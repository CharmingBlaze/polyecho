import { hexToRgb, getBayerOffset, rgbToHex } from '../../utils/color'

export interface PixelDrawParams {
  x: number
  y: number
  colorHex: string
  size: number
  tool: 'brush' | 'eraser' | 'bucket' | 'line' | 'dither'
  startX?: number
  startY?: number
  ditherPalette?: string[]
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

  clear(fillHex = '#333842') {
    this.ctx.fillStyle = fillHex
    this.ctx.fillRect(0, 0, this.width, this.height)
  }

  setPixel(x: number, y: number, hex: string) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return
    this.ctx.fillStyle = hex
    this.ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1)
  }

  getPixelHex(x: number, y: number): string {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return '#000000'
    const imgData = this.ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data
    return rgbToHex(imgData[0], imgData[1], imgData[2])
  }

  drawBrush(x: number, y: number, colorHex: string, size = 1) {
    const half = Math.floor(size / 2)
    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        this.setPixel(x + dx, y + dy, colorHex)
      }
    }
  }

  erase(x: number, y: number, size = 1) {
    const half = Math.floor(size / 2)
    this.ctx.clearRect(Math.floor(x) - half, Math.floor(y) - half, size, size)
  }

  drawLine(x0: number, y0: number, x1: number, y1: number, colorHex: string, size = 1) {
    let dx = Math.abs(x1 - x0)
    let dy = Math.abs(y1 - y0)
    let sx = x0 < x1 ? 1 : -1
    let sy = y0 < y1 ? 1 : -1
    let err = dx - dy

    let curX = x0
    let curY = y0

    while (true) {
      this.drawBrush(curX, curY, colorHex, size)
      if (curX === x1 && curY === y1) break
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

  floodFill(startX: number, startY: number, fillHex: string) {
    const x0 = Math.floor(startX)
    const y0 = Math.floor(startY)
    if (x0 < 0 || x0 >= this.width || y0 < 0 || y0 >= this.height) return

    const targetHex = this.getPixelHex(x0, y0)
    if (targetHex.toLowerCase() === fillHex.toLowerCase()) return

    const queue: [number, number][] = [[x0, y0]]
    const visited = new Uint8Array(this.width * this.height)

    while (queue.length > 0) {
      const [x, y] = queue.pop()!
      const idx = y * this.width + x
      if (visited[idx]) continue
      visited[idx] = 1

      if (this.getPixelHex(x, y).toLowerCase() === targetHex.toLowerCase()) {
        this.setPixel(x, y, fillHex)

        if (x > 0 && !visited[y * this.width + (x - 1)]) queue.push([x - 1, y])
        if (x < this.width - 1 && !visited[y * this.width + (x + 1)]) queue.push([x + 1, y])
        if (y > 0 && !visited[(y - 1) * this.width + x]) queue.push([x, y - 1])
        if (y < this.height - 1 && !visited[(y + 1) * this.width + x]) queue.push([x, y + 1])
      }
    }
  }

  toDataURL(): string {
    return this.canvas.toDataURL('image/png')
  }

  loadFromDataURL(url: string): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        this.ctx.clearRect(0, 0, this.width, this.height)
        this.ctx.drawImage(img, 0, 0, this.width, this.height)
        resolve()
      }
      img.src = url
    })
  }
}
