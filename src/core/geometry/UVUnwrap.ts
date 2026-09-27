import { packUvRectangles } from '../uv/UVRectPacking'
import { MeshObject, UV, Vertex, Vector3D } from '../../types/mesh'
import { facesShareWeldedUvEdge, findUvIslands } from '../uv/UVIslands'
import { alignToMinimumRectangle, clusterFacesByNormal, conformalUnwrapFaces, findOverlappingFaces } from '../uv/ConformalUnwrap'
import { undirectedEdgeId } from './EdgeUtils'
import {
  computeCentroid,
  computeFaceNormal,
  crossVec3,
  dotVec3,
  lengthVec3,
  normalizeVec3,
  scaleVec3,
  subVec3
} from '../../utils/math'

function jacobiEigen3(matrix: number[][]): { values: number[]; vectors: Vector3D[] } {
  const A = matrix.map(row => row.slice())
  const V = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1]
  ]

  for (let iter = 0; iter < 16; iter++) {
    let p = 0
    let q = 1
    let max = Math.abs(A[0][1])
    if (Math.abs(A[0][2]) > max) { p = 0; q = 2; max = Math.abs(A[0][2]) }
    if (Math.abs(A[1][2]) > max) { p = 1; q = 2; max = Math.abs(A[1][2]) }
    if (max < 1e-12) break

    const app = A[p][p]
    const aqq = A[q][q]
    const apq = A[p][q]
    const tau = (aqq - app) / (2 * apq)
    const t = tau === 0 ? 1 : Math.sign(tau) / (Math.abs(tau) + Math.hypot(1, tau))
    const c = 1 / Math.hypot(1, t)
    const s = t * c

    for (let r = 0; r < 3; r++) {
      if (r === p || r === q) continue
      const arp = A[r][p]
      const arq = A[r][q]
      A[r][p] = A[p][r] = c * arp - s * arq
      A[r][q] = A[q][r] = s * arp + c * arq
    }
    A[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq
    A[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq
    A[p][q] = A[q][p] = 0

    for (let r = 0; r < 3; r++) {
      const vip = V[r][p]
      const viq = V[r][q]
      V[r][p] = c * vip - s * viq
      V[r][q] = s * vip + c * viq
    }
  }

  return {
    values: [A[0][0], A[1][1], A[2][2]],
    vectors: [
      { x: V[0][0], y: V[1][0], z: V[2][0] },
      { x: V[0][1], y: V[1][1], z: V[2][1] },
      { x: V[0][2], y: V[1][2], z: V[2][2] }
    ]
  }
}

function bestFitProjectionBasis(points: Vector3D[], preferredNormal: Vector3D): { tangent: Vector3D; bitangent: Vector3D } {
  const fallbackNormal = normalizeVec3(preferredNormal)
  const helper = Math.abs(fallbackNormal.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 }
  let tangent = normalizeVec3(crossVec3(helper, fallbackNormal))
  let bitangent = normalizeVec3(crossVec3(fallbackNormal, tangent))
  if (points.length < 3) return { tangent, bitangent }

  const centroid = computeCentroid(points)
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0
  for (const point of points) {
    const dx = point.x - centroid.x
    const dy = point.y - centroid.y
    const dz = point.z - centroid.z
    xx += dx * dx
    xy += dx * dy
    xz += dx * dz
    yy += dy * dy
    yz += dy * dz
    zz += dz * dz
  }

  const { values, vectors } = jacobiEigen3([
    [xx, xy, xz],
    [xy, yy, yz],
    [xz, yz, zz]
  ])
  let minIndex = 0
  let maxIndex = 0
  for (let i = 1; i < 3; i++) {
    if (values[i] < values[minIndex]) minIndex = i
    if (values[i] > values[maxIndex]) maxIndex = i
  }

  let normal = vectors[minIndex]
  if (dotVec3(normal, fallbackNormal) < 0) {
    normal = { x: -normal.x, y: -normal.y, z: -normal.z }
  }
  normal = normalizeVec3(normal)

  tangent = subVec3(vectors[maxIndex], scaleVec3(normal, dotVec3(vectors[maxIndex], normal)))
  if (lengthVec3(tangent) < 1e-6) {
    tangent = crossVec3(helper, normal)
  }
  tangent = normalizeVec3(tangent)
  bitangent = normalizeVec3(crossVec3(normal, tangent))
  return { tangent, bitangent }
}

/**
 * Project faces onto their best-fit plane, aligned to the minimum-area
 * rectangle at the origin. Corner UVs are in the positions' units.
 */
export function projectFacesToBestFitPlane(
  mesh: MeshObject,
  faceIndices: number[],
  positions: Map<string, Vector3D>,
  normals: Map<number, Vector3D>
): Map<number, UV[]> {
  const normalSum = { x: 0, y: 0, z: 0 }
  const unique = new Map<string, Vector3D>()
  for (const fi of faceIndices) {
    const n = normals.get(fi) || { x: 0, y: 1, z: 0 }
    normalSum.x += n.x
    normalSum.y += n.y
    normalSum.z += n.z
    for (const id of mesh.faces[fi].vertexIds) {
      const p = positions.get(id)
      if (p) unique.set(id, p)
    }
  }
  if (lengthVec3(normalSum) < 1e-9) normalSum.y = 1
  const { tangent, bitangent } = bestFitProjectionBasis(Array.from(unique.values()), normalSum)

  const flat = new Float64Array(faceIndices.reduce((n, fi) => n + mesh.faces[fi].vertexIds.length, 0) * 2)
  let k = 0
  for (const fi of faceIndices) {
    for (const id of mesh.faces[fi].vertexIds) {
      const p = positions.get(id) || { x: 0, y: 0, z: 0 }
      flat[k++] = dotVec3(p, tangent)
      flat[k++] = dotVec3(p, bitangent)
    }
  }
  alignToMinimumRectangle(flat)
  const out = new Map<number, UV[]>()
  k = 0
  for (const fi of faceIndices) {
    out.set(fi, mesh.faces[fi].vertexIds.map(() => {
      const uv = { u: flat[k], v: flat[k + 1] }
      k += 2
      return uv
    }))
  }
  return out
}

function polygonArea3D(points: Vector3D[]): number {
  let x = 0, y = 0, z = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    x += (a.y - b.y) * (a.z + b.z)
    y += (a.z - b.z) * (a.x + b.x)
    z += (a.x - b.x) * (a.y + b.y)
  }
  return 0.5 * Math.hypot(x, y, z)
}

