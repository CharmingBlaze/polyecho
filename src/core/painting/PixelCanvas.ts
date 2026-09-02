import { hexToRgb, getBayerOffset, rgbToHex, rgbToHsl, hslToRgb } from '../../utils/color'
import { applyFloydSteinbergDither, applyAtkinsonDither } from '../../utils/dithering'

export interface PixelDrawParams {
  x: number
  y: number
  colorHex: string
  size: number
  tool: 'brush' | 'eraser' | 'bucket' | 'picker' | 'line' | 'rect' | 'circle' | 'dither' | 'shade' | 'select'
  opacity?: number
  shape?: 'square' | 'circle'
  filled?: boolean
  pixelPerfect?: boolean
  shadeMode?: 'lighten' | 'darken'
}

export interface SelectionRect {
  x: number
  y: number
  w: number
  h: number
  active: boolean
  floatingBuffer?: ImageData
}

export interface BufferLayer {
  id: string
  name: string
  visible: boolean
  opacity: number
  blendMode: 'normal' | 'multiply' | 'screen' | 'overlay' | 'additive'
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
}

/**
 * Pixel paint buffer. `canvas` is the composited preview (Three.js / 2D view).
 * All draw mutations write the active layer, then `composite()`.
 * `PixelCanvas.vue` is the UV/Paint tab router — not this class.
 */
function canvasLooksEmpty(ctx: CanvasRenderingContext2D) {
  const w = ctx.canvas.width
  const h = ctx.canvas.height
  if (w < 1 || h < 1) return true
  const pts = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
    [Math.floor(w / 2), Math.floor(h / 2)]
  ]
  for (const [x, y] of pts) {
    const d = ctx.getImageData(x, y, 1, 1).data
    if (d[3] > 0) return false
  }
  return true
}

function uvToPixel(u: number, v: number, width: number, height: number): { x: number; y: number } {
  const safeU = Number.isFinite(u) ? Math.max(0, Math.min(1, u)) : 0
  const safeV = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0
  return {
    x: Math.min(width - 1, Math.floor(safeU * width)),
    y: Math.min(height - 1, Math.floor((1 - safeV) * height))
  }
}

export class PixelBuffer {
  width: number
  height: number
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  layers: BufferLayer[] = []
  activeLayerId: string = ''

  constructor(width = 64, height = 64) {
    this.width = width
    this.height = height
    this.canvas = document.createElement('canvas')
    this.canvas.width = width
    this.canvas.height = height
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!
    
    // Create base layer
    const baseCanvas = document.createElement('canvas')
    baseCanvas.width = width
    baseCanvas.height = height
    const baseCtx = baseCanvas.getContext('2d', { willReadFrequently: true })!
    const baseLayer: BufferLayer = {
      id: 'layer_base',
      name: 'Layer 1',
      visible: true,
      opacity: 1.0,
      blendMode: 'normal',
      canvas: baseCanvas,
      ctx: baseCtx
    }
    this.layers.push(baseLayer)
    this.activeLayerId = baseLayer.id

    this.clear()
  }

  get activeLayer(): BufferLayer | undefined {
    return this.layers.find(l => l.id === this.activeLayerId) || this.layers[0]
  }

  layerCtx(): CanvasRenderingContext2D {
    this.ensureDrawable()
    return this.activeLayer?.ctx ?? this.ctx
  }

  /** Keep layer canvases sized and back the photo onto the layer if it was only on the composite. */
  ensureDrawable() {
    if (this.layers.length === 0) {
      const baseCanvas = document.createElement('canvas')
      baseCanvas.width = this.width
      baseCanvas.height = this.height
      const baseCtx = baseCanvas.getContext('2d', { willReadFrequently: true })!
      this.layers.push({
        id: 'layer_base',
        name: 'Layer 1',
        visible: true,
        opacity: 1.0,
        blendMode: 'normal',
        canvas: baseCanvas,
        ctx: baseCtx
      })
      this.activeLayerId = 'layer_base'
    }

    if (this.canvas.width !== this.width || this.canvas.height !== this.height) {
      this.canvas.width = this.width
      this.canvas.height = this.height
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!
    }

    const layer = this.activeLayer
    if (!layer) return
    if (layer.canvas.width !== this.width || layer.canvas.height !== this.height) {
      layer.canvas.width = this.width
      layer.canvas.height = this.height
      layer.ctx = layer.canvas.getContext('2d', { willReadFrequently: true })!
    }

    if (canvasLooksEmpty(layer.ctx) && !canvasLooksEmpty(this.ctx)) {
      this.syncToActiveLayer()
    }
  }

