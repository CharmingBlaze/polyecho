import * as THREE from 'three'
import type { Material } from '../../types/texture'

export const MIN_TEXTURE_TILE = 0.01
export const MAX_TEXTURE_TILE = 64
export const DEFAULT_TEXTURE_TILE = 1

export interface TextureTiling {
  tileX: number
  tileY: number
}

export function normalizeTextureTile(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_TEXTURE_TILE
  return THREE.MathUtils.clamp(value, MIN_TEXTURE_TILE, MAX_TEXTURE_TILE)
}

export function resolveTextureTiling(
  material: Pick<Material, 'tileX' | 'tileY'> | null | undefined,
): TextureTiling {
  return {
    tileX: normalizeTextureTile(material?.tileX),
    tileY: normalizeTextureTile(material?.tileY),
  }
}

export function configureTiledTexture(
  texture: THREE.Texture,
  tiling: Pick<TextureTiling, 'tileX' | 'tileY'>,
): THREE.Texture {
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(
    normalizeTextureTile(tiling.tileX),
    normalizeTextureTile(tiling.tileY),
  )
  texture.needsUpdate = true
  return texture
}

/**
 * Makes a material-local texture transform while retaining the source image.
 * The clone prevents repeat/wrap changes from leaking to materials that share
 * the same project texture.
 */
export function createTiledTexture(
  source: THREE.Texture,
  tiling: Pick<TextureTiling, 'tileX' | 'tileY'>,
): THREE.Texture {
  return configureTiledTexture(source.clone(), tiling)
}
