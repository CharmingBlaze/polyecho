import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  createTiledTexture,
  MAX_TEXTURE_TILE,
  MIN_TEXTURE_TILE,
  normalizeTextureTile,
  resolveTextureTiling,
} from './TextureTiling'

describe('TextureTiling', () => {
  it('defaults missing and non-finite values to one', () => {
    expect(resolveTextureTiling(undefined)).toEqual({ tileX: 1, tileY: 1 })
    expect(resolveTextureTiling({ tileX: Number.NaN, tileY: Number.POSITIVE_INFINITY }))
      .toEqual({ tileX: 1, tileY: 1 })
  })

  it('preserves independent decimal repeats', () => {
    expect(resolveTextureTiling({ tileX: 3, tileY: 2.5 }))
      .toEqual({ tileX: 3, tileY: 2.5 })
  })

  it('clamps repeats to the supported range', () => {
    expect(normalizeTextureTile(0)).toBe(MIN_TEXTURE_TILE)
    expect(normalizeTextureTile(100)).toBe(MAX_TEXTURE_TILE)
  })

  it('does not mutate a texture shared by differently tiled materials', () => {
    const source = new THREE.Texture(document.createElement('canvas'))
    const first = createTiledTexture(source, { tileX: 2, tileY: 3 })
    const second = createTiledTexture(source, { tileX: 5, tileY: 7 })

    expect(first).not.toBe(source)
    expect(second).not.toBe(source)
    expect(first).not.toBe(second)
    expect(first.image).toBe(source.image)
    expect(second.image).toBe(source.image)
    expect(source.repeat.toArray()).toEqual([1, 1])
    expect(first.repeat.toArray()).toEqual([2, 3])
    expect(second.repeat.toArray()).toEqual([5, 7])
    expect(first.wrapS).toBe(THREE.RepeatWrapping)
    expect(first.wrapT).toBe(THREE.RepeatWrapping)
  })
})
