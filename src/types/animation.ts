import { Vector3D } from './mesh'

export interface BoneSocket {
  id: string
  name: string
  boneId: string
  position: Vector3D
  rotation: Vector3D
  scale: Vector3D
}

export interface IKConstraint {
  enabled: boolean
  targetBoneId?: string
  poleTargetBoneId?: string
  poleAngle?: number // degrees
  chainLength: number // 2 by default
  iterations?: number
  weight?: number // 0..1
}

export interface SpringConstraint {
  enabled: boolean
  stiffness: number // 0.05..1.0
  damping: number // 0.05..1.0
  gravity: number // 0.0..1.0
  wind?: Vector3D
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
  roll?: number // Bone roll in degrees
  childrenIds: string[]
  sockets?: BoneSocket[]
  ikConstraint?: IKConstraint
  springConstraint?: SpringConstraint
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

export type InterpolationType = 'step' | 'linear' | 'cubic' | 'bezier'

export interface KeyframeTangent {
  handleIn: { x: number; y: number } // relative frame offset and value offset
  handleOut: { x: number; y: number }
  type: 'auto' | 'free' | 'aligned' | 'vector'
}

export interface Keyframe<T> {
  id: string
  frame: number // Frame number (0, 1, 2...)
  value: T
  interpolation?: InterpolationType
  tangent?: KeyframeTangent
}

export type TrackTargetType = 'mesh' | 'bone'

export interface AnimationTrack {
  targetId: string // Mesh ID or Bone ID
  targetType: TrackTargetType
  targetName?: string
  interpolation?: InterpolationType
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

export interface OnionSkinningSettings {
  enabled: boolean
  framesBefore: number
  framesAfter: number
  step: number
  opacity: number
  colorBefore: string
  colorAfter: string
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

