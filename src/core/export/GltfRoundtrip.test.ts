import { describe, expect, it } from 'vitest'
import { Triangle, Vector3 } from 'three'
import { createCube, createCylinder } from '../geometry/Primitives'
import { createImagePlane } from '../geometry/ImagePlane'
import { meshToThreeGeometry } from '../geometry/Converters'
import { buildExportTextureMap, exportToGLTF } from './GltfExport'
import { readGlb } from './gltfBinary'
import { PixelBuffer } from '../painting/PixelCanvas'
import type { Material } from '../../types/texture'
import { GltfImport } from '../import/GltfImport'
import { autoWeightMeshToArmature } from '../animation/AutoSkinning'
import type { AnimationClip, Armature, Bone } from '../../types/animation'

function bone(id: string, parentId: string | null, y: number): Bone {
  return {
    id,
    name: id,
    parentId,
    head: { x: 0, y, z: 0 },
    tail: { x: 0, y: y + 1, z: 0 },
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    childrenIds: parentId ? [] : ['child'],
    roll: 0
  }
}

function renderedSurface(mesh: ReturnType<typeof createCube>) {
  const { geometry } = meshToThreeGeometry(mesh)
  const position = geometry.getAttribute('position')
  const points = new Set<string>()
  let area = 0
  for (let i = 0; i < position.count; i += 3) {
    const corners = [0, 1, 2].map(offset => {
      const point = new Vector3().fromBufferAttribute(position, i + offset)
      points.add(point.toArray().map(value => value.toFixed(5)).join(','))
      return point
    }) as [Vector3, Vector3, Vector3]
    area += new Triangle(...corners).getArea()
  }
  geometry.dispose()
  return { area, triangleCount: position.count / 3, points: [...points].sort() }
}

