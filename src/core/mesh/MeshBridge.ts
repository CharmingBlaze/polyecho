import * as THREE from 'three'
import { surfaceTriangles } from '../geometry/SurfaceGeometry'
import { EditableMesh } from './MeshKernel'
import { MeshObject, Vertex, Face } from '../../types/mesh'
import { undirectedEdgeId } from '../geometry/EdgeUtils'

export class MeshBridge {
  /**
   * Converts a traditional MeshObject into an EditableMesh.
   * Maps string IDs to stable numeric IDs.
   */
  static meshObjectToEditableMesh(meshObj: MeshObject, previous?: {
    mesh: EditableMesh
    strToNumVertId: Map<string, number>
    strToNumFaceId: Map<string, number>
  }): {
    mesh: EditableMesh
    strToNumVertId: Map<string, number>
    numToStrVertId: Map<number, string>
    strToNumFaceId: Map<string, number>
    numToStrFaceId: Map<number, string>
  } {
    const mesh = new EditableMesh()
    if (previous) {
      mesh.restoreSnapshot({ ...previous.mesh.createSnapshot(), vertices: [], edges: [], faces: [], halfEdges: [] })
    }
    const strToNumVertId = new Map<string, number>(previous?.strToNumVertId)
    const numToStrVertId = new Map<number, string>()
    const strToNumFaceId = new Map<string, number>(previous?.strToNumFaceId)
    const numToStrFaceId = new Map<number, string>()

    // Add vertices
    for (const v of meshObj.vertices) {
      const numId = strToNumVertId.get(v.id) ?? mesh.allocVertexId()
      strToNumVertId.set(v.id, numId)
      numToStrVertId.set(numId, v.id)
      if (mesh.vertices.has(numId)) throw new Error(`Duplicate vertex ID: ${v.id}`)
      const vertex = mesh.addVertex(new THREE.Vector3(v.position.x, v.position.y, v.position.z), numId)
      vertex.documentId = v.id
      vertex.color = v.color
      vertex.boneWeights = v.boneWeights ? { ...v.boneWeights } : undefined
    }

    // Reserve surviving edge IDs before constructing face loops.
    if (previous) {
      const oldEdges = new Map([...previous.mesh.edges.values()].map(e => [undirectedEdgeId(String(e.v1), String(e.v2)), e]))
      for (const face of meshObj.faces) for (let i = 0; i < face.vertexIds.length; i++) {
        const a = strToNumVertId.get(face.vertexIds[i]), b = strToNumVertId.get(face.vertexIds[(i + 1) % face.vertexIds.length])
        if (a === undefined || b === undefined || !mesh.vertices.has(a) || !mesh.vertices.has(b)) continue
        const old = oldEdges.get(undirectedEdgeId(String(a), String(b)))
        if (old) mesh.getOrCreateEdge(a, b, old.id)
      }
    }

    // Add faces
    for (const f of meshObj.faces) {
      const numFaceId = strToNumFaceId.get(f.id) ?? mesh.allocFaceId()
      strToNumFaceId.set(f.id, numFaceId)
      numToStrFaceId.set(numFaceId, f.id)

      if (mesh.faces.has(numFaceId)) throw new Error(`Duplicate face ID: ${f.id}`)
      const numVertIds = f.vertexIds.map(vid => {
        const id = strToNumVertId.get(vid)
        if (id === undefined || !mesh.vertices.has(id)) throw new Error(`Face ${f.id} references missing vertex ${vid}`)
        return id
      })
      const uvs = f.uvs.map(u => new THREE.Vector2(u.u, u.v))

      const face = mesh.addFace(numVertIds, uvs, f.materialIndex ?? 0, undefined, numFaceId)
      if (!face) throw new Error(`Invalid polygon: ${f.id}`)
      face.documentId = f.id
    }

    const seams = new Set(meshObj.seamEdgeIds ?? [])
    for (const edge of mesh.edges.values()) {
      if (seams.has(undirectedEdgeId(numToStrVertId.get(edge.v1)!, numToStrVertId.get(edge.v2)!))) edge.seam = true
    }

    mesh.recalculateNormals()

    return {
      mesh,
      strToNumVertId,
      numToStrVertId,
      strToNumFaceId,
      numToStrFaceId
    }
  }

