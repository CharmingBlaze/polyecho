import { describe, expect, it } from 'vitest'
import { createCube } from '../geometry/Primitives'
import { resolveTextureTiling } from '../materials/TextureTiling'
import { ProjectSerializer } from './ProjectSerializer'

function cubeProjectJson(overrides: Record<string, unknown> = {}) {
  const cube = createCube('Cube', 2)
  return JSON.stringify({
    version: '1.0',
    appName: 'PSXModeller',
    projectName: 'Test',
    savedAt: '2026-01-01T00:00:00.000Z',
    meshes: [cube],
    textureDataUrl: '',
    activePalette: { id: 'p', name: 'P', colors: ['#ffffff'] },
    materials: [],
    armature: { bones: [], clips: [] },
    animations: [],
    activeAnimationId: null,
    currentFrame: 0,
    viewportSettings: {},
    ...overrides
  })
}

describe('ProjectSerializer', () => {
  it('accepts a version 1.0 cube project', () => {
    const proj = ProjectSerializer.deserialize(cubeProjectJson())
    expect(proj.meshes).toHaveLength(1)
    expect(proj.meshes[0].faces[0].vertexIds.length).toBe(4)
  })

  it('rejects invalid JSON and unknown versions', () => {
    expect(() => ProjectSerializer.deserialize('{')).toThrow(/not valid JSON/)
    expect(() => ProjectSerializer.deserialize(cubeProjectJson({ version: '9.0' }))).toThrow(/Unsupported project version/)
    expect(() => ProjectSerializer.deserialize(JSON.stringify({ meshes: 'nope' }))).toThrow(/missing meshes/)
  })

  it('migrates missing version / appName onto frozen 1.0', () => {
    const raw = JSON.parse(cubeProjectJson())
    delete raw.version
    delete raw.appName
    delete raw.armature
    delete raw.materials
    delete raw.animations
    delete raw.textures
    delete raw.referenceImages
    delete raw.viewportSettings
    delete raw.currentFrame
    delete raw.meshes[0].faces[0].uvs
    const proj = ProjectSerializer.deserialize(JSON.stringify(raw))
    expect(proj.version).toBe('1.0')
    expect(proj.appName).toBe('PSXModeller')
    expect(proj.armature).toBeTruthy()
    expect(proj.materials).toEqual([])
    expect(proj.animations).toEqual([])
    expect(proj.textures).toEqual([])
    expect(proj.referenceImages).toEqual([])
    expect(proj.currentFrame).toBe(0)
    expect(proj.viewportSettings).toEqual({})
    expect(proj.meshes[0].faces[0].uvs).toHaveLength(proj.meshes[0].faces[0].vertexIds.length)
  })

  it('round-trips serialize then deserialize', () => {
    const cube = createCube('Cube', 2)
    const canvas = document.createElement('canvas')
    canvas.width = 8
    canvas.height = 8
    canvas.getContext('2d')
    const json = ProjectSerializer.serialize(
      'Roundtrip',
      [cube],
      canvas,
      { id: 'p', name: 'P', colors: ['#ffffff'] },
      [],
      {
        id: 'armature',
        name: 'Armature',
        bones: [],
        rootBoneIds: [],
        clips: [],
        activeClipId: null
      },
      [],
      null,
      0,
      { shading: 'solid', showGrid: true } as import('../../types/tools').ViewportSettings
    )
    const proj = ProjectSerializer.deserialize(json)
    expect(proj.projectName).toBe('Roundtrip')
    expect(proj.version).toBe('1.0')
    expect(proj.appName).toBe('PSXModeller')
    expect(proj.meshes[0].vertices).toHaveLength(cube.vertices.length)
    expect(proj.meshes[0].faces).toHaveLength(6)
  })

  it('round-trips the textures library and fills a missing textures array', () => {
    const cube = createCube('Cube', 2)
    const canvas = document.createElement('canvas')
    canvas.width = 4
    canvas.height = 4
    canvas.getContext('2d')
    const json = ProjectSerializer.serialize(
      'Textured',
      [cube],
      canvas,
      { id: 'p', name: 'P', colors: ['#ffffff'] },
      [{
        id: 'mat_paint',
        name: 'PaintMat',
        textureId: 'tex_a',
        tileX: 3,
        tileY: 2.5,
        color: '#ffffff',
        shading: 'textured',
        psxJitter: false,
        psxJitterResolution: 240,
        psxAffine: false,
        dither: false,
        ditherLevel: 32,
        wireframe: false
      }],
      {
        id: 'armature',
        name: 'Armature',
        bones: [],
        rootBoneIds: [],
        clips: [],
        activeClipId: null
      },
      [],
      null,
      0,
      { shading: 'solid', showGrid: true } as import('../../types/tools').ViewportSettings,
      [{ id: 'tex_a', name: 'Paint', width: 4, height: 4, dataUrl: 'data:image/png;base64,aa' }]
    )
    const proj = ProjectSerializer.deserialize(json)
    expect(proj.textures).toHaveLength(1)
    expect(proj.textures?.[0].id).toBe('tex_a')
    expect(proj.materials[0].textureId).toBe('tex_a')
    expect(resolveTextureTiling(proj.materials[0])).toEqual({ tileX: 3, tileY: 2.5 })

    const raw = JSON.parse(cubeProjectJson())
    delete raw.textures
    const migrated = ProjectSerializer.deserialize(JSON.stringify(raw))
    expect(Array.isArray(migrated.textures)).toBe(true)
    expect(resolveTextureTiling(migrated.materials[0])).toEqual({ tileX: 1, tileY: 1 })
  })

  it('rejects faces whose UVs do not match vertexIds', () => {
    const cube = createCube('Cube', 2)
    cube.faces[0].uvs = cube.faces[0].uvs.slice(0, 1)
    expect(() => ProjectSerializer.deserialize(cubeProjectJson({ meshes: [cube] }))).toThrow(/uvs length/)
  })

  it('rejects corrupt vertex records and duplicate topology ids', () => {
    const invalidPosition = createCube('Cube', 2)
    ;(invalidPosition.vertices[0].position as { x: number | null }).x = null
    expect(() => ProjectSerializer.deserialize(cubeProjectJson({ meshes: [invalidPosition] }))).toThrow(/invalid id or position/)

    const duplicateVertex = createCube('Cube', 2)
    duplicateVertex.vertices[1].id = duplicateVertex.vertices[0].id
    expect(() => ProjectSerializer.deserialize(cubeProjectJson({ meshes: [duplicateVertex] }))).toThrow(/duplicate vertex id/)

    const duplicateFace = createCube('Cube', 2)
    duplicateFace.faces[1].id = duplicateFace.faces[0].id
    expect(() => ProjectSerializer.deserialize(cubeProjectJson({ meshes: [duplicateFace] }))).toThrow(/duplicate face id/)
  })

  it('rejects dangling, repeated, and malformed face corners', () => {
    const dangling = createCube('Cube', 2)
    dangling.faces[0].vertexIds[0] = 'missing'
    expect(() => ProjectSerializer.deserialize(cubeProjectJson({ meshes: [dangling] }))).toThrow(/missing vertex/)

    const repeated = createCube('Cube', 2)
    repeated.faces[0].vertexIds[1] = repeated.faces[0].vertexIds[0]
    expect(() => ProjectSerializer.deserialize(cubeProjectJson({ meshes: [repeated] }))).toThrow(/repeats a vertex/)

    const invalidUv = createCube('Cube', 2)
    ;(invalidUv.faces[0].uvs[0] as { u: number | null }).u = null
    expect(() => ProjectSerializer.deserialize(cubeProjectJson({ meshes: [invalidUv] }))).toThrow(/invalid uvs/)
  })

  it('rejects duplicate mesh ids before any project state can be applied', () => {
    const first = createCube('Cube', 2)
    const second = createCube('Other', 2)
    second.id = first.id
    expect(() => ProjectSerializer.deserialize(cubeProjectJson({ meshes: [first, second] }))).toThrow(/duplicate mesh id/)
  })
})
