import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import validator from 'gltf-validator'
import { exportToGLTF } from './GltfExport'
import { readGlb } from './gltfBinary'
import { findPngOffset, readPngIhdr } from '../painting/encodePng'
import { buildEngineHandoffScene } from './engineHandoffScene'

describe('engine hand-off GLB', () => {
  it('writes unique names, skin, UVs, two clips, and marker extras', async () => {
    const scene = buildEngineHandoffScene()
    const blob = await exportToGLTF(
      scene.meshes,
      scene.texMap,
      scene.clips,
      true,
      scene.armature,
      scene.materials
    )
    const bytes = Buffer.from(await blob.arrayBuffer())
    const { json, bin } = readGlb(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))

    const nodes = (json.nodes ?? []) as Array<{ name?: string }>
    const names = nodes.map(n => n.name).filter((n): n is string => !!n)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toContain('Bone')
    expect(names).toContain('Bone_2')

    expect(Array.isArray(json.skins) && (json.skins as unknown[]).length).toBeGreaterThanOrEqual(1)
    const skins = json.skins as Array<{ joints?: number[] }>
    expect((skins[0].joints ?? []).length).toBeGreaterThanOrEqual(2)

    const meshes = (json.meshes ?? []) as Array<{ primitives?: Array<{ attributes?: Record<string, number> }> }>
    const prim = meshes[0]?.primitives?.[0]
    expect(prim?.attributes && 'TEXCOORD_0' in prim.attributes).toBe(true)
    expect(prim?.attributes && 'JOINTS_0' in prim.attributes).toBe(true)
    expect(prim?.attributes && 'WEIGHTS_0' in prim.attributes).toBe(true)

    const mats = (json.materials ?? []) as Array<{ name?: string; pbrMetallicRoughness?: { baseColorTexture?: { index: number } } }>
    expect(mats.some(m => m.name === 'HeroMat')).toBe(true)

    const animations = (json.animations ?? []) as Array<{
      name?: string
      channels?: unknown[]
      extras?: { events?: Array<{ name: string; frame: number; time?: number }> }
    }>
    expect(animations.length).toBeGreaterThanOrEqual(2)
    expect(animations.map(a => a.name).sort()).toEqual(['Idle', 'Walk'])
    expect(animations.every(a => (a.channels?.length ?? 0) > 0)).toBe(true)
    const walk = animations.find(a => a.name === 'Walk')
    expect(walk?.extras?.events?.some(e => e.name === 'footstep' && e.frame === 12 && typeof e.time === 'number')).toBe(true)

    const images = (json.images ?? []) as Array<{ mimeType?: string; bufferView?: number }>
    expect(images.some(img => img.mimeType === 'image/png')).toBe(true)
    const views = (json.bufferViews ?? []) as Array<{ byteOffset?: number; byteLength: number }>
    expect(bin).toBeTruthy()
    const img = images.find(i => typeof i.bufferView === 'number')!
    const view = views[img.bufferView!]
    const png = new Uint8Array(bin!).slice(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength)
    expect(findPngOffset(png)).toBe(0)
    expect(readPngIhdr(png)).toEqual({ width: 8, height: 8 })

    const report = await validator.validateBytes(new Uint8Array(bytes))
    expect(report.issues.numErrors).toBe(0)

    const dest = resolve(process.cwd(), 'samples', 'engine-handoff.glb')
    mkdirSync(resolve(process.cwd(), 'samples'), { recursive: true })
    writeFileSync(dest, bytes)

    scene.dispose()
  }, 20000)
})
