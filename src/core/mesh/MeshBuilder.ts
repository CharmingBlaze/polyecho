import { Vector2, Vector3 } from 'three'
import { EditableMesh } from './MeshKernel'
import { assertMeshValid } from './MeshValidator'

/** Validated construction using the same mutation rules as the editing kernel. */
export class MeshBuilder {
  private mesh = new EditableMesh()

  vertex(position: Vector3): number { return this.mesh.addVertex(position).id }

  face(vertices: number[], uvs?: Vector2[], materialIndex = 0): number {
    const face = this.mesh.addFace(vertices, uvs, materialIndex)
    if (!face) throw new Error('Invalid polygon corners')
    return face.id
  }

  build(): EditableMesh {
    assertMeshValid(this.mesh)
    return this.mesh.clone()
  }
}
