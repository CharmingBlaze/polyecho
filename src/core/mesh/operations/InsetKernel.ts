import * as THREE from 'three'
import { EditableMesh } from '../MeshKernel'

export interface InsetOptions {
  thickness: number
  depth?: number
  outset?: boolean
}

export interface InsetResult {
  mesh: EditableMesh
  insetFaceIds: number[]
  insetVertexIds: number[]
}

export class InsetKernel {
  /**
   * True polygon offset Inset algorithm.
   * Calculates inward/outward parallel offset lines and their corner intersections.
   */
  static insetFace(mesh: EditableMesh, faceId: number, options: InsetOptions): InsetResult | null {
    const face = mesh.faces.get(faceId)
    if (!face || face.vertexIds.length < 3) return null

    const thickness = Math.max(0.001, options.thickness)
    const depth = options.depth || 0

    const vertIds = [...face.vertexIds]
    const n = vertIds.length
    const originalPositions = vertIds.map(vid => mesh.vertices.get(vid)!.position.clone())

    // Face plane coordinate system
    const normal = face.normal.clone().normalize()
    const p0 = originalPositions[0]

    // Basis vectors on the polygon plane
    const uAxis = originalPositions[1].clone().sub(p0).normalize()
    const vAxis = new THREE.Vector3().crossVectors(normal, uAxis).normalize()

    // 2D coordinates on the plane
    const pts2D = originalPositions.map(p => {
      const rel = p.clone().sub(p0)
      return new THREE.Vector2(rel.dot(uAxis), rel.dot(vAxis))
    })

    // Compute inward offset lines: for edge (p_i -> p_{i+1}), normal is (-dy, dx)
    interface Line2D {
      point: THREE.Vector2
      dir: THREE.Vector2
    }

    const offsetLines: Line2D[] = []

    for (let i = 0; i < n; i++) {
      const pA = pts2D[i]
      const pB = pts2D[(i + 1) % n]
      const edgeVec = pB.clone().sub(pA)
      const edgeLen = edgeVec.length()
      if (edgeLen < 1e-6) continue

      const dir = edgeVec.clone().normalize()
      // Inward perpendicular normal for CCW winding is (-dir.y, dir.x)
      const inwardNormal = new THREE.Vector2(-dir.y, dir.x)
      if (options.outset) {
        inwardNormal.negate()
      }

      // Offset line point
      const offsetPoint = pA.clone().add(inwardNormal.clone().multiplyScalar(thickness))
      offsetLines.push({ point: offsetPoint, dir })
    }

    // Intersect consecutive offset lines to find new inset 2D corners
    const newPts2D: THREE.Vector2[] = []
    const lineCount = offsetLines.length

    for (let i = 0; i < lineCount; i++) {
      const line1 = offsetLines[(i - 1 + lineCount) % lineCount]
      const line2 = offsetLines[i]

      // Solve intersection: line1.point + t1 * line1.dir = line2.point + t2 * line2.dir
      const det = line1.dir.x * line2.dir.y - line1.dir.y * line2.dir.x
      if (Math.abs(det) > 1e-5) {
        const dp = line2.point.clone().sub(line1.point)
        const t1 = (dp.x * line2.dir.y - dp.y * line2.dir.x) / det
        const intersect = line1.point.clone().add(line1.dir.clone().multiplyScalar(t1))
        newPts2D.push(intersect)
      } else {
        // Parallel or collinear fallback
        newPts2D.push(line2.point)
      }
    }

    // Convert 2D points back to 3D world space (plus depth along normal)
    const newVertexIds: number[] = []
    for (let i = 0; i < n; i++) {
      const p2 = newPts2D[i]
      const pos3D = p0.clone()
        .add(uAxis.clone().multiplyScalar(p2.x))
        .add(vAxis.clone().multiplyScalar(p2.y))
        .add(normal.clone().multiplyScalar(depth))

      const newV = mesh.addVertex(pos3D)
      newVertexIds.push(newV.id)
    }

    // Preserve metadata
    const uvs = [...face.uvs]
    const matIdx = face.materialIndex
    const color = face.color

    // Remove the original face
    mesh.removeFace(faceId)

    // Add perimeter quad strips connecting original border to inset border
    for (let i = 0; i < n; i++) {
      const vA_orig = vertIds[i]
      const vB_orig = vertIds[(i + 1) % n]
      const vB_inset = newVertexIds[(i + 1) % n]
      const vA_inset = newVertexIds[i]

      mesh.addFace([vA_orig, vB_orig, vB_inset, vA_inset], undefined, matIdx, color)
    }

    // Add the center inset cap face
    const centerCapFace = mesh.addFace(newVertexIds, uvs, matIdx, color, faceId)
    mesh.recalculateNormals()

    return {
      mesh,
      insetFaceIds: centerCapFace ? [centerCapFace.id] : [],
      insetVertexIds: newVertexIds
    }
  }

  static insetFaces(mesh: EditableMesh, faceIds: number[], options: InsetOptions): InsetResult {
    const allInsetFaceIds: number[] = []
    const allInsetVertexIds: number[] = []

    for (const fId of faceIds) {
      const res = this.insetFace(mesh, fId, options)
      if (res) {
        allInsetFaceIds.push(...res.insetFaceIds)
        allInsetVertexIds.push(...res.insetVertexIds)
      }
    }

    return {
      mesh,
      insetFaceIds: allInsetFaceIds,
      insetVertexIds: allInsetVertexIds
    }
  }
}