function polygonAreaUV(uvs: UV[]): number {
  let sum = 0
  for (let i = 0; i < uvs.length; i++) {
    const a = uvs[i]
    const b = uvs[(i + 1) % uvs.length]
    sum += a.u * b.v - b.u * a.v
  }
  return 0.5 * Math.abs(sum)
}

function faceAreas(face: MeshObject['faces'][number], vertMap: Map<string, Vertex>): { world: number; uv: number } | null {
  if (face.uvs.length < 3 || face.uvs.length !== face.vertexIds.length) return null
  const points = face.vertexIds.map(id => vertMap.get(id)?.position).filter(Boolean) as Vector3D[]
  if (points.length !== face.vertexIds.length) return null
  return { world: polygonArea3D(points), uv: polygonAreaUV(face.uvs) }
}

function resolveTargetFaces(mesh: MeshObject, onlyFaceIndices?: number[]): number[] {
  if (onlyFaceIndices && onlyFaceIndices.length > 0) {
    return Array.from(new Set(onlyFaceIndices.filter(i => i >= 0 && i < mesh.faces.length)))
  }
  return mesh.faces.map((_, i) => i)
}

function boundsOfPoints(points: Vector3D[]) {
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.z < minZ) minZ = p.z
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
    if (p.z > maxZ) maxZ = p.z
  }
  if (!Number.isFinite(minX)) {
    return { minX: -1, maxX: 1, minY: -1, maxY: 1, minZ: -1, maxZ: 1 }
  }
  return { minX, maxX, minY, maxY, minZ, maxZ }
}

function degToRad(degrees: number): number {
  return degrees * Math.PI / 180
}

/** Viewport pose: scale, then Euler XYZ in degrees, then translation. */
export function meshWorldPoint(mesh: MeshObject, p: Vector3D): Vector3D {
  const scaled = {
    x: p.x * mesh.scale.x,
    y: p.y * mesh.scale.y,
    z: p.z * mesh.scale.z
  }
  const a = degToRad(mesh.rotation.x)
  const b = degToRad(mesh.rotation.y)
  const c = degToRad(mesh.rotation.z)
  const c1 = Math.cos(a), s1 = Math.sin(a)
  const c2 = Math.cos(b), s2 = Math.sin(b)
  const c3 = Math.cos(c), s3 = Math.sin(c)
  return {
    x: mesh.position.x + (c2 * c3) * scaled.x + (-c2 * s3) * scaled.y + s2 * scaled.z,
    y: mesh.position.y + (c1 * s3 + c3 * s1 * s2) * scaled.x + (c1 * c3 - s1 * s2 * s3) * scaled.y + (-c2 * s1) * scaled.z,
    z: mesh.position.z + (s1 * s3 - c1 * c3 * s2) * scaled.x + (c3 * s1 + c1 * s2 * s3) * scaled.y + (c1 * c2) * scaled.z
  }
}

function worldPositions(mesh: MeshObject): Map<string, Vector3D> {
  const map = new Map<string, Vector3D>()
  for (const vertex of mesh.vertices) map.set(vertex.id, meshWorldPoint(mesh, vertex.position))
  return map
}

function faceWorldPoints(mesh: MeshObject, faceIndex: number, positions: Map<string, Vector3D>): Vector3D[] {
  const points: Vector3D[] = []
  for (const id of mesh.faces[faceIndex].vertexIds) {
    const p = positions.get(id)
    if (p) points.push(p)
  }
  return points
}

function pointsOfFaces(mesh: MeshObject, faceIndices: number[], positions: Map<string, Vector3D>): Vector3D[] {
  const points: Vector3D[] = []
  for (const faceIndex of faceIndices) points.push(...faceWorldPoints(mesh, faceIndex, positions))
  return points
}

function objectUp(mesh: MeshObject): Vector3D {
  const origin = meshWorldPoint(mesh, { x: 0, y: 0, z: 0 })
  const up = meshWorldPoint(mesh, { x: 0, y: 1, z: 0 })
  const delta = subVec3(up, origin)
  if (lengthVec3(delta) < 1e-8) return { x: 0, y: 1, z: 0 }
  return normalizeVec3(delta)
}

/** Tube axis follows the object's local Y, in world space, so a rotated mesh still unwraps. */
function projectionFrame(mesh: MeshObject, points: Vector3D[]) {
  const center = points.length > 0 ? computeCentroid(points) : meshWorldPoint(mesh, { x: 0, y: 0, z: 0 })
  const axis = objectUp(mesh)
  const helper = Math.abs(axis.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 }
  const tangent = normalizeVec3(crossVec3(helper, axis))
  const bitangent = normalizeVec3(crossVec3(axis, tangent))
  return { center, axis, tangent, bitangent }
}

/**
 * Longitude around `axis`, continuous across the branch cut and stable at the
 * pole so one face never stretches across the whole texture.
 */
function continuousAngles(points: Vector3D[], center: Vector3D, tangent: Vector3D, bitangent: Vector3D): number[] {
  const polar = points.map(point => {
    const dx = point.x - center.x
    const dy = point.y - center.y
    const dz = point.z - center.z
    const x = dx * tangent.x + dy * tangent.y + dz * tangent.z
    const y = dx * bitangent.x + dy * bitangent.y + dz * bitangent.z
    return { angle: Math.atan2(y, x), radius: Math.hypot(x, y) }
  })
  const ring = polar.filter(sample => sample.radius > 1e-5)
  let sx = 0
  let sy = 0
  for (const sample of ring) {
    sx += Math.cos(sample.angle)
    sy += Math.sin(sample.angle)
  }
  const mid = ring.length > 0 ? Math.atan2(sy, sx) : 0
  return polar.map(sample => {
    if (sample.radius <= 1e-5) return mid
    let delta = sample.angle - mid
    while (delta > Math.PI) delta -= Math.PI * 2
    while (delta < -Math.PI) delta += Math.PI * 2
    return mid + delta
  })
}

function heightAlong(point: Vector3D, center: Vector3D, axis: Vector3D): number {
  return (point.x - center.x) * axis.x + (point.y - center.y) * axis.y + (point.z - center.z) * axis.z
}

