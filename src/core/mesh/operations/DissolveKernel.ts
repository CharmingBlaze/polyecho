import { EditableMesh } from '../MeshKernel'

export class DissolveKernel {
  /**
   * Dissolves an edge between two adjacent faces, merging them into a single polygon
   * without deleting surrounding geometry.
   */
  static dissolveEdge(mesh: EditableMesh, edgeId: number): boolean {
    const edge = mesh.edges.get(edgeId)
    if (!edge || edge.faceIds.length !== 2) return false

    const [f1Id, f2Id] = edge.faceIds
    const face1 = mesh.faces.get(f1Id)
    const face2 = mesh.faces.get(f2Id)
    if (!face1 || !face2) return false

    const vA = edge.v1
    const vB = edge.v2

    // Build merged vertex loop
    // Traverse face1 up to edge (vA, vB), then stitch face2 in reverse
    const verts1 = face1.vertexIds
    const n1 = verts1.length

    const mergedVerts: number[] = []
    const idxA = verts1.indexOf(vA)

    for (let i = 0; i < n1; i++) {
      const v = verts1[(idxA + i) % n1]
      mergedVerts.push(v)
    }

    // Replace the edge vertices with the remaining face2 vertices
    const verts2 = face2.vertexIds
    const otherFace2Verts = verts2.filter(vid => vid !== vA && vid !== vB)

    const finalVerts: number[] = []
    for (const v of mergedVerts) {
      finalVerts.push(v)
      if (v === vB) {
        finalVerts.push(...otherFace2Verts)
      }
    }

    const matIdx = face1.materialIndex
    const color = face1.color

    mesh.removeFace(f1Id)
    mesh.removeFace(f2Id)
    mesh.removeEdge(edgeId)

    mesh.addFace(finalVerts, undefined, matIdx, color)
    mesh.recalculateNormals()

    return true
  }
}
