import type { BufferGeometry, Object3D } from 'three'
import type { MeshShadeMode, Vector3D } from '../../types/mesh'
import { computeFaceNormal } from '../../utils/math'

/** Degrees. Edges sharper than this stay flat when `shadeMode` is `auto`. Matches Blender's default. */
export const DEFAULT_AUTO_SMOOTH_ANGLE = 30

export interface ShadeExtras {
  shadeMode: MeshShadeMode
  autoSmoothAngle?: number
}

const SHADE_DOT = 0.999
const OBJ_SHADE_COMMENT = /^#\s*polyecho_shade\s+(flat|smooth|auto)(?:\s+(\d+(?:\.\d+)?))?/i

function isShadeMode(value: unknown): value is MeshShadeMode {
  return value === 'flat' || value === 'smooth' || value === 'auto'
}

function vecDot(a: Vector3D, b: Vector3D) {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function posKey(p: Vector3D) {
  return `${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)}`
}

export function parseShadeExtras(data: Record<string, unknown> | undefined | null): ShadeExtras | null {
  if (!data) return null
  if (!isShadeMode(data.shadeMode)) return null
  const angle = data.autoSmoothAngle
  return {
    shadeMode: data.shadeMode,
    autoSmoothAngle: typeof angle === 'number' && Number.isFinite(angle) ? angle : undefined
  }
}

export function shadeUserData(extras: ShadeExtras): Record<string, unknown> {
  const data: Record<string, unknown> = { shadeMode: extras.shadeMode }
  if (extras.shadeMode === 'auto') {
    data.autoSmoothAngle = extras.autoSmoothAngle ?? DEFAULT_AUTO_SMOOTH_ANGLE
  } else if (typeof extras.autoSmoothAngle === 'number') {
    data.autoSmoothAngle = extras.autoSmoothAngle
  }
  return data
}

export function formatObjShadeComment(extras: ShadeExtras): string {
  if (extras.shadeMode === 'auto') {
    return `# polyecho_shade auto ${extras.autoSmoothAngle ?? DEFAULT_AUTO_SMOOTH_ANGLE}`
  }
  return `# polyecho_shade ${extras.shadeMode}`
}

export function parseObjShadeComment(line: string): ShadeExtras | null {
  const match = line.trim().match(OBJ_SHADE_COMMENT)
  if (!match) return null
  const shadeMode = match[1].toLowerCase() as MeshShadeMode
  const angle = match[2] != null ? Number(match[2]) : undefined
  return {
    shadeMode,
    autoSmoothAngle: Number.isFinite(angle) ? angle : undefined
  }
}

export interface ShadeTriangle {
  positions: [Vector3D, Vector3D, Vector3D]
  normals?: [Vector3D, Vector3D, Vector3D]
}

/** Infer Blender-style Shade Flat / Smooth / Smooth by Angle from authored normals. */
export function inferShadeModeFromTriangles(triangles: ShadeTriangle[]): MeshShadeMode {
  if (triangles.length === 0) return 'flat'

  let compared = 0
  let allMatchFace = true
  const welded = new Map<string, Vector3D[]>()

  for (const tri of triangles) {
    if (!tri.normals) continue
    const faceNormal = computeFaceNormal(tri.positions)
    for (let i = 0; i < 3; i++) {
      const n = tri.normals[i]
      if (!n) continue
      compared++
      if (vecDot(n, faceNormal) < SHADE_DOT) allMatchFace = false
      const key = posKey(tri.positions[i])
      const list = welded.get(key)
      if (list) list.push(n)
      else welded.set(key, [n])
    }
  }

  if (compared === 0 || allMatchFace) return 'flat'

  for (const normals of welded.values()) {
    const first = normals[0]
    for (let i = 1; i < normals.length; i++) {
      if (vecDot(first, normals[i]) < SHADE_DOT) return 'auto'
    }
  }
  return 'smooth'
}

export function inferShadeModeFromGeometry(geometry: BufferGeometry): MeshShadeMode {
  const pos = geometry.getAttribute('position')
  const nrm = geometry.getAttribute('normal')
  if (!pos) return 'flat'
  const index = geometry.getIndex()
  const triCount = index ? index.count / 3 : pos.count / 3
  const triangles: ShadeTriangle[] = []
  for (let i = 0; i < triCount; i++) {
    const i0 = index ? index.getX(i * 3) : i * 3
    const i1 = index ? index.getX(i * 3 + 1) : i * 3 + 1
    const i2 = index ? index.getX(i * 3 + 2) : i * 3 + 2
    const positions: ShadeTriangle['positions'] = [
      { x: pos.getX(i0), y: pos.getY(i0), z: pos.getZ(i0) },
      { x: pos.getX(i1), y: pos.getY(i1), z: pos.getZ(i1) },
      { x: pos.getX(i2), y: pos.getY(i2), z: pos.getZ(i2) }
    ]
    const normals: ShadeTriangle['normals'] | undefined = nrm
      ? [
          { x: nrm.getX(i0), y: nrm.getY(i0), z: nrm.getZ(i0) },
          { x: nrm.getX(i1), y: nrm.getY(i1), z: nrm.getZ(i1) },
          { x: nrm.getX(i2), y: nrm.getY(i2), z: nrm.getZ(i2) }
        ]
      : undefined
    triangles.push({ positions, normals })
  }
  return inferShadeModeFromTriangles(triangles)
}

export function readImportedShade(
  object: Object3D,
  geometry: BufferGeometry
): ShadeExtras {
  const extras = parseShadeExtras({
    ...(geometry.userData as Record<string, unknown>),
    ...(object.userData as Record<string, unknown>)
  })
  if (extras) {
    return {
      shadeMode: extras.shadeMode,
      autoSmoothAngle: extras.autoSmoothAngle ?? (extras.shadeMode === 'auto' ? DEFAULT_AUTO_SMOOTH_ANGLE : undefined)
    }
  }
  return { shadeMode: inferShadeModeFromGeometry(geometry) }
}
