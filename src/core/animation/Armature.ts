import { Armature, AnimationClip, AnimationTrack } from '../../types/animation'
import { Vector3D } from '../../types/mesh'
import { vec3 } from '../../utils/math'

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

/**
 * Samples track transform values at a given frame with interpolation.
 */
export function sampleTrack(track: AnimationTrack, frame: number): { position: Vector3D; rotation: Vector3D; scale: Vector3D } {
  const sampleVectorKeys = (keys: { frame: number; value: Vector3D; interpolation?: string }[], def: Vector3D): Vector3D => {
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

        let t = (frame - k1.frame) / (k2.frame - k1.frame)

        // Smooth cubic ease in/out
        if (k1.interpolation === 'cubic') {
          t = t * t * (3 - 2 * t)
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
