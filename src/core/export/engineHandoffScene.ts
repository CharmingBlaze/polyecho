import { autoWeightMeshToArmature } from '../animation/AutoSkinning'
import { createCube } from '../geometry/Primitives'
import { PixelBuffer } from '../painting/PixelCanvas'
import type { AnimationClip, Armature, Bone } from '../../types/animation'
import type { Material } from '../../types/texture'
import type { MeshObject } from '../../types/mesh'
import { buildExportTextureMap } from './GltfExport'
import type * as THREE from 'three'

function bone(id: string, parentId: string | null, y: number, name = id): Bone {
  return {
    id,
    name,
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

function clip(name: string, z1: number, withMarker: boolean): AnimationClip {
  return {
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
    }],
    markers: withMarker ? [{ id: `${name}_m0`, name: 'footstep', frame: 12 }] : []
  }
}

/** Character-like scene used by the engine-handoff test and `npm run handoff:glb`. */
export function buildEngineHandoffScene(): {
  meshes: MeshObject[]
  texMap: Map<string, THREE.Texture>
  clips: AnimationClip[]
  armature: Armature
  materials: Material[]
  dispose: () => void
} {
  const cube = createCube('Hero', 2)
  cube.materialId = 'mat_hero'
  const bones = [bone('root', null, 0, 'Bone'), bone('child', 'root', 1, 'Bone')]
  bones[1].childrenIds = []
  autoWeightMeshToArmature(cube, bones, { maxInfluences: 4 })
  const armature: Armature = {
    id: 'arm_hero',
    name: 'Armature',
    bones,
    rootBoneIds: ['root'],
    clips: [],
    activeClipId: null
  }
  const buf = new PixelBuffer(8, 8)
  buf.clear('#3366ff')
  const texMap = buildExportTextureMap([{
    id: 'tex_hero',
    name: 'HeroTex',
    width: 8,
    height: 8,
    pixelBuffer: buf
  }])
  const material: Material = {
    id: 'mat_hero',
    name: 'HeroMat',
    textureId: 'tex_hero',
    color: '#ffffff',
    shading: 'textured',
    psxJitter: false,
    psxJitterResolution: 240,
    psxAffine: false,
    dither: false,
    ditherLevel: 32,
    wireframe: false
  }
  return {
    meshes: [cube],
    texMap,
    clips: [clip('Walk', 30, true), clip('Idle', 0, false)],
    armature,
    materials: [material],
    dispose: () => {
      for (const tex of texMap.values()) tex.dispose()
    }
  }
}