function norm01(value: number, min: number, max: number): number {
  const span = max - min
  if (span < 1e-8) return 0.5
  return (value - min) / span
}

function signedNorm(value: number, min: number, max: number, positive: boolean): number {
  const t = norm01(value, min, max)
  return positive ? t : 1 - t
}

function assignProjectedToRect(
  points: Vector3D[],
  axisU: Vector3D,
  axisV: Vector3D,
  rect: { u0: number; v0: number; u1: number; v1: number }
): UV[] {
  const proj = points.map(p => ({
    u: p.x * axisU.x + p.y * axisU.y + p.z * axisU.z,
    v: p.x * axisV.x + p.y * axisV.y + p.z * axisV.z
  }))
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
  for (const p of proj) {
    if (p.u < minU) minU = p.u
    if (p.u > maxU) maxU = p.u
    if (p.v < minV) minV = p.v
    if (p.v > maxV) maxV = p.v
  }

  if (points.length !== 4) {
    return proj.map(p => ({
      u: rect.u0 + norm01(p.u, minU, maxU) * (rect.u1 - rect.u0),
      v: rect.v0 + norm01(p.v, minV, maxV) * (rect.v1 - rect.v0)
    }))
  }

  const corners = [
    { u: rect.u0, v: rect.v1 },
    { u: rect.u1, v: rect.v1 },
    { u: rect.u1, v: rect.v0 },
    { u: rect.u0, v: rect.v0 }
  ]
  const src = proj.map(p => ({
    u: rect.u0 + norm01(p.u, minU, maxU) * (rect.u1 - rect.u0),
    v: rect.v0 + norm01(p.v, minV, maxV) * (rect.v1 - rect.v0)
  }))
  const assigned = [-1, -1, -1, -1]
  const used = new Set<number>()
  const pairs: { vert: number; corner: number; dist: number }[] = []
  for (let vert = 0; vert < 4; vert++) {
    for (let corner = 0; corner < 4; corner++) {
      const du = src[vert].u - corners[corner].u
      const dv = src[vert].v - corners[corner].v
      pairs.push({ vert, corner, dist: du * du + dv * dv })
    }
  }
  pairs.sort((a, b) => a.dist - b.dist)
  for (const pair of pairs) {
    if (assigned[pair.vert] !== -1 || used.has(pair.corner)) continue
    assigned[pair.vert] = pair.corner
    used.add(pair.corner)
  }
  return assigned.map((corner, i) => corners[corner] ?? src[i])
}

/**
 * Box unwrap along dominant normal axes. Uses the target faces' AABB so
 * scaled or offset meshes land in 0..1 instead of assuming a unit cube.
 */
export function boxUnwrap(mesh: MeshObject, onlyFaceIndices?: number[]): MeshObject {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  const positions = worldPositions(newMesh)
  const targets = resolveTargetFaces(newMesh, onlyFaceIndices)
  const b = boundsOfPoints(pointsOfFaces(newMesh, targets, positions))

  for (const faceIndex of targets) {
    const face = newMesh.faces[faceIndex]
    const facePoints = faceWorldPoints(newMesh, faceIndex, positions)
    if (facePoints.length < 3) continue

    const normal = computeFaceNormal(facePoints)
    const absX = Math.abs(normal.x)
    const absY = Math.abs(normal.y)
    const absZ = Math.abs(normal.z)

    if (absX >= absY && absX >= absZ) {
      face.uvs = facePoints.map(p => ({
        u: signedNorm(p.z, b.minZ, b.maxZ, normal.x >= 0),
        v: norm01(p.y, b.minY, b.maxY)
      }))
    } else if (absY >= absX && absY >= absZ) {
      face.uvs = facePoints.map(p => ({
        u: norm01(p.x, b.minX, b.maxX),
        v: signedNorm(p.z, b.minZ, b.maxZ, normal.y >= 0)
      }))
    } else {
      face.uvs = facePoints.map(p => ({
        u: signedNorm(p.x, b.minX, b.maxX, normal.z >= 0),
        v: norm01(p.y, b.minY, b.maxY)
      }))
    }
  }

  return newMesh
}

/**
 * Planar unwrap along a world axis, normalized to the target AABB.
 */
export function planarUnwrap(mesh: MeshObject, axis: 'x' | 'y' | 'z' = 'z', onlyFaceIndices?: number[]): MeshObject {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  const positions = worldPositions(newMesh)
  const targets = resolveTargetFaces(newMesh, onlyFaceIndices)
  const b = boundsOfPoints(pointsOfFaces(newMesh, targets, positions))

  for (const faceIndex of targets) {
    const face = newMesh.faces[faceIndex]
    const facePoints = faceWorldPoints(newMesh, faceIndex, positions)
    if (facePoints.length < 3) continue
    if (axis === 'x') {
      face.uvs = facePoints.map(p => ({
        u: norm01(p.z, b.minZ, b.maxZ),
        v: norm01(p.y, b.minY, b.maxY)
      }))
    } else if (axis === 'y') {
      face.uvs = facePoints.map(p => ({
        u: norm01(p.x, b.minX, b.maxX),
        v: norm01(p.z, b.minZ, b.maxZ)
      }))
    } else {
      face.uvs = facePoints.map(p => ({
        u: norm01(p.x, b.minX, b.maxX),
        v: norm01(p.y, b.minY, b.maxY)
      }))
    }
  }

  return newMesh
}

/**
 * Cylindrical unwrap around the target AABB Y axis. Caps sit in separate tiles.
 */
