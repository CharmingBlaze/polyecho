import * as THREE from 'three'
import type { MeshObject, Vector3D } from '../../types/mesh'
import type { EditableMesh } from '../mesh/MeshKernel'
import { parseUndirectedEdgeId, undirectedEdgeId } from './EdgeUtils'
import { meshObjectWorldMatrix } from './MeshTransform'
import { resolveInstanceMesh } from './DuplicateTools'

export type AlignAxis = 'x' | 'y' | 'z'
export type AlignMode = 'min' | 'center' | 'max' | 'cursor'

const _point = new THREE.Vector3()
const _matrix = new THREE.Matrix4()

function near(a: number, b: number) {
  return Math.abs(a - b) < 1e-5
}

/** True when rotation is not 0° or scale is not 1. Location is ignored. */
export function hasObjectRotationOrScale(mesh: MeshObject): boolean {
  return !near(mesh.rotation.x, 0) || !near(mesh.rotation.y, 0) || !near(mesh.rotation.z, 0)
    || !near(mesh.scale.x, 1) || !near(mesh.scale.y, 1) || !near(mesh.scale.z, 1)
}

/** Bake local rotation and scale into vertices, then reset both to identity. Location stays. */
export function applyRotationAndScale(mesh: MeshObject): void {
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(mesh.rotation.x),
    THREE.MathUtils.degToRad(mesh.rotation.y),
    THREE.MathUtils.degToRad(mesh.rotation.z),
    'XYZ'
  )
  const quat = new THREE.Quaternion().setFromEuler(euler)
  const scale = new THREE.Vector3(mesh.scale.x, mesh.scale.y, mesh.scale.z)
  _matrix.compose(new THREE.Vector3(), quat, scale)
  const flipped = _matrix.determinant() < 0
  for (const vertex of mesh.vertices) {
    _point.set(vertex.position.x, vertex.position.y, vertex.position.z).applyMatrix4(_matrix)
    vertex.position.x = _point.x
    vertex.position.y = _point.y
    vertex.position.z = _point.z
  }
  if (flipped) {
    for (const face of mesh.faces) {
      face.vertexIds.reverse()
      if (face.uvs) face.uvs.reverse()
    }
  }
  mesh.rotation = { x: 0, y: 0, z: 0 }
  mesh.scale = { x: 1, y: 1, z: 1 }
}

/** Bake object-local rotation and scale into a resident kernel without changing its IDs. */
export function applyRotationAndScaleToEditableMesh(
  mesh: EditableMesh,
  rotation: Vector3D,
  objectScale: Vector3D,
): void {
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(rotation.x),
    THREE.MathUtils.degToRad(rotation.y),
    THREE.MathUtils.degToRad(rotation.z),
    'XYZ',
  )
  const quat = new THREE.Quaternion().setFromEuler(euler)
  const scale = new THREE.Vector3(objectScale.x, objectScale.y, objectScale.z)
  _matrix.compose(new THREE.Vector3(), quat, scale)
  const flipped = _matrix.determinant() < 0
  for (const vertex of mesh.vertices.values()) vertex.position.applyMatrix4(_matrix)
  if (flipped) for (const faceId of [...mesh.faces.keys()]) mesh.reverseFace(faceId)
  mesh.recalculateNormals()
}

function remapEdgeIds(ids: string[] | undefined, vertexIds: string[], map: Map<string, string>): string[] | undefined {
  if (!ids) return undefined
  return ids.flatMap(id => {
    const parsed = parseUndirectedEdgeId(id, vertexIds)
    if (!parsed) return []
    const a = map.get(parsed.v1)
    const b = map.get(parsed.v2)
    return a && b ? [undirectedEdgeId(a, b)] : []
  })
}

/**
 * Copy the source mesh's vertices onto this linked duplicate and drop the link.
 * Transform stays on the instance.
 */
