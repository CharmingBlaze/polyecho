import * as THREE from 'three'
import { EditableMesh, MeshFace } from '../MeshKernel'

export class AttributeInterpolator {
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
