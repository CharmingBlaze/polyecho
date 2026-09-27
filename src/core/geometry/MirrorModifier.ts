import * as THREE from 'three'
import { MeshObject, Vertex, Face, UV, MirrorModifier, Vector3D } from '../../types/mesh'
import { meshObjectWorldMatrix } from './MeshTransform'
import { lerpVec3 } from '../../utils/math'

export type ModifierPurpose = 'viewport' | 'render' | 'apply'
export type MirrorAxis = 'x' | 'y' | 'z'

const AXES: MirrorAxis[] = ['x', 'y', 'z']

const _point = new THREE.Vector3()
const _normal = new THREE.Vector3()
const _toNormal = new THREE.Matrix3()
const _fromNormal = new THREE.Matrix3()

export interface MirrorSpace {
  identity: boolean
  toMirror: THREE.Matrix4
  fromMirror: THREE.Matrix4
}

function cloneVerts(vertices: Vertex[]): Vertex[] {
  return vertices.map(v => ({
    ...v,
    position: { ...v.position },
    normal: v.normal ? { ...v.normal } : undefined,
    boneWeights: v.boneWeights ? { ...v.boneWeights } : undefined
  }))
}

function cloneFaces(faces: Face[]): Face[] {
  return faces.map(f => ({
    ...f,
    vertexIds: [...f.vertexIds],
    uvs: f.uvs.map(uv => ({ ...uv }))
  }))
}

function lerpUv(a: UV, b: UV, t: number): UV {
  return { u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t }
}

function axisFlag(
  mod: MirrorModifier,
  key: 'bisectX' | 'bisectY' | 'bisectZ' | 'flipX' | 'flipY' | 'flipZ',
  legacy: boolean
): boolean {
  const value = mod[key]
  if (typeof value === 'boolean') return value
  return legacy
}

export function mirrorAxisEnabled(mod: MirrorModifier, axis: MirrorAxis): boolean {
  if (axis === 'x') return mod.axisX
  if (axis === 'y') return mod.axisY
  return mod.axisZ
}

export function bisectAxisEnabled(mod: MirrorModifier, axis: MirrorAxis): boolean {
  const key = axis === 'x' ? 'bisectX' : axis === 'y' ? 'bisectY' : 'bisectZ'
  return axisFlag(mod, key, mod.bisect === true && mirrorAxisEnabled(mod, axis))
}

export function flipAxisEnabled(mod: MirrorModifier, axis: MirrorAxis): boolean {
  const key = axis === 'x' ? 'flipX' : axis === 'y' ? 'flipY' : 'flipZ'
  return axisFlag(mod, key, false)
}

export function mirrorIsActive(mod: MirrorModifier, purpose: ModifierPurpose, inEditMode: boolean): boolean {
  if (purpose === 'apply') return true
  if (purpose === 'render') return mod.showRender !== false
  if (!mod.enabled) return false
  if (inEditMode && mod.showEdit === false) return false
  return true
}

export function resolveMirrorObject(mesh: MeshObject, scene?: readonly MeshObject[]): MeshObject | null {
  const id = mesh.mirror?.mirrorObjectId
  if (!id || id === mesh.id || !scene) return null
  return scene.find(item => item.id === id) ?? null
}

export function mirrorSpace(mesh: MeshObject, mirrorObject?: MeshObject | null): MirrorSpace {
  const toMirror = new THREE.Matrix4()
  const fromMirror = new THREE.Matrix4()
  if (!mirrorObject) {
    return { identity: true, toMirror, fromMirror }
  }
  const objectWorld = meshObjectWorldMatrix(mesh)
  const mirrorWorld = meshObjectWorldMatrix(mirrorObject)
  const mirrorInverse = mirrorWorld.clone().invert()
  if (Math.abs(mirrorInverse.determinant()) < 1e-12) {
    return { identity: true, toMirror, fromMirror }
  }
  toMirror.multiplyMatrices(mirrorInverse, objectWorld)
  fromMirror.copy(toMirror).invert()
  return { identity: false, toMirror, fromMirror }
}

function applyPoint(vertex: Vertex, matrix: THREE.Matrix4, normalMatrix: THREE.Matrix3) {
  _point.set(vertex.position.x, vertex.position.y, vertex.position.z).applyMatrix4(matrix)
  vertex.position.x = _point.x
  vertex.position.y = _point.y
  vertex.position.z = _point.z
  if (!vertex.normal) return
  _normal.set(vertex.normal.x, vertex.normal.y, vertex.normal.z).applyMatrix3(normalMatrix)
  if (_normal.lengthSq() > 1e-12) _normal.normalize()
  vertex.normal.x = _normal.x
  vertex.normal.y = _normal.y
  vertex.normal.z = _normal.z
}

/**
 * Sutherland–Hodgman clip. `keepPositive` keeps coord >= -distance; otherwise coord <= distance.
 * Vertices within `distance` of the plane are snapped onto it and kept.
 */
