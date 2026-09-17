import { beforeEach, afterEach, describe, it, expect } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { Vector3 } from 'three'
import { fitRigPreset, inspectRig, meshRestMatrix, rigPresets } from './RiggingWorkflow'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
import { useHistoryStore } from '../../stores/historyStore'
import { createCube } from '../geometry/Primitives'
import { evaluateSkinning, meshToThreeGeometry, updateThreeGeometryAttributes } from '../geometry/Converters'

describe('guided rigging', () => {
  let pinia: ReturnType<typeof createPinia>
  beforeEach(() => { pinia = createPinia(); setActivePinia(pinia) })
  afterEach(() => disposePinia(pinia))

  it('fits every template with nonzero bones and valid parent order', () => {
    const mesh = createCube('Model', 2)
    mesh.position = { x: 12, y: 4, z: -6 }
    mesh.scale = { x: 2, y: 3, z: .5 }
    for (const preset of rigPresets) {
      const names = new Set<string>()
      const joints = fitRigPreset(mesh, preset.id)
      expect(joints.length).toBeGreaterThan(0)
      for (const joint of joints) {
        expect(joint.parent === null || names.has(joint.parent)).toBe(true)
        expect(new Vector3(...joint.head).distanceTo(new Vector3(...joint.tail))).toBeGreaterThan(0)
        expect(joint.head[0]).toBeGreaterThanOrEqual(10)
        expect(joint.head[0]).toBeLessThanOrEqual(14)
        names.add(joint.name)
      }
    }
    mesh.vertices = []
    expect(fitRigPreset(mesh, 'human')).toEqual([])
  })

  it('adds a preset in one undo step and preserves existing bones', () => {
    const project = useProjectStore(), animation = useAnimationStore(), history = useHistoryStore()
    const root = animation.addRootBone('Original')
    animation.addRigPreset(project.activeMesh!.id, 'human')
    const count = animation.armature.bones.length
    expect(count).toBeGreaterThan(1)
    expect(animation.armature.bones.some(b => b.id === root.id)).toBe(true)
    history.undo()
    expect(animation.armature.bones.map(b => b.name)).toEqual(['Original'])
    history.redo()
    expect(animation.armature.bones.length).toBe(count)
    animation.addRigPreset(project.activeMesh!.id, 'human')
    animation.addRigPreset(project.activeMesh!.id, 'human')
    expect(new Set(animation.armature.bones.map(b => b.name)).size).toBe(animation.armature.bones.length)
  })

  it('registers smooth binding, removes rigid parenting, and reports missing or invalid weights', () => {
    const project = useProjectStore(), animation = useAnimationStore()
    const mesh = project.activeMesh!
    const bone = animation.addRootBone()
    animation.bindSelectedGeometry('object', bone.id)
    animation.autoWeightMeshToBones(mesh)
    expect(mesh.parentBoneId).toBeUndefined()
    expect(mesh.armatureId).toBe(animation.armature.id)
    expect(inspectRig(mesh, animation.armature.bones).ready).toBe(true)
    mesh.vertices[0].boneWeights = {}
    mesh.vertices[1].boneWeights = { missing: 1 }
    expect(inspectRig(mesh, animation.armature.bones)).toMatchObject({ unweighted: 2, invalid: 1, ready: false })
    expect(animation.reparentBone(bone.id, 'missing')).toBe(false)
  })

  it('keeps painting and pose mutually exclusive without creating animation keys', () => {
    const animation = useAnimationStore()
    animation.addRootBone()
    animation.clickToPlaceMode = true
    animation.toggleWeightPaint(true)
    expect(animation.clickToPlaceMode).toBe(false)
    animation.toggleTestPose(true)
    expect(animation.isWeightPaintActive).toBe(false)
    animation.selectedBone!.rotation.z = 30
    animation.toggleTestPose(false)
    expect(animation.selectedBone!.rotation.z).toBe(0)
    expect(animation.activeClip!.tracks).toHaveLength(0)
    animation.toggleWeightPaint(true)
    animation.clickToPlaceMode = true
    expect(animation.isWeightPaintActive).toBe(false)
    expect(animation.isTestPoseActive).toBe(false)
  })

  it('paints and deforms rotated scaled models in world space, including fast viewport updates', () => {
    const project = useProjectStore(), animation = useAnimationStore()
    const mesh = project.activeMesh!
    mesh.rotation.z = 90
    mesh.scale = { x: 2, y: 3, z: .5 }
    const bone = animation.addRootBone()
    const matrix = meshRestMatrix(mesh)
    const vertex = mesh.vertices[0]
    const world = new Vector3(vertex.position.x, vertex.position.y, vertex.position.z).applyMatrix4(matrix)
    animation.paintVertexWeightAtPoint(mesh.id, world, bone.id, 'draw', { radius: .01, weight: 1, strength: 1 })
    expect(vertex.boneWeights?.[bone.id]).toBe(1)
    expect(mesh.vertices.filter(v => v.boneWeights?.[bone.id] === 1)).toHaveLength(1)
    animation.autoWeightMeshToBones(mesh)
    bone.position.x = 1
    const deformed = evaluateSkinning(mesh, mesh.vertices, [bone])
    const actual = new Vector3(deformed[0].position.x, deformed[0].position.y, deformed[0].position.z).applyMatrix4(matrix)
    expect(actual.x).toBeCloseTo(world.x + 1)
    expect(actual.y).toBeCloseTo(world.y)
    const context = { isPoseMode: true, bones: [bone] }
    const bundle = meshToThreeGeometry(mesh, [], [], 'flat', context)
    bone.position.x = 2
    expect(updateThreeGeometryAttributes(mesh, bundle.geometry, context)).toBe(true)
    const rebuilt = meshToThreeGeometry(mesh, [], [], 'flat', context)
    expect(Array.from(bundle.geometry.getAttribute('position').array)).toEqual(Array.from(rebuilt.geometry.getAttribute('position').array))
    bundle.geometry.dispose()
    rebuilt.geometry.dispose()
  })

  it('normalizes invalid weights and changes to rigid binding without double deformation', () => {
    const project = useProjectStore(), animation = useAnimationStore()
    const mesh = project.activeMesh!
    const root = animation.addRootBone('root')
    mesh.vertices[0].boneWeights = { [root.id]: 2, missing: 1, invalid: NaN }
    animation.normalizeAllMeshWeights(mesh.id)
    expect(mesh.vertices[0].boneWeights).toEqual({ [root.id]: 1 })
    animation.bindSelectedGeometry('object', root.id)
    expect(mesh.vertices.every(v => Object.keys(v.boneWeights ?? {}).length === 0)).toBe(true)
    expect(inspectRig(mesh, animation.armature.bones).ready).toBe(true)
  })

  it('keeps grandchildren in the visible hierarchy when their parent is deleted', () => {
    const animation = useAnimationStore()
    const root = animation.addRootBone()
    const child = animation.addChildBone(root.id)!
    const grandchild = animation.addChildBone(child.id)!
    animation.deleteBone(child.id)
    expect(root.childrenIds).toContain(grandchild.id)
    expect(grandchild.parentId).toBe(root.id)
  })
})
