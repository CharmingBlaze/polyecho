import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
import { useHistoryStore } from '../../stores/historyStore'
import { fitJoint } from './JointFitting'
import { autoWeightMeshToArmature } from './AutoSkinning'
import { createCube } from '../geometry/Primitives'

describe('guided joint fitting and surface weights', () => {
  let pinia: ReturnType<typeof createPinia>
  beforeEach(() => { pinia = createPinia(); setActivePinia(pinia) })
  afterEach(() => disposePinia(pinia))

  it('moves connected elbows and mirrors about an offset rig center, with undo', () => {
    const animation = useAnimationStore(), project = useProjectStore(), history = useHistoryStore()
    project.activeMesh!.position.x = 10
    animation.addRigPreset(project.activeMesh!.id, 'human')
    const arm = animation.armature.bones.find(b => b.name === 'UpperArm.L')!
    const elbow = animation.armature.bones.find(b => b.name === 'Forearm.L')!
    const opposite = animation.armature.bones.find(b => b.name === 'Forearm.R')!
    const before = { ...elbow.head }
    animation.selectBone(elbow.id)
    animation.placeRigJoint({ x: 10.8, y: .9, z: .2 })
    expect(elbow.head).toEqual(arm.tail)
    expect(opposite.head).toEqual({ x: 9.2, y: .9, z: .2 })
    history.undo()
    expect(animation.armature.bones.find(b => b.id === elbow.id)!.head).toEqual(before)
    expect(fitJoint(animation.armature.bones, elbow.id, { x: NaN, y: 0, z: 0 })).toBe(false)
  })

  it('does not pass influence between disconnected nearby pieces', () => {
    const animation = useAnimationStore()
    const left = animation.addRootBone('left'), right = animation.addRootBone('right')
    left.head = { x: -1, y: -1, z: 0 }; left.tail = { x: -1, y: 1, z: 0 }
    right.head = { x: 1, y: -1, z: 0 }; right.tail = { x: 1, y: 1, z: 0 }
    const mesh = createCube('pieces', .4)
    mesh.position = { x: 0, y: 0, z: 0 }
    const other = createCube('other', .4)
    mesh.vertices.forEach(v => { v.position.x -= .4 })
    const remap = new Map(other.vertices.map(v => [v.id, `other_${v.id}`]))
    other.vertices.forEach(v => { v.position.x += .4; v.id = remap.get(v.id)! })
    other.faces.forEach(f => { f.vertexIds = f.vertexIds.map(id => remap.get(id)!) })
    const split = mesh.vertices.length
    mesh.vertices.push(...other.vertices); mesh.faces.push(...other.faces)
    autoWeightMeshToArmature(mesh, [left, right], { method: 'surface' })
    expect(mesh.vertices.slice(0, split).every(v => v.boneWeights?.[left.id] === 1 && !v.boneWeights?.[right.id])).toBe(true)
    expect(mesh.vertices.slice(split).every(v => v.boneWeights?.[right.id] === 1 && !v.boneWeights?.[left.id])).toBe(true)
  })

  it('blends connected regions with normalized weights and bounded influences', () => {
    const animation = useAnimationStore(), project = useProjectStore()
    animation.addRigPreset(project.activeMesh!.id, 'chain')
    const mesh = project.activeMesh!
    autoWeightMeshToArmature(mesh, animation.armature.bones, { method: 'surface' })
    expect(mesh.vertices.some(v => Object.keys(v.boneWeights!).length > 1)).toBe(true)
    for (const v of mesh.vertices) {
      expect(Object.keys(v.boneWeights!).length).toBeLessThanOrEqual(4)
      expect(Object.values(v.boneWeights!).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
    }
  })

  it('exits conflicting tools when joint placement begins', () => {
    const animation = useAnimationStore()
    animation.toggleTestPose(true)
    animation.jointPlacementActive = true
    expect(animation.isTestPoseActive).toBe(false)
    animation.toggleWeightPaint(true)
    expect(animation.jointPlacementActive).toBe(false)
  })
})
