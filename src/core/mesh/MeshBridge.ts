import * as THREE from 'three'
import { EditableMesh } from './MeshKernel'
import { MeshObject, Vertex, Face } from '../../types/mesh'

export class MeshBridge {
  /**
   * Converts a traditional MeshObject into an EditableMesh.
   * Maps string IDs to stable numeric IDs.
   */
  static meshObjectToEditableMesh(meshObj: MeshObject): {
    mesh: EditableMesh
    strToNumVertId: Map<string, number>
    numToStrVertId: Map<number, string>
    strToNumFaceId: Map<string, number>
    numToStrFaceId: Map<number, string>
  } {
    const mesh = new EditableMesh()
    const strToNumVertId = new Map<string, number>()
    const numToStrVertId = new Map<number, string>()
    const strToNumFaceId = new Map<string, number>()
    const numToStrFaceId = new Map<number, string>()

    // Add vertices
    for (const v of meshObj.vertices) {
      const numId = mesh.allocVertexId()
      strToNumVertId.set(v.id, numId)
      numToStrVertId.set(numId, v.id)
      mesh.addVertex(new THREE.Vector3(v.position.x, v.position.y, v.position.z), numId)
    }

    // Add faces
    for (const f of meshObj.faces) {
      const numFaceId = mesh.allocFaceId()
      strToNumFaceId.set(f.id, numFaceId)
      numToStrFaceId.set(numFaceId, f.id)

      const numVertIds = f.vertexIds.map(vid => strToNumVertId.get(vid)!).filter(id => id !== undefined)
      const uvs = f.uvs.map(u => new THREE.Vector2(u.u, u.v))

      mesh.addFace(numVertIds, uvs, f.materialIndex || 0, undefined, numFaceId)
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

    const vertexIdMap = new Map<number, string>()

    // Build vertices
    for (const [vId, v] of mesh.vertices) {
      const strId = vertMap?.get(vId) || `v_${vId}`
      vertexIdMap.set(vId, strId)

      vertices.push({
        id: strId,
        position: { x: v.position.x, y: v.position.y, z: v.position.z }
      })
    }

    // Build faces
    for (const [fId, f] of mesh.faces) {
      const strFaceId = faceMap?.get(fId) || `f_${fId}`
      const faceVertStrIds = f.vertexIds.map(numId => vertexIdMap.get(numId)!).filter(Boolean)

      faces.push({
        id: strFaceId,
        vertexIds: faceVertStrIds,
        uvs: f.uvs.map(u => ({ u: u.x, v: u.y })),
        normal: { x: f.normal.x, y: f.normal.y, z: f.normal.z },
        materialIndex: f.materialIndex
      })
    }

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
        faces
      }
    }

    return {
      ...baseMeshObjOrName,
      vertices,
      faces
    }
  }

  /**
   * Converts an EditableMesh directly into THREE.BufferGeometry for render/ghost previews.
   */
  static editableMeshToThreeGeometry(mesh: EditableMesh): THREE.BufferGeometry {
    const positions: number[] = []
    const normals: number[] = []
    const uvs: number[] = []

    mesh.recalculateNormals()

    for (const [, face] of mesh.faces) {
      const vIds = face.vertexIds
      if (vIds.length < 3) continue

      const fn = face.normal
      const p0 = mesh.vertices.get(vIds[0])?.position
      const uv0 = face.uvs[0] || new THREE.Vector2(0, 0)
      if (!p0) continue

      for (let i = 1; i < vIds.length - 1; i++) {
        const p1 = mesh.vertices.get(vIds[i])?.position
        const p2 = mesh.vertices.get(vIds[i + 1])?.position
        if (!p1 || !p2) continue

        const uv1 = face.uvs[i] || new THREE.Vector2(1, 0)
        const uv2 = face.uvs[i + 1] || new THREE.Vector2(1, 1)

        positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z)
        normals.push(fn.x, fn.y, fn.z, fn.x, fn.y, fn.z, fn.x, fn.y, fn.z)
        uvs.push(uv0.x, uv0.y, uv1.x, uv1.y, uv2.x, uv2.y)
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    return geometry
  }
}
