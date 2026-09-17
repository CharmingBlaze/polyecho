import * as THREE from 'three'
import { EditableMesh } from '../MeshKernel'
import { HalfEdgeTopology } from '../HalfEdgeTopology'
import { AttributeInterpolator } from '../attributes/AttributeInterpolator'

export interface ExtrudeResult {
  mesh: EditableMesh
  newVertexIds: number[]
  extrudedFaceIds: number[]
  regionNormal: THREE.Vector3
  vertexNormals?: Map<number, THREE.Vector3>
}

export interface ExtrudeOptions {
  individual?: boolean
  faceIds?: number[]
  edgeIds?: number[]
  vertexIds?: number[]
}

export class ExtrudeKernel {
  /**
   * Region / individual face extrude, or edge / vertex extrude when no faces are given.
   * Caps stay in place; the caller moves `newVertexIds`.
   */
  static extrude(mesh: EditableMesh, options: ExtrudeOptions): ExtrudeResult {
    const faces = [...new Set(options.faceIds ?? [])].filter((id) => mesh.faces.has(id))
    if (faces.length > 0) {
      if (options.individual) {
        const newVertexIds: number[] = []
        const extrudedFaceIds: number[] = []
        const n = new THREE.Vector3()
        const vertexNormals = new Map<number, THREE.Vector3>()
        for (const fId of faces) {
          const r = this.extrudeFaces(mesh, [fId])
          newVertexIds.push(...r.newVertexIds)
          extrudedFaceIds.push(...r.extrudedFaceIds)
          n.add(r.regionNormal)
          r.newVertexIds.forEach(id => vertexNormals.set(id, r.regionNormal.clone()))
        }
        if (n.lengthSq() > 1e-10) n.normalize()
        else n.set(0, 1, 0)
        return { mesh, newVertexIds, extrudedFaceIds, regionNormal: n, vertexNormals }
      }
      return this.extrudeFaces(mesh, faces)
    }

    const edges = (options.edgeIds ?? []).filter((id) => mesh.edges.has(id))
    if (edges.length > 0) return this.extrudeEdges(mesh, edges)

    const verts = (options.vertexIds ?? []).filter((id) => mesh.vertices.has(id))
    if (verts.length > 0) return this.extrudeVertices(mesh, verts)

    return {
      mesh,
      newVertexIds: [],
      extrudedFaceIds: [],
      regionNormal: new THREE.Vector3(0, 1, 0),
    }
  }

  /**
   * Pure topological region extrusion.
   * Finds boundary edges, duplicates vertices for the cap, creates perimeter side-quads,
   * and updates cap faces in-place without moving geometry.
   */
  static extrudeFaces(mesh: EditableMesh, selectedFaceIds: number[]): ExtrudeResult {
    const faces = [...new Set(selectedFaceIds)].filter((id) => mesh.faces.has(id))
    if (faces.length === 0) {
      return {
        mesh,
        newVertexIds: [],
        extrudedFaceIds: [],
        regionNormal: new THREE.Vector3(0, 1, 0),
      }
    }

    const regionNormal = HalfEdgeTopology.computeRegionNormal(mesh, faces)
    const boundaryEdges = HalfEdgeTopology.findRegionBoundaryEdges(mesh, faces)

    const oldToNewVertMap = new Map<number, number>()
    const newVertexIds: number[] = []

    const allSelectedFaceVertIds = new Set<number>()
    for (const fId of faces) {
      const face = mesh.faces.get(fId)
      if (!face) continue
      for (const vid of face.vertexIds) allSelectedFaceVertIds.add(vid)
    }

    for (const vId of allSelectedFaceVertIds) {
      const oldV = mesh.vertices.get(vId)
      if (!oldV) continue
      const newV = mesh.addVertex(oldV.position.clone())
      AttributeInterpolator.copyVertex(oldV, newV)
      oldToNewVertMap.set(vId, newV.id)
      newVertexIds.push(newV.id)
    }

    const selFaceSet = new Set(faces)
    for (const edge of boundaryEdges) {
      const vAOld = edge.v1
      const vBOld = edge.v2
      const vANew = oldToNewVertMap.get(vAOld)
      const vBNew = oldToNewVertMap.get(vBOld)
      if (vANew === undefined || vBNew === undefined) continue

      let selFaceId = edge.faceIds.find((fid) => selFaceSet.has(fid))
      const selFace = selFaceId !== undefined ? mesh.faces.get(selFaceId) : null
      let forward = true
      if (selFace) {
        const idxA = selFace.vertexIds.indexOf(vAOld)
        const idxB = selFace.vertexIds.indexOf(vBOld)
        const n = selFace.vertexIds.length
        if (idxA !== -1 && idxB !== -1) {
          forward = (idxA + 1) % n === idxB
        }
      }

      if (forward) {
        this.addSideQuad(mesh, vAOld, vBOld, vBNew, vANew, selFace)
      } else {
        this.addSideQuad(mesh, vBOld, vAOld, vANew, vBNew, selFace)
      }
    }

    for (const fId of faces) {
      const face = mesh.faces.get(fId)
      if (!face) continue
      const newFaceVerts = face.vertexIds.map((oldVId) => oldToNewVertMap.get(oldVId) ?? oldVId)
      const uvs = face.uvs.map((uv) => uv.clone())
      const matIdx = face.materialIndex
      const color = face.color
      mesh.replaceFace(fId, newFaceVerts, uvs, matIdx, color)
    }

    // Interior originals have no remaining surface after the cap moves.
    for (const id of allSelectedFaceVertIds) {
      const vertex = mesh.vertices.get(id)
      if (vertex && vertex.faceIds.length === 0 && vertex.edgeIds.length === 0) mesh.removeVertex(id)
    }
    mesh.recalculateNormals()

    return {
      mesh,
      newVertexIds,
      extrudedFaceIds: [...faces],
      regionNormal,
    }
  }

