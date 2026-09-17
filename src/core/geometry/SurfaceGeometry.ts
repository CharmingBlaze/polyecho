import * as THREE from 'three'

/** Deterministic triangulation in the dominant plane, preserving polygon winding.
 * Convex quads prefer corner 0–2, so tiny deformations cannot flip the diagonal.
 * Concave polygons use ear clipping; render diagonals never become topology.
 */
export function surfaceTriangles(points: THREE.Vector3[]): number[][] {
  if (points.length < 3) return []
  if (points.length === 3) return [[0, 1, 2]]
  const normal = new THREE.Vector3()
  for (let i = 1; i < points.length - 1; i++) normal.add(points[i].clone().sub(points[0]).cross(points[i + 1].clone().sub(points[0])))
  if (normal.lengthSq() === 0) return []
  const n = [Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)]
  const drop = n.indexOf(Math.max(...n))
  const projected = points.map(p => drop === 0 ? new THREE.Vector2(p.y, p.z) : drop === 1 ? new THREE.Vector2(p.x, p.z) : new THREE.Vector2(p.x, p.y))
  if (points.length === 4) {
    const orientation = Math.sign(THREE.ShapeUtils.area(projected))
    const positive = ([a, b, c]: number[]) => projected[b].clone().sub(projected[a]).cross(projected[c].clone().sub(projected[a])) * orientation > 0
    for (const triangles of [[[0, 1, 2], [0, 2, 3]], [[0, 1, 3], [1, 2, 3]]]) {
      if (triangles.every(positive)) return triangles
    }
  }
  return THREE.ShapeUtils.triangulateShape(projected, []).map(tri => {
    const [a, b, c] = tri
    const cross = points[b].clone().sub(points[a]).cross(points[c].clone().sub(points[a]))
    return cross.dot(normal) < 0 ? [a, c, b] : tri
  })
}

export function perspectiveEdgeParameter(t: number, a: THREE.Vector3, b: THREE.Vector3, camera: THREE.Camera) {
  if (!(camera as THREE.PerspectiveCamera).isPerspectiveCamera) return t
  const da = -a.clone().applyMatrix4(camera.matrixWorldInverse).z
  const db = -b.clone().applyMatrix4(camera.matrixWorldInverse).z
  return (t / db) / ((1 - t) / da + t / db)
}

export function meshPlacementMatrix(mesh: { position: {x:number;y:number;z:number}; rotation: {x:number;y:number;z:number}; scale: {x:number;y:number;z:number} }) {
  return new THREE.Matrix4().compose(new THREE.Vector3(mesh.position.x, mesh.position.y, mesh.position.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...[mesh.rotation.x, mesh.rotation.y, mesh.rotation.z].map(THREE.MathUtils.degToRad) as [number, number, number])),
    new THREE.Vector3(mesh.scale.x, mesh.scale.y, mesh.scale.z))
}
