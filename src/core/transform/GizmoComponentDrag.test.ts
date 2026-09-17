import { Matrix4, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { createCube } from '../geometry/Primitives'
import { MeshBridge } from '../mesh/MeshBridge'
import { applyGizmoComponentPositions } from './GizmoComponentDrag'

describe('gizmo component drag', () => {
  it('writes leased kernel positions from a world delta', () => {
    const document = createCube('Cube', 2)
    const bridge = MeshBridge.meshObjectToEditableMesh(document)
    const target = document.vertices[0]!
    const startWorld = new Map<string, Vector3>([
      [target.id, new Vector3(target.position.x, target.position.y, target.position.z)],
    ])
    const before = bridge.mesh.vertices.get(bridge.strToNumVertId.get(target.id)!)!.position.clone()
    applyGizmoComponentPositions({
      bridge,
      targetVertIds: new Set([target.id]),
      startWorld,
      deltaMatrix: new Matrix4().makeTranslation(0.5, 0, 0),
      worldInverse: new Matrix4(),
    })
    const after = bridge.mesh.vertices.get(bridge.strToNumVertId.get(target.id)!)!.position
    expect(after.x).toBeCloseTo(before.x + 0.5)
    expect(after.y).toBeCloseTo(before.y)
    expect(after.z).toBeCloseTo(before.z)
  })
})
