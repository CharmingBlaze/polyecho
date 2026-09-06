import { MeshObject, UV, Vertex, Vector3D } from '../../types/mesh'
import { findUvIslands } from '../uv/UVIslands'
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

function rotateIslandToPrincipalAxis(mesh: MeshObject, island: number[]) {
  let sumU = 0
  let sumV = 0
  let count = 0
  for (const faceIndex of island) {
    for (const uv of mesh.faces[faceIndex].uvs) {
      sumU += uv.u
      sumV += uv.v
      count++
    }
  }
  if (count === 0) return

  const centerU = sumU / count
  const centerV = sumV / count
  let cuu = 0
  let cvv = 0
  let cuv = 0
  for (const faceIndex of island) {
    for (const uv of mesh.faces[faceIndex].uvs) {
      const du = uv.u - centerU
      const dv = uv.v - centerV
      cuu += du * du
      cvv += dv * dv
      cuv += du * dv
    }
  }

  const angle = -0.5 * Math.atan2(2 * cuv, cuu - cvv)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  for (const faceIndex of island) {
    for (const uv of mesh.faces[faceIndex].uvs) {
      const du = uv.u - centerU
      const dv = uv.v - centerV
      uv.u = centerU + du * cos - dv * sin
      uv.v = centerV + du * sin + dv * cos
    }
  }
}

function resolveTargetFaces(mesh: MeshObject, onlyFaceIndices?: number[]): number[] {
  if (onlyFaceIndices && onlyFaceIndices.length > 0) {
    return Array.from(new Set(onlyFaceIndices.filter(i => i >= 0 && i < mesh.faces.length)))
  }
  return mesh.faces.map((_, i) => i)
}