export function cylinderUnwrap(mesh: MeshObject, onlyFaceIndices?: number[]): MeshObject {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  const positions = worldPositions(newMesh)
  const targets = resolveTargetFaces(newMesh, onlyFaceIndices)
  const cloud = pointsOfFaces(newMesh, targets, positions)
  const frame = projectionFrame(newMesh, cloud)
  let minH = Infinity
  let maxH = -Infinity
  let radius = 1e-6
  for (const point of cloud) {
    const h = heightAlong(point, frame.center, frame.axis)
    if (h < minH) minH = h
    if (h > maxH) maxH = h
    const dx = point.x - frame.center.x - frame.axis.x * h
    const dy = point.y - frame.center.y - frame.axis.y * h
    const dz = point.z - frame.center.z - frame.axis.z * h
    radius = Math.max(radius, Math.hypot(dx, dy, dz))
  }
  if (!Number.isFinite(minH)) { minH = -1; maxH = 1 }

  for (const faceIndex of targets) {
    const face = newMesh.faces[faceIndex]
    const facePoints = faceWorldPoints(newMesh, faceIndex, positions)
    if (facePoints.length < 3) continue

    const normal = computeFaceNormal(facePoints)
    const facing = dotVec3(normal, frame.axis)
    if (Math.abs(facing) > 0.7) {
      const tileV0 = facing > 0 ? 0.52 : 0.02
      face.uvs = facePoints.map(point => {
        const dx = point.x - frame.center.x
        const dy = point.y - frame.center.y
        const dz = point.z - frame.center.z
        const u = dx * frame.tangent.x + dy * frame.tangent.y + dz * frame.tangent.z
        const v = dx * frame.bitangent.x + dy * frame.bitangent.y + dz * frame.bitangent.z
        return {
          u: 0.74 + (u / radius * 0.5 + 0.5) * 0.24,
          v: tileV0 + (v / radius * 0.5 + 0.5) * 0.46
        }
      })
    } else {
      const angles = continuousAngles(facePoints, frame.center, frame.tangent, frame.bitangent)
      face.uvs = facePoints.map((point, index) => ({
        u: ((angles[index] + Math.PI) / (2 * Math.PI)) * 0.7,
        v: norm01(heightAlong(point, frame.center, frame.axis), minH, maxH)
      }))
    }
  }

  return newMesh
}

/**
 * Spherical equirectangular unwrap around the target AABB center.
 */
export function sphereUnwrap(mesh: MeshObject, onlyFaceIndices?: number[]): MeshObject {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  const positions = worldPositions(newMesh)
  const targets = resolveTargetFaces(newMesh, onlyFaceIndices)
  const cloud = pointsOfFaces(newMesh, targets, positions)
  const frame = projectionFrame(newMesh, cloud)

  for (const faceIndex of targets) {
    const face = newMesh.faces[faceIndex]
    const facePoints = faceWorldPoints(newMesh, faceIndex, positions)
    if (facePoints.length < 3) continue

    const angles = continuousAngles(facePoints, frame.center, frame.tangent, frame.bitangent)
    face.uvs = facePoints.map((point, index) => {
      const dx = point.x - frame.center.x
      const dy = point.y - frame.center.y
      const dz = point.z - frame.center.z
      const len = Math.hypot(dx, dy, dz) || 1
      const along = (dx * frame.axis.x + dy * frame.axis.y + dz * frame.axis.z) / len
      const vCoord = 0.5 - Math.asin(Math.max(-1, Math.min(1, along))) / Math.PI
      return {
        u: 0.5 + angles[index] / (2 * Math.PI),
        v: 1 - vCoord
      }
    })
  }

  return newMesh
}

/**
 * Conical unwrap around the target AABB Y axis.
 */
export function coneUnwrap(mesh: MeshObject, onlyFaceIndices?: number[]): MeshObject {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  const positions = worldPositions(newMesh)
  const targets = resolveTargetFaces(newMesh, onlyFaceIndices)
  const cloud = pointsOfFaces(newMesh, targets, positions)
  const frame = projectionFrame(newMesh, cloud)
  let minH = Infinity
  let maxH = -Infinity
  let radius = 1e-6
  for (const point of cloud) {
    const h = heightAlong(point, frame.center, frame.axis)
    if (h < minH) minH = h
    if (h > maxH) maxH = h
    const dx = point.x - frame.center.x - frame.axis.x * h
    const dy = point.y - frame.center.y - frame.axis.y * h
    const dz = point.z - frame.center.z - frame.axis.z * h
    radius = Math.max(radius, Math.hypot(dx, dy, dz))
  }
  if (!Number.isFinite(minH)) { minH = -1; maxH = 1 }

  for (const faceIndex of targets) {
    const face = newMesh.faces[faceIndex]
    const facePoints = faceWorldPoints(newMesh, faceIndex, positions)
    if (facePoints.length < 3) continue

    const normal = computeFaceNormal(facePoints)
    if (dotVec3(normal, frame.axis) < -0.7) {
      face.uvs = facePoints.map(point => {
        const dx = point.x - frame.center.x
        const dy = point.y - frame.center.y
        const dz = point.z - frame.center.z
        const u = dx * frame.tangent.x + dy * frame.tangent.y + dz * frame.tangent.z
        const v = dx * frame.bitangent.x + dy * frame.bitangent.y + dz * frame.bitangent.z
        return {
          u: 0.76 + (u / radius * 0.5 + 0.5) * 0.22,
          v: 0.52 + (v / radius * 0.5 + 0.5) * 0.46
        }
      })
    } else {
      const angles = continuousAngles(facePoints, frame.center, frame.tangent, frame.bitangent)
      face.uvs = facePoints.map((point, index) => ({
        u: ((angles[index] + Math.PI) / (2 * Math.PI)) * 0.75,
        v: norm01(heightAlong(point, frame.center, frame.axis), minH, maxH)
      }))
    }
  }

  return newMesh
}

/**
 * Cubemap cross: each face is projected onto its plane, then fitted into a 4×3 cell.
 */
export function cubemapCrossUnwrap(mesh: MeshObject, onlyFaceIndices?: number[]): MeshObject {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  const positions = worldPositions(newMesh)
  const targets = resolveTargetFaces(newMesh, onlyFaceIndices)
  const cellW = 0.25
  const cellH = 1 / 3

  for (const faceIndex of targets) {
    const face = newMesh.faces[faceIndex]
    const facePoints = faceWorldPoints(newMesh, faceIndex, positions)
    if (facePoints.length < 3) continue

    const normal = computeFaceNormal(facePoints)
    let col = 1
    let row = 1
    let axisU = { x: 1, y: 0, z: 0 }
    let axisV = { x: 0, y: 1, z: 0 }

    if (normal.y > 0.5) {
      col = 1; row = 0
      axisU = { x: 1, y: 0, z: 0 }
      axisV = { x: 0, y: 0, z: -1 }
    } else if (normal.y < -0.5) {
      col = 1; row = 2
      axisU = { x: 1, y: 0, z: 0 }
      axisV = { x: 0, y: 0, z: 1 }
    } else if (normal.z > 0.5) {
      col = 1; row = 1
      axisU = { x: 1, y: 0, z: 0 }
      axisV = { x: 0, y: 1, z: 0 }
    } else if (normal.x > 0.5) {
      col = 2; row = 1
      axisU = { x: 0, y: 0, z: -1 }
      axisV = { x: 0, y: 1, z: 0 }
    } else if (normal.z < -0.5) {
      col = 3; row = 1
      axisU = { x: -1, y: 0, z: 0 }
      axisV = { x: 0, y: 1, z: 0 }
    } else if (normal.x < -0.5) {
      col = 0; row = 1
      axisU = { x: 0, y: 0, z: 1 }
      axisV = { x: 0, y: 1, z: 0 }
    }

    const pad = 0.004
    const u0 = col * cellW + pad
    const u1 = (col + 1) * cellW - pad
    const v1 = 1 - row * cellH - pad
    const v0 = 1 - (row + 1) * cellH + pad
    face.uvs = assignProjectedToRect(facePoints, axisU, axisV, { u0, v0, u1, v1 })
  }

  return newMesh
}

