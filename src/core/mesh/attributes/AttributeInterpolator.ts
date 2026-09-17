import * as THREE from 'three'
import { EditableMesh, MeshFace, MeshVertex } from '../MeshKernel'

export class AttributeInterpolator {
  /** Copy data, never topology identity or mutable attribute references. */
  static copyVertex(source: MeshVertex, target: MeshVertex): void {
    target.color = source.color
    target.boneWeights = source.boneWeights ? { ...source.boneWeights } : undefined
  }

  static interpolateVertex(a: MeshVertex, b: MeshVertex, target: MeshVertex, t: number): void {
    const weights: Record<string, number> = {}
    for (const [vertex, factor] of [[a, 1 - t], [b, t]] as const) {
      for (const [bone, weight] of Object.entries(vertex.boneWeights ?? {})) {
        if (Number.isFinite(weight) && weight > 0) weights[bone] = (weights[bone] ?? 0) + factor * weight
      }
    }
    const influences = Object.entries(weights).filter(([, w]) => w > 0)
      .sort(([aId, aw], [bId, bw]) => bw - aw || aId.localeCompare(bId)).slice(0, 4)
    const total = influences.reduce((sum, [, w]) => sum + w, 0)
    target.boneWeights = total > 0 ? Object.fromEntries(influences.map(([id, w]) => [id, w / total])) : undefined
    target.color = a.color === b.color ? a.color : a.color && b.color
      ? `#${new THREE.Color(a.color).lerp(new THREE.Color(b.color), t).getHexString()}`
      : a.color ?? b.color
  }

  /**
   * Interpolates face corner UVs along an edge (vA -> vB) at parameter t (0..1).
   */
  static interpolateEdgeUV(face: MeshFace, vA: number, vB: number, t: number): THREE.Vector2 {
    const idxA = face.vertexIds.indexOf(vA)
    const idxB = face.vertexIds.indexOf(vB)

    if (idxA !== -1 && idxB !== -1 && face.uvs[idxA] && face.uvs[idxB]) {
      return face.uvs[idxA].clone().lerp(face.uvs[idxB], t)
    }

    return new THREE.Vector2(0.5, 0.5)
  }

  /**
   * Interpolates 3D position along an edge (vA -> vB) at parameter t.
   */
  static interpolateEdgePosition(mesh: EditableMesh, vA: number, vB: number, t: number): THREE.Vector3 {
    const posA = mesh.vertices.get(vA)?.position || new THREE.Vector3()
    const posB = mesh.vertices.get(vB)?.position || new THREE.Vector3()
    return posA.clone().lerp(posB, t)
  }
}