  compositeDeferred = false

  commitLayers() {
    if (!this.compositeDeferred) this.composite()
  }

  suspendComposite() {
    this.compositeDeferred = true
  }

  resumeComposite() {
    this.compositeDeferred = false
    this.composite()
  }

  resizeCanvasContents(
    source: HTMLCanvasElement,
    dest: HTMLCanvasElement,
    destCtx: CanvasRenderingContext2D,
    mode: 'resample' | 'crop'
  ) {
    destCtx.imageSmoothingEnabled = mode === 'resample'
    destCtx.clearRect(0, 0, dest.width, dest.height)
    if (mode === 'resample') {
      destCtx.drawImage(source, 0, 0, dest.width, dest.height)
    } else {
      destCtx.drawImage(source, 0, 0)
    }
  }

  addLayer(name?: string): BufferLayer {
    const layerCanvas = document.createElement('canvas')
    layerCanvas.width = this.width
    layerCanvas.height = this.height
    const layerCtx = layerCanvas.getContext('2d', { willReadFrequently: true })!
    const newLayer: BufferLayer = {
      id: `layer_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: name || `Layer ${this.layers.length + 1}`,
      visible: true,
      opacity: 1.0,
      blendMode: 'normal',
      canvas: layerCanvas,
      ctx: layerCtx
    }
    this.layers.push(newLayer)
    this.activeLayerId = newLayer.id
    this.composite()
    return newLayer
  }

  deleteLayer(id: string): boolean {
    if (this.layers.length <= 1) return false // Keep at least one layer
    const idx = this.layers.findIndex(l => l.id === id)
    if (idx !== -1) {
      this.layers.splice(idx, 1)
      if (this.activeLayerId === id) {
        this.activeLayerId = this.layers[Math.max(0, idx - 1)].id
      }
      this.composite()
      return true
    }
    return false
  }

  duplicateLayer(id: string): BufferLayer | null {
    const src = this.layers.find(l => l.id === id)
    if (!src) return null
    const layerCanvas = document.createElement('canvas')
    layerCanvas.width = this.width
    layerCanvas.height = this.height
    const layerCtx = layerCanvas.getContext('2d', { willReadFrequently: true })!
    layerCtx.drawImage(src.canvas, 0, 0)
    const newLayer: BufferLayer = {
      id: `layer_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: `${src.name} Copy`,
      visible: true,
      opacity: src.opacity,
      blendMode: src.blendMode,
      canvas: layerCanvas,
      ctx: layerCtx
    }
    const idx = this.layers.findIndex(l => l.id === id)
    this.layers.splice(idx + 1, 0, newLayer)
    this.activeLayerId = newLayer.id
    this.composite()
    return newLayer
  }

  composite() {
    this.ctx.clearRect(0, 0, this.width, this.height)
    for (const layer of this.layers) {
      if (!layer.visible || layer.opacity <= 0) continue
      this.ctx.save()
      this.ctx.globalAlpha = layer.opacity
      if (layer.blendMode === 'multiply') {
        this.ctx.globalCompositeOperation = 'multiply'
      } else if (layer.blendMode === 'screen') {
        this.ctx.globalCompositeOperation = 'screen'
      } else if (layer.blendMode === 'overlay') {
        this.ctx.globalCompositeOperation = 'overlay'
      } else if (layer.blendMode === 'additive') {
        this.ctx.globalCompositeOperation = 'lighter'
      } else {
        this.ctx.globalCompositeOperation = 'source-over'
      }
      this.ctx.drawImage(layer.canvas, 0, 0)
      this.ctx.restore()
    }
  }