const SMART_PROJECT_FLAT_DEGREES = 8

export interface FlatChart {
  uvs: Map<number, UV[]>
  /** Placed by pins in final UV space; do not offset or pack. */
  pinned: boolean
}

export interface FlattenContext {
  seams: Set<string>
  positions: Map<string, Vector3D>
  normals: Map<number, Vector3D>
  angleLimitDegrees: number
  /** `curved` keeps near-flat clusters as exact planar projections. */
  conformal: 'always' | 'curved'
  pins?: Set<string>
}

/**
 * Flatten normal-angle clusters into charts that never overlap themselves.
 * Conformal first where allowed; a chart that still overlaps falls back to
 * its best-fit plane, and faces that overlap there are split off into new
 * clusters and flattened again.
 */
export function flattenClusters(mesh: MeshObject, clusters: number[][], ctx: FlattenContext): FlatChart[] {
  const flatCos = Math.cos(SMART_PROJECT_FLAT_DEGREES * Math.PI / 180)
  const queue = clusters.filter(c => c.length > 0)
  const charts: FlatChart[] = []
  while (queue.length > 0) {
    const cluster = queue.shift()!
    let useConformal = ctx.conformal === 'always'
    if (!useConformal) {
      const sum = { x: 0, y: 0, z: 0 }
      for (const fi of cluster) {
        const n = ctx.normals.get(fi)!
        sum.x += n.x
        sum.y += n.y
        sum.z += n.z
      }
      const avg = normalizeVec3(sum)
      useConformal = cluster.some(fi => dotVec3(ctx.normals.get(fi)!, avg) < flatCos)
    }
    if (useConformal) {
      const result = conformalUnwrapFaces(mesh, cluster, ctx.seams, ctx.positions, { pins: ctx.pins })
      if (result && (result.pinned || findOverlappingFaces(cluster, result.uvs).size === 0)) {
        charts.push({ uvs: result.uvs, pinned: result.pinned })
        continue
      }
    }
    const planar = projectFacesToBestFitPlane(mesh, cluster, ctx.positions, ctx.normals)
    const rejected = findOverlappingFaces(cluster, planar)
    if (rejected.size > 0) {
      for (const fi of rejected) planar.delete(fi)
      queue.push(...clusterFacesByNormal(mesh, cluster.filter(fi => rejected.has(fi)), ctx.normals, ctx.seams, ctx.angleLimitDegrees))
    }
    charts.push({ uvs: planar, pinned: false })
  }
  return charts
}

/**
 * Seam list with every UV island border in scope added: edges whose two
 * faces are not welded in UV, and edges on the border of the scope.
 * Existing seams are kept.
 */
export function seamEdgesFromUvIslands(mesh: MeshObject, onlyFaceIndices?: number[]): string[] {
  const scope = onlyFaceIndices && onlyFaceIndices.length > 0 ? new Set(onlyFaceIndices) : null
  const edgeFaces = new Map<string, number[]>()
  mesh.faces.forEach((face, fi) => {
    const ids = face.vertexIds
    for (let i = 0; i < ids.length; i++) {
      const key = undirectedEdgeId(ids[i], ids[(i + 1) % ids.length])
      const list = edgeFaces.get(key)
      if (list) list.push(fi)
      else edgeFaces.set(key, [fi])
    }
  })
  const seams = new Set(mesh.seamEdgeIds || [])
  for (const [key, faces] of edgeFaces) {
    if (faces.length !== 2) continue
    const [a, b] = faces
    const inA = !scope || scope.has(a)
    const inB = !scope || scope.has(b)
    if (!inA && !inB) continue
    if (!inA || !inB || !facesShareWeldedUvEdge(mesh, a, b)) seams.add(key)
  }
  return Array.from(seams)
}

export interface ViewProjection {
  /** World-space camera position, right, up, and forward (into the scene) vectors. */
  position: Vector3D
  right: Vector3D
  up: Vector3D
  forward: Vector3D
  perspective: boolean
}

/**
 * Project From View: UVs are the faces as the camera sees them, fitted into
 * the tile without distorting texture pixels.
 */
export function projectFromView(
  mesh: MeshObject,
  view: ViewProjection,
  onlyFaceIndices?: number[],
  textureWidth = 64,
  textureHeight = textureWidth
): MeshObject {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  const positions = worldPositions(newMesh)
  const targets = resolveTargetFaces(newMesh, onlyFaceIndices)
  const screen = (p: Vector3D) => {
    const d = subVec3(p, view.position)
    const x = dotVec3(d, view.right)
    const y = dotVec3(d, view.up)
    if (!view.perspective) return { x, y }
    const z = Math.max(1e-4, dotVec3(d, view.forward))
    return { x: x / z, y: y / z }
  }
  const projected = new Map<number, Array<{ x: number; y: number }>>()
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const fi of targets) {
    const pts = newMesh.faces[fi].vertexIds.map(id => screen(positions.get(id) ?? view.position))
    projected.set(fi, pts)
    for (const p of pts) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
  }
  if (!Number.isFinite(minX)) return newMesh
  const w = Math.max(1, textureWidth)
  const h = Math.max(1, textureHeight)
  const spanX = Math.max(maxX - minX, 1e-9)
  const spanY = Math.max(maxY - minY, 1e-9)
  const pixelsPerUnit = Math.min(w / spanX, h / spanY)
  const offU = (1 - spanX * pixelsPerUnit / w) / 2
  const offV = (1 - spanY * pixelsPerUnit / h) / 2
  for (const [fi, pts] of projected) {
    newMesh.faces[fi].uvs = pts.map(p => ({
      u: offU + (p.x - minX) * pixelsPerUnit / w,
      v: offV + (p.y - minY) * pixelsPerUnit / h
    }))
  }
  return newMesh
}