function boundsOfFaces(mesh: MeshObject, vertMap: Map<string, Vertex>, faceIndices: number[]) {
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (const i of faceIndices) {
    for (const id of mesh.faces[i].vertexIds) {
      const p = vertMap.get(id)?.position
      if (!p) continue
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.z < minZ) minZ = p.z
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
      if (p.z > maxZ) maxZ = p.z
    }
  }
  if (!Number.isFinite(minX)) {
    return { minX: -1, maxX: 1, minY: -1, maxY: 1, minZ: -1, maxZ: 1 }
  }
  return { minX, maxX, minY, maxY, minZ, maxZ }
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
  const vertMap = new Map<string, Vertex>()
  for (const v of newMesh.vertices) {
    vertMap.set(v.id, v)
  }
  const targets = resolveTargetFaces(newMesh, onlyFaceIndices)
  const b = boundsOfFaces(newMesh, vertMap, targets)

  for (const faceIndex of targets) {
    const face = newMesh.faces[faceIndex]
    const faceVerts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
    if (faceVerts.length < 3) continue

    const normal = face.normal || computeFaceNormal(faceVerts.map(v => v.position))
    const absX = Math.abs(normal.x)
    const absY = Math.abs(normal.y)
    const absZ = Math.abs(normal.z)

    if (absX >= absY && absX >= absZ) {
      face.uvs = faceVerts.map(v => ({
        u: signedNorm(v.position.z, b.minZ, b.maxZ, normal.x >= 0),
        v: norm01(v.position.y, b.minY, b.maxY)
      }))
    } else if (absY >= absX && absY >= absZ) {
      face.uvs = faceVerts.map(v => ({
        u: norm01(v.position.x, b.minX, b.maxX),
        v: signedNorm(v.position.z, b.minZ, b.maxZ, normal.y >= 0)
      }))
    } else {
      face.uvs = faceVerts.map(v => ({
        u: signedNorm(v.position.x, b.minX, b.maxX, normal.z >= 0),
        v: norm01(v.position.y, b.minY, b.maxY)
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
  const vertMap = new Map<string, Vertex>()
  for (const v of newMesh.vertices) {
    vertMap.set(v.id, v)
  }
  const targets = resolveTargetFaces(newMesh, onlyFaceIndices)
  const b = boundsOfFaces(newMesh, vertMap, targets)

  for (const faceIndex of targets) {
    const face = newMesh.faces[faceIndex]
    const faceVerts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
    if (axis === 'x') {
      face.uvs = faceVerts.map(v => ({
        u: norm01(v.position.z, b.minZ, b.maxZ),
        v: norm01(v.position.y, b.minY, b.maxY)
      }))
    } else if (axis === 'y') {
      face.uvs = faceVerts.map(v => ({
        u: norm01(v.position.x, b.minX, b.maxX),
        v: norm01(v.position.z, b.minZ, b.maxZ)
      }))
    } else {
      face.uvs = faceVerts.map(v => ({
        u: norm01(v.position.x, b.minX, b.maxX),
        v: norm01(v.position.y, b.minY, b.maxY)
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
  const vertMap = new Map<string, Vertex>()
  for (const v of newMesh.vertices) {
    vertMap.set(v.id, v)
  }
  const targets = resolveTargetFaces(newMesh, onlyFaceIndices)
  const b = boundsOfFaces(newMesh, vertMap, targets)
  const cx = (b.minX + b.maxX) * 0.5
  const cz = (b.minZ + b.maxZ) * 0.5
  let radius = 1e-6
  for (const faceIndex of targets) {
    for (const id of newMesh.faces[faceIndex].vertexIds) {
      const p = vertMap.get(id)?.position
      if (!p) continue
      radius = Math.max(radius, Math.hypot(p.x - cx, p.z - cz))
    }
  }

  for (const faceIndex of targets) {
    const face = newMesh.faces[faceIndex]
    const faceVerts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
    if (faceVerts.length < 3) continue

    const normal = face.normal || computeFaceNormal(faceVerts.map(v => v.position))
    if (Math.abs(normal.y) > 0.7) {
      const tileV0 = normal.y > 0 ? 0.52 : 0.02
      face.uvs = faceVerts.map(v => ({
        u: 0.74 + ((v.position.x - cx) / radius * 0.5 + 0.5) * 0.24,
        v: tileV0 + ((v.position.z - cz) / radius * 0.5 + 0.5) * 0.46
      }))
    } else {
      face.uvs = faceVerts.map(v => {
        const angle = Math.atan2(v.position.z - cz, v.position.x - cx)
        return {
          u: ((angle + Math.PI) / (2 * Math.PI)) * 0.7,
          v: norm01(v.position.y, b.minY, b.maxY)
        }
      })
    }
  }

  return newMesh
}

/**
 * Spherical equirectangular unwrap around the target AABB center.
 */
export function sphereUnwrap(mesh: MeshObject, onlyFaceIndices?: number[]): MeshObject {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  const vertMap = new Map<string, Vertex>()
  for (const v of newMesh.vertices) {
    vertMap.set(v.id, v)
  }
  const targets = resolveTargetFaces(newMesh, onlyFaceIndices)
  const b = boundsOfFaces(newMesh, vertMap, targets)
  const cx = (b.minX + b.maxX) * 0.5
  const cy = (b.minY + b.maxY) * 0.5
  const cz = (b.minZ + b.maxZ) * 0.5

  for (const faceIndex of targets) {
    const face = newMesh.faces[faceIndex]
    const faceVerts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
    if (faceVerts.length < 3) continue

    face.uvs = faceVerts.map(v => {
      const dx = v.position.x - cx
      const dy = v.position.y - cy
      const dz = v.position.z - cz
      const len = Math.hypot(dx, dy, dz) || 1
      const u = 0.5 + Math.atan2(dz / len, dx / len) / (2 * Math.PI)
      const vCoord = 0.5 - Math.asin(Math.max(-1, Math.min(1, dy / len))) / Math.PI
      return { u, v: 1 - vCoord }
    })
  }

  return newMesh
}

/**
 * Conical unwrap around the target AABB Y axis.
 */
export function coneUnwrap(mesh: MeshObject, onlyFaceIndices?: number[]): MeshObject {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  const vertMap = new Map<string, Vertex>()
  for (const v of newMesh.vertices) {
    vertMap.set(v.id, v)
  }
  const targets = resolveTargetFaces(newMesh, onlyFaceIndices)
  const b = boundsOfFaces(newMesh, vertMap, targets)
  const cx = (b.minX + b.maxX) * 0.5
  const cz = (b.minZ + b.maxZ) * 0.5
  let radius = 1e-6
  for (const faceIndex of targets) {
    for (const id of newMesh.faces[faceIndex].vertexIds) {
      const p = vertMap.get(id)?.position
      if (!p) continue
      radius = Math.max(radius, Math.hypot(p.x - cx, p.z - cz))
    }
  }

  for (const faceIndex of targets) {
    const face = newMesh.faces[faceIndex]
    const faceVerts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
    if (faceVerts.length < 3) continue

    const normal = face.normal || computeFaceNormal(faceVerts.map(v => v.position))
    if (normal.y < -0.7) {
      face.uvs = faceVerts.map(v => ({
        u: 0.76 + ((v.position.x - cx) / radius * 0.5 + 0.5) * 0.22,
        v: 0.52 + ((v.position.z - cz) / radius * 0.5 + 0.5) * 0.46
      }))
    } else {
      face.uvs = faceVerts.map(v => {
        const angle = Math.atan2(v.position.z - cz, v.position.x - cx)
        return {
          u: ((angle + Math.PI) / (2 * Math.PI)) * 0.75,
          v: norm01(v.position.y, b.minY, b.maxY)
        }
      })
    }
  }

  return newMesh
}

/**
 * Cubemap cross: each face is projected onto its plane, then fitted into a 4×3 cell.
 */
export function cubemapCrossUnwrap(mesh: MeshObject, onlyFaceIndices?: number[]): MeshObject {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  const vertMap = new Map<string, Vertex>()
  for (const v of newMesh.vertices) {
    vertMap.set(v.id, v)
  }
  const targets = resolveTargetFaces(newMesh, onlyFaceIndices)
  const cellW = 0.25
  const cellH = 1 / 3

  for (const faceIndex of targets) {
    const face = newMesh.faces[faceIndex]
    const faceVerts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
    if (faceVerts.length < 3) continue

    const normal = face.normal || computeFaceNormal(faceVerts.map(v => v.position))
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
    face.uvs = assignProjectedToRect(faceVerts.map(v => v.position), axisU, axisV, { u0, v0, u1, v1 })
  }

  return newMesh
}

export interface SmartUvProjectOptions {
  angleLimitDegrees?: number
  marginPixels?: number
  textureSize?: number
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
  const cosLimit = Math.cos(angleLimit * Math.PI / 180)
  const requestedFaces = options.onlyFaceIndices?.filter(i => i >= 0 && i < projected.faces.length)
  const targetFaces = requestedFaces && requestedFaces.length > 0
    ? Array.from(new Set(requestedFaces))
    : projected.faces.map((_, i) => i)
  const targetSet = new Set(targetFaces)
  const vertexMap = new Map(projected.vertices.map(v => [v.id, v]))
  const seamSet = new Set(projected.seamEdgeIds || [])
  const edgeKey = (a: string, b: string) => a < b ? `${a}_${b}` : `${b}_${a}`

  const normals = new Map<number, Vector3D>()
  for (const faceIndex of targetFaces) {
    const face = projected.faces[faceIndex]
    const points = face.vertexIds.map(id => vertexMap.get(id)?.position).filter(Boolean) as Vector3D[]
    normals.set(faceIndex, face.normal || computeFaceNormal(points))
  }

  const edgeFaces = new Map<string, number[]>()
  for (const faceIndex of targetFaces) {
    const ids = projected.faces[faceIndex].vertexIds
    for (let i = 0; i < ids.length; i++) {
      const key = edgeKey(ids[i], ids[(i + 1) % ids.length])
      const linked = edgeFaces.get(key) || []
      linked.push(faceIndex)
      edgeFaces.set(key, linked)
    }
  }

  const neighbors = new Map<number, Array<{ face: number; edge: string }>>()
  for (const faceIndex of targetFaces) neighbors.set(faceIndex, [])
  for (const [edge, faces] of edgeFaces) {
    for (let i = 0; i < faces.length; i++) {
      for (let j = i + 1; j < faces.length; j++) {
        neighbors.get(faces[i])?.push({ face: faces[j], edge })
        neighbors.get(faces[j])?.push({ face: faces[i], edge })
      }
    }
  }

  const visited = new Set<number>()
  const islands: number[][] = []
  for (const seed of targetFaces) {
    if (visited.has(seed)) continue
    const island: number[] = []
    const queue = [seed]
    const seedNormal = normals.get(seed) || { x: 0, y: 1, z: 0 }
    let normalSum = { ...seedNormal }
    visited.add(seed)

    while (queue.length > 0) {
      const current = queue.shift()!
      island.push(current)
      const averageNormal = normalizeVec3(normalSum)
      for (const link of neighbors.get(current) || []) {
        if (!targetSet.has(link.face) || visited.has(link.face) || seamSet.has(link.edge)) continue
        const candidateNormal = normals.get(link.face) || seedNormal
        const localNormal = normals.get(current) || seedNormal
        if (dotVec3(localNormal, candidateNormal) < cosLimit) continue
        // Prevent a chain of gentle bends from wrapping an island all the way
        // around a sphere or tube and overlapping its planar projection.
        if (dotVec3(averageNormal, candidateNormal) < cosLimit) continue
        visited.add(link.face)
        queue.push(link.face)
        normalSum = {
          x: normalSum.x + candidateNormal.x,
          y: normalSum.y + candidateNormal.y,
          z: normalSum.z + candidateNormal.z
        }
      }
    }
    islands.push(island)
  }

  for (let islandIndex = 0; islandIndex < islands.length; islandIndex++) {
    const island = islands[islandIndex]
    let normalSum = { x: 0, y: 0, z: 0 }
    const uniquePoints = new Map<string, Vector3D>()
    for (const faceIndex of island) {
      const normal = normals.get(faceIndex) || { x: 0, y: 1, z: 0 }
      normalSum.x += normal.x
      normalSum.y += normal.y
      normalSum.z += normal.z
      for (const id of projected.faces[faceIndex].vertexIds) {
        const position = vertexMap.get(id)?.position
        if (position) uniquePoints.set(id, position)
      }
    }
    const { tangent, bitangent } = bestFitProjectionBasis(
      Array.from(uniquePoints.values()),
      normalSum
    )

    for (const faceIndex of island) {
      const face = projected.faces[faceIndex]
      face.uvs = face.vertexIds.map(id => {
        const position = vertexMap.get(id)?.position || { x: 0, y: 0, z: 0 }
        // Separate projection spaces before packing so two cut islands whose
        // local coordinates happen to match cannot be mistaken for welded UVs.
        return {
          u: dotVec3(position, tangent) + islandIndex * 10000,
          v: dotVec3(position, bitangent)
        }
      })
    }
    rotateIslandToPrincipalAxis(projected, island)
  }

  return packUVIslands(
    projected,
    Number.isFinite(Number(options.marginPixels)) ? Number(options.marginPixels) : 2,
    Number.isFinite(Number(options.textureSize)) ? Number(options.textureSize) : 64,
    targetFaces
  )
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
  onlyFaceIndices?: number[]
): MeshObject {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  if (newMesh.faces.length === 0) return newMesh

  const safeMarginPixels = Number.isFinite(marginPixels) ? marginPixels : 2
  const safeTextureSize = Number.isFinite(textureSize) ? textureSize : 64
  const margin = Math.max(0, safeMarginPixels / Math.max(1, safeTextureSize))
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
      w: Math.max(0.001, maxU - minU),
      h: Math.max(0.001, maxV - minV)
    }
  })

  boxes.sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h))

  interface Placement { box: IslandBox; u: number; v: number; rotated: boolean }
  const tryPack = (scale: number): Placement[] | null => {
    const placements: Placement[] = []
    let x = margin
    let y = margin
    let rowHeight = 0
    const limit = 1 - margin + 1e-8

    for (const box of boxes) {
      const choices = [
        { rotated: false, w: box.w * scale, h: box.h * scale },
        { rotated: true, w: box.h * scale, h: box.w * scale }
      ].filter(choice => choice.w <= 1 - margin * 2 + 1e-8 && choice.h <= 1 - margin * 2 + 1e-8)
      if (choices.length === 0) return null

      let choice = choices
        .filter(item => x + item.w <= limit)
        .sort((a, b) => Math.max(rowHeight, a.h) - Math.max(rowHeight, b.h) || a.w - b.w)[0]

      if (!choice) {
        x = margin
        y += rowHeight + margin
        rowHeight = 0
        choice = choices.sort((a, b) => a.h - b.h || a.w - b.w)[0]
      }
      if (!choice || y + choice.h > limit) return null

      placements.push({ box, u: x, v: y, rotated: choice.rotated })
      x += choice.w + margin
      rowHeight = Math.max(rowHeight, choice.h)
    }
    return placements
  }

  let low = 0
  let high = 1
  while (tryPack(high)) high *= 2
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
        const sourceU = uv.u - box.minU
        const sourceV = uv.v - box.minV
        const packedU = rotated ? sourceV : sourceU
        const packedV = rotated ? box.w - sourceU : sourceV
        uv.u = Math.max(0, Math.min(1, targetU + packedU * appliedScale))
        uv.v = Math.max(0, Math.min(1, targetV + packedV * appliedScale))
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
      if (face.uvs.length < 3) continue
      const verts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
      if (verts.length < 3) continue
      const p0 = verts[0].position, p1 = verts[1].position, p2 = verts[2].position
      const e1 = { x: p1.x - p0.x, y: p1.y - p0.y, z: p1.z - p0.z }
      const e2 = { x: p2.x - p0.x, y: p2.y - p0.y, z: p2.z - p0.z }
      worldArea += 0.5 * Math.hypot(
        e1.y * e2.z - e1.z * e2.y,
        e1.z * e2.x - e1.x * e2.z,
        e1.x * e2.y - e1.y * e2.x
      )
      const u0 = face.uvs[0], u1 = face.uvs[1], u2 = face.uvs[2]
      uvArea += 0.5 * Math.abs((u1.u - u0.u) * (u2.v - u0.v) - (u2.u - u0.u) * (u1.v - u0.v))
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
  const verts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
  if (verts.length < 3) return 16

  const p0 = verts[0].position, p1 = verts[1].position, p2 = verts[2].position
  const e1 = { x: p1.x - p0.x, y: p1.y - p0.y, z: p1.z - p0.z }
  const e2 = { x: p2.x - p0.x, y: p2.y - p0.y, z: p2.z - p0.z }
  const crossX = e1.y * e2.z - e1.z * e2.y
  const crossY = e1.z * e2.x - e1.x * e2.z
  const crossZ = e1.x * e2.y - e1.y * e2.x
  const wArea = 0.5 * Math.hypot(crossX, crossY, crossZ)

  const u0 = face.uvs[0], u1 = face.uvs[1], u2 = face.uvs[2]
  const uvArea = 0.5 * Math.abs((u1.u - u0.u) * (u2.v - u0.v) - (u2.u - u0.u) * (u1.v - u0.v))

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
      if (face.uvs.length < 3) continue
      const verts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
      if (verts.length < 3) continue

      const p0 = verts[0].position, p1 = verts[1].position, p2 = verts[2].position
      const e1 = { x: p1.x - p0.x, y: p1.y - p0.y, z: p1.z - p0.z }
      const e2 = { x: p2.x - p0.x, y: p2.y - p0.y, z: p2.z - p0.z }
      const crossX = e1.y * e2.z - e1.z * e2.y
      const crossY = e1.z * e2.x - e1.x * e2.z
      const crossZ = e1.x * e2.y - e1.y * e2.x
      const wArea = 0.5 * Math.hypot(crossX, crossY, crossZ)

      const u0 = face.uvs[0], u1 = face.uvs[1], u2 = face.uvs[2]
      const uvArea = 0.5 * Math.abs((u1.u - u0.u) * (u2.v - u0.v) - (u2.u - u0.u) * (u1.v - u0.v))

      islandWorldArea += wArea
      islandUvArea += uvArea

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
    if (face.uvs.length < 3) continue
    const verts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
    if (verts.length < 3) continue

    const p0 = verts[0].position, p1 = verts[1].position, p2 = verts[2].position
    const e1 = { x: p1.x - p0.x, y: p1.y - p0.y, z: p1.z - p0.z }
    const e2 = { x: p2.x - p0.x, y: p2.y - p0.y, z: p2.z - p0.z }
    const wArea = 0.5 * Math.hypot(
      e1.y * e2.z - e1.z * e2.y,
      e1.z * e2.x - e1.x * e2.z,
      e1.x * e2.y - e1.y * e2.x
    )

    const u0 = face.uvs[0], u1 = face.uvs[1], u2 = face.uvs[2]
    const uvArea = 0.5 * Math.abs((u1.u - u0.u) * (u2.v - u0.v) - (u2.u - u0.u) * (u1.v - u0.v))

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
