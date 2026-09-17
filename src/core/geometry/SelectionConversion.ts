import type { MeshObject } from '../../types/mesh'
import { getMeshEdges, undirectedEdgeId } from './EdgeUtils'

export type ComponentMode = 'vertex' | 'edge' | 'face'
export function convertComponentSelection(mesh: MeshObject, from: ComponentMode, to: ComponentMode, selection: { vertices: string[]; edges: string[]; faces: string[] }) {
  const edges = getMeshEdges(mesh)
  const faceEdges = (ids: string[]) => ids.map((id, i) => undirectedEdgeId(id, ids[(i + 1) % ids.length]))
  const faces = mesh.faces.filter(f => selection.faces.includes(f.id))
  const vertices = new Set(from === 'vertex' ? selection.vertices
    : from === 'edge' ? edges.filter(e => selection.edges.includes(e.id)).flatMap(e => [e.v1, e.v2])
      : faces.flatMap(f => f.vertexIds))
  const selectedEdges = new Set(from === 'face' ? faces.flatMap(f => faceEdges(f.vertexIds))
    : from === 'edge' ? selection.edges : edges.filter(e => vertices.has(e.v1) && vertices.has(e.v2)).map(e => e.id))
  return {
    vertices: to === 'vertex' ? [...vertices] : [],
    edges: to === 'edge' ? [...selectedEdges] : [],
    faces: to === 'face' ? mesh.faces.filter(f => f.vertexIds.every(id => vertices.has(id))
      && (from !== 'edge' || faceEdges(f.vertexIds).every(id => selectedEdges.has(id)))).map(f => f.id) : [],
  }
}
