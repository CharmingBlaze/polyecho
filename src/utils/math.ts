import { Vector3D, UV } from '../types/mesh'

export function vec3(x = 0, y = 0, z = 0): Vector3D {
  return { x, y, z }
}

export function addVec3(a: Vector3D, b: Vector3D): Vector3D {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

export function subVec3(a: Vector3D, b: Vector3D): Vector3D {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

export function scaleVec3(v: Vector3D, s: number): Vector3D {
  return { x: v.x * s, y: v.y * s, z: v.z * s }
}

export function lengthVec3(v: Vector3D): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
}

export function distVec3(a: Vector3D, b: Vector3D): number {
  return lengthVec3(subVec3(a, b))
}

export function normalizeVec3(v: Vector3D): Vector3D {
  const len = lengthVec3(v)
  if (len < 0.00001) return { x: 0, y: 1, z: 0 }
  return { x: v.x / len, y: v.y / len, z: v.z / len }
}

export function dotVec3(a: Vector3D, b: Vector3D): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

export function crossVec3(a: Vector3D, b: Vector3D): Vector3D {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

export function lerpVec3(a: Vector3D, b: Vector3D, t: number): Vector3D {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  }
}

export function computeCentroid(points: Vector3D[]): Vector3D {
  if (points.length === 0) return { x: 0, y: 0, z: 0 }
  let sum = { x: 0, y: 0, z: 0 }
  for (const p of points) {
    sum = addVec3(sum, p)
  }
  return scaleVec3(sum, 1 / points.length)
}

export function computeFaceNormal(points: Vector3D[]): Vector3D {
  if (points.length < 3) return { x: 0, y: 1, z: 0 }
  // Newell's method for arbitrary polygon normal
  let normal = { x: 0, y: 0, z: 0 }
  for (let i = 0; i < points.length; i++) {
    const current = points[i]
    const next = points[(i + 1) % points.length]
    normal.x += (current.y - next.y) * (current.z + next.z)
    normal.y += (current.z - next.z) * (current.x + next.x)
    normal.z += (current.x - next.x) * (current.y + next.y)
  }
  return normalizeVec3(normal)
}

export function snapValue(val: number, step: number): number {
  if (step <= 0) return val
  return Math.round(val / step) * step
}

export function snapVec3(v: Vector3D, step: number): Vector3D {
  if (step <= 0) return v
  return {
    x: snapValue(v.x, step),
    y: snapValue(v.y, step),
    z: snapValue(v.z, step),
  }
}

// Barycentric coordinates for UV interpolation in triangles
export function barycentric(p: Vector3D, a: Vector3D, b: Vector3D, c: Vector3D): [number, number, number] {
  const v0 = subVec3(b, a)
  const v1 = subVec3(c, a)
  const v2 = subVec3(p, a)

  const d00 = dotVec3(v0, v0)
  const d01 = dotVec3(v0, v1)
  const d11 = dotVec3(v1, v1)
  const d20 = dotVec3(v2, v0)
  const d21 = dotVec3(v2, v1)

  const denom = d00 * d11 - d01 * d01
  if (Math.abs(denom) < 1e-7) return [0.333, 0.333, 0.334]

  const v = (d11 * d20 - d01 * d21) / denom
  const w = (d00 * d21 - d01 * d20) / denom
  const u = 1.0 - v - w

  return [u, v, w]
}

export function interpolateUV(uvs: UV[], weights: number[]): UV {
  let u = 0
  let v = 0
  for (let i = 0; i < uvs.length; i++) {
    const w = weights[i] || 0
    u += uvs[i].u * w
    v += uvs[i].v * w
  }
  return { u, v }
}