  resize(newWidth: number, newHeight: number, mode: 'resample' | 'crop' = 'crop') {
    if (newWidth <= 0 || newHeight <= 0) return
    const nextW = Math.round(newWidth)
    const nextH = Math.round(newHeight)
    if (nextW === this.width && nextH === this.height && mode === 'crop') return

    for (const layer of this.layers) {
      const snapshot = document.createElement('canvas')
      snapshot.width = layer.canvas.width
      snapshot.height = layer.canvas.height
      snapshot.getContext('2d')!.drawImage(layer.canvas, 0, 0)
      layer.canvas.width = nextW
      layer.canvas.height = nextH
      layer.ctx = layer.canvas.getContext('2d', { willReadFrequently: true })!
      this.resizeCanvasContents(snapshot, layer.canvas, layer.ctx, mode)
    }

    this.width = nextW
    this.height = nextH
    this.canvas.width = nextW
    this.canvas.height = nextH
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!
    this.composite()
  }

  syncToActiveLayer() {
    const layer = this.activeLayer
    if (layer) {
      if (layer.canvas.width !== this.width || layer.canvas.height !== this.height) {
        layer.canvas.width = this.width
        layer.canvas.height = this.height
        layer.ctx = layer.canvas.getContext('2d', { willReadFrequently: true })!
      }
      layer.ctx.clearRect(0, 0, this.width, this.height)
      layer.ctx.drawImage(this.canvas, 0, 0)
    }
  }

  clear(fillHex?: string) {
    if (fillHex) {
      this.ctx.fillStyle = fillHex
      this.ctx.fillRect(0, 0, this.width, this.height)
      if (this.activeLayer) {
        this.activeLayer.ctx.fillStyle = fillHex
        this.activeLayer.ctx.fillRect(0, 0, this.width, this.height)
      }
    } else {
      this.ctx.clearRect(0, 0, this.width, this.height)
      if (this.activeLayer) {
        this.activeLayer.ctx.clearRect(0, 0, this.width, this.height)
      }
    }
    this.commitLayers()
  }