function bisectAlongAxis(
  vertices: Vertex[],
  faces: Face[],
  axis: MirrorAxis,
  distance: number,
  keepPositive: boolean
): { vertices: Vertex[]; faces: Face[] } {
  const eps = Math.max(0, distance)
  const vertMap = new Map(vertices.map(v => [v.id, v]))
  const outVerts = cloneVerts(vertices)
  const outVertMap = new Map(outVerts.map(v => [v.id, v]))
  const outFaces: Face[] = []
  let splitSeq = 0

  const addVert = (v: Vertex) => {
    outVerts.push(v)
    outVertMap.set(v.id, v)
    vertMap.set(v.id, v)
  }

  const inside = (coord: number) => (keepPositive ? coord >= -eps : coord <= eps)

  for (const face of faces) {
    const n = face.vertexIds.length
    if (n < 3 || face.uvs.length !== n) continue

    const ids: string[] = []
    const uvs: UV[] = []

    for (let i = 0; i < n; i++) {
      const aId = face.vertexIds[i]
      const bId = face.vertexIds[(i + 1) % n]
      const a = vertMap.get(aId)
      const b = vertMap.get(bId)
      if (!a || !b) continue
      const uvA = face.uvs[i]
      const uvB = face.uvs[(i + 1) % n]
      const ca = a.position[axis]
      const cb = b.position[axis]
      const aIn = inside(ca)
      const bIn = inside(cb)

      if (aIn) {
        const kept = outVertMap.get(aId)
        if (kept && Math.abs(ca) <= eps) kept.position[axis] = 0
        ids.push(aId)
        uvs.push({ ...uvA })
      }

      if (aIn !== bIn) {
        const den = cb - ca
        const t = Math.abs(den) < 1e-9 ? 0 : (-ca) / den
        const clamped = Math.max(0, Math.min(1, t))
        const pos = lerpVec3(a.position, b.position, clamped)
        pos[axis] = 0
        const newId = `bis_${axis}_${face.id}_${splitSeq++}`
        addVert({
          id: newId,
          position: pos,
          color: a.color,
          boneWeights: a.boneWeights ? { ...a.boneWeights } : undefined
        })
        ids.push(newId)
        uvs.push(lerpUv(uvA, uvB, clamped))
      }
    }

    if (ids.length < 3) continue
    outFaces.push({
      ...face,
      vertexIds: ids,
      uvs
    })
  }

  const used = new Set(outFaces.flatMap(f => f.vertexIds))
  return {
    vertices: outVerts.filter(v => used.has(v.id)),
    faces: outFaces
  }
}

function mirrorAcross(
  vertices: Vertex[],
  faces: Face[],
  axis: MirrorAxis,
  mod: MirrorModifier
): { vertices: Vertex[]; faces: Face[] } {
  const outVertices = vertices
  const outFaces = faces
  const mergeT = Math.max(0, mod.mergeThreshold ?? 0.001)
  const vertMap = new Map<string, string>()
  const mult = { x: 1, y: 1, z: 1 }
  mult[axis] = -1
  const sourceVertices = vertices.slice()

  for (const v of sourceVertices) {
    const coord = v.position[axis]
    if (mod.merge && Math.abs(coord) <= mergeT) {
      v.position[axis] = 0
      vertMap.set(v.id, v.id)
    } else {
      const mirroredId = `mir_${axis}_${v.id}`
      outVertices.push({
        id: mirroredId,
        position: {
          x: v.position.x * mult.x,
          y: v.position.y * mult.y,
          z: v.position.z * mult.z
        },
        normal: v.normal
          ? {
              x: v.normal.x * mult.x,
              y: v.normal.y * mult.y,
              z: v.normal.z * mult.z
            }
          : undefined,
        color: v.color,
        selected: false,
        boneWeights: v.boneWeights ? { ...v.boneWeights } : undefined
      })
      vertMap.set(v.id, mirroredId)
    }
  }

  const offsetU = mod.offsetU ?? 0
  const offsetV = mod.offsetV ?? 0
  for (const f of [...faces]) {
    const mirroredVertexIds = f.vertexIds.map(vid => vertMap.get(vid) || vid)
    if (mirroredVertexIds.every((id, i) => id === f.vertexIds[i])) continue
    if (new Set(mirroredVertexIds).size < 3) continue

    mirroredVertexIds.reverse()
    const mirroredUVs = f.uvs.map(uv => ({
      u: mod.flipU ? 1 - uv.u + offsetU : uv.u,
      v: mod.flipV ? 1 - uv.v + offsetV : uv.v
    }))
    mirroredUVs.reverse()

    outFaces.push({
      id: `mir_${axis}_${f.id}`,
      vertexIds: mirroredVertexIds,
      uvs: mirroredUVs,
      materialIndex: f.materialIndex,
      selected: false
    })
  }

  return { vertices: outVertices, faces: outFaces }
}

