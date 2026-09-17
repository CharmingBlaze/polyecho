import { afterEach, describe, expect, it } from 'vitest'
import { PixelBuffer } from './PixelCanvas'
import {
  createStarterTextureContents,
  fillDefaultTexture,
  loadDefaultTexturePref,
  normalizeDefaultTexturePref,
  saveDefaultTexturePref
} from './DefaultTextures'

afterEach(() => {
  localStorage.removeItem('polyecho_default_texture')
})

describe('default texture presets', () => {
  it('fills a solid color starter instead of the retro atlas', () => {
    const buf = new PixelBuffer(64, 64)
    fillDefaultTexture(buf, { kind: 'white', color: '#808080' })
    expect(buf.getPixelHex(0, 0).toLowerCase()).toBe('#ffffff')
    expect(buf.getPixelHex(40, 40).toLowerCase()).toBe('#ffffff')
  })

  it('fills a checkerboard starter', () => {
    const buf = new PixelBuffer(64, 64)
    fillDefaultTexture(buf, { kind: 'checker', color: '#808080' })
    expect(buf.getPixelHex(0, 0).toLowerCase()).toBe('#d1d5db')
    expect(buf.getPixelHex(8, 0).toLowerCase()).toBe('#6b7280')
  })

  it('persists the chosen starter and uses it for new texture contents', () => {
    saveDefaultTexturePref({ kind: 'color', color: '#ff00aa' })
    expect(loadDefaultTexturePref()).toEqual({ kind: 'color', color: '#ff00aa' })
    const starter = createStarterTextureContents()
    expect(starter.name).toBe('Texture_Color_64x64')
    expect(starter.atlas).toBeUndefined()
    expect(starter.pixelBuffer.getPixelHex(12, 12).toLowerCase()).toBe('#ff00aa')
  })

  it('rejects unknown kinds', () => {
    expect(normalizeDefaultTexturePref({ kind: 'nope', color: 'red' })).toEqual({
      kind: 'atlas',
      color: '#808080'
    })
  })
})