  setPixel(x: number, y: number, hex: string, alpha = 1.0, commit = true) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return
    const ctx = this.layerCtx()
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
    ctx.fillStyle = hex
    ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1)
    ctx.globalAlpha = 1.0
    if (commit) this.commitLayers()
  }

  getPixelHex(x: number, y: number): string {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return '#000000'
    const imgData = this.ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data
    return rgbToHex(imgData[0], imgData[1], imgData[2])
  }

  drawBrush(
    x: number,
    y: number,
    colorHex: string,
    size = 1,
    opacity = 1.0,
    shape: 'square' | 'circle' = 'square',
    commit = true
  ) {
    const ctx = this.layerCtx()
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity))
    ctx.fillStyle = colorHex
    const half = Math.floor(size / 2)
    const px = Math.floor(x) - half
    const py = Math.floor(y) - half

    if (shape === 'circle' && size > 2) {
      ctx.beginPath()
      ctx.arc(Math.floor(x) + 0.5, Math.floor(y) + 0.5, size / 2, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.fillRect(px, py, size, size)
    }
    ctx.globalAlpha = 1.0
    if (commit) this.commitLayers()
  }

  erase(x: number, y: number, size = 1, shape: 'square' | 'circle' = 'square', commit = true) {
    const ctx = this.layerCtx()
    const half = Math.floor(size / 2)
    const px = Math.floor(x) - half
    const py = Math.floor(y) - half

    if (shape === 'circle' && size > 2) {
      ctx.save()
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.arc(Math.floor(x) + 0.5, Math.floor(y) + 0.5, size / 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    } else {
      ctx.clearRect(px, py, size, size)
    }
    if (commit) this.commitLayers()
  }

  /**
   * Aseprite-style Shading Brush (Lighten or Darken pixels with optional Hue Shifting or Palette Snapping)
   */
  drawShade(
    x: number, 
    y: number, 
    mode: 'lighten' | 'darken', 
    size = 1, 
    step = 15, 
    hueShift = false, 
    palette?: string[]
  ) {
    const start = -Math.floor(size / 2)
    const end = start + Math.max(1, size)
    for (let dy = start; dy < end; dy++) {
      for (let dx = start; dx < end; dx++) {
        const px = Math.floor(x + dx)
        const py = Math.floor(y + dy)
        if (px < 0 || px >= this.width || py < 0 || py >= this.height) continue

        const ctx = this.layerCtx()
        const imgData = ctx.getImageData(px, py, 1, 1)
        const d = imgData.data
        if (d[3] === 0) continue // Skip transparent

        if (palette && palette.length > 0) {
          const sorted = [...palette].sort((a, b) => {
            const rgbA = hexToRgb(a)
            const rgbB = hexToRgb(b)
            return (rgbA.r * 0.299 + rgbA.g * 0.587 + rgbA.b * 0.114) - (rgbB.r * 0.299 + rgbB.g * 0.587 + rgbB.b * 0.114)
          })
          let bestIdx = 0
          let bestDist = Infinity
          const cr = d[0], cg = d[1], cb = d[2]
          for (let i = 0; i < sorted.length; i++) {
            const pr = hexToRgb(sorted[i])
            const dist = (cr - pr.r) ** 2 + (cg - pr.g) ** 2 + (cb - pr.b) ** 2
            if (dist < bestDist) {
              bestDist = dist
              bestIdx = i
            }
          }
          const nextIdx = mode === 'lighten' ? Math.min(sorted.length - 1, bestIdx + 1) : Math.max(0, bestIdx - 1)
          const targetRgb = hexToRgb(sorted[nextIdx])
          d[0] = targetRgb.r
          d[1] = targetRgb.g
          d[2] = targetRgb.b
        } else if (hueShift) {
          const hsl = rgbToHsl(d[0], d[1], d[2])
          const lDelta = (mode === 'lighten' ? step : -step) / 255
          const newL = Math.max(0, Math.min(1, hsl.l + lDelta))
          let newH = hsl.h
          if (mode === 'lighten') {
            const diff = 60 - newH
            newH = (newH + diff * 0.05 + 360) % 360
          } else {
            const diff = 240 - newH
            newH = (newH + diff * 0.05 + 360) % 360
          }
          const rgb = hslToRgb(newH, hsl.s, newL)
          d[0] = rgb.r
          d[1] = rgb.g
          d[2] = rgb.b
        } else {
          const delta = mode === 'lighten' ? step : -step
          d[0] = Math.max(0, Math.min(255, d[0] + delta))
          d[1] = Math.max(0, Math.min(255, d[1] + delta))
          d[2] = Math.max(0, Math.min(255, d[2] + delta))
        }

        ctx.putImageData(imgData, px, py)
      }
    }
    this.commitLayers()
  }

  paintAtUV(
    u: number, 
    v: number, 
    color: string, 
    size = 1, 
    tool: 'brush' | 'eraser' | 'shade-light' | 'shade-dark' = 'brush',
    opacity = 1.0
  ) {
    const { x: px, y: py } = uvToPixel(u, v, this.width, this.height)

    if (tool === 'eraser') {
      this.erase(px, py, size)
    } else if (tool === 'shade-light') {
      this.drawShade(px, py, 'lighten', size)
    } else if (tool === 'shade-dark') {
      this.drawShade(px, py, 'darken', size)
    } else {
      this.drawBrush(px, py, color, size, opacity)
    }
  }

  paintLineAtUV(
    u0: number, 
    v0: number, 
    u1: number, 
    v1: number, 
    color: string, 
    size = 1, 
    tool: 'brush' | 'eraser' = 'brush',
    opacity = 1.0,
    shape: 'square' | 'circle' = 'square'
  ) {
    const start = uvToPixel(u0, v0, this.width, this.height)
    const end = uvToPixel(u1, v1, this.width, this.height)
    const x0 = start.x
    const y0 = start.y
    const x1 = end.x
    const y1 = end.y

    if (tool === 'eraser') {
      this.eraseLine(x0, y0, x1, y1, size, shape)
    } else {
      this.drawLine(x0, y0, x1, y1, color, size, opacity, shape)
    }
  }

  eraseLine(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    size = 1,
    shape: 'square' | 'circle' = 'square'
  ) {
    let dx = Math.abs(x1 - x0)
    let dy = Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1
    const sy = y0 < y1 ? 1 : -1
    let err = dx - dy
    let cx = Math.floor(x0)
    let cy = Math.floor(y0)
    const endX = Math.floor(x1)
    const endY = Math.floor(y1)
    while (true) {
      this.erase(cx, cy, size, shape, false)
      if (cx === endX && cy === endY) break
      const e2 = 2 * err
      if (e2 > -dy) { err -= dy; cx += sx }
      if (e2 < dx) { err += dx; cy += sy }
    }
    this.commitLayers()
  }

  drawLine(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    colorHex: string,
    size = 1,
    opacity = 1.0,
    shape: 'square' | 'circle' = 'square'
  ) {
    let dx = Math.abs(x1 - x0)
    let dy = Math.abs(y1 - y0)
    let sx = x0 < x1 ? 1 : -1
    let sy = y0 < y1 ? 1 : -1
    let err = dx - dy

    let curX = Math.floor(x0)
    let curY = Math.floor(y0)
    const endX = Math.floor(x1)
    const endY = Math.floor(y1)

    while (true) {
      this.drawBrush(curX, curY, colorHex, size, opacity, shape, false)
      if (curX === endX && curY === endY) break
      let e2 = 2 * err
      if (e2 > -dy) {
        err -= dy
        curX += sx
      }
      if (e2 < dx) {
        err += dx
        curY += sy
      }
    }
    this.commitLayers()
  }

  drawRect(x0: number, y0: number, x1: number, y1: number, colorHex: string, size = 1, filled = false, opacity = 1.0) {
    const minX = Math.min(x0, x1)
    const maxX = Math.max(x0, x1)
    const minY = Math.min(y0, y1)
    const maxY = Math.max(y0, y1)
    const w = maxX - minX + 1
    const h = maxY - minY + 1

    const ctx = this.layerCtx()
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity))
    ctx.fillStyle = colorHex

    if (filled) {
      ctx.fillRect(minX, minY, w, h)
    } else {
      ctx.fillRect(minX, minY, w, size) // Top
      ctx.fillRect(minX, maxY - size + 1, w, size) // Bottom
      ctx.fillRect(minX, minY, size, h) // Left
      ctx.fillRect(maxX - size + 1, minY, size, h) // Right
    }
    ctx.globalAlpha = 1.0
    this.commitLayers()
  }

  drawCircle(cx: number, cy: number, radius: number, colorHex: string, size = 1, filled = false, opacity = 1.0) {
    const ctx = this.layerCtx()
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity))
    ctx.fillStyle = colorHex
    ctx.strokeStyle = colorHex
    ctx.lineWidth = size

    ctx.beginPath()
    ctx.arc(cx, cy, Math.max(1, radius), 0, Math.PI * 2)
    if (filled) {
      ctx.fill()
    } else {
      ctx.stroke()
    }
    ctx.globalAlpha = 1.0
    this.commitLayers()
  }

  drawDither(x: number, y: number, colorHex: string, size = 1) {
    const start = -Math.floor(size / 2)
    const end = start + Math.max(1, size)
    const baseRgb = hexToRgb(colorHex)

    for (let dy = start; dy < end; dy++) {
      for (let dx = start; dx < end; dx++) {
        const px = Math.floor(x + dx)
        const py = Math.floor(y + dy)
        if (px < 0 || px >= this.width || py < 0 || py >= this.height) continue

        const offset = getBayerOffset(px, py, 40)
        const ditherColor = rgbToHex(baseRgb.r + offset, baseRgb.g + offset, baseRgb.b + offset)
        this.setPixel(px, py, ditherColor, 1, false)
      }
    }
    this.commitLayers()
  }

  /**
   * Fast Uint32Array Scanline Flood Fill
   */
  floodFill(startX: number, startY: number, fillHex: string) {
    const x0 = Math.floor(startX)
    const y0 = Math.floor(startY)
    if (x0 < 0 || x0 >= this.width || y0 < 0 || y0 >= this.height) return

    const ctx = this.layerCtx()
    const imgData = ctx.getImageData(0, 0, this.width, this.height)
    const data32 = new Uint32Array(imgData.data.buffer)

    const fillRgb = hexToRgb(fillHex)
    // Little endian ABGR
    const fillColor32 = (255 << 24) | (fillRgb.b << 16) | (fillRgb.g << 8) | fillRgb.r
    const targetColor32 = data32[y0 * this.width + x0]

    if (targetColor32 === fillColor32) return

    const stack: [number, number][] = [[x0, y0]]
    const w = this.width
    const h = this.height

    while (stack.length > 0) {
      const [x, y] = stack.pop()!
      let lx = x
      while (lx >= 0 && data32[y * w + lx] === targetColor32) {
        lx--
      }
      lx++

      let rx = x
      while (rx < w && data32[y * w + rx] === targetColor32) {
        rx++
      }
      rx--

      let spanAbove = false
      let spanBelow = false

      for (let i = lx; i <= rx; i++) {
        data32[y * w + i] = fillColor32

        if (y > 0) {
          if (data32[(y - 1) * w + i] === targetColor32) {
            if (!spanAbove) {
              stack.push([i, y - 1])
              spanAbove = true
            }
          } else {
            spanAbove = false
          }
        }

        if (y < h - 1) {
          if (data32[(y + 1) * w + i] === targetColor32) {
            if (!spanBelow) {
              stack.push([i, y + 1])
              spanBelow = true
            }
          } else {
            spanBelow = false
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0)
    this.commitLayers()
  }

  // --- Aseprite Special FX & Adjustments ---

  /**
   * Classic Aseprite 1px Outline FX:
   * Adds a solid 1px border around all non-transparent pixels.
   */
  generateOutline(outlineColorHex = '#000000') {
    const ctx = this.layerCtx()
    const imgData = ctx.getImageData(0, 0, this.width, this.height)
    const data32 = new Uint32Array(imgData.data.buffer)
    const outlineData = new Uint32Array(data32.length)
    outlineData.set(data32)

    const rgb = hexToRgb(outlineColorHex)
    const outColor32 = (255 << 24) | (rgb.b << 16) | (rgb.g << 8) | rgb.r

    const w = this.width
    const h = this.height

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x
        // If current pixel is transparent
        if ((data32[idx] >>> 24) === 0) {
          // Check 4 neighbors
          const hasNeighbor = 
            (x > 0 && (data32[idx - 1] >>> 24) > 0) ||
            (x < w - 1 && (data32[idx + 1] >>> 24) > 0) ||
            (y > 0 && (data32[idx - w] >>> 24) > 0) ||
            (y < h - 1 && (data32[idx + w] >>> 24) > 0)

          if (hasNeighbor) {
            outlineData[idx] = outColor32
          }
        }
      }
    }

    const resImg = new ImageData(new Uint8ClampedArray(outlineData.buffer), w, h)
    ctx.putImageData(resImg, 0, 0)
    this.commitLayers()
  }

  adjustBrightness(amount: number) {
    const ctx = this.layerCtx()
    const imgData = ctx.getImageData(0, 0, this.width, this.height)
    const d = imgData.data
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue
      d[i] = Math.max(0, Math.min(255, d[i] + amount))
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + amount))
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + amount))
    }
    ctx.putImageData(imgData, 0, 0)
    this.commitLayers()
  }

  desaturate() {
    const ctx = this.layerCtx()
    const imgData = ctx.getImageData(0, 0, this.width, this.height)
    const d = imgData.data
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue
      const gray = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])
      d[i] = gray
      d[i + 1] = gray
      d[i + 2] = gray
    }
    ctx.putImageData(imgData, 0, 0)
    this.commitLayers()
  }

  invertColors() {
    const ctx = this.layerCtx()
    const imgData = ctx.getImageData(0, 0, this.width, this.height)
    const d = imgData.data
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue
      d[i] = 255 - d[i]
      d[i + 1] = 255 - d[i + 1]
      d[i + 2] = 255 - d[i + 2]
    }
    ctx.putImageData(imgData, 0, 0)
    this.commitLayers()
  }

  /**
   * Quantizes / remaps all layer pixels to the nearest colors in a target palette.
   */
  remapToPalette(paletteHexes: string[], mode: 'nearest' | 'floyd-steinberg' | 'atkinson' = 'nearest') {
    if (!paletteHexes || paletteHexes.length === 0) return
    const ctx = this.layerCtx()
    if (mode === 'floyd-steinberg') {
      applyFloydSteinbergDither(ctx, this.width, this.height, paletteHexes)
    } else if (mode === 'atkinson') {
      applyAtkinsonDither(ctx, this.width, this.height, paletteHexes)
    } else {
      const imgData = ctx.getImageData(0, 0, this.width, this.height)
      const d = imgData.data
      const palette = paletteHexes.map(hex => {
        let clean = hex.replace('#', '')
        if (clean.length === 3) clean = clean.split('').map(c => c + c).join('')
        const num = parseInt(clean, 16)
        return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
      })
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue // Preserve transparency
        const r = d[i], g = d[i + 1], b = d[i + 2]
        let bestDist = Infinity
        let bestColor = palette[0]
        for (const p of palette) {
          const dr = r - p[0], dg = g - p[1], db = b - p[2]
          const dist = dr * dr + dg * dg + db * db
          if (dist < bestDist) {
            bestDist = dist
            bestColor = p
          }
        }
        d[i] = bestColor[0]
        d[i + 1] = bestColor[1]
        d[i + 2] = bestColor[2]
      }
      ctx.putImageData(imgData, 0, 0)
    }
    this.commitLayers()
  }

  flip(horizontal: boolean, vertical: boolean, allLayers = false) {
    const targets = allLayers ? this.layers : (this.activeLayer ? [this.activeLayer] : [])
    for (const layer of targets) {
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = this.width
      tempCanvas.height = this.height
      tempCanvas.getContext('2d')!.drawImage(layer.canvas, 0, 0)
      layer.ctx.save()
      layer.ctx.clearRect(0, 0, this.width, this.height)
      layer.ctx.translate(horizontal ? this.width : 0, vertical ? this.height : 0)
      layer.ctx.scale(horizontal ? -1 : 1, vertical ? -1 : 1)
      layer.ctx.drawImage(tempCanvas, 0, 0)
      layer.ctx.restore()
    }
    this.commitLayers()
  }

  rotate(degrees: 90 | -90 | 180) {
    const swap = degrees === 90 || degrees === -90
    const nextW = swap ? this.height : this.width
    const nextH = swap ? this.width : this.height

    for (const layer of this.layers) {
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = this.width
      tempCanvas.height = this.height
      tempCanvas.getContext('2d')!.drawImage(layer.canvas, 0, 0)

      layer.canvas.width = nextW
      layer.canvas.height = nextH
      layer.ctx = layer.canvas.getContext('2d', { willReadFrequently: true })!
      layer.ctx.save()
      layer.ctx.clearRect(0, 0, nextW, nextH)
      layer.ctx.translate(nextW / 2, nextH / 2)
      layer.ctx.rotate((degrees * Math.PI) / 180)
      layer.ctx.drawImage(tempCanvas, -tempCanvas.width / 2, -tempCanvas.height / 2)
      layer.ctx.restore()
    }

    this.width = nextW
    this.height = nextH
    this.canvas.width = nextW
    this.canvas.height = nextH
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!
    this.composite()
  }

  /**
   * Extract unique palette colors from active texture (up to maxColors)
   */
  extractPalette(maxColors = 32): string[] {
    const imgData = this.ctx.getImageData(0, 0, this.width, this.height).data
    const colorMap = new Map<string, number>()

    for (let i = 0; i < imgData.length; i += 4) {
      if (imgData[i + 3] < 128) continue // Ignore transparent
      const hex = rgbToHex(imgData[i], imgData[i + 1], imgData[i + 2])
      colorMap.set(hex, (colorMap.get(hex) || 0) + 1)
    }

    return Array.from(colorMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxColors)
      .map(([hex]) => hex)
  }

  /**
   * Dilate non-transparent pixels outward by `margin` pixels to prevent UV seam artifacts and filtering bleed.
   */
  dilateSeamPadding(margin = 1) {
    const layer = this.activeLayer
    if (!layer) return
    const imgData = layer.ctx.getImageData(0, 0, this.width, this.height)
    const data = imgData.data
    const outData = new Uint8ClampedArray(data)

    const w = this.width
    const h = this.height

    for (let step = 0; step < margin; step++) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4
          if (data[idx + 3] === 0) {
            const neighbors = [
              [x - 1, y],
              [x + 1, y],
              [x, y - 1],
              [x, y + 1]
            ]
            for (const [nx, ny] of neighbors) {
              if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                const nIdx = (ny * w + nx) * 4
                if (data[nIdx + 3] > 0) {
                  outData[idx] = data[nIdx]
                  outData[idx + 1] = data[nIdx + 1]
                  outData[idx + 2] = data[nIdx + 2]
                  outData[idx + 3] = data[nIdx + 3]
                  break
                }
              }
            }
          }
        }
      }
      data.set(outData)
    }

    layer.ctx.putImageData(imgData, 0, 0)
    this.composite()
  }

  toDataURL(): string {
    return this.canvas.toDataURL('image/png')
  }

  clone(): PixelBuffer {
    const copy = new PixelBuffer(this.width, this.height)
    copy.layers = this.layers.map(layer => {
      const canvas = document.createElement('canvas')
      canvas.width = this.width
      canvas.height = this.height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(layer.canvas, 0, 0)
      return {
        id: layer.id,
        name: layer.name,
        visible: layer.visible,
        opacity: layer.opacity,
        blendMode: layer.blendMode,
        canvas,
        ctx
      }
    })
    copy.activeLayerId = this.activeLayerId
    if (copy.layers.length === 0) {
      copy.addLayer('Layer 1')
    }
    copy.composite()
    return copy
  }

  loadFromFile(file: File | Blob, autoResize = true): Promise<void> {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        try {
          if (autoResize && (img.naturalWidth !== this.width || img.naturalHeight !== this.height)) {
            this.resize(img.naturalWidth, img.naturalHeight, 'crop')
          }
          const layer = this.activeLayer
          const destCtx = layer?.ctx ?? this.ctx
          destCtx.imageSmoothingEnabled = false
          destCtx.clearRect(0, 0, this.width, this.height)
          destCtx.drawImage(img, 0, 0, this.width, this.height)
          this.composite()
          resolve()
        } catch (err) {
          reject(err)
        } finally {
          URL.revokeObjectURL(objectUrl)
        }
      }
      img.onerror = (err) => {
        URL.revokeObjectURL(objectUrl)
        reject(err)
      }
      img.src = objectUrl
    })
  }

  loadFromDataURL(url: string, autoResize = true): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        if (autoResize && (img.naturalWidth !== this.width || img.naturalHeight !== this.height)) {
          this.resize(img.naturalWidth, img.naturalHeight, 'crop')
        }
        const destCtx = this.activeLayer?.ctx ?? this.ctx
        destCtx.clearRect(0, 0, this.width, this.height)
        destCtx.drawImage(img, 0, 0, this.width, this.height)
        this.composite()
        resolve()
      }
      img.src = url
    })
  }
}
