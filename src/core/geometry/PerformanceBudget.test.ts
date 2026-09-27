import { describe, expect, it } from 'vitest'
import type { MeshObject } from '../../types/mesh'
import { MeshBridge } from '../mesh/MeshBridge'

function gridMesh(columns: number, rows: number): MeshObject {
  const vertices: MeshObject['vertices'] = []
  const faces: MeshObject['faces'] = []
  for (let y = 0; y <= rows; y++) {
    for (let x = 0; x <= columns; x++) {
      vertices.push({ id: `v_${y}_${x}`, position: { x, y: 0, z: y } })
    }
  }
  const id = (x: number, y: number) => `v_${y}_${x}`
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      faces.push({
        id: `f_${y}_${x}`,
        vertexIds: [id(x, y), id(x, y + 1), id(x + 1, y + 1), id(x + 1, y)],
        uvs: [{ u: 0, v: 0 }, { u: 0, v: 1 }, { u: 1, v: 1 }, { u: 1, v: 0 }],
        materialIndex: 0,
      })
    }
  }
  return {
    id: `grid_${columns}_${rows}`,
    name: 'Performance Grid',
    vertices,
    faces,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    visible: true,
    locked: false,
    materialId: 'default_material',
  }
}

describe('large mesh performance budgets', () => {
  it.each([
    { columns: 100, rows: 50, faces: 5_000, budgetMs: 2_000 },
    { columns: 200, rows: 100, faces: 20_000, budgetMs: 6_000 },
    { columns: 250, rows: 200, faces: 50_000, budgetMs: 15_000 },
  ])('bridges and triangulates $faces faces within $budgetMs ms', ({ columns, rows, faces, budgetMs }) => {
    const document = gridMesh(columns, rows)
    const started = performance.now()
    const editable = MeshBridge.meshObjectToEditableMesh(document).mesh
    const geometry = MeshBridge.editableMeshToThreeGeometry(editable)
    const elapsed = performance.now() - started

    expect(editable.faces.size).toBe(faces)
    expect(geometry.getAttribute('position').count).toBe(faces * 6)
    expect(elapsed, `${faces} faces took ${elapsed.toFixed(1)} ms`).toBeLessThan(budgetMs)
    geometry.dispose()
  }, 30_000)
})
