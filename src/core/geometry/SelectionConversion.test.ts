import { describe, expect, it } from 'vitest'
import { createCube } from './Primitives'
import { convertComponentSelection } from './SelectionConversion'
import { bevelFaces, extrudeFaces, insetFaces, mergeVerticesAdvanced, subdivideFaces } from './Operations'
import { getMeshEdges } from './EdgeUtils'
import { MeshBridge } from '../mesh/MeshBridge'
import { MeshValidator } from '../mesh/MeshValidator'

describe('selection continuity', () => {
  it('keeps document IDs unique through repeated topology edits', () => {
    let mesh = createCube('cube', 2)
    mesh = bevelFaces(mesh, [], 0.2, [getMeshEdges(mesh)[0].id]).mesh
    let face = mesh.faces.find(f => f.vertexIds.length === 4)!.id
    for (let i = 0; i < 3; i++) {
      const extrude = extrudeFaces(mesh, [face], 0.2)
      const inset = insetFaces(extrude.mesh, extrude.selectedFaceIds, 0.01)
      mesh = inset.mesh; face = inset.selectedFaceIds[0]
      expect(new Set(mesh.vertices.map(v => v.id)).size).toBe(mesh.vertices.length)
      expect(new Set(mesh.faces.map(f => f.id)).size).toBe(mesh.faces.length)
      expect(mesh.faces.some(f => f.id === face)).toBe(true)
      expect(MeshValidator.validate(MeshBridge.meshObjectToEditableMesh(mesh).mesh).valid).toBe(true)
    }
  })
  it('converts a face into its edges and back without selecting its neighbors', () => {
    const mesh = createCube('cube', 2), face = mesh.faces[0]
    const edges = convertComponentSelection(mesh, 'face', 'edge', { vertices: [], edges: [], faces: [face.id] })
    expect(edges.edges).toHaveLength(4)
    expect(convertComponentSelection(mesh, 'edge', 'face', edges).faces).toEqual([face.id])
    expect(convertComponentSelection(mesh, 'edge', 'face', { ...edges, edges: edges.edges.slice(0, 3) }).faces).toEqual([])
  })
  it('keeps the new edge segments selected after subdivision', () => {
    const mesh = createCube('cube', 2), edge = getMeshEdges(mesh)[0]
    const result = subdivideFaces(mesh, [], { edgeIds: [edge.id], cuts: 2 })
    expect(result.selectedVertexIds).toHaveLength(2)
    expect(result.selectedEdgeIds).toHaveLength(3)
    expect(result.selectedEdgeIds).not.toContain(edge.id)
    expect(result.selectedEdgeIds!.every(id => getMeshEdges(result.mesh).some(e => e.id === id))).toBe(true)
  })
  it('merges to first/last in selection order, not document vertex order', () => {
    const mesh = createCube('cube', 2), a = mesh.vertices[0], b = mesh.vertices[1]
    const result = mergeVerticesAdvanced(mesh, [b.id, a.id], 'first')
    expect(result.selectedVertexIds).toEqual([b.id])
    expect(result.mesh.vertices.find(v => v.id === b.id)!.position).toEqual(b.position)
  })
})