/** Copy pinned corner UVs from `before` onto `after` (same faces, same order). */
export function restorePinnedUvs(before: MeshObject, after: MeshObject): MeshObject {
  const pins = new Set(before.uvPinKeys || [])
  if (pins.size === 0) return after
  after.faces.forEach((face, fi) => {
    const prev = before.faces[fi]
    if (!prev || prev.id !== face.id) return
    face.vertexIds.forEach((id, c) => {
      const uv = prev.uvs[c]
      if (uv && pins.has(`${face.id}:${id}`)) face.uvs[c] = { u: uv.u, v: uv.v }
    })
  })
  return after
}

export interface SmartUvProjectOptions {
  angleLimitDegrees?: number
  marginPixels?: number
  textureSize?: number
  textureHeight?: number
  onlyFaceIndices?: number[]
}

/**
 * General-purpose UV projection for arbitrary hard-surface and organic meshes.
 * Faces are grouped into islands by real mesh adjacency, explicit seams, and
 * normal angle, then each island is projected onto its own best-fit plane and
 * packed into the texture tile.
 */
export function smartUvProject(mesh: MeshObject, options: SmartUvProjectOptions = {}): MeshObject {
  const projected: MeshObject = JSON.parse(JSON.stringify(mesh))
  if (projected.faces.length === 0) return projected

  const requestedAngle = Number(options.angleLimitDegrees ?? 66)
  const angleLimit = Number.isFinite(requestedAngle) ? Math.max(1, Math.min(179, requestedAngle)) : 66
  const requestedFaces = options.onlyFaceIndices?.filter(i => i >= 0 && i < projected.faces.length)
  const targetFaces = requestedFaces && requestedFaces.length > 0
    ? Array.from(new Set(requestedFaces))
    : projected.faces.map((_, i) => i)
  const seamSet = new Set(projected.seamEdgeIds || [])
  const positions = new Map(projected.vertices.map(v => [v.id, v.position]))

  const normals = new Map<number, Vector3D>()
  for (const faceIndex of targetFaces) {
    const points = projected.faces[faceIndex].vertexIds.map(id => positions.get(id)).filter(Boolean) as Vector3D[]
    normals.set(faceIndex, computeFaceNormal(points))
  }

  const clusters = clusterFacesByNormal(projected, targetFaces, normals, seamSet, angleLimit)
  const charts = flattenClusters(projected, clusters, { seams: seamSet, positions, normals, angleLimitDegrees: angleLimit, conformal: 'curved' })
  charts.forEach((chart, islandIndex) => {
    for (const [fi, uvs] of chart.uvs) {
      // Separate projection spaces before packing so two cut islands whose
      // local coordinates happen to match cannot be mistaken for welded UVs.
      projected.faces[fi].uvs = uvs.map(uv => ({ u: uv.u + islandIndex * 10000, v: uv.v }))
    }
  })

  // The projection is in geometric units; convert it to texture aspect before packing.
  const texW = Math.max(1, Number(options.textureSize) || 64)
  const texH = Math.max(1, Number(options.textureHeight) || texW)
  for (const i of targetFaces) for (const uv of projected.faces[i].uvs) uv.v *= texW / texH

  return packUVIslands(projected, Number.isFinite(Number(options.marginPixels)) ? Number(options.marginPixels) : 2, texW, targetFaces, texH)
}

/**
 * Packs disconnected UV islands inside [0..1] with pixel-accurate padding.
 * Island connectivity requires a shared 3D edge with welded UV endpoints;
 * unrelated faces that merely overlap in UV space remain separate islands.
 */
export function packUVIslands(
  mesh: MeshObject,
  marginPixels = 2,
  textureSize = 64,
  onlyFaceIndices?: number[],
  textureHeight = textureSize
): MeshObject {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  if (newMesh.faces.length === 0) return newMesh

  const safeMarginPixels = Number.isFinite(marginPixels) ? marginPixels : 2
  const safeTextureSize = Number.isFinite(textureSize) ? textureSize : 64
  const width = Math.max(1, safeTextureSize)
  const height = Math.max(1, Number.isFinite(textureHeight) ? textureHeight : width)
  const margin = Math.max(0, safeMarginPixels)
  const islands = findUvIslands(newMesh, onlyFaceIndices)

  // 2. Measure Island Bounding Boxes
  interface IslandBox {
    indices: number[]
    minU: number
    maxU: number
    minV: number
    maxV: number
    w: number
    h: number
  }

  const boxes: IslandBox[] = islands.map(island => {
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
    for (const fIdx of island) {
      for (const uv of newMesh.faces[fIdx].uvs) {
        if (uv.u < minU) minU = uv.u
        if (uv.u > maxU) maxU = uv.u
        if (uv.v < minV) minV = uv.v
        if (uv.v > maxV) maxV = uv.v
      }
    }
    return {
      indices: island,
      minU,
      maxU,
      minV,
      maxV,
      w: Math.max(1e-6, (maxU - minU) * width),
      h: Math.max(1e-6, (maxV - minV) * height)
    }
  })

  if (boxes.length === 0) return newMesh

  boxes.sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h))

  const tryPack = (scale: number) => {
    const packed = packUvRectangles(boxes, width, height, margin, scale)
    return packed?.map((p, i) => ({ box: boxes[i], u: p.x, v: p.y, rotated: p.rotated })) ?? null
  }

  let low = 0
  let high = 1
  let growGuard = 0
  while (tryPack(high) && growGuard < 32) {
    high *= 2
    growGuard++
  }
  for (let i = 0; i < 28; i++) {
    const mid = (low + high) / 2
    if (tryPack(mid)) low = mid
    else high = mid
  }
  let appliedScale = low * 0.999
  let placements = tryPack(appliedScale)
  if (!placements) {
    appliedScale = low
    placements = tryPack(low) || []
  }

  for (const placement of placements) {
    const { box, u: targetU, v: targetV, rotated } = placement
    for (const faceIndex of box.indices) {
      for (const uv of newMesh.faces[faceIndex].uvs) {
        const sourceU = (uv.u - box.minU) * width
        const sourceV = (uv.v - box.minV) * height
        const packedU = rotated ? sourceV : sourceU
        const packedV = rotated ? box.w - sourceU : sourceV
        uv.u = Math.max(0, Math.min(1, (targetU + packedU * appliedScale) / width))
        uv.v = Math.max(0, Math.min(1, (targetV + packedV * appliedScale) / height))
      }
    }
  }

  return newMesh
}