describe('GLB I/O', () => {
  it('exports a cube GLB as triangles and imports it back as six welded quads', async () => {
    const cube = createCube('Cube', 2)
    const blob = await exportToGLTF([cube], new Map(), [], true)
    expect(blob.size).toBeGreaterThan(100)
    const { json } = readGlb(await blob.arrayBuffer())
    const primitive = (json.meshes as Array<{ primitives: Array<{ mode?: number }> }>)[0].primitives[0]
    expect(primitive.mode ?? 4).toBe(4)
    const { meshes } = await GltfImport.loadFromArrayBuffer(await blob.arrayBuffer(), 'Imported')
    expect(meshes.length).toBeGreaterThanOrEqual(1)
    expect(meshes[0].faces.length).toBe(6)
    expect(meshes[0].vertices.length).toBe(8)
    for (const face of meshes[0].faces) {
      expect(face.vertexIds.length).toBe(4)
      expect(face.uvs.length).toBe(4)
    }
  }, 20000)

  it('keeps bent-quad render triangles identical through GLB', async () => {
    const cube = createCube('BentCube', 2)
    cube.vertices[0]!.position.x += 0.35
    cube.vertices[0]!.position.y += 0.2
    cube.vertices[0]!.position.z -= 0.15
    const before = renderedSurface(cube)
    const blob = await exportToGLTF([cube], new Map(), [], true)
    const { meshes } = await GltfImport.loadFromArrayBuffer(await blob.arrayBuffer(), 'Bent')
    const after = renderedSurface(meshes[0])
    expect(after.points).toEqual(before.points)
    expect(after.triangleCount).toBe(before.triangleCount)
    expect(after.area).toBeCloseTo(before.area, 4)
    expect(meshes[0].faces.every(face => face.uvs.length === face.vertexIds.length)).toBe(true)
  }, 20000)

  it('round-trips an n-gon cylinder as a closed editable surface', async () => {
    const cylinder = createCylinder('Cylinder', 1, 2, 8)
    const before = renderedSurface(cylinder)
    const blob = await exportToGLTF([cylinder], new Map(), [], true)
    const { meshes } = await GltfImport.loadFromArrayBuffer(await blob.arrayBuffer(), 'Cylinder')
    const imported = meshes[0]
    expect(imported.vertices).toHaveLength(16)
    const after = renderedSurface(imported)
    expect(after.points).toEqual(before.points)
    expect(after.triangleCount).toBe(before.triangleCount)
    expect(after.area).toBeCloseTo(before.area, 4)
    expect(imported.faces.every(face => face.uvs.length === face.vertexIds.length)).toBe(true)
    const incidence = new Map<string, number>()
    for (const face of imported.faces) for (let i = 0; i < face.vertexIds.length; i++) {
      const key = [face.vertexIds[i], face.vertexIds[(i + 1) % face.vertexIds.length]].sort().join('|')
      incidence.set(key, (incidence.get(key) ?? 0) + 1)
    }
    expect([...incidence.values()].every(count => count === 2)).toBe(true)
  }, 20000)

  it('exports a skinned cube with bones that import back as an armature', async () => {
    const cube = createCube('SkinnedCube', 2)
    const bones = [bone('root', null, 0), bone('child', 'root', 1)]
    bones[1].childrenIds = []
    autoWeightMeshToArmature(cube, bones, { maxInfluences: 4 })
    const armature: Armature = {
      id: 'arm_test',
      name: 'Armature',
      bones,
      rootBoneIds: ['root'],
      clips: [],
      activeClipId: null
    }
    const blob = await exportToGLTF([cube], new Map(), [], true, armature)
    const { meshes, armature: imported } = await GltfImport.loadFromArrayBuffer(await blob.arrayBuffer(), 'Rig')
    expect(meshes.length).toBeGreaterThanOrEqual(1)
    expect(imported?.bones.length).toBeGreaterThanOrEqual(2)
  }, 20000)

  it('exports two bone clips and imports rotation keys', async () => {
    const cube = createCube('ClipCube', 2)
    const bones = [bone('root', null, 0), bone('child', 'root', 1)]
    bones[1].childrenIds = []
    autoWeightMeshToArmature(cube, bones, { maxInfluences: 4 })
    const armature: Armature = {
      id: 'arm_clips',
      name: 'Armature',
      bones,
      rootBoneIds: ['root'],
      clips: [],
      activeClipId: null
    }
    const clip = (name: string, z1: number): AnimationClip => ({
      id: name,
      name,
      durationFrames: 24,
      fps: 24,
      loop: true,
      tracks: [{
        targetId: 'root',
        targetType: 'bone',
        positionKeys: [],
        scaleKeys: [],
        rotationKeys: [
          { id: `${name}_0`, frame: 0, value: { x: 0, y: 0, z: 0 } },
          { id: `${name}_1`, frame: 24, value: { x: 0, y: 0, z: z1 } }
        ]
      }]
    })
    const blob = await exportToGLTF(
      [cube],
      new Map(),
      [clip('Walk', 25), clip('Idle', 0)],
      true,
      armature
    )
    const { animations, armature: imported } = await GltfImport.loadFromArrayBuffer(
      await blob.arrayBuffer(),
      'Clips'
    )
    const clips = animations ?? imported?.clips ?? []
    expect(clips.length).toBeGreaterThanOrEqual(2)
    const withRot = clips.filter(c => c.tracks.some(t => t.rotationKeys.length > 0))
    expect(withRot.length).toBeGreaterThanOrEqual(1)
  }, 20000)

  it('exports a material map and imports a bound material', async () => {
    const cube = createCube('TexturedCube', 2)
    cube.materialId = 'mat_paint'
    const buf = new PixelBuffer(8, 8)
    buf.clear('#ff3366')
    buf.drawBrush(1, 1, '#00ff00', 1, 1, 'square', true)
    const texMap = buildExportTextureMap([{
      id: 'tex_paint',
      name: 'Paint',
      width: 8,
      height: 8,
      pixelBuffer: buf
    }])
    const material: Material = {
      id: 'mat_paint',
      name: 'PaintMat',
      textureId: 'tex_paint',
      tileX: 3,
      tileY: 2.5,
      color: '#ffffff',
      shading: 'textured',
      roughness: 0.35,
      metalness: 0.6,
      psxJitter: false,
      psxJitterResolution: 240,
      psxAffine: false,
      dither: false,
      ditherLevel: 32,
      wireframe: false
    }
    const blob = await exportToGLTF([cube], texMap, [], true, undefined, [material])
    const { json: gltf } = readGlb(await blob.arrayBuffer())
    const mats = (gltf.materials ?? []) as Array<{
      name?: string
      pbrMetallicRoughness?: {
        baseColorTexture?: {
          extensions?: { KHR_texture_transform?: { scale?: number[] } }
        }
      }
    }>
    expect(mats.length).toBeGreaterThanOrEqual(1)
    expect(mats.some(m => m.name === 'PaintMat')).toBe(true)
    expect(mats[0].pbrMetallicRoughness?.baseColorTexture?.extensions?.KHR_texture_transform?.scale)
      .toEqual([3, 2.5])

    const imported = await GltfImport.loadFromArrayBuffer(await blob.arrayBuffer(), 'Tex')
    expect(imported.meshes[0].materialId).not.toBe('default_material')
    expect(imported.materials?.length).toBeGreaterThanOrEqual(1)
    expect(imported.materials?.[0].roughness).toBeCloseTo(0.35, 2)
    expect(imported.materials?.[0].metalness).toBeCloseTo(0.6, 2)
    expect(imported.materials?.[0].tileX).toBeCloseTo(3, 4)
    expect(imported.materials?.[0].tileY).toBeCloseTo(2.5, 4)
    for (const tex of texMap.values()) tex.dispose()
  }, 20000)

  it('round-trips an unlit, double-sided alpha image card', async () => {
    const card = createImagePlane({
      name: 'TreeCard',
      imageWidth: 32,
      imageHeight: 64,
      height: 3,
      materialId: 'mat_tree',
      transform: {
        position: { x: 1, y: 0, z: -2 },
        rotation: { x: 0, y: 30, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
    })
    const buffer = new PixelBuffer(4, 4)
    buffer.clear('rgba(0, 0, 0, 0)')
    buffer.drawBrush(2, 2, '#33cc55', 1, 1, 'square', true)
    const textureMap = buildExportTextureMap([{
      id: 'tex_tree',
      name: 'Tree',
      width: 4,
      height: 4,
      pixelBuffer: buffer,
    }])
    const material: Material = {
      id: 'mat_tree',
      name: 'TreeCardMaterial',
      textureId: 'tex_tree',
      color: '#ffffff',
      fill: 'image',
      shading: 'unlit',
      opacity: 1,
      blendMode: 'mask',
      alphaTest: 0.12,
      doubleSided: true,
      psxJitter: false,
      psxJitterResolution: 240,
      psxAffine: false,
      dither: false,
      ditherLevel: 32,
      wireframe: false,
    }

    const blob = await exportToGLTF([card], textureMap, [], true, undefined, [material])
    const { json } = readGlb(await blob.arrayBuffer())
    const exported = (json.materials as Array<{
      alphaMode?: string
      alphaCutoff?: number
      doubleSided?: boolean
      extensions?: Record<string, unknown>
      pbrMetallicRoughness?: { baseColorTexture?: { index: number } }
    }>)[0]
    expect(exported.alphaMode).toBe('MASK')
    expect(exported.alphaCutoff).toBeCloseTo(0.12, 4)
    expect(exported.doubleSided).toBe(true)
    expect(exported.extensions).toHaveProperty('KHR_materials_unlit')
    expect(exported.pbrMetallicRoughness?.baseColorTexture?.index).toBeTypeOf('number')

    const imported = await GltfImport.loadFromArrayBuffer(await blob.arrayBuffer(), 'Tree')
    expect(imported.meshes[0].faces).toHaveLength(1)
    expect(imported.meshes[0].position).toMatchObject({ x: 1, y: 0, z: -2 })
    expect(imported.meshes[0].rotation.y).toBeCloseTo(30, 1)
    expect(imported.materials?.[0]).toMatchObject({
      shading: 'unlit',
      blendMode: 'mask',
      doubleSided: true,
    })
    expect(imported.materials?.[0].alphaTest).toBeCloseTo(0.12, 4)
    for (const texture of textureMap.values()) texture.dispose()
  }, 20000)

  it('preserves object-mode TRS instead of baking world verts', async () => {
    const cube = createCube('MovedCube', 2)
    cube.position = { x: 1.5, y: 2, z: -0.25 }
    cube.rotation = { x: 0, y: 45, z: 0 }
    cube.scale = { x: 2, y: 1, z: 0.5 }
    const blob = await exportToGLTF([cube], new Map(), [], true)
    const { meshes } = await GltfImport.loadFromArrayBuffer(await blob.arrayBuffer(), 'TRS')
    expect(meshes.length).toBeGreaterThanOrEqual(1)
    const imported = meshes[0]
    expect(imported.position.x).toBeCloseTo(1.5, 3)
    expect(imported.position.y).toBeCloseTo(2, 3)
    expect(imported.position.z).toBeCloseTo(-0.25, 3)
    expect(imported.rotation.y).toBeCloseTo(45, 1)
    expect(imported.scale.x).toBeCloseTo(2, 3)
    expect(imported.scale.y).toBeCloseTo(1, 3)
    expect(imported.scale.z).toBeCloseTo(0.5, 3)
    const maxLocal = Math.max(...imported.vertices.map(v => Math.abs(v.position.x)))
    expect(maxLocal).toBeLessThan(1.2)
  }, 20000)

  it('round-trips vertex colors and skin weights', async () => {
    const cube = createCube('WeightedCube', 2)
    cube.vertices[0].color = '#ff0000'
    const bones = [bone('root', null, 0), bone('child', 'root', 1)]
    bones[1].childrenIds = []
    autoWeightMeshToArmature(cube, bones, { maxInfluences: 4 })
    const armature: Armature = {
      id: 'arm_weights',
      name: 'Armature',
      bones,
      rootBoneIds: ['root'],
      clips: [],
      activeClipId: null
    }
    const blob = await exportToGLTF([cube], new Map(), [], true, armature)
    const { meshes, armature: imported } = await GltfImport.loadFromArrayBuffer(await blob.arrayBuffer(), 'Weights')
    expect(imported?.bones.length).toBeGreaterThanOrEqual(2)
    const boneIds = new Set((imported?.bones ?? []).map(b => b.id))
    const weighted = meshes[0].vertices.filter(v => v.boneWeights && Object.keys(v.boneWeights).length > 0)
    expect(weighted.length).toBeGreaterThan(0)
    expect(Object.keys(weighted[0].boneWeights!).some(id => boneIds.has(id))).toBe(true)
    expect(meshes[0].vertices.some(v => v.color?.toLowerCase() === '#ff0000')).toBe(true)
  }, 20000)

  it('round-trips Shade Smooth and Smooth by Angle extras', async () => {
    const smooth = createCube('SmoothCube', 2)
    smooth.shadeMode = 'smooth'
    const smoothBlob = await exportToGLTF([smooth], new Map(), [], true)
    const smoothImported = await GltfImport.loadFromArrayBuffer(await smoothBlob.arrayBuffer(), 'Smooth')
    expect(smoothImported.meshes[0].shadeMode).toBe('smooth')

    const auto = createCube('AutoCube', 2)
    auto.shadeMode = 'auto'
    auto.autoSmoothAngle = 45
    const autoBlob = await exportToGLTF([auto], new Map(), [], true)
    const autoImported = await GltfImport.loadFromArrayBuffer(await autoBlob.arrayBuffer(), 'Auto')
    expect(autoImported.meshes[0].shadeMode).toBe('auto')
    expect(autoImported.meshes[0].autoSmoothAngle).toBe(45)
  }, 20000)
})

