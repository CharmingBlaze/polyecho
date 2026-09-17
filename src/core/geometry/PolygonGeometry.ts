import { Vector3 } from 'three'
import { GeometryTolerance } from './GeometryTolerance'

/** Twice the oriented area; uses every corner and avoids large world coordinates. */
export function polygonAreaVector(points: readonly Vector3[]): Vector3 {
  const result = new Vector3()
  if (points.length < 3) return result
  for (let i = 1; i + 1 < points.length; i++) {
    result.add(points[i].clone().sub(points[0]).cross(points[i + 1].clone().sub(points[0])))
  }
  return result
}

export function polygonPlanarity(points: readonly Vector3[]) {
  const normal = polygonAreaVector(points).normalize()
  const center = points.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(points.length || 1)
  let deviation = 0
  let scale = 0
  for (const p of points) {
    deviation = Math.max(deviation, Math.abs(p.clone().sub(center).dot(normal)))
    scale = Math.max(scale, p.distanceTo(center))
  }
  return { planar: normal.lengthSq() > 0 && deviation <= scale * GeometryTolerance.coplanar, deviation, normal, center }
}