  /**
   * Converts an EditableMesh back to a MeshObject.
   */
  static editableMeshToMeshObject(
    mesh: EditableMesh,
    baseMeshObjOrName: MeshObject | string,
    idOrVertMap?: string | Map<number, string>,
    numToStrVertId?: Map<number, string>,
    numToStrFaceId?: Map<number, string>
  ): MeshObject {
    const vertices: Vertex[] = []
    const faces: Face[] = []

    let vertMap: Map<number, string> | undefined
    let faceMap: Map<number, string> | undefined

    if (idOrVertMap instanceof Map) {
      vertMap = idOrVertMap
      faceMap = numToStrVertId
    } else {
      vertMap = numToStrVertId
      faceMap = numToStrFaceId
    }
    // Identity belongs to the kernel too, so callers cannot accidentally rename
    // surviving elements by omitting the bridge maps.
    vertMap ??= new Map()
    faceMap ??= new Map()
    for (const v of mesh.vertices.values()) if (v.documentId && !vertMap.has(v.id)) vertMap.set(v.id, v.documentId)
    for (const f of mesh.faces.values()) if (f.documentId && !faceMap.has(f.id)) faceMap.set(f.id, f.documentId)

    const vertexIdMap = new Map<number, string>()
    // Kernel ids are rebuilt on import; surviving document ids are not.
    // Reserve all existing strings so a later operation cannot create a second
    // `v_12` / `f_12` after earlier topology edits removed lower-numbered ids.
    const usedVertices = new Set(vertMap?.values() ?? [])
    const usedFaces = new Set(faceMap?.values() ?? [])
    if (typeof baseMeshObjOrName !== 'string') {
      baseMeshObjOrName.vertices.forEach(v => usedVertices.add(v.id))
      baseMeshObjOrName.faces.forEach(f => usedFaces.add(f.id))
    }
    const allocate = (id: number, prefix: string, map: Map<number, string> | undefined, used: Set<string>) => {
      const existing = map?.get(id)
      if (existing) return existing
      let candidate = `${prefix}_${id}`, suffix = 1
      while (used.has(candidate)) candidate = `${prefix}_${id}_${suffix++}`
      used.add(candidate)
      map?.set(id, candidate)
      return candidate
    }

    // Build vertices
    for (const [vId, v] of mesh.vertices) {
      const strId = allocate(vId, 'v', vertMap, usedVertices)
      v.documentId = strId
      vertexIdMap.set(vId, strId)

      vertices.push({
        id: strId,
        position: { x: v.position.x, y: v.position.y, z: v.position.z },
        ...(v.color !== undefined ? { color: v.color } : {}),
        ...(v.boneWeights ? { boneWeights: { ...v.boneWeights } } : {})
      })
    }

    // Build faces
    for (const [fId, f] of mesh.faces) {
      const strFaceId = allocate(fId, 'f', faceMap, usedFaces)
      f.documentId = strFaceId
      const faceVertStrIds = f.vertexIds.map(numId => vertexIdMap.get(numId)!).filter(Boolean)

      // Ensure every vertex of the face has a corresponding UV coordinate
      let uvs = f.uvs && f.uvs.length === faceVertStrIds.length 
        ? f.uvs.map(u => ({ u: u.x, v: u.y }))
        : []

      if (uvs.length !== faceVertStrIds.length) {
        // Fallback procedural UV generation per polygon
        if (faceVertStrIds.length === 3) {
          uvs = [{ u: 0.5, v: 1.0 }, { u: 0.0, v: 0.0 }, { u: 1.0, v: 0.0 }]
        } else if (faceVertStrIds.length === 4) {
          uvs = [{ u: 0.0, v: 0.0 }, { u: 1.0, v: 0.0 }, { u: 1.0, v: 1.0 }, { u: 0.0, v: 1.0 }]
        } else {
          uvs = faceVertStrIds.map((_, i) => {
            const angle = (i / faceVertStrIds.length) * Math.PI * 2
            return { u: 0.5 + 0.5 * Math.cos(angle), v: 0.5 + 0.5 * Math.sin(angle) }
          })
        }
      }

      faces.push({
        id: strFaceId,
        vertexIds: faceVertStrIds,
        uvs,
        normal: { x: f.normal.x, y: f.normal.y, z: f.normal.z },
        materialIndex: f.materialIndex
      })
    }

    const seamEdgeIds = [...mesh.edges.values()].filter(e => e.seam)
      .map(e => undirectedEdgeId(vertexIdMap.get(e.v1)!, vertexIdMap.get(e.v2)!))
    const seamData = seamEdgeIds.length || (typeof baseMeshObjOrName !== 'string' && baseMeshObjOrName.seamEdgeIds)
      ? { seamEdgeIds } : {}

    if (typeof baseMeshObjOrName === 'string') {
      const meshId = (typeof idOrVertMap === 'string') ? idOrVertMap : `mesh_${Date.now()}_${Math.floor(Math.random() * 1000)}`
      return {
        id: meshId,
        name: baseMeshObjOrName,
        visible: true,
        locked: false,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        materialId: 'default_material',
        shadeMode: 'flat',
        vertices,
        faces,
        ...seamData
      }
    }

    return {
      ...baseMeshObjOrName,
      vertices,
      faces,
      ...seamData
    }
  }

  /**
   * Converts an EditableMesh directly into THREE.BufferGeometry for render/ghost previews.
   */
  static editableMeshToThreeGeometry(mesh: EditableMesh): THREE.BufferGeometry {
    const triangleToFace: number[] = []
    const renderVertexToVertex: number[] = []
    const renderVertexToCorner: number[] = []
    const positions: number[] = []
    const normals: number[] = []
    const uvs: number[] = []

    mesh.recalculateNormals()

    for (const [, face] of mesh.faces) {
      const vIds = face.vertexIds
      if (vIds.length < 3) continue

      const fn = face.normal
      const points = vIds.map(id => mesh.vertices.get(id)!.position)
      for (const triangle of surfaceTriangles(points)) {
        triangleToFace.push(face.id)
        for (const corner of triangle) {
          const p = points[corner]
          const uv = face.uvs[corner] ?? new THREE.Vector2()
          positions.push(p.x, p.y, p.z)
          normals.push(fn.x, fn.y, fn.z)
          uvs.push(uv.x, uv.y)
          renderVertexToVertex.push(vIds[corner])
          renderVertexToCorner.push(face.halfEdgeIds[corner])
        }
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.userData.renderMapping = { triangleToFace, renderVertexToVertex, renderVertexToCorner }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    return geometry
  }
}
