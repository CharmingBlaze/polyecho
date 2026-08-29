import { MeshObject } from '../../types/mesh'
import { Armature, Bone, AnimationClip } from '../../types/animation'
import { createCube } from './Primitives'

function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).substring(2, 9)}`
}

export interface ProjectTemplate {
  name: string
  meshes: MeshObject[]
  armature?: Armature
}

/**
 * Generates a low-poly rigged character template with Head, Torso, Arms, Legs
 */
export function createCharacterTemplate(): ProjectTemplate {
  const meshes: MeshObject[] = []

  // 1. Torso
  const torso = createCube('Torso', 1)
  torso.position = { x: 0, y: 1.5, z: 0 }
  torso.scale = { x: 0.9, y: 1.2, z: 0.5 }
  meshes.push(torso)

  // 2. Head
  const head = createCube('Head', 0.7)
  head.position = { x: 0, y: 2.5, z: 0 }
  meshes.push(head)

  // 3. Left Arm
  const leftArm = createCube('Arm_L', 0.8)
  leftArm.position = { x: -0.7, y: 1.5, z: 0 }
  leftArm.scale = { x: 0.35, y: 1.1, z: 0.35 }
  meshes.push(leftArm)

  // 4. Right Arm
  const rightArm = createCube('Arm_R', 0.8)
  rightArm.position = { x: 0.7, y: 1.5, z: 0 }
  rightArm.scale = { x: 0.35, y: 1.1, z: 0.35 }
  meshes.push(rightArm)

  // 5. Left Leg
  const leftLeg = createCube('Leg_L', 0.8)
  leftLeg.position = { x: -0.25, y: 0.5, z: 0 }
  leftLeg.scale = { x: 0.4, y: 1.0, z: 0.4 }
  meshes.push(leftLeg)

  // 6. Right Leg
  const rightLeg = createCube('Leg_R', 0.8)
  rightLeg.position = { x: 0.25, y: 0.5, z: 0 }
  rightLeg.scale = { x: 0.4, y: 1.0, z: 0.4 }
  meshes.push(rightLeg)

  // Armature for Character
  const rootBone: Bone = {
    id: 'bone_root',
    name: 'Root_Hips',
    parentId: null,
    head: { x: 0, y: 1.0, z: 0 },
    tail: { x: 0, y: 1.8, z: 0 },
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    childrenIds: ['bone_head', 'bone_arm_l', 'bone_arm_r', 'bone_leg_l', 'bone_leg_r']
  }

  const headBone: Bone = {
    id: 'bone_head',
    name: 'Head',
    parentId: 'bone_root',
    head: { x: 0, y: 2.1, z: 0 },
    tail: { x: 0, y: 2.8, z: 0 },
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    childrenIds: []
  }

  const armLBone: Bone = {
    id: 'bone_arm_l',
    name: 'Arm_Left',
    parentId: 'bone_root',
    head: { x: -0.7, y: 1.9, z: 0 },
    tail: { x: -0.7, y: 1.0, z: 0 },
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    childrenIds: []
  }

  const armRBone: Bone = {
    id: 'bone_arm_r',
    name: 'Arm_Right',
    parentId: 'bone_root',
    head: { x: 0.7, y: 1.9, z: 0 },
    tail: { x: 0.7, y: 1.0, z: 0 },
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    childrenIds: []
  }

  const legLBone: Bone = {
    id: 'bone_leg_l',
    name: 'Leg_Left',
    parentId: 'bone_root',
    head: { x: -0.25, y: 1.0, z: 0 },
    tail: { x: -0.25, y: 0, z: 0 },
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    childrenIds: []
  }

  const legRBone: Bone = {
    id: 'bone_leg_r',
    name: 'Leg_Right',
    parentId: 'bone_root',
    head: { x: 0.25, y: 1.0, z: 0 },
    tail: { x: 0.25, y: 0, z: 0 },
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    childrenIds: []
  }

  // Walk Cycle Animation
  const walkClip: AnimationClip = {
    id: 'clip_walk',
    name: 'Walk Cycle',
    durationFrames: 24,
    fps: 12,
    loop: true,
    tracks: [
      {
        targetId: 'bone_arm_l',
        targetType: 'bone',
        positionKeys: [],
        rotationKeys: [
          { id: genId('k'), frame: 0, value: { x: -25, y: 0, z: 0 }, interpolation: 'linear' },
          { id: genId('k'), frame: 12, value: { x: 25, y: 0, z: 0 }, interpolation: 'linear' },
          { id: genId('k'), frame: 24, value: { x: -25, y: 0, z: 0 }, interpolation: 'linear' }
        ],
        scaleKeys: []
      },
      {
        targetId: 'bone_arm_r',
        targetType: 'bone',
        positionKeys: [],
        rotationKeys: [
          { id: genId('k'), frame: 0, value: { x: 25, y: 0, z: 0 }, interpolation: 'linear' },
          { id: genId('k'), frame: 12, value: { x: -25, y: 0, z: 0 }, interpolation: 'linear' },
          { id: genId('k'), frame: 24, value: { x: 25, y: 0, z: 0 }, interpolation: 'linear' }
        ],
        scaleKeys: []
      },
      {
        targetId: 'bone_leg_l',
        targetType: 'bone',
        positionKeys: [],
        rotationKeys: [
          { id: genId('k'), frame: 0, value: { x: 25, y: 0, z: 0 }, interpolation: 'linear' },
          { id: genId('k'), frame: 12, value: { x: -25, y: 0, z: 0 }, interpolation: 'linear' },
          { id: genId('k'), frame: 24, value: { x: 25, y: 0, z: 0 }, interpolation: 'linear' }
        ],
        scaleKeys: []
      },
      {
        targetId: 'bone_leg_r',
        targetType: 'bone',
        positionKeys: [],
        rotationKeys: [
          { id: genId('k'), frame: 0, value: { x: -25, y: 0, z: 0 }, interpolation: 'linear' },
          { id: genId('k'), frame: 12, value: { x: 25, y: 0, z: 0 }, interpolation: 'linear' },
          { id: genId('k'), frame: 24, value: { x: -25, y: 0, z: 0 }, interpolation: 'linear' }
        ],
        scaleKeys: []
      }
    ]
  }

  const armature: Armature = {
    id: genId('armature_char'),
    name: 'Character_Rig',
    bones: [rootBone, headBone, armLBone, armRBone, legLBone, legRBone],
    rootBoneIds: ['bone_root'],
    clips: [walkClip],
    activeClipId: walkClip.id
  }

  return {
    name: 'Retro_Character',
    meshes,
    armature
  }
}

/**
 * Generates a retro treasure chest prop template
 */
export function createTreasureChestTemplate(): ProjectTemplate {
  const meshes: MeshObject[] = []

  // Chest Base
  const base = createCube('Chest_Base', 1.6)
  base.position = { x: 0, y: 0.5, z: 0 }
  base.scale = { x: 1.2, y: 0.6, z: 0.8 }
  meshes.push(base)

  // Chest Lid
  const lid = createCube('Chest_Lid', 1.6)
  lid.position = { x: 0, y: 1.2, z: 0 }
  lid.scale = { x: 1.24, y: 0.35, z: 0.84 }
  meshes.push(lid)

  // Lock
  const lock = createCube('Chest_Lock', 0.25)
  lock.position = { x: 0, y: 0.9, z: 0.7 }
  lock.scale = { x: 0.7, y: 1.2, z: 0.3 }
  meshes.push(lock)

  return {
    name: 'Treasure_Chest',
    meshes
  }
}

/**
 * Generates a retro dungeon room template
 */
export function createDungeonRoomTemplate(): ProjectTemplate {
  const meshes: MeshObject[] = []

  // Floor
  const floor = createCube('Floor', 4)
  floor.position = { x: 0, y: -0.1, z: 0 }
  floor.scale = { x: 1.5, y: 0.05, z: 1.5 }
  meshes.push(floor)

  // Wall Back
  const wallBack = createCube('Wall_Back', 4)
  wallBack.position = { x: 0, y: 1.5, z: -3 }
  wallBack.scale = { x: 1.5, y: 0.8, z: 0.1 }
  meshes.push(wallBack)

  // Wall Left
  const wallLeft = createCube('Wall_Left', 4)
  wallLeft.position = { x: -3, y: 1.5, z: 0 }
  wallLeft.scale = { x: 0.1, y: 0.8, z: 1.5 }
  meshes.push(wallLeft)

  // Pillar
  const pillar = createCube('Pillar', 1)
  pillar.position = { x: -1.8, y: 1.5, z: -1.8 }
  pillar.scale = { x: 0.5, y: 3.0, z: 0.5 }
  meshes.push(pillar)

  return {
    name: 'Dungeon_Room',
    meshes
  }
}
