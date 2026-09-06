/** Happy-dom has no 2D canvas. Enough ImageData for PixelBuffer paint + clone. */

type PixelStore = { w: number; h: number; data: Uint8ClampedArray }

const stores = new WeakMap<HTMLCanvasElement, PixelStore>()

function parseFill(style: unknown): [number, number, number, number] {
  const s = String(style || '#000000').trim()
  if (s.startsWith('rgba')) {
    const m = s.match(/rgba?\(([^)]+)\)/)
    if (m) {
      const p = m[1].split(',').map(n => Number(n.trim()))
      return [p[0] || 0, p[1] || 0, p[2] || 0, Math.round((p[3] ?? 1) * 255)]
    }
  }
  const hex = s.startsWith('#') ? s.slice(1) : s
  if (hex.length === 3) {
    return [
      parseInt(hex[0] + hex[0], 16),
      parseInt(hex[1] + hex[1], 16),
      parseInt(hex[2] + hex[2], 16),
      255
    ]
  }
  if (hex.length >= 6) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
      255
    ]
  }
  return [0, 0, 0, 255]
}

function storeFor(canvas: HTMLCanvasElement): PixelStore {
  const w = canvas.width || 0
  const h = canvas.height || 0
  let buf = stores.get(canvas)
  if (!buf || buf.w !== w || buf.h !== h) {
    buf = { w, h, data: new Uint8ClampedArray(w * h * 4) }
    stores.set(canvas, buf)
  }
  return buf
}

function makeImageData(w: number, h: number, data?: Uint8ClampedArray) {
  const bytes = data ?? new Uint8ClampedArray(w * h * 4)
  return { data: bytes, width: w, height: h }
}

class Memory2DContext {
  canvas: HTMLCanvasElement
  fillStyle: string | CanvasGradient | CanvasPattern = '#000000'
  globalAlpha = 1
  globalCompositeOperation = 'source-over'
  imageSmoothingEnabled = false
  private stack: Array<{
    fillStyle: string | CanvasGradient | CanvasPattern
    globalAlpha: number
    op: string
  }> = []

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
  }

  save() {
    this.stack.push({
      fillStyle: this.fillStyle,
      globalAlpha: this.globalAlpha,
      op: this.globalCompositeOperation
    })
  }

  restore() {
    const s = this.stack.pop()
    if (!s) return
    this.fillStyle = s.fillStyle
    this.globalAlpha = s.globalAlpha
    this.globalCompositeOperation = s.op
  }

  clearRect(x: number, y: number, w: number, h: number) {
    const buf = storeFor(this.canvas)
    const x0 = Math.max(0, Math.floor(x))
    const y0 = Math.max(0, Math.floor(y))
    const x1 = Math.min(buf.w, Math.ceil(x + w))
    const y1 = Math.min(buf.h, Math.ceil(y + h))
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const i = (py * buf.w + px) * 4
        buf.data[i] = 0
        buf.data[i + 1] = 0
        buf.data[i + 2] = 0
        buf.data[i + 3] = 0
      }
    }
  }

  fillRect(x: number, y: number, w: number, h: number) {
    const buf = storeFor(this.canvas)
    const [r, g, b, a] = parseFill(this.fillStyle)
    const aa = Math.round(a * Math.max(0, Math.min(1, this.globalAlpha)))
    const x0 = Math.max(0, Math.floor(x))
    const y0 = Math.max(0, Math.floor(y))
    const x1 = Math.min(buf.w, Math.ceil(x + w))
    const y1 = Math.min(buf.h, Math.ceil(y + h))
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const i = (py * buf.w + px) * 4
        buf.data[i] = r
        buf.data[i + 1] = g
        buf.data[i + 2] = b
        buf.data[i + 3] = aa
      }
    }
  }

  getImageData(x: number, y: number, w: number, h: number) {
    const buf = storeFor(this.canvas)
    const out = new Uint8ClampedArray(w * h * 4)
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const sx = x0 + col
        const sy = y0 + row
        const di = (row * w + col) * 4
        if (sx < 0 || sy < 0 || sx >= buf.w || sy >= buf.h) continue
        const si = (sy * buf.w + sx) * 4
        out[di] = buf.data[si]
        out[di + 1] = buf.data[si + 1]
        out[di + 2] = buf.data[si + 2]
        out[di + 3] = buf.data[si + 3]
      }
    }
    return makeImageData(w, h, out)
  }

  putImageData(img: { data: ArrayLike<number>; width: number; height: number }, dx: number, dy: number) {
    const buf = storeFor(this.canvas)
    const x0 = Math.floor(dx)
    const y0 = Math.floor(dy)
    for (let row = 0; row < img.height; row++) {
      for (let col = 0; col < img.width; col++) {
        const tx = x0 + col
        const ty = y0 + row
        if (tx < 0 || ty < 0 || tx >= buf.w || ty >= buf.h) continue
        const si = (row * img.width + col) * 4
        const di = (ty * buf.w + tx) * 4
        buf.data[di] = img.data[si]
        buf.data[di + 1] = img.data[si + 1]
        buf.data[di + 2] = img.data[si + 2]
        buf.data[di + 3] = img.data[si + 3]
      }
    }
  }

  drawImage(src: CanvasImageSource, dx: number, dy: number) {
    const dest = storeFor(this.canvas)
    if (!(src instanceof HTMLCanvasElement)) return
    const from = storeFor(src)
    const ox = Math.floor(dx)
    const oy = Math.floor(dy)
    const a = Math.max(0, Math.min(1, this.globalAlpha))
    for (let row = 0; row < from.h; row++) {
      for (let col = 0; col < from.w; col++) {
        const tx = ox + col
        const ty = oy + row
        if (tx < 0 || ty < 0 || tx >= dest.w || ty >= dest.h) continue
        const si = (row * from.w + col) * 4
        const di = (ty * dest.w + tx) * 4
        const sa = (from.data[si + 3] / 255) * a
        if (sa <= 0) continue
        dest.data[di] = from.data[si]
        dest.data[di + 1] = from.data[si + 1]
        dest.data[di + 2] = from.data[si + 2]
        dest.data[di + 3] = Math.round(sa * 255)
      }
    }
  }

  beginPath() {}
  closePath() {}
  arc() {}
  rect() {}
  fill() {}
  clip() {}
  translate() {}
  scale() {}
  rotate() {}
  setTransform() {}
  createImageData(w: number, h: number) {
    return makeImageData(w, h)
  }
}

export function installCanvas2dStub() {
  const proto = HTMLCanvasElement.prototype
  proto.getContext = function (this: HTMLCanvasElement, type: string) {
    if (type === '2d') {
      const tagged = this as HTMLCanvasElement & { __pe2d?: Memory2DContext }
      if (!tagged.__pe2d || tagged.__pe2d.canvas !== this) {
        tagged.__pe2d = new Memory2DContext(this)
      }
      return tagged.__pe2d as unknown as CanvasRenderingContext2D
    }
    return null
  } as typeof proto.getContext

  proto.toDataURL = function (this: HTMLCanvasElement) {
    const buf = storeFor(this)
    let hash = 0
    for (let i = 0; i < buf.data.length; i += 16) hash = (hash * 33 + buf.data[i]) >>> 0
    return `data:image/png;base64,${hash.toString(16)}`
  }
}
