import { describe, expect, it } from 'vitest'
import type { Face, MeshObject, Vertex } from '../../types/mesh'
import { weldImportedMesh } from './ImportWeld'
import { ObjImport } from './ObjImport'
import { exportToOBJ } from '../export/ObjExport'
import { meshToThreeGeometry } from '../geometry/Converters'
import { createCube, createCylinder } from '../geometry/Primitives'

function renderedTriangles(mesh: MeshObject): string[] {
  const { geometry } = meshToThreeGeometry(mesh)
  const position = geometry.getAttribute('position')
  const triangles: string[] = []
  for (let i = 0; i < position.count; i += 3) {
    const corners = [0, 1, 2].map(offset => [
      position.getX(i + offset), position.getY(i + offset), position.getZ(i + offset),
    ].map(value => value.toFixed(5)).join(',')).sort()
    triangles.push(corners.join('|'))
  }
  geometry.dispose()
  return triangles.sort()
}

type P = [number, number, number]

/** Unshared corners per triangle, the way a GLB stores flat-shaded geometry. */
function soup(tris: Array<{ p: [P, P, P]; uv?: [number, number][] }>): MeshObject {
  const vertices: Vertex[] = []
  const faces: Face[] = []
  tris.forEach(({ p, uv }, t) => {
    const ids = p.map((pos, i) => {
      const id = `v_${t * 3 + i + 1}`
      vertices.push({ id, position: { x: pos[0], y: pos[1], z: pos[2] } })
      return id
    })
    faces.push({
      id: `f_${t + 1}`,
      vertexIds: ids,
      uvs: (uv ?? p.map(q => [q[0], q[2]] as [number, number])).map(([u, v]) => ({ u, v })),
      normal: { x: 0, y: 1, z: 0 },
      materialIndex: 0
    })
  })
  return {
    id: 'm', name: 'Soup', visible: true, locked: false,
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
    materialId: 'default_material', vertices, faces
  }
}

/** Each grid cell split on its 0–2 diagonal, as `faceTriIndexSets` would. */
function gridSoup(n: number) {
  const tris: Array<{ p: [P, P, P] }> = []
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const a: P = [i, 0, j], b: P = [i, 0, j + 1], c: P = [i + 1, 0, j + 1], d: P = [i + 1, 0, j]
    tris.push({ p: [a, b, c] }, { p: [a, c, d] })
  }
  return soup(tris)
}

describe('weldImportedMesh', () => {
  it('folds a triangulated grid back into its cells, not across grid lines', () => {
    const mesh = weldImportedMesh(gridSoup(2))
    expect(mesh.vertices.length).toBe(9)
    expect(mesh.faces.length).toBe(4)
    for (const face of mesh.faces) {
      expect(face.vertexIds.length).toBe(4)
      const xs = face.vertexIds.map(id => mesh.vertices.find(v => v.id === id)!.position.x)
      expect(Math.max(...xs) - Math.min(...xs)).toBe(1)
    }
  })

  it('re-triangulates a folded quad along the file diagonal', () => {
    const soupMesh = gridSoup(1)
    const before = renderedTriangles(soupMesh)
    const mesh = weldImportedMesh(soupMesh)
    expect(mesh.faces).toHaveLength(1)
    expect(mesh.faces[0].vertexIds).toHaveLength(4)
    expect(renderedTriangles(mesh)).toEqual(before)
  })

  it('keeps per-corner UVs on the merged quad', () => {
    const mesh = weldImportedMesh(gridSoup(1))
    const face = mesh.faces[0]
    face.vertexIds.forEach((id, i) => {
      const p = mesh.vertices.find(v => v.id === id)!.position
      expect(face.uvs[i]).toEqual({ u: p.x, v: p.z })
    })
  })

  it('leaves a pair split when the shared edge is a UV cut', () => {
    const mesh = weldImportedMesh(soup([
      { p: [[0, 0, 0], [0, 0, 1], [1, 0, 1]], uv: [[0, 0], [0, 1], [1, 1]] },
      { p: [[0, 0, 0], [1, 0, 1], [1, 0, 0]], uv: [[0.5, 0], [0.9, 0.9], [0.9, 0]] }
    ]))
    expect(mesh.vertices.length).toBe(4)
    expect(mesh.faces.map(f => f.vertexIds.length)).toEqual([3, 3])
  })

  it('leaves a bent pair split, since that diagonal was real in the file', () => {
    const mesh = weldImportedMesh(soup([
      { p: [[0, 0, 0], [0, 0, 1], [1, 0.3, 1]] },
      { p: [[0, 0, 0], [1, 0.3, 1], [1, 0, 0]] }
    ]))
    expect(mesh.faces.map(f => f.vertexIds.length)).toEqual([3, 3])
  })

  it('does not weld corners that carry different skin weights', () => {
    const mesh = gridSoup(1)
    mesh.vertices[0].boneWeights = { a: 1 }
    mesh.vertices[3].boneWeights = { b: 1 }
    expect(weldImportedMesh(mesh).vertices.length).toBe(5)
  })
})

describe('OBJ round trip keeps face loops', () => {
  it('cube stays six quads and the cylinder cap stays one 8-sided face', () => {
    const cube = ObjImport.parse(exportToOBJ([createCube('Cube', 2)])).meshes[0]
    expect(cube.faces.map(f => f.vertexIds.length)).toEqual([4, 4, 4, 4, 4, 4])
    const cylinder = ObjImport.parse(exportToOBJ([createCylinder('Cyl', 1, 2, 8)])).meshes[0]
    const sizes = cylinder.faces.map(f => f.vertexIds.length).sort((a, b) => b - a)
    expect(sizes.slice(0, 2)).toEqual([8, 8])
    expect(sizes.slice(2).every(n => n === 4)).toBe(true)
  })

  it('a foreign triangulated OBJ quad imports as one face', () => {
    const obj = ['v 0 0 0', 'v 0 0 1', 'v 1 0 1', 'v 1 0 0', 'f 1 2 3', 'f 1 3 4'].join('\n')
    expect(ObjImport.parse(obj).meshes[0].faces.map(f => f.vertexIds.length)).toEqual([4])
  })
})
