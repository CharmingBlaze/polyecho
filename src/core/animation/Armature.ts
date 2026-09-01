import { Armature, AnimationClip, AnimationTrack, Bone } from '../../types/animation'
import { MeshObject, Vector3D } from '../../types/mesh'
import { vec3 } from '../../utils/math'

/** Object-to-bone parent. `parentId` stays mesh-to-mesh; `parentBoneId` is the bind. */
export function resolveMeshBoneParentId(mesh: MeshObject, bones: Bone[]): string | undefined {
  if (mesh.parentBoneId && bones.some(b => b.id === mesh.parentBoneId)) return mesh.parentBoneId
  if (mesh.parentType === 'bone' && mesh.parentId && bones.some(b => b.id === mesh.parentId)) return mesh.parentId
  if (mesh.parentId && bones.some(b => b.id === mesh.parentId)) return mesh.parentId
  return undefined
}

export function setMeshBoneParent(mesh: MeshObject, boneId: string | null, armatureId?: string) {
  if (!boneId) {
    if (mesh.parentId && mesh.parentBoneId && mesh.parentId === mesh.parentBoneId) {
      mesh.parentId = undefined
    }
    if (mesh.parentType === 'bone') mesh.parentType = undefined
    mesh.parentBoneId = undefined
    return
  }
  mesh.parentBoneId = boneId
  mesh.parentType = 'bone'
  if (armatureId) mesh.armatureId = armatureId
  if (mesh.parentId === boneId) mesh.parentId = undefined
}

function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).substring(2, 9)}`
}

export function createDefaultArmature(name = 'Armature'): Armature {
  const defaultClip: AnimationClip = {
    id: genId('clip_idle'),
    name: 'Idle',
    durationFrames: 24,
    fps: 12,
    loop: true,
    tracks: []
  }

  return {
    id: genId('armature'),
    name,
    bones: [],
    rootBoneIds: [],
    clips: [defaultClip],
    activeClipId: defaultClip.id
  }
}

function evaluateCubicBezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const oneMinusT = 1 - t
  return (
    oneMinusT * oneMinusT * oneMinusT * p0 +
    3 * oneMinusT * oneMinusT * t * p1 +
    3 * oneMinusT * t * t * p2 +
    t * t * t * p3
  )
}

/**
 * Samples track transform values at a given frame with interpolation.
 */
export function sampleTrack(track: AnimationTrack, frame: number): { position: Vector3D; rotation: Vector3D; scale: Vector3D } {
  const sampleVectorKeys = (keys: { frame: number; value: Vector3D; interpolation?: string; tangent?: any }[], def: Vector3D): Vector3D => {
    if (keys.length === 0) return { ...def }
    if (keys.length === 1) return { ...keys[0].value }

    const sorted = [...keys].sort((a, b) => a.frame - b.frame)

    if (frame <= sorted[0].frame) return { ...sorted[0].value }
    if (frame >= sorted[sorted.length - 1].frame) return { ...sorted[sorted.length - 1].value }

    for (let i = 0; i < sorted.length - 1; i++) {
      const k1 = sorted[i]
      const k2 = sorted[i + 1]
      if (frame >= k1.frame && frame <= k2.frame) {
        if (k1.interpolation === 'step') {
          return { ...k1.value }
        }

        const deltaF = k2.frame - k1.frame
        let t = deltaF > 0 ? (frame - k1.frame) / deltaF : 0

        if (k1.interpolation === 'cubic') {
          t = t * t * (3 - 2 * t)
        } else if (k1.interpolation === 'bezier') {
          // Custom Bézier curve with tangent handles
          const outY = k1.tangent?.handleOut?.y ?? 0
          const inY = k2.tangent?.handleIn?.y ?? 0
          
          return {
            x: evaluateCubicBezier(t, k1.value.x, k1.value.x + outY, k2.value.x + inY, k2.value.x),
            y: evaluateCubicBezier(t, k1.value.y, k1.value.y + outY, k2.value.y + inY, k2.value.y),
            z: evaluateCubicBezier(t, k1.value.z, k1.value.z + outY, k2.value.z + inY, k2.value.z),
          }
        }

        return {
          x: k1.value.x + (k2.value.x - k1.value.x) * t,
          y: k1.value.y + (k2.value.y - k1.value.y) * t,
          z: k1.value.z + (k2.value.z - k1.value.z) * t,
        }
      }
    }
    return { ...def }
  }

  return {
    position: sampleVectorKeys(track.positionKeys, vec3(0, 0, 0)),
    rotation: sampleVectorKeys(track.rotationKeys, vec3(0, 0, 0)),
    scale: sampleVectorKeys(track.scaleKeys, vec3(1, 1, 1))
  }
}
