import { PixelBuffer } from '../painting/PixelCanvas'

export class ImageImport {
  /**
   * Reads an Image file and draws it onto a target PixelBuffer with optional resizing and retro color quantization.
   */
  static async loadToPixelBuffer(
    file: File | Blob,
    targetBuffer: PixelBuffer,
    options?: { fitMode?: 'contain' | 'stretch' | 'tile' }
  ): Promise<void> {
    const url = URL.createObjectURL(file)
    const img = new Image()

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = err => reject(err)
      img.src = url
    })

    const canvas = document.createElement('canvas')
    canvas.width = targetBuffer.width
    canvas.height = targetBuffer.height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      URL.revokeObjectURL(url)
      return
    }

    ctx.imageSmoothingEnabled = false // Retro nearest-neighbor

    if (options?.fitMode === 'stretch' || !options?.fitMode) {
      ctx.drawImage(img, 0, 0, targetBuffer.width, targetBuffer.height)
    } else if (options?.fitMode === 'contain') {
      const hRatio = targetBuffer.width / img.width
      const vRatio = targetBuffer.height / img.height
      const ratio = Math.min(hRatio, vRatio)
      const centerShiftX = (targetBuffer.width - img.width * ratio) / 2
      const centerShiftY = (targetBuffer.height - img.height * ratio) / 2
      ctx.drawImage(
        img,
        0,
        0,
        img.width,
        img.height,
        centerShiftX,
        centerShiftY,
        img.width * ratio,
        img.height * ratio
      )
    }

    const imgData = ctx.getImageData(0, 0, targetBuffer.width, targetBuffer.height)
    targetBuffer.ctx.putImageData(imgData, 0, 0)
    URL.revokeObjectURL(url)
  }
}
