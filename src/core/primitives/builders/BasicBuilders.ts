import * as THREE from 'three'
import { EditableMesh } from '../../mesh/MeshKernel'
import { BoxParameters, PlaneParameters, PyramidParameters, WedgeParameters, IPrimitiveBuilder } from '../PrimitiveTypes'

export class BoxBuilder implements IPrimitiveBuilder<BoxParameters> {
  create(params: BoxParameters): EditableMesh {
    const mesh = new EditableMesh()
    const w = Math.abs(params.width) || 1
    const d = Math.abs(params.depth) || 1
    const h = Math.abs(params.height) || 1

    const hx = w / 2
    const hz = d / 2
    const hy = h / 2

    // 8 Vertices
    const v0 = mesh.addVertex(new THREE.Vector3(-hx, -hy,  hz)).id // 0: -X -Y +Z
    const v1 = mesh.addVertex(new THREE.Vector3( hx, -hy,  hz)).id // 1: +X -Y +Z
    const v2 = mesh.addVertex(new THREE.Vector3( hx,  hy,  hz)).id // 2: +X +Y +Z
    const v3 = mesh.addVertex(new THREE.Vector3(-hx,  hy,  hz)).id // 3: -X +Y +Z
    const v4 = mesh.addVertex(new THREE.Vector3(-hx, -hy, -hz)).id // 4: -X -Y -Z
    const v5 = mesh.addVertex(new THREE.Vector3( hx, -hy, -hz)).id // 5: +X -Y -Z
    const v6 = mesh.addVertex(new THREE.Vector3( hx,  hy, -hz)).id // 6: +X +Y -Z
    const v7 = mesh.addVertex(new THREE.Vector3(-hx,  hy, -hz)).id // 7: -X +Y -Z

    const uvs = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(1, 0),
      new THREE.Vector2(1, 1),
      new THREE.Vector2(0, 1)
    ]

    // 6 Quad faces with correct CCW outward winding
    // Front (+Z)
    mesh.addFace([v0, v1, v2, v3], uvs, 0)
    // Back (-Z)
    mesh.addFace([v5, v4, v7, v6], uvs, 0)
    // Top (+Y)
    mesh.addFace([v3, v2, v6, v7], uvs, 0)
    // Bottom (-Y)
    mesh.addFace([v4, v5, v1, v0], uvs, 0)
    // Right (+X)
    mesh.addFace([v1, v5, v6, v2], uvs, 0)
    // Left (-X)
    mesh.addFace([v4, v0, v3, v7], uvs, 0)

    mesh.recalculateNormals()
    return mesh
  }
}

export class PlaneBuilder implements IPrimitiveBuilder<PlaneParameters> {
  create(params: PlaneParameters): EditableMesh {
    const mesh = new EditableMesh()
    const w = Math.abs(params.width) || 1
    const d = Math.abs(params.depth) || 1

    const hx = w / 2
    const hz = d / 2

    const v0 = mesh.addVertex(new THREE.Vector3(-hx, 0,  hz)).id
    const v1 = mesh.addVertex(new THREE.Vector3( hx, 0,  hz)).id
    const v2 = mesh.addVertex(new THREE.Vector3( hx, 0, -hz)).id
    const v3 = mesh.addVertex(new THREE.Vector3(-hx, 0, -hz)).id

    const uvs = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(1, 0),
      new THREE.Vector2(1, 1),
      new THREE.Vector2(0, 1)
    ]

    mesh.addFace([v0, v1, v2, v3], uvs, 0)
    mesh.recalculateNormals()
    return mesh
  }
}

export class PyramidBuilder implements IPrimitiveBuilder<PyramidParameters> {
  create(params: PyramidParameters): EditableMesh {
    const mesh = new EditableMesh()
    const w = Math.abs(params.width) || 1
    const d = Math.abs(params.depth) || 1
    const h = Math.abs(params.height) || 1

    const hx = w / 2
    const hz = d / 2

    // Base 4 vertices at Y = 0
    const v0 = mesh.addVertex(new THREE.Vector3(-hx, 0,  hz)).id
    const v1 = mesh.addVertex(new THREE.Vector3( hx, 0,  hz)).id
    const v2 = mesh.addVertex(new THREE.Vector3( hx, 0, -hz)).id
    const v3 = mesh.addVertex(new THREE.Vector3(-hx, 0, -hz)).id

    // Apex vertex at top center
    const vApex = mesh.addVertex(new THREE.Vector3(0, h, 0)).id

    const quadUvs = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(1, 0),
      new THREE.Vector2(1, 1),
      new THREE.Vector2(0, 1)
    ]

    const triUvs = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(1, 0),
      new THREE.Vector2(0.5, 1)
    ]

    // Base Quad
    mesh.addFace([v3, v2, v1, v0], quadUvs, 0)

    // 4 Side Triangular Faces
    mesh.addFace([v0, v1, vApex], triUvs, 0)
    mesh.addFace([v1, v2, vApex], triUvs, 0)
    mesh.addFace([v2, v3, vApex], triUvs, 0)
    mesh.addFace([v3, v0, vApex], triUvs, 0)

    mesh.recalculateNormals()
    return mesh
  }
}

export class WedgeBuilder implements IPrimitiveBuilder<WedgeParameters> {
  create(params: WedgeParameters): EditableMesh {
    const mesh = new EditableMesh()
    const w = Math.abs(params.width) || 1
    const d = Math.abs(params.depth) || 1
    const h = Math.abs(params.height) || 1

    const hx = w / 2
    const hz = d / 2

    // 6 Vertices for triangular prism ramp
    const v0 = mesh.addVertex(new THREE.Vector3(-hx, 0,  hz)).id // bottom front-left
    const v1 = mesh.addVertex(new THREE.Vector3( hx, 0,  hz)).id // bottom front-right
    const v2 = mesh.addVertex(new THREE.Vector3( hx, 0, -hz)).id // bottom back-right
    const v3 = mesh.addVertex(new THREE.Vector3(-hx, 0, -hz)).id // bottom back-left

    const v4 = mesh.addVertex(new THREE.Vector3( hx, h, -hz)).id // top back-right
    const v5 = mesh.addVertex(new THREE.Vector3(-hx, h, -hz)).id // top back-left

    const quadUvs = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(1, 0),
      new THREE.Vector2(1, 1),
      new THREE.Vector2(0, 1)
    ]

    const triUvs = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(1, 0),
      new THREE.Vector2(1, 1)
    ]

    // Bottom Quad
    mesh.addFace([v3, v2, v1, v0], quadUvs, 0)
    // Back Vertical Quad
    mesh.addFace([v2, v3, v5, v4], quadUvs, 0)
    // Sloped Quad Ramp
    mesh.addFace([v0, v1, v4, v5], quadUvs, 0)
    // Left Triangle
    mesh.addFace([v3, v0, v5], triUvs, 0)
    // Right Triangle
    mesh.addFace([v1, v2, v4], triUvs, 0)

    mesh.recalculateNormals()
    return mesh
  }
}
