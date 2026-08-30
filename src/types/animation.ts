import { Vector3D } from './mesh'

export interface BoneSocket {
  id: string
  name: string
  boneId: string
  position: Vector3D
  rotation: Vector3D
  scale: Vector3D
}

export interface Bone {
  id: string
  name: string
  parentId: string | null
  connectedToParent?: boolean
  head: Vector3D // Joint pivot in world/local space
  tail: Vector3D // Bone end
  position: Vector3D // Local translation offset (Pose)
  rotation: Vector3D // Euler angles in degrees (Pose)
  scale: Vector3D
  childrenIds: string[]
  sockets?: BoneSocket[]
}

export type BindingType = 'object' | 'rigid_vertex' | 'smooth_vertex'

export interface ObjectBoneBinding {
  id: string
  type: 'object'
  meshId: string
  boneId: string
}

export interface SkinBinding {
  id: string
  type: 'skin'
  meshId: string
  skeletonId: string
}

export type Binding = ObjectBoneBinding | SkinBinding

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