export function makeUniqueMesh(
  mesh: MeshObject,
  lookup: (id: string) => MeshObject | undefined
): boolean {
  if (!mesh.instanceOf) return false
  const source = resolveInstanceMesh(mesh, lookup)
  const sourceVerts = source.vertices
  const map = new Map<string, string>()
  mesh.vertices = sourceVerts.map((vertex, index) => {
    const id = `v_${mesh.id}_u${index}`
    map.set(vertex.id, id)
    return {
      ...vertex,
      id,
      position: { ...vertex.position },
      ...(vertex.boneWeights ? { boneWeights: { ...vertex.boneWeights } } : {})
    }
  })
  mesh.faces = source.faces.map((face, index) => ({
    ...face,
    id: `f_${mesh.id}_u${index}`,
    vertexIds: face.vertexIds.map(id => map.get(id) || id),
    uvs: face.uvs?.map(uv => ({ ...uv })),
    ...(face.normal ? { normal: { ...face.normal } } : {})
  }))
  mesh.seamEdgeIds = remapEdgeIds(source.seamEdgeIds, sourceVerts.map(v => v.id), map)
  mesh.sharpEdgeIds = remapEdgeIds(source.sharpEdgeIds, sourceVerts.map(v => v.id), map)
  mesh.shadeMode = source.shadeMode
  mesh.autoSmoothAngle = source.autoSmoothAngle
  delete mesh.instanceOf
  return true
}

function worldBounds(mesh: MeshObject, lookup: (id: string) => MeshObject | undefined) {
  const geometry = resolveInstanceMesh(mesh, lookup)
  const matrix = meshObjectWorldMatrix(mesh)
  const min = { x: Infinity, y: Infinity, z: Infinity }
  const max = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const vertex of geometry.vertices) {
    _point.set(vertex.position.x, vertex.position.y, vertex.position.z).applyMatrix4(matrix)
    min.x = Math.min(min.x, _point.x); max.x = Math.max(max.x, _point.x)
    min.y = Math.min(min.y, _point.y); max.y = Math.max(max.y, _point.y)
    min.z = Math.min(min.z, _point.z); max.z = Math.max(max.z, _point.z)
  }
  if (!Number.isFinite(min.x)) {
    return { min: { ...mesh.position }, max: { ...mesh.position } }
  }
  return { min, max }
}

function feature(bounds: { min: Vector3D; max: Vector3D }, axis: AlignAxis, mode: AlignMode): number {
  if (mode === 'min') return bounds.min[axis]
  if (mode === 'max') return bounds.max[axis]
  return (bounds.min[axis] + bounds.max[axis]) / 2
}

/** Slide object origins so a bound (or the center, for the cursor) shares one world coordinate. */
export function alignObjects(
  meshes: MeshObject[],
  axis: AlignAxis,
  mode: AlignMode,
  cursor: Vector3D,
  lookup: (id: string) => MeshObject | undefined = () => undefined
): void {
  if (meshes.length === 0) return
  const bounds = meshes.map(mesh => worldBounds(mesh, lookup))
  const target = mode === 'cursor'
    ? cursor[axis]
    : mode === 'min'
      ? Math.min(...bounds.map(item => item.min[axis]))
      : mode === 'max'
        ? Math.max(...bounds.map(item => item.max[axis]))
        : bounds.reduce((sum, item) => sum + (item.min[axis] + item.max[axis]) / 2, 0) / bounds.length
  meshes.forEach((mesh, index) => {
    const current = feature(bounds[index], axis, mode === 'cursor' ? 'center' : mode)
    mesh.position[axis] += target - current
  })
}

/** Set every selected vertex to the selection's min, center, or max, or to one cursor coordinate. */
export function alignVertices(
  mesh: MeshObject,
  vertexIds: string[],
  axis: AlignAxis,
  mode: AlignMode,
  cursor: number
): void {
  const wanted = new Set(vertexIds)
  const vertices = mesh.vertices.filter(vertex => wanted.has(vertex.id))
  if (vertices.length === 0) return
  const values = vertices.map(vertex => vertex.position[axis])
  const target = mode === 'cursor'
    ? cursor
    : mode === 'min'
      ? Math.min(...values)
      : mode === 'max'
        ? Math.max(...values)
        : values.reduce((sum, value) => sum + value, 0) / values.length
  for (const vertex of vertices) vertex.position[axis] = target
}
