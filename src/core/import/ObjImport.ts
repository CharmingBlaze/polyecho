import { MeshObject, Vertex, Face, Vector3D } from '../../types/mesh'
import { computeFaceNormal } from '../../utils/math'

export interface ObjImportResult {
  meshes: MeshObject[]
}

export class ObjImport {
  /**
   * Parses a Wavefront .obj text string into one or more MeshObject instances.
   */
  static parse(objText: string, defaultName = 'Imported_Mesh'): ObjImportResult {
    const lines = objText.split(/\r?\n/)

    const rawVertices: Vector3D[] = []
    const rawUVs: { u: number; v: number }[] = []
    const rawNormals: Vector3D[] = []

    interface RawFace {
      vertexIndices: number[]
      uvIndices: number[]
      normalIndices: number[]
      materialIndex?: number
    }

    const meshes: MeshObject[] = []
    let currentMeshName = defaultName
    let currentFaces: RawFace[] = []

    function flushCurrentMesh() {
      if (currentFaces.length === 0) return

      const meshVertices: Vertex[] = []
      const meshFaces: Face[] = []

      // Map raw OBJ 1-based vertex index to new MeshObject vertex ID
      const vertIndexToMeshVertId = new Map<number, string>()

      for (let i = 0; i < currentFaces.length; i++) {
        const f = currentFaces[i]
        const faceVertIds: string[] = []
        const faceUVs: { u: number; v: number }[] = []

        for (let j = 0; j < f.vertexIndices.length; j++) {
          const vIdx = f.vertexIndices[j]
          let vertId = vertIndexToMeshVertId.get(vIdx)

          if (!vertId) {
            const rawV = rawVertices[vIdx - 1] || { x: 0, y: 0, z: 0 }
            vertId = `v_${meshVertices.length + 1}`
            vertIndexToMeshVertId.set(vIdx, vertId)

            meshVertices.push({
              id: vertId,
              position: { x: rawV.x, y: rawV.y, z: rawV.z }
            })
          }

          faceVertIds.push(vertId)

          // UV
          const uvIdx = f.uvIndices[j]
          if (uvIdx && rawUVs[uvIdx - 1]) {
            faceUVs.push({ ...rawUVs[uvIdx - 1] })
          } else {
            faceUVs.push({ u: 0, v: 0 })
          }
        }

        // Calculate face normal
        const faceVertPositions = faceVertIds.map(vid => {
          const v = meshVertices.find(mv => mv.id === vid)
          return v ? v.position : { x: 0, y: 0, z: 0 }
        })
        const normal = computeFaceNormal(faceVertPositions)

        meshFaces.push({
          id: `f_${meshFaces.length + 1}`,
          vertexIds: faceVertIds,
          uvs: faceUVs,
          normal,
          materialIndex: f.materialIndex || 0
        })
      }

      if (meshVertices.length > 0 && meshFaces.length > 0) {
        meshes.push({
          id: `mesh_obj_${Date.now()}_${meshes.length + 1}`,
          name: currentMeshName,
          visible: true,
          locked: false,
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          materialId: 'default_material',
          shadeMode: 'flat',
          vertices: meshVertices,
          faces: meshFaces
        })
      }

      currentFaces = []
    }

    for (let line of lines) {
      line = line.trim()
      if (!line || line.startsWith('#')) continue

      const parts = line.split(/\s+/)
      const tag = parts[0]

      if (tag === 'v') {
        // Vertex position: v x y z
        const x = parseFloat(parts[1]) || 0
        const y = parseFloat(parts[2]) || 0
        const z = parseFloat(parts[3]) || 0
        rawVertices.push({ x, y, z })
      } else if (tag === 'vt') {
        // Vertex UV: vt u v
        const u = parseFloat(parts[1]) || 0
        const v = parseFloat(parts[2]) || 0
        rawUVs.push({ u, v })
      } else if (tag === 'vn') {
        // Vertex Normal: vn x y z
        const x = parseFloat(parts[1]) || 0
        const y = parseFloat(parts[2]) || 0
        const z = parseFloat(parts[3]) || 0
        rawNormals.push({ x, y, z })
      } else if (tag === 'f') {
        // Face definition: f v1/vt1/vn1 v2/vt2/vn2 ...
        const vertexIndices: number[] = []
        const uvIndices: number[] = []
        const normalIndices: number[] = []

        for (let i = 1; i < parts.length; i++) {
          const segs = parts[i].split('/')
          const vIdx = parseInt(segs[0], 10)
          if (!isNaN(vIdx)) {
            // Handle negative indices relative to end of list
            vertexIndices.push(vIdx < 0 ? rawVertices.length + vIdx + 1 : vIdx)
          }

          if (segs.length > 1 && segs[1]) {
            const vtIdx = parseInt(segs[1], 10)
            if (!isNaN(vtIdx)) {
              uvIndices.push(vtIdx < 0 ? rawUVs.length + vtIdx + 1 : vtIdx)
            }
          } else {
            uvIndices.push(0)
          }

          if (segs.length > 2 && segs[2]) {
            const vnIdx = parseInt(segs[2], 10)
            if (!isNaN(vnIdx)) {
              normalIndices.push(vnIdx < 0 ? rawNormals.length + vnIdx + 1 : vnIdx)
            }
          }
        }

        if (vertexIndices.length >= 3) {
          currentFaces.push({ vertexIndices, uvIndices, normalIndices })
        }
      } else if (tag === 'o' || tag === 'g') {
        // Object or Group declaration
        if (currentFaces.length > 0) {
          flushCurrentMesh()
        }
        if (parts[1]) {
          currentMeshName = parts.slice(1).join('_')
        }
      }
    }

    flushCurrentMesh()

    if (meshes.length === 0 && rawVertices.length > 0) {
      // Fallback if no groups were defined
      flushCurrentMesh()
    }

    return { meshes }
  }
}
