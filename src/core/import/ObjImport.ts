import { MeshObject, Vertex, Face, Vector3D } from '../../types/mesh'
import { computeFaceNormal } from '../../utils/math'
import { ensureMeshUVs, boxUnwrap } from '../geometry/UVUnwrap'
import {
  inferShadeModeFromTriangles,
  parseObjShadeComment,
  type ShadeExtras,
  type ShadeTriangle
} from '../geometry/MeshShading'

export interface ObjImportResult {
  meshes: MeshObject[]
  materialNames: string[]
}

export class ObjImport {
  /**
   * Parses a Wavefront .obj text string into one or more MeshObject instances.
   */
  static parse(objText: string, defaultName = 'Imported_Mesh'): ObjImportResult {
    const lines = objText.split(/\r?\n/)

    const rawVertices: Array<Vector3D & { color?: string }> = []
    const rawUVs: { u: number; v: number }[] = []
    const rawNormals: Vector3D[] = []

    interface RawFace {
      vertexIndices: number[]
      uvIndices: number[]
      normalIndices: number[]
      materialIndex?: number
      smoothing: number
    }

    const meshes: MeshObject[] = []
    const materialNames = new Set<string>()
    let currentMeshName = defaultName
    let currentMaterial = 'default_material'
    let currentFaces: RawFace[] = []
    let currentSmoothing = 0
    let pendingShade: ShadeExtras | null = null

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
              position: { x: rawV.x, y: rawV.y, z: rawV.z },
              color: rawV.color
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
        const samples: ShadeTriangle[] = []
        for (const f of currentFaces) {
          for (let i = 1; i < f.vertexIndices.length - 1; i++) {
            const idxs = [0, i, i + 1]
            const positions = idxs.map(k => {
              const raw = rawVertices[f.vertexIndices[k] - 1]
              return raw ? { x: raw.x, y: raw.y, z: raw.z } : { x: 0, y: 0, z: 0 }
            }) as ShadeTriangle['positions']
            const normals = idxs.every(k => f.normalIndices[k] && rawNormals[f.normalIndices[k] - 1])
              ? idxs.map(k => rawNormals[f.normalIndices[k] - 1]) as ShadeTriangle['normals']
              : undefined
            samples.push({ positions, normals })
          }
        }
        const smoothingOn = currentFaces.some(f => f.smoothing > 0)
        const inferred = pendingShade ?? {
          shadeMode: smoothingOn ? inferShadeModeFromTriangles(samples) : 'flat'
        }
        const objMesh: MeshObject = {
          id: `mesh_obj_${Date.now()}_${meshes.length + 1}`,
          name: currentMeshName,
          visible: true,
          locked: false,
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          materialId: currentMaterial,
          shadeMode: inferred.shadeMode,
          autoSmoothAngle: inferred.autoSmoothAngle,
          vertices: meshVertices,
          faces: meshFaces
        }

        // Check if all UVs are (0,0) or missing -> auto unwrap with Smart Box Unwrap
        const hasCustomUVs = meshFaces.some(f => f.uvs && f.uvs.some(u => u.u !== 0 || u.v !== 0))
        if (!hasCustomUVs) {
          const unwrapped = boxUnwrap(objMesh)
          objMesh.faces = unwrapped.faces
        }
        ensureMeshUVs(objMesh)

        meshes.push(objMesh)
      }

      currentFaces = []
      pendingShade = null
    }

    for (let line of lines) {
      line = line.trim()
      if (!line) continue
      if (line.startsWith('#')) {
        const shadeHint = parseObjShadeComment(line)
        if (shadeHint) pendingShade = shadeHint
        continue
      }

      const parts = line.split(/\s+/)
      const tag = parts[0]

      if (tag === 'v') {
        const x = parseFloat(parts[1]) || 0
        const y = parseFloat(parts[2]) || 0
        const z = parseFloat(parts[3]) || 0
        const vertex: Vector3D & { color?: string } = { x, y, z }
        if (parts.length >= 7) {
          const r = Math.round(Math.min(1, Math.max(0, parseFloat(parts[4]) || 0)) * 255)
          const g = Math.round(Math.min(1, Math.max(0, parseFloat(parts[5]) || 0)) * 255)
          const b = Math.round(Math.min(1, Math.max(0, parseFloat(parts[6]) || 0)) * 255)
          vertex.color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
        }
        rawVertices.push(vertex)
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
          currentFaces.push({ vertexIndices, uvIndices, normalIndices, smoothing: currentSmoothing })
        }
      } else if (tag === 's') {
        const token = (parts[1] || 'off').toLowerCase()
        currentSmoothing = token === 'off' || token === '0' ? 0 : (parseInt(token, 10) || 1)
      } else if (tag === 'o' || tag === 'g') {
        if (currentFaces.length > 0) {
          flushCurrentMesh()
        }
        if (parts[1]) {
          currentMeshName = parts.slice(1).join('_')
        }
      } else if (tag === 'usemtl' && parts[1]) {
        const nextMat = parts[1]
        if (currentFaces.length > 0 && nextMat !== currentMaterial) {
          flushCurrentMesh()
        }
        currentMaterial = nextMat
        materialNames.add(nextMat)
      }
    }

    flushCurrentMesh()

    if (meshes.length === 0 && rawVertices.length > 0) {
      flushCurrentMesh()
    }

    return { meshes, materialNames: [...materialNames] }
  }
}
