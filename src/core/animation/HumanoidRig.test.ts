import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createCube } from '../geometry/Primitives'
import { buildHumanoidRig, suggestHumanoidMarkers, moveHumanoidMarker, validateHumanoidMarkers } from './HumanoidRig'
import { autoWeightMeshToArmature } from './AutoSkinning'
import { useProjectStore } from '../../stores/projectStore'
import { useAnimationStore } from '../../stores/animationStore'
import { useHistoryStore } from '../../stores/historyStore'

describe('humanoid marker workflow', () => {
  let pinia: ReturnType<typeof createPinia>
  beforeEach(() => { pinia = createPinia(); setActivePinia(pinia) })
  afterEach(() => disposePinia(pinia))
  it('builds both skeleton details from world-space markers without modifying the model', () => {
    const mesh = createCube('Character', 2)
    mesh.position = { x: 8, y: 3, z: -2 }; mesh.scale.y = 3
    const original = JSON.stringify(mesh)
    for (const pose of ['t', 'a'] as const) {
      const markers = suggestHumanoidMarkers(mesh, pose)
      expect(markers).toHaveLength(12)
      expect(validateHumanoidMarkers(markers)).toEqual([])
      for (const [detail, count] of [['standard', 19], ['simple', 15]] as const) {
        const bones = buildHumanoidRig(mesh, markers, detail)
        expect(bones).toHaveLength(count)
        expect(bones.find(b => b.name === 'Forearm.L')!.head).toEqual(markers.find(m => m.id === 'elbow.L')!.position)
        for (const bone of bones) {
          expect(bone.head).not.toEqual(bone.tail)
          if (bone.parentId) expect(bones.find(b => b.id === bone.parentId)!.childrenIds).toContain(bone.id)
        }
      }
    }
    expect(JSON.stringify(mesh)).toBe(original)
  })
  it('mirrors about the character center and permits independent asymmetric placement', () => {
    const mesh = createCube('Character', 2); mesh.position.x = 9
    const markers = suggestHumanoidMarkers(mesh)
    moveHumanoidMarker(markers, 'wrist.L', { x: 11, y: 2, z: .3 }, true)
    expect(markers.find(m => m.id === 'wrist.R')!.position).toEqual({ x: 7, y: 2, z: .3 })
    moveHumanoidMarker(markers, 'wrist.L', { x: 12, y: 1, z: 0 }, false)
    expect(markers.find(m => m.id === 'wrist.R')!.position.x).toBe(7)
    moveHumanoidMarker(markers, 'wrist.L', { x: NaN, y: 1, z: 0 }, true)
    expect(markers.find(m => m.id === 'wrist.L')!.position.x).toBe(12)
    markers.find(m => m.id === 'ankle.L')!.position.y = 30
    expect(validateHumanoidMarkers(markers).length).toBeGreaterThan(0)
    expect(buildHumanoidRig(mesh, markers)).toEqual([])
  })
  it('commits new bone IDs and normalized weights in one undo while preserving existing bones and clips', () => {
    const project = useProjectStore(), animation = useAnimationStore(), history = useHistoryStore()
    const root = animation.addRootBone('Original')
    const clip = JSON.stringify(animation.armature.clips)
    const source = project.activeMesh!, before = JSON.stringify(source)
    const draft = JSON.parse(before), bones = buildHumanoidRig(draft, suggestHumanoidMarkers(draft))
    autoWeightMeshToArmature(draft, bones, { method: 'surface' })
    bones.find(b => b.name === 'Forearm.L')!.rotation.z = 45
    expect(JSON.stringify(source)).toBe(before)
    expect(animation.commitHumanoidRig(draft, bones)).toBe(true)
    expect(animation.armature.bones).toHaveLength(20)
    expect(animation.armature.bones[0].id).toBe(root.id)
    expect(animation.armature.bones.every(b => b.rotation.z === 0)).toBe(true)
    const ids = new Set(animation.armature.bones.map(b => b.id))
    for (const vertex of source.vertices) {
      expect(Object.keys(vertex.boneWeights!).every(id => ids.has(id))).toBe(true)
      expect(Object.values(vertex.boneWeights!).reduce((a, b) => a + b, 0)).toBeCloseTo(1)
    }
    expect(JSON.stringify(animation.armature.clips)).toBe(clip)
    history.undo()
    expect(animation.armature.bones.map(b => b.name)).toEqual(['Original'])
    expect(JSON.stringify(project.activeMesh)).toBe(before)
  })
  it('rejects a stale preview without adding bones', () => {
    const project = useProjectStore(), animation = useAnimationStore()
    const draft = JSON.parse(JSON.stringify(project.activeMesh)), bones = buildHumanoidRig(draft, suggestHumanoidMarkers(draft))
    project.activeMesh!.vertices[0].position.x += 1
    expect(animation.commitHumanoidRig(draft, bones)).toBe(false)
    expect(animation.armature.bones).toHaveLength(0)
  })
})