export function evaluateMirror(
  mesh: MeshObject,
  scene?: readonly MeshObject[],
  purpose: ModifierPurpose = 'viewport',
  inEditMode = false
): { vertices: Vertex[]; faces: Face[] } {
  const mod = mesh.mirror
  if (!mod || !mirrorIsActive(mod, purpose, inEditMode)) {
    return { vertices: mesh.vertices, faces: mesh.faces }
  }

  const hasWork = AXES.some(axis => mirrorAxisEnabled(mod, axis) || bisectAxisEnabled(mod, axis))
  if (!hasWork) {
    return { vertices: mesh.vertices, faces: mesh.faces }
  }

  const space = mirrorSpace(mesh, resolveMirrorObject(mesh, scene))
  let outVertices = cloneVerts(mesh.vertices)
  let outFaces = cloneFaces(mesh.faces)
  const bisectDistance = Math.max(0, mod.bisectDistance ?? 0.001)

  if (!space.identity) {
    _toNormal.getNormalMatrix(space.toMirror)
    for (const vertex of outVertices) applyPoint(vertex, space.toMirror, _toNormal)
  }

  for (const axis of AXES) {
    if (bisectAxisEnabled(mod, axis)) {
      const cut = bisectAlongAxis(outVertices, outFaces, axis, bisectDistance, !flipAxisEnabled(mod, axis))
      outVertices = cut.vertices
      outFaces = cut.faces
    }
    if (mirrorAxisEnabled(mod, axis)) {
      const mirrored = mirrorAcross(outVertices, outFaces, axis, mod)
      outVertices = mirrored.vertices
      outFaces = mirrored.faces
    }
  }

  if (!space.identity) {
    _fromNormal.getNormalMatrix(space.fromMirror)
    for (const vertex of outVertices) applyPoint(vertex, space.fromMirror, _fromNormal)
  }

  return { vertices: outVertices, faces: outFaces }
}

/**
 * Edit-mode clipping. Vertices cannot cross an active mirror plane.
 * With Merge on, vertices inside the merge distance stick to the plane.
 */
export function clipMirrorPosition(
  current: Vector3D,
  start: Vector3D,
  mod: MirrorModifier | undefined,
  space?: MirrorSpace
): Vector3D {
  if (!mod?.enabled || !mod.clipping) return current
  const useSpace = space && !space.identity ? space : null
  _point.set(current.x, current.y, current.z)
  const startPoint = new THREE.Vector3(start.x, start.y, start.z)
  if (useSpace) {
    _point.applyMatrix4(useSpace.toMirror)
    startPoint.applyMatrix4(useSpace.toMirror)
  }
  const mergeT = mod.merge ? Math.max(0, mod.mergeThreshold ?? 0.001) : 0
  const coords = { x: _point.x, y: _point.y, z: _point.z }
  const startCoords = { x: startPoint.x, y: startPoint.y, z: startPoint.z }
  for (const axis of AXES) {
    if (!mirrorAxisEnabled(mod, axis)) continue
    const from = startCoords[axis]
    const to = coords[axis]
    if ((from >= 0 && to < 0) || (from <= 0 && to > 0) || (mod.merge && Math.abs(to) <= mergeT)) {
      coords[axis] = 0
    }
  }
  _point.set(coords.x, coords.y, coords.z)
  if (useSpace) _point.applyMatrix4(useSpace.fromMirror)
  return { x: _point.x, y: _point.y, z: _point.z }
}

export function mirrorStackKey(meshes: readonly MeshObject[]): string {
  return meshes.map(mesh => {
    const mod = mesh.mirror
    if (!mod) return mesh.id
    const target = mod.mirrorObjectId ? meshes.find(item => item.id === mod.mirrorObjectId) : undefined
    const trs = target
      ? `${target.position.x},${target.position.y},${target.position.z},${target.rotation.x},${target.rotation.y},${target.rotation.z},${target.scale.x},${target.scale.y},${target.scale.z}`
      : ''
    return [
      mesh.id,
      mod.enabled ? 1 : 0,
      mod.showEdit === false ? 0 : 1,
      mod.showRender === false ? 0 : 1,
      mod.axisX ? 1 : 0,
      mod.axisY ? 1 : 0,
      mod.axisZ ? 1 : 0,
      mod.bisectX ? 1 : 0,
      mod.bisectY ? 1 : 0,
      mod.bisectZ ? 1 : 0,
      mod.flipX ? 1 : 0,
      mod.flipY ? 1 : 0,
      mod.flipZ ? 1 : 0,
      mod.clipping ? 1 : 0,
      mod.merge ? 1 : 0,
      mod.mergeThreshold,
      mod.bisectDistance ?? '',
      mod.flipU ? 1 : 0,
      mod.flipV ? 1 : 0,
      mod.offsetU ?? 0,
      mod.offsetV ?? 0,
      mod.mirrorObjectId ?? '',
      mod.bisect ? 1 : 0,
      trs
    ].join(',')
  }).join('|')
}

export function applyMirror(mesh: MeshObject, scene?: readonly MeshObject[]): void {
  if (!mesh.mirror) return
  const { vertices, faces } = evaluateMirror(mesh, scene, 'apply')
  mesh.vertices = vertices
  mesh.faces = faces
  mesh.mirror.enabled = false
}
