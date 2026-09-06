import { describe, expect, it } from 'vitest'
import { createCube } from '../geometry/Primitives'
import { MeshBridge } from './MeshBridge'

describe('EditableMesh snapshots', () => {
  it('restoreSnapshot puts a moved vertex back', () => {
    const cube = createCube('Cube', 2)
    const { mesh } = MeshBridge.meshObjectToEditableMesh(cube)
    const first = [...mesh.vertices.values()][0]
    const snap = mesh.createSnapshot()
    const origin = first.position.clone()
    first.position.set(99, 99, 99)
    mesh.restoreSnapshot(snap)
    const restored = mesh.vertices.get(first.id)!
    expect(restored.position.x).toBeCloseTo(origin.x)
    expect(restored.position.y).toBeCloseTo(origin.y)
    expect(restored.position.z).toBeCloseTo(origin.z)
  })
})
