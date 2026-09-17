import { describe, expect, it } from 'vitest'
import { inferPixelTileGrid, inferTileSpacing, pixelTileIndexAt, pixelTileRect, resolvePixelTileGrid, tileBounds, transformTile } from './TilePixels'
describe('Tile pixels', () => {
  it('infers a 16px Minecraft-style grid on evenly divisible atlases', () => {
    expect(inferPixelTileGrid(256, 256)).toEqual({ cols: 16, rows: 16 })
    expect(inferPixelTileGrid(64, 64)).toEqual({ cols: 4, rows: 4 })
    expect(inferPixelTileGrid(1024, 1024)).toEqual({ cols: 64, rows: 64 })
    expect(inferPixelTileGrid(17, 13)).toBeNull()
  })
  it('picks a fixed 16px cell instead of stretching leftover pixels across the grid', () => {
    expect(pixelTileRect(1254, 1254, 16, 16, 0)).toEqual({ x: 0, y: 0, width: 16, height: 16 })
    expect(pixelTileRect(1254, 1254, 16, 16, 78)).toEqual({ x: 0, y: 16, width: 16, height: 16 })
  })
  it('skips gutters so a 16px tile with 1px spacing lands on the next art cell', () => {
    expect(pixelTileRect(33, 16, 16, 16, 1, 1, 0)).toEqual({ x: 17, y: 0, width: 16, height: 16 })
    expect(inferTileSpacing(33, 16, 16, 16)).toBe(1)
    expect(pixelTileIndexAt(33, 16, { tileW: 16, tileH: 16, spacing: 1 }, 18, 2)).toBe(1)
  })
  it('replaces a leftover 2×2 on a large sheet with a 16px picker grid', () => {
    expect(resolvePixelTileGrid(256, 256, { cols: 2, rows: 2 })).toEqual({ cols: 16, rows: 16 })
    expect(resolvePixelTileGrid(1254, 1254, { cols: 2, rows: 2 })).toEqual({ cols: 78, rows: 78 })
    expect(resolvePixelTileGrid(16, 16, { cols: 2, rows: 2 })).toEqual({ cols: 2, rows: 2 })
  })
  it('covers every pixel without overlap for uneven atlas dimensions', () => {
    const visits = new Uint8Array(17 * 13)
    for (let i = 0; i < 12; i++) {
      const b = tileBounds(17, 13, 4, 3, i)
      for (let y = b.y; y < b.y + b.height; y++) for (let x = b.x; x < b.x + b.width; x++) visits[y * 17 + x]++
    }
    expect([...visits].every(n => n === 1)).toBe(true)
  })
  it('rotates clockwise, preserving all RGBA channels and reverses flips', () => {
    const pixels = new Uint8ClampedArray([1,2,3,4, 5,6,7,8, 9,10,11,12, 13,14,15,16])
    expect([...transformTile(pixels, 2, 2, 'rotate')]).toEqual([9,10,11,12, 1,2,3,4, 13,14,15,16, 5,6,7,8])
    expect(transformTile(transformTile(pixels, 2, 2, 'horizontal'), 2, 2, 'horizontal')).toEqual(pixels)
    expect(() => transformTile(new Uint8ClampedArray(24), 3, 2, 'rotate')).toThrow()
  })
})
