import { Vector3D } from './mesh'

export interface Bone {
  id: string
  name: string
  parentId: string | null
  head: Vector3D // Joint pivot in world/local space
  tail: Vector3D // Bone end
  position: Vector3D // Local translation offset
  rotation: Vector3D // Euler angles in degrees
  scale: Vector3D
  childrenIds: string[]
}

export type InterpolationType = 'step' | 'linear' | 'cubic'

export interface Keyframe<T> {
  id: string
  frame: number // Frame number (0, 1, 2...)
  value: T
  interpolation?: InterpolationType
}

export type TrackTargetType = 'mesh' | 'bone'

export interface AnimationTrack {
  targetId: string // Mesh ID or Bone ID
  targetType: TrackTargetType
  targetName?: string
  positionKeys: Keyframe<Vector3D>[]
  rotationKeys: Keyframe<Vector3D>[]
  scaleKeys: Keyframe<Vector3D>[]
}

// Backward compatibility alias
export type BoneTrack = AnimationTrack

export interface AnimationMarker {
  id: string
  name: string
  frame: number
}

export interface AnimationClip {
  id: string
  name: string
  durationFrames: number // e.g. 24 or 30 frames
  fps: number // 10, 12 (PSX), 15, 24, 30, 60
  loop: boolean
  rootMotion?: boolean
  tracks: AnimationTrack[]
  markers?: AnimationMarker[]
}

export interface Armature {
  id: string
  name: string
  bones: Bone[]
  rootBoneIds: string[]
  clips: AnimationClip[]
  activeClipId: string | null
}
