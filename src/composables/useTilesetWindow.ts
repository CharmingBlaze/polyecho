import { computed, reactive, ref } from 'vue'
import type { PaintRect } from '../core/painting/PaintSelection'
import { pixelTileRect, tileBounds } from '../core/painting/TilePixels'

export type TilesetRegion = { x: number; y: number; width: number; height: number }
export type TilesetUseMode = 'stamp' | 'paint'

/** Working atlas for stamp / clipped paint. Independent of the floating editor. */
export const tilesetImageId = ref<string | null>(null)
export const tilesetPanelOpen = ref(false)
export const tilesetTileIndex = ref(0)
export const tilesetRegion = ref<TilesetRegion | null>(null)
export const tilesetUseMode = ref<TilesetUseMode>('stamp')
export const tilesetClipPaint = ref(true)
export const tilesetTileWidth = ref(16)
export const tilesetTileHeight = ref(16)
export const tilesetCols = ref(2)
export const tilesetRows = ref(2)
export const tilesetSpacing = ref(0)
export const tilesetMargin = ref(0)
export const tilesetStamp = reactive({
  individual: true,
  inset: 0.5,
  rotation: 0,
  flip: false
})

export function activateTileset(imageId: string) {
  if (tilesetImageId.value !== imageId) {
    tilesetImageId.value = imageId
    tilesetTileIndex.value = 0
    tilesetRegion.value = null
  }
}

export function openTileset(imageId: string) {
  activateTileset(imageId)
  tilesetPanelOpen.value = true
}

export function closeTilesetPanel() {
  tilesetPanelOpen.value = false
}

export function clearTilesetSession() {
  tilesetImageId.value = null
  tilesetPanelOpen.value = false
  tilesetRegion.value = null
  tilesetTileIndex.value = 0
  tilesetTileWidth.value = 16
  tilesetTileHeight.value = 16
  tilesetCols.value = 2
  tilesetRows.value = 2
  tilesetSpacing.value = 0
  tilesetMargin.value = 0
}

export function selectTilesetTile(index: number) {
  tilesetTileIndex.value = Math.max(0, index)
}

export function tilesetActiveBounds(width: number, height: number, cols: number, rows: number): TilesetRegion {
  if (tilesetRegion.value) return tilesetRegion.value
  if (tilesetTileWidth.value > 0 && tilesetTileHeight.value > 0) {
    return pixelTileRect(width, height, tilesetTileWidth.value, tilesetTileHeight.value, tilesetTileIndex.value, tilesetSpacing.value, tilesetMargin.value)
  }
  return tileBounds(width, height, cols, rows, tilesetTileIndex.value)
}

export function tilesetPaintClip(textureId: string, width: number, height: number, cols: number, rows: number): PaintRect | null {
  if (!tilesetClipPaint.value || tilesetUseMode.value !== 'paint' || tilesetImageId.value !== textureId) return null
  const bounds = tilesetActiveBounds(width, height, cols, rows)
  return { x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height }
}

export const tilesetSessionActive = computed(() => Boolean(tilesetImageId.value))
