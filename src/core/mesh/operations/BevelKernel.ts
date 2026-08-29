import * as THREE from 'three'
import { EditableMesh } from '../MeshKernel'

export interface BevelOptions {
  width: number
  segments: number
  profile?: number // 0.5 = circular arc
  clampOverlap?: boolean
}

export interface BevelResult {
  mesh: EditableMesh
  beveledFaceIds: number[]
  beveledVertexIds: number[]
}

export class BevelKernel {
  /**
   * Chamfer and multi-segment Bevel solver.
   */
  static bevelFaces(mesh: EditableMesh, faceIds: number[], options: BevelOptions): BevelResult {
    const segments = Math.max(1, Math.min(8, options.segments || 1))
    let width = Math.max(0.001, options.width)

    const beveledFaceIds: number[] = []
    const beveledVertexIds: number[] = []

    for (const fId of faceIds) {
      const face = mesh.faces.get(fId)
      if (!face || face.vertexIds.length < 3) continue

      const n = face.vertexIds.length
      const origVerts = face.vertexIds.map(vid => mesh.vertices.get(vid)!.position.clone())
      const centroid = new THREE.Vector3()
      origVerts.forEach(p => centroid.add(p))
      centroid.divideScalar(n)

      // Clamp width so it does not exceed distance to centroid
      let minDistToCenter = Infinity
      for (const p of origVerts) {
        minDistToCenter = Math.min(minDistToCenter, p.distanceTo(centroid))
      }
      if (options.clampOverlap !== false) {
        width = Math.min(width, minDistToCenter * 0.9)
      }

      // Generate segment rings from outer perimeter to beveled center
      let previousRingVertIds = [...face.vertexIds]
      const matIdx = face.materialIndex
      const color = face.color
      const uvs = [...face.uvs]

      mesh.removeFace(fId)

      for (let s = 1; s <= segments; s++) {
        const t = s / segments
        // Arc profile parameterization (circular quadrant when profile = 0.5)
        const angle = (Math.PI * 0.5) * t
        const radialOffset = width * (1 - Math.cos(angle))
        const normalElevation = width * Math.sin(angle)

        const currentRingVertIds: number[] = []

        for (let i = 0; i < n; i++) {
          const pOrig = origVerts[i]
          const dirToCenter = centroid.clone().sub(pOrig).normalize()
          const pos = pOrig.clone()
            .add(dirToCenter.multiplyScalar(radialOffset))
            .add(face.normal.clone().normalize().multiplyScalar(normalElevation))

          const newV = mesh.addVertex(pos)
          currentRingVertIds.push(newV.id)
          beveledVertexIds.push(newV.id)
        }

        // Create quad strip between previousRing and currentRing
        for (let i = 0; i < n; i++) {
          const v1 = previousRingVertIds[i]
          const v2 = previousRingVertIds[(i + 1) % n]
          const v3 = currentRingVertIds[(i + 1) % n]
          const v4 = currentRingVertIds[i]

          const stripFace = mesh.addFace([v1, v2, v3, v4], undefined, matIdx, color)
          if (stripFace) beveledFaceIds.push(stripFace.id)
        }

        previousRingVertIds = currentRingVertIds
      }

      // Add center cap face
      const capFace = mesh.addFace(previousRingVertIds, uvs, matIdx, color)
      if (capFace) beveledFaceIds.push(capFace.id)
    }

    mesh.recalculateNormals()

    return {
      mesh,
      beveledFaceIds,
      beveledVertexIds
    }
  }
}