/**
 * Gridify / Straighten Quad UV Islands into an orthogonal grid.
 */
export function gridifyQuadIslands(mesh: MeshObject, targetFaceIndices?: number[]): MeshObject {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  const facesToProcess = targetFaceIndices && targetFaceIndices.length > 0 
    ? targetFaceIndices 
    : newMesh.faces.map((_, i) => i)

  for (const fIdx of facesToProcess) {
    const face = newMesh.faces[fIdx]
    if (!face || face.uvs.length !== 4) continue

    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
    for (const uv of face.uvs) {
      if (uv.u < minU) minU = uv.u
      if (uv.u > maxU) maxU = uv.u
      if (uv.v < minV) minV = uv.v
      if (uv.v > maxV) maxV = uv.v
    }

    const corners = [
      { u: minU, v: maxV },
      { u: maxU, v: maxV },
      { u: maxU, v: minV },
      { u: minU, v: minV }
    ]
    const assigned = [-1, -1, -1, -1]
    const used = new Set<number>()
    const pairs: { vert: number; corner: number; dist: number }[] = []
    for (let vert = 0; vert < 4; vert++) {
      for (let corner = 0; corner < 4; corner++) {
        const du = face.uvs[vert].u - corners[corner].u
        const dv = face.uvs[vert].v - corners[corner].v
        pairs.push({ vert, corner, dist: du * du + dv * dv })
      }
    }
    pairs.sort((a, b) => a.dist - b.dist)
    for (const pair of pairs) {
      if (assigned[pair.vert] !== -1 || used.has(pair.corner)) continue
      assigned[pair.vert] = pair.corner
      used.add(pair.corner)
    }
    face.uvs = assigned.map((corner, index) => (
      corner >= 0 ? { ...corners[corner] } : { ...face.uvs[index] }
    ))
  }

  return newMesh
}

/**
 * Equalize Texel Density across all UV islands to ensure uniform pixels/meter.
 */
export function equalizeTexelDensity(mesh: MeshObject): MeshObject {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  const vertMap = new Map<string, Vertex>()
  for (const v of newMesh.vertices) {
    vertMap.set(v.id, v)
  }

  const islands = findUvIslands(newMesh)
  let totalWorldArea = 0
  let totalUvArea = 0
  const islandMetrics = islands.map(island => {
    let worldArea = 0
    let uvArea = 0
    let centerU = 0
    let centerV = 0
    let corners = 0
    for (const faceIndex of island) {
      const face = newMesh.faces[faceIndex]
      const areas = faceAreas(face, vertMap)
      if (!areas) continue
      worldArea += areas.world
      uvArea += areas.uv
      for (const uv of face.uvs) {
        centerU += uv.u
        centerV += uv.v
        corners++
      }
    }
    totalWorldArea += worldArea
    totalUvArea += uvArea
    return { island, worldArea, uvArea, centerU, centerV, corners }
  })

  if (totalWorldArea === 0 || totalUvArea === 0) return newMesh

  const avgRatio = totalUvArea / totalWorldArea
  for (const metrics of islandMetrics) {
    if (metrics.worldArea === 0 || metrics.uvArea === 0 || metrics.corners === 0) continue
    const scale = Math.max(0.1, Math.min(3.0, Math.sqrt((metrics.worldArea * avgRatio) / metrics.uvArea)))
    const centerU = metrics.centerU / metrics.corners
    const centerV = metrics.centerV / metrics.corners
    for (const faceIndex of metrics.island) {
      for (const uv of newMesh.faces[faceIndex].uvs) {
        uv.u = centerU + (uv.u - centerU) * scale
        uv.v = centerV + (uv.v - centerV) * scale
      }
    }
  }

  return newMesh
}

/**
 * Sample linear texel density (pixels per world unit) of a specific face.
 */
export function sampleFaceTexelDensity(mesh: MeshObject, faceIndex: number, textureSize = 64): number {
  if (!mesh || !mesh.faces || faceIndex < 0 || faceIndex >= mesh.faces.length) return 16
  const face = mesh.faces[faceIndex]
  if (!face || face.uvs.length < 3) return 16

  const vertMap = new Map<string, Vertex>()
  for (const v of mesh.vertices) vertMap.set(v.id, v)
  const areas = faceAreas(face, vertMap)
  if (!areas) return 16
  const wArea = areas.world
  const uvArea = areas.uv

  if (wArea <= 0.00001 || uvArea <= 0.0000001) return 16

  const pixelArea = uvArea * (textureSize * textureSize)
  const density = Math.sqrt(pixelArea / wArea)
  return Math.round(density * 10) / 10
}

/**
 * Scale selected UV islands / faces to an exact target texel density (pixels per world unit).
 */
export function applyTargetTexelDensity(
  mesh: MeshObject,
  targetDensityPxPerUnit: number,
  textureSize = 64,
  targetFaceIndices?: number[]
): MeshObject {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  if (newMesh.faces.length === 0 || targetDensityPxPerUnit <= 0) return newMesh

  const vertMap = new Map<string, Vertex>()
  for (const v of newMesh.vertices) vertMap.set(v.id, v)

  const targetSet = targetFaceIndices && targetFaceIndices.length > 0
    ? new Set(targetFaceIndices)
    : new Set(newMesh.faces.map((_, i) => i))

  const islands = findUvIslands(newMesh, Array.from(targetSet))

  for (const island of islands) {
    let islandWorldArea = 0
    let islandUvArea = 0
    let cU = 0, cV = 0, totalVerts = 0

    for (const fIdx of island) {
      const face = newMesh.faces[fIdx]
      const areas = faceAreas(face, vertMap)
      if (!areas) continue
      islandWorldArea += areas.world
      islandUvArea += areas.uv

      for (const uv of face.uvs) {
        cU += uv.u; cV += uv.v
        totalVerts++
      }
    }

    if (islandWorldArea <= 0.00001 || islandUvArea <= 0.0000001 || totalVerts === 0) continue

    cU /= totalVerts
    cV /= totalVerts

    const currentPixelArea = islandUvArea * (textureSize * textureSize)
    const currentDensity = Math.sqrt(currentPixelArea / islandWorldArea)
    if (currentDensity <= 0.001) continue

    const scale = targetDensityPxPerUnit / currentDensity

    for (const fIdx of island) {
      const face = newMesh.faces[fIdx]
      for (const uv of face.uvs) {
        uv.u = cU + (uv.u - cU) * scale
        uv.v = cV + (uv.v - cV) * scale
      }
    }
  }

  return newMesh
}

