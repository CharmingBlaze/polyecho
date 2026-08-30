import { hexToRgb, getBayerOffset, rgbToHex } from '../../utils/color'

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

export class PixelBuffer {
  width: number
  height: number
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D

  constructor(width = 64, height = 64) {
    this.width = width
    this.height = height
    this.canvas = document.createElement('canvas')
    this.canvas.width = width
    this.canvas.height = height
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!
    this.clear('#333842')
  }

  resize(newWidth: number, newHeight: number, mode: 'resample' | 'crop' = 'crop') {
    if (newWidth <= 0 || newHeight <= 0) return
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = this.width
    tempCanvas.height = this.height
    const tempCtx = tempCanvas.getContext('2d')!
    tempCtx.drawImage(this.canvas, 0, 0)

    this.width = Math.round(newWidth)
    this.height = Math.round(newHeight)
    this.canvas.width = this.width
    this.canvas.height = this.height
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!
    this.ctx.imageSmoothingEnabled = mode === 'resample'

    if (mode === 'resample') {
      this.ctx.drawImage(tempCanvas, 0, 0, this.width, this.height)
    } else {
      this.clear('#1e2025')
      this.ctx.drawImage(tempCanvas, 0, 0)
    }
  }

  clear(fillHex?: string) {
    if (fillHex) {
      this.ctx.fillStyle = fillHex
      this.ctx.fillRect(0, 0, this.width, this.height)
    } else {
      this.ctx.clearRect(0, 0, this.width, this.height)
    }
  }

