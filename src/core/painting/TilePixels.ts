export const MAX_ATLAS_CELLS = 128
export const PREFERRED_TILE_PX = 16

/** Prefer 16px Minecraft-style cells, then 32 / 8 / 64, when the image divides evenly. */
export function inferPixelTileGrid(width: number, height: number): { cols: number; rows: number } | null {
  for (const size of [16, 32, 8, 64]) {
    if (width % size || height % size) continue
    const cols = width / size, rows = height / size
    if (cols >= 2 && rows >= 2 && cols <= MAX_ATLAS_CELLS && rows <= MAX_ATLAS_CELLS) return { cols, rows }
  }
  return null
}

/**
 * Map-editor palette grid. A leftover 2×2 (or any grid with cells larger than 32px)
 * on a real tilesheet is treated as unset and replaced with 16px cells.
 */
export function resolvePixelTileGrid(
  width: number,
  height: number,
  stored?: { cols: number; rows: number } | null
): { cols: number; rows: number } {
  const inferred = inferPixelTileGrid(width, height)
  const coarse = !stored || width / stored.cols > 32 || height / stored.rows > 32
  if (inferred && (coarse || !stored)) return inferred
  if (coarse) {
    const cols = Math.max(1, Math.min(MAX_ATLAS_CELLS, Math.floor(width / PREFERRED_TILE_PX)))
    const rows = Math.max(1, Math.min(MAX_ATLAS_CELLS, Math.floor(height / PREFERRED_TILE_PX)))
    if (cols >= 2 && rows >= 2) return { cols, rows }
  }
  return stored || inferred || { cols: 2, rows: 2 }
}

export type PixelTileLayout = { tileW: number; tileH: number; spacing?: number; margin?: number }

/** Tiled-style grid: tile size, gutter between tiles, and outer margin. */
export function pixelTileGrid(imageW: number, imageH: number, layout: PixelTileLayout) {
  const tileW = Math.max(1, Math.round(layout.tileW) || 1)
  const tileH = Math.max(1, Math.round(layout.tileH) || 1)
  const spacing = Math.max(0, Math.round(layout.spacing || 0))
  const margin = Math.max(0, Math.round(layout.margin || 0))
  const strideX = tileW + spacing
  const strideY = tileH + spacing
  const cols = Math.max(1, Math.min(MAX_ATLAS_CELLS, Math.floor((imageW - margin + spacing) / strideX)))
  const rows = Math.max(1, Math.min(MAX_ATLAS_CELLS, Math.floor((imageH - margin + spacing) / strideY)))
  const usedW = margin + cols * tileW + Math.max(0, cols - 1) * spacing
  const usedH = margin + rows * tileH + Math.max(0, rows - 1) * spacing
  return { cols, rows, tileW, tileH, spacing, margin, strideX, strideY, usedW, usedH }
}

/** Fixed pixel cells, same math as the map-editor picker. */
export function pixelTileRect(
  imageW: number,
  imageH: number,
  tileW: number,
  tileH: number,
  index: number,
  spacing = 0,
  margin = 0
) {
  const g = pixelTileGrid(imageW, imageH, { tileW, tileH, spacing, margin })
  const col = ((index % g.cols) + g.cols) % g.cols
  const row = Math.max(0, Math.min(g.rows - 1, Math.floor(index / g.cols)))
  const x = g.margin + col * g.strideX
  const y = g.margin + row * g.strideY
  return { x, y, width: Math.min(g.tileW, Math.max(0, imageW - x)), height: Math.min(g.tileH, Math.max(0, imageH - y)) }
}

export function pixelTileIndexAt(
  imageW: number,
  imageH: number,
  layout: PixelTileLayout,
  px: number,
  py: number
) {
  const g = pixelTileGrid(imageW, imageH, layout)
  const col = Math.max(0, Math.min(g.cols - 1, Math.floor((px - g.margin) / g.strideX)))
  const row = Math.max(0, Math.min(g.rows - 1, Math.floor((py - g.margin) / g.strideY)))
  return row * g.cols + col
}

/** Prefer a gutter that makes the chosen tile size tile the image with no leftover. */
export function inferTileSpacing(imageW: number, imageH: number, tileW: number, tileH: number, margin = 0) {
  for (const spacing of [0, 1, 2, 4, 8]) {
    const g = pixelTileGrid(imageW, imageH, { tileW, tileH, spacing, margin })
    if (g.usedW === imageW && g.usedH === imageH) return spacing
  }
  return null
}

/** Integer cell boundaries retain edge pixels even for non-divisible images. */
export function tileBounds(width: number, height: number, cols: number, rows: number, index: number) {
  const col = index % cols, row = Math.floor(index / cols)
  const x = Math.floor(col * width / cols), y = Math.floor(row * height / rows)
  return { x, y, width: Math.floor((col + 1) * width / cols) - x, height: Math.floor((row + 1) * height / rows) - y }
}

export function transformTile(data: Uint8ClampedArray, width: number, height: number, mode: 'horizontal' | 'vertical' | 'rotate') {
  if (mode === 'rotate' && width !== height) throw new Error('Rotation requires a square tile')
  const output = new Uint8ClampedArray(data.length)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const dx = mode === 'horizontal' ? width - 1 - x : mode === 'rotate' ? height - 1 - y : x
    const dy = mode === 'vertical' ? height - 1 - y : mode === 'rotate' ? x : y
    output.set(data.subarray((y * width + x) * 4, (y * width + x) * 4 + 4), (dy * width + dx) * 4)
  }
  return output
}
