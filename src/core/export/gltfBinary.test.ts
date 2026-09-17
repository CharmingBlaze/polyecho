import { describe, expect, it } from 'vitest'
import { embedPngImages, injectClipExtras, injectNodeExtras, readGlb, writeGlb } from './gltfBinary'
import { encodePngRgba, findPngOffset, readPngIhdr } from '../painting/encodePng'

describe('gltfBinary', () => {
  it('round-trips JSON and BIN chunks', () => {
    const bin = new Uint8Array([1, 2, 3, 4, 5]).buffer
    const rebuilt = writeGlb({ asset: { version: '2.0' }, animations: [{ name: 'Walk' }] }, bin)
    const { json, bin: outBin } = readGlb(rebuilt)
    expect((json.asset as { version: string }).version).toBe('2.0')
    expect(outBin).toBeTruthy()
    expect(new Uint8Array(outBin!).slice(0, 5)).toEqual(new Uint8Array([1, 2, 3, 4, 5]))
  })

  it('injects animation extras without dropping BIN', () => {
    const bin = new Uint8Array([9, 8, 7, 6]).buffer
    const glb = writeGlb({ asset: { version: '2.0' }, animations: [{ name: 'Walk' }, { name: 'Idle' }] }, bin)
    const patched = injectClipExtras(glb, {
      Walk: { events: [{ name: 'footstep', frame: 12 }] }
    })
    const { json, bin: outBin } = readGlb(patched)
    const animations = json.animations as Array<{ name: string; extras?: { events: Array<{ name: string }> } }>
    expect(animations[0].extras?.events[0].name).toBe('footstep')
    expect(animations[1].extras).toBeUndefined()
    expect(new Uint8Array(outBin!).slice(0, 4)).toEqual(new Uint8Array([9, 8, 7, 6]))
  })

  it('injects node shade extras', () => {
    const bin = new Uint8Array([1, 2, 3, 4]).buffer
    const glb = writeGlb({ asset: { version: '2.0' }, nodes: [{ name: 'Hero' }, { name: 'Prop' }] }, bin)
    const patched = injectNodeExtras(glb, { Hero: { shadeMode: 'smooth' } })
    const { json } = readGlb(patched)
    const nodes = json.nodes as Array<{ name: string; extras?: { shadeMode: string } }>
    expect(nodes[0].extras?.shadeMode).toBe('smooth')
    expect(nodes[1].extras).toBeUndefined()
  })

  it('appends a real PNG image when the GLB has none', () => {
    const png = encodePngRgba(2, 2, new Uint8ClampedArray(16).fill(255))
    const glb = writeGlb({
      asset: { version: '2.0' },
      materials: [{ name: 'HeroMat', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }],
      buffers: [{ byteLength: 4 }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 4 }]
    }, new Uint8Array([1, 2, 3, 4]).buffer)
    const patched = embedPngImages(glb, [png])
    const { json, bin } = readGlb(patched)
    const images = json.images as Array<{ mimeType: string; bufferView: number }>
    expect(images[0].mimeType).toBe('image/png')
    const views = json.bufferViews as Array<{ byteOffset: number; byteLength: number }>
    const view = views[images[0].bufferView]
    const slice = new Uint8Array(bin!).slice(view.byteOffset, view.byteOffset + view.byteLength)
    expect(findPngOffset(slice)).toBe(0)
    expect(readPngIhdr(slice)).toEqual({ width: 2, height: 2 })
    expect((json.materials as Array<{ pbrMetallicRoughness: { baseColorTexture: { index: number } } }>)[0]
      .pbrMetallicRoughness.baseColorTexture.index).toBe(0)
  })
})
