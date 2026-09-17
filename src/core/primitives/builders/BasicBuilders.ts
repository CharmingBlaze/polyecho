import * as THREE from 'three'
import { EditableMesh } from '../../mesh/MeshKernel'
import { BoxParameters, PlaneParameters, PyramidParameters, WedgeParameters, IPrimitiveBuilder } from '../PrimitiveTypes'

function gridSurface(mesh: EditableMesh, vertices: Map<string, number>, origin: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, nx: number, ny: number) {
  const ids: number[][] = []
  for (let y = 0; y <= ny; y++) {
    ids[y] = []
    for (let x = 0; x <= nx; x++) {
      const p = origin.clone().addScaledVector(u, x / nx).addScaledVector(v, y / ny)
      const key = p.toArray().map(n => n.toFixed(10)).join(',')
      let id = vertices.get(key)
      if (id === undefined) { id = mesh.addVertex(p).id; vertices.set(key, id) }
      ids[y][x] = id
    }
  }
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) mesh.addFace(
    [ids[y][x], ids[y][x + 1], ids[y + 1][x + 1], ids[y + 1][x]],
    [new THREE.Vector2(x/nx,y/ny),new THREE.Vector2((x+1)/nx,y/ny),new THREE.Vector2((x+1)/nx,(y+1)/ny),new THREE.Vector2(x/nx,(y+1)/ny)])
}
const divisions = (n?: number) => Math.max(1, Math.min(32, Math.round(n || 1)))

export class BoxBuilder implements IPrimitiveBuilder<BoxParameters> {
  create(params: BoxParameters): EditableMesh {
    const mesh = new EditableMesh(), vertices = new Map<string, number>()
    const w = Math.abs(params.width) || 1, h = Math.abs(params.height) || 1, d = Math.abs(params.depth) || 1
    const x = divisions(params.segmentsX), y = divisions(params.segmentsY), z = divisions(params.segmentsZ)
    const V = (a:number,b:number,c:number) => new THREE.Vector3(a,b,c)
    gridSurface(mesh,vertices,V(-w/2,-h/2,d/2),V(w,0,0),V(0,h,0),x,y)
    gridSurface(mesh,vertices,V(w/2,-h/2,-d/2),V(-w,0,0),V(0,h,0),x,y)
    gridSurface(mesh,vertices,V(-w/2,h/2,d/2),V(w,0,0),V(0,0,-d),x,z)
    gridSurface(mesh,vertices,V(-w/2,-h/2,-d/2),V(w,0,0),V(0,0,d),x,z)
    gridSurface(mesh,vertices,V(w/2,-h/2,d/2),V(0,0,-d),V(0,h,0),z,y)
    gridSurface(mesh,vertices,V(-w/2,-h/2,-d/2),V(0,0,d),V(0,h,0),z,y)
    mesh.recalculateNormals(); return mesh
  }
}

export class PlaneBuilder implements IPrimitiveBuilder<PlaneParameters> {
  create(params: PlaneParameters): EditableMesh {
    const mesh = new EditableMesh()
    const w = Math.abs(params.width) || 1, d = Math.abs(params.depth) || 1
    gridSurface(mesh,new Map(),new THREE.Vector3(-w/2,0,d/2),new THREE.Vector3(w,0,0),new THREE.Vector3(0,0,-d),divisions(params.segmentsX),divisions(params.segmentsZ))
    mesh.recalculateNormals(); return mesh
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