/**
 * Calculate UV Stretch & Distortion heatmap per face.
 * Returns map of face ID -> { ratio, color }
 */
export function calculateUVDistortion(mesh: MeshObject): Map<string, { ratio: number; color: string }> {
  const result = new Map<string, { ratio: number; color: string }>()
  const vertMap = new Map<string, Vertex>()
  for (const v of mesh.vertices) vertMap.set(v.id, v)

  let totalWorldArea = 0
  let totalUvArea = 0
  const faceData: { id: string; wArea: number; uvArea: number }[] = []

  for (const face of mesh.faces) {
    const areas = faceAreas(face, vertMap)
    if (!areas) continue
    const wArea = areas.world
    const uvArea = areas.uv

    totalWorldArea += wArea
    totalUvArea += uvArea
    faceData.push({ id: face.id, wArea, uvArea })
  }

  const meanDensity = totalWorldArea > 0 ? totalUvArea / totalWorldArea : 1.0

  for (const f of faceData) {
    const faceDensity = f.wArea > 0 ? f.uvArea / f.wArea : 1.0
    const ratio = meanDensity > 0 ? faceDensity / meanDensity : 1.0

    let color = 'rgba(34, 197, 94, 0.45)' // Optimal Green (1.0)
    if (ratio < 0.6) {
      color = 'rgba(59, 130, 246, 0.55)' // Compressed Blue (< 0.6)
    } else if (ratio > 1.5) {
      color = 'rgba(239, 68, 68, 0.55)' // Stretched Red (> 1.5)
    } else if (ratio > 1.2) {
      color = 'rgba(245, 158, 11, 0.45)' // Slight stretch Amber
    } else if (ratio < 0.8) {
      color = 'rgba(6, 182, 212, 0.45)' // Slight compression Cyan
    }

    result.set(f.id, { ratio, color })
  }

  return result
}

/**
 * Generate high-contrast numbered calibration UV test grid (A1..H8).
 */
export function generateUVCheckerboardDataURL(size = 512): string {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const cells = 8
  const cellSize = size / cells
  const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      const isEven = (r + c) % 2 === 0
      ctx.fillStyle = isEven ? '#334155' : '#1e293b'
      ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize)

      // Inner border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
      ctx.lineWidth = 1
      ctx.strokeRect(c * cellSize, r * cellSize, cellSize, cellSize)

      // Label (e.g. A1, D4)
      ctx.fillStyle = isEven ? '#94a3b8' : '#cbd5e1'
      ctx.font = `bold ${Math.round(cellSize * 0.28)}px monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${cols[c]}${8 - r}`, c * cellSize + cellSize / 2, r * cellSize + cellSize / 2)
    }
  }

  // Draw 2x2 colored quadrants divider
  ctx.strokeStyle = '#f59e0b'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(size / 2, 0)
  ctx.lineTo(size / 2, size)
  ctx.moveTo(0, size / 2)
  ctx.lineTo(size, size / 2)
  ctx.stroke()

  return canvas.toDataURL('image/png')
}

export function autoPackIslands(mesh: MeshObject, margin = 0.02): MeshObject {
  return packUVIslands(mesh, Math.round(margin * 64), 64)
}

/**
 * Validates and ensures complete, valid UV coordinates for all face vertices on any 3D object.
 */
export function ensureMeshUVs(mesh: MeshObject): boolean {
  if (!mesh || !mesh.faces || !mesh.vertices) return false
  let changed = false
  const vertMap = new Map<string, Vertex>()
  for (const v of mesh.vertices) {
    vertMap.set(v.id, v)
  }

  for (const face of mesh.faces) {
    if (!face.uvs || face.uvs.length !== face.vertexIds.length || face.uvs.some(uv => !uv || !Number.isFinite(uv.u) || !Number.isFinite(uv.v))) {
      changed = true
      const faceVerts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
      const normal = face.normal || computeFaceNormal(faceVerts.map(v => v.position))
      const absX = Math.abs(normal.x)
      const absY = Math.abs(normal.y)
      const absZ = Math.abs(normal.z)

      face.uvs = faceVerts.map(v => {
        if (absX >= absY && absX >= absZ) {
          const sign = normal.x >= 0 ? 1 : -1
          return { u: (v.position.z * sign + 1.0) / 2.0, v: (v.position.y + 1.0) / 2.0 }
        } else if (absY >= absX && absY >= absZ) {
          const sign = normal.y >= 0 ? 1 : -1
          return { u: (v.position.x + 1.0) / 2.0, v: (v.position.z * sign + 1.0) / 2.0 }
        } else {
          const sign = normal.z >= 0 ? 1 : -1
          return { u: (v.position.x * sign + 1.0) / 2.0, v: (v.position.y + 1.0) / 2.0 }
        }
      })

      if (face.uvs.length < face.vertexIds.length) {
        face.uvs = face.vertexIds.map((_, i) => {
          if (face.vertexIds.length === 3) {
            return i === 0 ? { u: 0.5, v: 1 } : (i === 1 ? { u: 0, v: 0 } : { u: 1, v: 0 })
          }
          if (face.vertexIds.length === 4) {
            return i === 0 ? { u: 0, v: 0 } : (i === 1 ? { u: 1, v: 0 } : (i === 2 ? { u: 1, v: 1 } : { u: 0, v: 1 }))
          }
          const ang = (i / face.vertexIds.length) * Math.PI * 2
          return { u: 0.5 + 0.5 * Math.cos(ang), v: 0.5 + 0.5 * Math.sin(ang) }
        })
      }
    }
  }
  return changed
}