  static extrudeEdges(mesh: EditableMesh, edgeIds: number[]): ExtrudeResult {
    const unique = [...new Set(edgeIds)].filter((id) => mesh.edges.has(id))
    if (unique.length === 0) {
      return {
        mesh,
        newVertexIds: [],
        extrudedFaceIds: [],
        regionNormal: new THREE.Vector3(0, 1, 0),
      }
    }

    const oldToNew = new Map<number, number>()
    const newVertexIds: number[] = []
    const extrudedFaceIds: number[] = []
    const n = new THREE.Vector3()

    const ensure = (vId: number) => {
      const existing = oldToNew.get(vId)
      if (existing !== undefined) return existing
      const oldV = mesh.vertices.get(vId)
      if (!oldV) return vId
      const nv = mesh.addVertex(oldV.position.clone())
      AttributeInterpolator.copyVertex(oldV, nv)
      oldToNew.set(vId, nv.id)
      newVertexIds.push(nv.id)
      return nv.id
    }

    for (const eId of unique) {
      const edge = mesh.edges.get(eId)
      if (!edge) continue
      for (const fId of edge.faceIds) {
        const f = mesh.faces.get(fId)
        if (f) n.add(f.normal)
      }
      const aNew = ensure(edge.v1)
      const bNew = ensure(edge.v2)
      const face = edge.faceIds.length > 0 ? mesh.faces.get(edge.faceIds[0]!) : null
      let forward = true
      if (face) {
        const idxA = face.vertexIds.indexOf(edge.v1)
        const idxB = face.vertexIds.indexOf(edge.v2)
        const fn = face.vertexIds.length
        if (idxA !== -1 && idxB !== -1) forward = (idxA + 1) % fn === idxB
      }
      const added = forward
        ? this.addSideQuad(mesh, edge.v2, edge.v1, aNew, bNew, face)
        : this.addSideQuad(mesh, edge.v1, edge.v2, bNew, aNew, face)
      if (added !== null) extrudedFaceIds.push(added)
    }

    if (n.lengthSq() > 1e-10) n.normalize()
    else n.set(0, 1, 0)
    mesh.recalculateNormals()
    return { mesh, newVertexIds, extrudedFaceIds, regionNormal: n }
  }

  static extrudeVertices(mesh: EditableMesh, vertexIds: number[]): ExtrudeResult {
    const unique = [...new Set(vertexIds)].filter((id) => mesh.vertices.has(id))
    const newVertexIds: number[] = []
    const n = new THREE.Vector3()

    for (const vId of unique) {
      const oldV = mesh.vertices.get(vId)
      if (!oldV) continue
      for (const fId of oldV.faceIds) {
        const f = mesh.faces.get(fId)
        if (f) n.add(f.normal)
      }
      const nv = mesh.addVertex(oldV.position.clone())
      AttributeInterpolator.copyVertex(oldV, nv)
      newVertexIds.push(nv.id)
      mesh.getOrCreateEdge(vId, nv.id)
    }

    if (n.lengthSq() > 1e-10) n.normalize()
    else n.set(0, 1, 0)
    mesh.recalculateNormals()
    return { mesh, newVertexIds, extrudedFaceIds: [], regionNormal: n }
  }

  private static addSideQuad(
    mesh: EditableMesh,
    a: number,
    b: number,
    c: number,
    d: number,
    srcFace: { materialIndex: number; color?: string } | null | undefined
  ): number | null {
    const uvs = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(1, 0),
      new THREE.Vector2(1, 1),
      new THREE.Vector2(0, 1),
    ]
    const face = mesh.addFace([a, b, c, d], uvs, srcFace?.materialIndex ?? 0, srcFace?.color)
    return face?.id ?? null
  }
}
