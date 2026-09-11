import * as THREE from 'three'
import { EditableMesh } from '../MeshKernel'

export type BevelProfileMode = 'chamfer' | 'convex' | 'concave'

export interface BevelOptions {
  width: number
  segments: number
  /** 0 = chamfer, 0.5 = convex round, 1 = concave. */
  profile?: number
  clampOverlap?: boolean
}

export interface BevelResult {
  mesh: EditableMesh
  beveledFaceIds: number[]
  beveledVertexIds: number[]
}

export function bevelProfileLabel(profile: number): BevelProfileMode {
  if (profile <= 0.25) return 'chamfer'
  if (profile >= 0.75) return 'concave'
  return 'convex'
}

export function bevelProfileValue(mode: BevelProfileMode): number {
  if (mode === 'chamfer') return 0
  if (mode === 'concave') return 1
  return 0.5
}

export class BevelKernel {
  static bevelFaces(mesh: EditableMesh, faceIds: number[], options: BevelOptions): BevelResult {
    const segments = Math.max(1, Math.min(8, options.segments || 1))
    let width = Math.max(0.001, options.width)
    const profile = Math.max(0, Math.min(1, options.profile ?? 0))

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

      let minDistToCenter = Infinity
      for (const p of origVerts) {
        minDistToCenter = Math.min(minDistToCenter, p.distanceTo(centroid))
      }
      if (options.clampOverlap !== false) {
        width = Math.min(width, minDistToCenter * 0.9)
      }

      let previousRingVertIds = [...face.vertexIds]
      const matIdx = face.materialIndex
      const color = face.color
      const uvs = [...face.uvs]
      const faceNormal = face.normal.clone().normalize()

      mesh.removeFace(fId)

      for (let s = 1; s <= segments; s++) {
        const t = s / segments
        const { radial, alongNormal } = BevelKernel.profileOffset(t, width, profile)
        const currentRingVertIds: number[] = []

        for (let i = 0; i < n; i++) {
          const pOrig = origVerts[i]
          const dirToCenter = centroid.clone().sub(pOrig)
          if (dirToCenter.lengthSq() < 1e-10) dirToCenter.copy(faceNormal)
          else dirToCenter.normalize()
          const pos = pOrig.clone()
            .add(dirToCenter.multiplyScalar(radial))
            .add(faceNormal.clone().multiplyScalar(alongNormal))

          const newV = mesh.addVertex(pos)
          currentRingVertIds.push(newV.id)
          beveledVertexIds.push(newV.id)
        }

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

      const capFace = mesh.addFace(previousRingVertIds, uvs, matIdx, color)
      if (capFace) beveledFaceIds.push(capFace.id)
    }

    mesh.recalculateNormals()
    return { mesh, beveledFaceIds, beveledVertexIds }
  }

  /** Mix chamfer (linear inset), convex quarter-circle, and concave scoop. */
  static profileOffset(t: number, width: number, profile: number): { radial: number; alongNormal: number } {
    const chamfer = { radial: width * t, alongNormal: 0 }
    const angle = Math.PI * 0.5 * t
    const convex = { radial: width * (1 - Math.cos(angle)), alongNormal: width * Math.sin(angle) }
    const concave = { radial: width * Math.sin(angle), alongNormal: width * (1 - Math.cos(angle)) }

    if (profile <= 0.5) {
      const k = profile * 2
      return {
        radial: chamfer.radial + (convex.radial - chamfer.radial) * k,
        alongNormal: chamfer.alongNormal + (convex.alongNormal - chamfer.alongNormal) * k,
      }
    }
    const k = (profile - 0.5) * 2
    return {
      radial: convex.radial + (concave.radial - convex.radial) * k,
      alongNormal: convex.alongNormal + (concave.alongNormal - convex.alongNormal) * k,
    }
  }
}