  setPixel(x: number, y: number, hex: string, alpha = 1.0) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return
    this.ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
    this.ctx.fillStyle = hex
    this.ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1)
    this.ctx.globalAlpha = 1.0
  }

  getPixelHex(x: number, y: number): string {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return '#000000'
    const imgData = this.ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data
    return rgbToHex(imgData[0], imgData[1], imgData[2])
  }

  drawBrush(x: number, y: number, colorHex: string, size = 1, opacity = 1.0, shape: 'square' | 'circle' = 'square') {
    this.ctx.globalAlpha = Math.max(0, Math.min(1, opacity))
    this.ctx.fillStyle = colorHex
    const half = Math.floor(size / 2)
    const px = Math.floor(x) - half
    const py = Math.floor(y) - half

    if (shape === 'circle' && size > 2) {
      this.ctx.beginPath()
      this.ctx.arc(Math.floor(x) + 0.5, Math.floor(y) + 0.5, size / 2, 0, Math.PI * 2)
      this.ctx.fill()
    } else {
      this.ctx.fillRect(px, py, size, size)
    }
    this.ctx.globalAlpha = 1.0
  }

  erase(x: number, y: number, size = 1, shape: 'square' | 'circle' = 'square') {
    const half = Math.floor(size / 2)
    const px = Math.floor(x) - half
    const py = Math.floor(y) - half

    if (shape === 'circle' && size > 2) {
      this.ctx.save()
      this.ctx.globalCompositeOperation = 'destination-out'
      this.ctx.beginPath()
      this.ctx.arc(Math.floor(x) + 0.5, Math.floor(y) + 0.5, size / 2, 0, Math.PI * 2)
      this.ctx.fill()
      this.ctx.restore()
    } else {
      this.ctx.clearRect(px, py, size, size)
    }
  }

  /**
   * Aseprite-style Shading Brush (Lighten or Darken pixels by step)
   */
  drawShade(x: number, y: number, mode: 'lighten' | 'darken', size = 1, step = 15) {
    const half = Math.floor(size / 2)
    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        const px = Math.floor(x + dx)
        const py = Math.floor(y + dy)
        if (px < 0 || px >= this.width || py < 0 || py >= this.height) continue

        const imgData = this.ctx.getImageData(px, py, 1, 1)
        const d = imgData.data
        if (d[3] === 0) continue // Skip transparent

        const delta = mode === 'lighten' ? step : -step
        d[0] = Math.max(0, Math.min(255, d[0] + delta))
        d[1] = Math.max(0, Math.min(255, d[1] + delta))
        d[2] = Math.max(0, Math.min(255, d[2] + delta))
        this.ctx.putImageData(imgData, px, py)
      }
    }
  }

  paintAtUV(
    u: number, 
    v: number, 
    color: string, 
    size = 1, 
    tool: 'brush' | 'eraser' | 'shade-light' | 'shade-dark' = 'brush',
    opacity = 1.0
  ) {
    const px = Math.floor(u * this.width)
    const py = Math.floor((1 - v) * this.height)

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
    opacity = 1.0
  ) {
    const x0 = Math.floor(u0 * this.width)
    const y0 = Math.floor((1 - v0) * this.height)
    const x1 = Math.floor(u1 * this.width)
    const y1 = Math.floor((1 - v1) * this.height)

    if (tool === 'eraser') {
      let dx = Math.abs(x1 - x0)
      let dy = Math.abs(y1 - y0)
      let sx = x0 < x1 ? 1 : -1
      let sy = y0 < y1 ? 1 : -1
      let err = dx - dy
      let cx = x0, cy = y0
      while (true) {
        this.erase(cx, cy, size)
        if (cx === x1 && cy === y1) break
        let e2 = 2 * err
        if (e2 > -dy) { err -= dy; cx += sx }
        if (e2 < dx) { err += dx; cy += sy }
      }
    } else {
      this.drawLine(x0, y0, x1, y1, color, size, opacity)
    }
  }

  drawLine(x0: number, y0: number, x1: number, y1: number, colorHex: string, size = 1, opacity = 1.0) {
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
      this.drawBrush(curX, curY, colorHex, size, opacity)
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
  }

  drawRect(x0: number, y0: number, x1: number, y1: number, colorHex: string, size = 1, filled = false, opacity = 1.0) {
    const minX = Math.min(x0, x1)
    const maxX = Math.max(x0, x1)
    const minY = Math.min(y0, y1)
    const maxY = Math.max(y0, y1)
    const w = maxX - minX + 1
    const h = maxY - minY + 1

    this.ctx.globalAlpha = Math.max(0, Math.min(1, opacity))
    this.ctx.fillStyle = colorHex

    if (filled) {
      this.ctx.fillRect(minX, minY, w, h)
    } else {
      this.ctx.fillRect(minX, minY, w, size) // Top
      this.ctx.fillRect(minX, maxY - size + 1, w, size) // Bottom
      this.ctx.fillRect(minX, minY, size, h) // Left
      this.ctx.fillRect(maxX - size + 1, minY, size, h) // Right
    }
    this.ctx.globalAlpha = 1.0
  }

  drawCircle(cx: number, cy: number, radius: number, colorHex: string, size = 1, filled = false, opacity = 1.0) {
    this.ctx.globalAlpha = Math.max(0, Math.min(1, opacity))
    this.ctx.fillStyle = colorHex
    this.ctx.strokeStyle = colorHex
    this.ctx.lineWidth = size

    this.ctx.beginPath()
    this.ctx.arc(cx, cy, Math.max(1, radius), 0, Math.PI * 2)
    if (filled) {
      this.ctx.fill()
    } else {
      this.ctx.stroke()
    }
    this.ctx.globalAlpha = 1.0
  }

  drawDither(x: number, y: number, colorHex: string, size = 1) {
    const half = Math.floor(size / 2)
    const baseRgb = hexToRgb(colorHex)

    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        const px = Math.floor(x + dx)
        const py = Math.floor(y + dy)
        if (px < 0 || px >= this.width || py < 0 || py >= this.height) continue

        const offset = getBayerOffset(px, py, 40)
        const ditherColor = rgbToHex(baseRgb.r + offset, baseRgb.g + offset, baseRgb.b + offset)
        this.setPixel(px, py, ditherColor)
      }
    }
  }

  /**
   * Fast Uint32Array Scanline Flood Fill
   */
  floodFill(startX: number, startY: number, fillHex: string) {
    const x0 = Math.floor(startX)
    const y0 = Math.floor(startY)
    if (x0 < 0 || x0 >= this.width || y0 < 0 || y0 >= this.height) return

    const imgData = this.ctx.getImageData(0, 0, this.width, this.height)
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

    this.ctx.putImageData(imgData, 0, 0)
  }

  // --- Aseprite Special FX & Adjustments ---

  /**
   * Classic Aseprite 1px Outline FX:
   * Adds a solid 1px border around all non-transparent pixels.
   */
  generateOutline(outlineColorHex = '#000000') {
    const imgData = this.ctx.getImageData(0, 0, this.width, this.height)
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
    this.ctx.putImageData(resImg, 0, 0)
  }

  adjustBrightness(amount: number) {
    const imgData = this.ctx.getImageData(0, 0, this.width, this.height)
    const d = imgData.data
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue
      d[i] = Math.max(0, Math.min(255, d[i] + amount))
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + amount))
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + amount))
    }
    this.ctx.putImageData(imgData, 0, 0)
  }

  desaturate() {
    const imgData = this.ctx.getImageData(0, 0, this.width, this.height)
    const d = imgData.data
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue
      const gray = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])
      d[i] = gray
      d[i + 1] = gray
      d[i + 2] = gray
    }
    this.ctx.putImageData(imgData, 0, 0)
  }

  invertColors() {
    const imgData = this.ctx.getImageData(0, 0, this.width, this.height)
    const d = imgData.data
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue
      d[i] = 255 - d[i]
      d[i + 1] = 255 - d[i + 1]
      d[i + 2] = 255 - d[i + 2]
    }
    this.ctx.putImageData(imgData, 0, 0)
  }

  flip(horizontal: boolean, vertical: boolean) {
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = this.width
    tempCanvas.height = this.height
    const tempCtx = tempCanvas.getContext('2d')!
    tempCtx.drawImage(this.canvas, 0, 0)

    this.ctx.save()
    this.ctx.clearRect(0, 0, this.width, this.height)
    this.ctx.translate(horizontal ? this.width : 0, vertical ? this.height : 0)
    this.ctx.scale(horizontal ? -1 : 1, vertical ? -1 : 1)
    this.ctx.drawImage(tempCanvas, 0, 0)
    this.ctx.restore()
  }

  rotate(degrees: 90 | -90 | 180) {
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = this.width
    tempCanvas.height = this.height
    const tempCtx = tempCanvas.getContext('2d')!
    tempCtx.drawImage(this.canvas, 0, 0)

    if (degrees === 90 || degrees === -90) {
      const oldW = this.width
      const oldH = this.height
      this.width = oldH
      this.height = oldW
      this.canvas.width = this.width
      this.canvas.height = this.height
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!
    }

    this.ctx.save()
    this.ctx.clearRect(0, 0, this.width, this.height)
    this.ctx.translate(this.width / 2, this.height / 2)
    this.ctx.rotate((degrees * Math.PI) / 180)
    this.ctx.drawImage(tempCanvas, -tempCanvas.width / 2, -tempCanvas.height / 2)
    this.ctx.restore()
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

  toDataURL(): string {
    return this.canvas.toDataURL('image/png')
  }

  clone(): PixelBuffer {
    const copy = new PixelBuffer(this.width, this.height)
    copy.ctx.clearRect(0, 0, this.width, this.height)
    copy.ctx.drawImage(this.canvas, 0, 0)
    return copy
  }

  loadFromFile(file: File | Blob, autoResize = true): Promise<void> {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        try {
          if (autoResize && (img.naturalWidth !== this.width || img.naturalHeight !== this.height)) {
            this.width = img.naturalWidth
            this.height = img.naturalHeight
            this.canvas.width = img.naturalWidth
            this.canvas.height = img.naturalHeight
            this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!
          }
          this.ctx.imageSmoothingEnabled = false
          this.ctx.clearRect(0, 0, this.width, this.height)
          this.ctx.drawImage(img, 0, 0, this.width, this.height)
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
          this.width = img.naturalWidth
          this.height = img.naturalHeight
          this.canvas.width = img.naturalWidth
          this.canvas.height = img.naturalHeight
          this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!
        }
        this.ctx.clearRect(0, 0, this.width, this.height)
        this.ctx.drawImage(img, 0, 0, this.width, this.height)
        resolve()
      }
      img.src = url
    })
  }
}

