import { MeshObject, Face, Vector3D } from '../../types/mesh'
import { computeCentroid, computeFaceNormal, subVec3, lengthVec3, crossVec3, normalizeVec3, dotVec3 } from '../../utils/math'
import { MeshBridge } from '../mesh/MeshBridge'
import type { MeshBridgeData } from '../mesh/MeshRepository'
import { InsetKernel } from '../mesh/operations/InsetKernel'
import { ExtrudeKernel } from '../mesh/operations/ExtrudeKernel'
import { bevelEdges } from '../mesh/operations/EdgeBevelKernel'
import { MergeKernel } from '../mesh/operations/MergeKernel'
import { DissolveKernel } from '../mesh/operations/DissolveKernel'
import { MeshTopologyService } from '../mesh/MeshTopologyService'
import { TopologyOps } from '../mesh/operations/TopologyOps'
import { MeshEditOps, edgeChainsFromIds } from '../mesh/operations/MeshEditOps'
import { CircleLoop } from '../mesh/operations/CircleLoop'
import { Straighten, type StraightenDirection } from '../mesh/operations/Straighten'
import { BooleanKernel, type BooleanOp } from '../mesh/operations/BooleanKernel'
import { parseUndirectedEdgeId, getMeshEdges } from './EdgeUtils'
import { evaluateSubdivision } from './SubdivisionModifier'
import { surfaceTriangles } from './SurfaceGeometry'
import * as THREE from 'three'

export interface OperationResult {
  mesh: MeshObject
  selectedFaceIds: string[]
  selectedVertexIds: string[]
  selectedEdgeIds?: string[]
}

/**
 * Extrudes selected faces outward along their face normal,
 * creating connecting side quad faces and moving the front face outward.
 */
export function extrudeFaces(mesh: MeshObject, faceIds: string[], distance = 0.5): OperationResult {
  return extrudeSelection(mesh, { faceIds, distance })
}

export function extrudeSelection(
  mesh: MeshObject,
  options: {
    faceIds?: string[]
    edgeIds?: string[]
    vertexIds?: string[]
    distance?: number
    individual?: boolean
  },
  bridge: MeshBridgeData = MeshBridge.meshObjectToEditableMesh(mesh)
): OperationResult {
  const distance = options.distance ?? 0.5
  const faceIds = (options.faceIds ?? [])
    .map((id) => bridge.strToNumFaceId.get(id))
    .filter((id): id is number => id !== undefined)

  const edgeIds: number[] = []
  if (options.edgeIds?.length) {
    const docEdges = getMeshEdges(mesh)
    for (const key of options.edgeIds) {
      const de = docEdges.find((e) => e.id === key)
      if (!de) continue
      const a = bridge.strToNumVertId.get(de.v1)
      const b = bridge.strToNumVertId.get(de.v2)
      if (a == null || b == null) continue
      for (const ke of bridge.mesh.edges.values()) {
        if ((ke.v1 === a && ke.v2 === b) || (ke.v1 === b && ke.v2 === a)) {
          edgeIds.push(ke.id)
          break
        }
      }
    }
  }

  const vertexIds = (options.vertexIds ?? [])
    .map((id) => bridge.strToNumVertId.get(id))
    .filter((id): id is number => id !== undefined)

  const result = ExtrudeKernel.extrude(bridge.mesh, {
    individual: options.individual,
    faceIds,
    edgeIds,
    vertexIds,
  })
  const offset = result.regionNormal.clone().multiplyScalar(distance)
  for (const vid of result.newVertexIds) {
    bridge.mesh.vertices.get(vid)?.position.add(result.vertexNormals?.get(vid)?.clone().multiplyScalar(distance) ?? offset)
  }
  bridge.mesh.recalculateNormals()

  const out = MeshBridge.editableMeshToMeshObject(
    bridge.mesh,
    mesh,
    bridge.numToStrVertId,
    bridge.numToStrFaceId
  )
  return {
    mesh: out,
    selectedFaceIds: result.extrudedFaceIds.map(id => bridge.numToStrFaceId.get(id) || `f_${id}`),
    selectedVertexIds: result.newVertexIds.map(id => bridge.numToStrVertId.get(id) || `v_${id}`)
  }
}

/**
 * Insets selected faces (Blender region inset). Connected faces share one inner loop.
 * `thickness` is even edge offset in object space (not a scale-to-centroid factor).
 */
export function insetFaces(
  mesh: MeshObject,
  faceIds: string[],
  thickness = 0.1,
  options?: { individual?: boolean; depth?: number; outset?: boolean; boundary?: boolean },
  bridge: MeshBridgeData = MeshBridge.meshObjectToEditableMesh(mesh)
): OperationResult {
  if (faceIds.length === 0) {
    return { mesh, selectedFaceIds: faceIds, selectedVertexIds: [] }
  }

  const numFaces = faceIds
    .map(id => bridge.strToNumFaceId.get(id))
    .filter((id): id is number => id !== undefined)

  const result = InsetKernel.insetFaces(bridge.mesh, numFaces, {
    thickness: Math.max(0, thickness),
    depth: options?.depth ?? 0,
    outset: options?.outset,
    individual: options?.individual,
    boundary: options?.boundary
  })

  const out = MeshBridge.editableMeshToMeshObject(
    bridge.mesh,
    mesh,
    bridge.numToStrVertId,
    bridge.numToStrFaceId
  )

  const selectedFaceIds = result.insetFaceIds.map(id => bridge.numToStrFaceId.get(id) || `f_${id}`)
  const selectedVertexIds = result.insetVertexIds.map(id => bridge.numToStrVertId.get(id) || `v_${id}`)

  return { mesh: out, selectedFaceIds, selectedVertexIds }
}

export interface SubdivideOptions {
  cuts?: number
  smoothness?: number
  edgeIds?: string[]
}

/**
 * Blender Subdivide: shared edge verts, Number of Cuts, Smoothness.
 * Neighbor faces that inherit split verts are tessellated so the mesh stays manifold.
 */
export function subdivideFaces(
  mesh: MeshObject,
  faceIds: string[],
  options?: SubdivideOptions,
  bridge?: MeshBridgeData
): OperationResult {
  const edgeIds = options?.edgeIds ?? []
  if (faceIds.length === 0 && edgeIds.length === 0) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: [] }
  }

  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  const numFaces = faceIds
    .map(id => bridge.strToNumFaceId.get(id))
    .filter((id): id is number => id !== undefined)

  const extraEdgeIds: number[] = []
  if (edgeIds.length > 0) {
    const knownVerts = mesh.vertices.map(v => v.id)
    for (const id of edgeIds) {
      const parsed = parseUndirectedEdgeId(id, knownVerts)
      if (!parsed) continue
      const n1 = bridge.strToNumVertId.get(parsed.v1)
      const n2 = bridge.strToNumVertId.get(parsed.v2)
      if (n1 == null || n2 == null) continue
      const eId = DissolveKernel.findEdgeId(bridge.mesh, n1, n2)
      if (eId != null) extraEdgeIds.push(eId)
    }
  }

  const created = MeshTopologyService.subdivideFaces(bridge.mesh, numFaces, {
    cuts: options?.cuts,
    smoothness: options?.smoothness,
    extraEdgeIds
  })

  const out = MeshBridge.editableMeshToMeshObject(
    bridge.mesh,
    mesh,
    bridge.numToStrVertId,
    bridge.numToStrFaceId
  )
  return {
    mesh: out,
    selectedFaceIds: created.map(id => bridge.numToStrFaceId.get(id) || `f_${id}`),
    selectedVertexIds: out.vertices.filter(v => !mesh.vertices.some(old => old.id === v.id)).map(v => v.id),
    selectedEdgeIds: (() => {
      const born = new Set(out.vertices.filter(v => !mesh.vertices.some(old => old.id === v.id)).map(v => v.id))
      const ends = new Set(getMeshEdges(mesh).filter(e => edgeIds.includes(e.id)).flatMap(e => [e.v1, e.v2]))
      return getMeshEdges(out).filter(e => (born.has(e.v1) || ends.has(e.v1)) && (born.has(e.v2) || ends.has(e.v2))).map(e => e.id)
    })()
  }
}

/** One or more Catmull–Clark levels. Original vertices move, so the mesh rounds. */
export function catmullClarkSubdivide(
  mesh: MeshObject,
  level = 1,
  bridge?: MeshBridgeData
): OperationResult {
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  const steps = Math.max(1, Math.min(3, Math.round(level) || 1))
  const sub = evaluateSubdivision(mesh.vertices, mesh.faces, steps, 'catmull-clark')
  const next: MeshObject = { ...mesh, vertices: sub.vertices, faces: sub.faces }
  const rebuilt = MeshBridge.meshObjectToEditableMesh(next, bridge)
  bridge.mesh.restoreSnapshot(rebuilt.mesh.createSnapshot())
  replaceBridgeMaps(bridge, rebuilt)
  return { mesh: next, selectedFaceIds: [], selectedVertexIds: [] }
}

/** Move vertices toward a sphere centered on the selection. Factor 1 is fully spherical. */
export function spherizeVertices(
  mesh: MeshObject,
  vertexIds: string[],
  factor = 1,
  bridge?: MeshBridgeData
): OperationResult {
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  const ids = kernelVertIds(bridge, vertexIds)
  if (ids.length < 2) return { mesh, selectedFaceIds: [], selectedVertexIds: vertexIds }
  const center = new THREE.Vector3()
  for (const id of ids) center.add(bridge.mesh.vertices.get(id)!.position)
  center.multiplyScalar(1 / ids.length)
  MeshEditOps.toSphere(bridge.mesh, ids, factor, center)
  return projectEdit(mesh, bridge, [], ids)
}

export type SnapTarget = 'grid' | 'vertex' | 'edge' | 'face'

/** Move selected vertices onto the grid, or slide the whole selection to a vertex, edge center, or face. */
export function snapVertices(
  mesh: MeshObject,
  vertexIds: string[],
  mode: SnapTarget,
  gridSize = 0.1,
  bridge?: MeshBridgeData
): OperationResult {
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  const ids = kernelVertIds(bridge, vertexIds)
  const selected = new Set(ids)
  if (selected.size === 0) return { mesh, selectedFaceIds: [], selectedVertexIds: vertexIds }
  const live = [...selected].map(id => bridge.mesh.vertices.get(id)).filter((v): v is NonNullable<typeof v> => !!v)
  if (mode === 'grid') {
    const step = Number.isFinite(gridSize) && gridSize > 0 ? gridSize : 0.1
    for (const vertex of live) {
      vertex.position.x = Math.round(vertex.position.x / step) * step
      vertex.position.y = Math.round(vertex.position.y / step) * step
      vertex.position.z = Math.round(vertex.position.z / step) * step
    }
    bridge.mesh.recalculateNormals()
    return projectEdit(mesh, bridge, [], ids)
  }

  const centroid = new THREE.Vector3()
  for (const vertex of live) centroid.add(vertex.position)
  centroid.multiplyScalar(1 / live.length)
  const target = mode === 'vertex'
    ? nearestVertex(bridge.mesh, centroid, selected)
    : mode === 'edge'
      ? nearestEdgeCenter(bridge.mesh, centroid, selected)
      : nearestFacePoint(bridge.mesh, centroid, selected)
  if (!target) return { mesh, selectedFaceIds: [], selectedVertexIds: vertexIds }
  const delta = target.sub(centroid)
  for (const vertex of live) vertex.position.add(delta)
  bridge.mesh.recalculateNormals()
  return projectEdit(mesh, bridge, [], ids)
}

function nearestVertex(mesh: import('../mesh/MeshKernel').EditableMesh, point: THREE.Vector3, skip: Set<number>): THREE.Vector3 | null {
  let best: THREE.Vector3 | null = null
  let bestD = Infinity
  for (const vertex of mesh.vertices.values()) {
    if (skip.has(vertex.id)) continue
    const d = vertex.position.distanceToSquared(point)
    if (d < bestD) {
      bestD = d
      best = vertex.position.clone()
    }
  }
  return best
}

function nearestEdgeCenter(mesh: import('../mesh/MeshKernel').EditableMesh, point: THREE.Vector3, skip: Set<number>): THREE.Vector3 | null {
  let best: THREE.Vector3 | null = null
  let bestD = Infinity
  for (const edge of mesh.edges.values()) {
    if (skip.has(edge.v1) && skip.has(edge.v2)) continue
    const a = mesh.vertices.get(edge.v1)?.position
    const b = mesh.vertices.get(edge.v2)?.position
    if (!a || !b) continue
    const mid = a.clone().add(b).multiplyScalar(0.5)
    const d = mid.distanceToSquared(point)
    if (d < bestD) {
      bestD = d
      best = mid
    }
  }
  return best
}

function nearestFacePoint(mesh: import('../mesh/MeshKernel').EditableMesh, point: THREE.Vector3, skip: Set<number>): THREE.Vector3 | null {
  let best: THREE.Vector3 | null = null
  let bestD = Infinity
  for (const face of mesh.faces.values()) {
    if (face.vertexIds.every(id => skip.has(id))) continue
    const points = face.vertexIds.map(id => mesh.vertices.get(id)?.position).filter((p): p is THREE.Vector3 => !!p)
    if (points.length < 3) continue
    for (const tri of surfaceTriangles(points)) {
      const hit = closestPointOnTriangle(point, points[tri[0]], points[tri[1]], points[tri[2]])
      const d = hit.distanceToSquared(point)
      if (d < bestD) {
        bestD = d
        best = hit
      }
    }
  }
  return best
}

function closestPointOnTriangle(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): THREE.Vector3 {
  const ab = b.clone().sub(a)
  const ac = c.clone().sub(a)
  const ap = p.clone().sub(a)
  const d1 = ab.dot(ap)
  const d2 = ac.dot(ap)
  if (d1 <= 0 && d2 <= 0) return a.clone()
  const bp = p.clone().sub(b)
  const d3 = ab.dot(bp)
  const d4 = ac.dot(bp)
  if (d3 >= 0 && d4 <= d3) return b.clone()
  const vc = d1 * d4 - d3 * d2
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return a.clone().addScaledVector(ab, d1 / (d1 - d3))
  const cp = p.clone().sub(c)
  const d5 = ab.dot(cp)
  const d6 = ac.dot(cp)
  if (d6 >= 0 && d5 <= d6) return c.clone()
  const vb = d5 * d2 - d1 * d6
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return a.clone().addScaledVector(ac, d2 / (d2 - d6))
  const va = d3 * d6 - d5 * d4
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    return b.clone().addScaledVector(c.clone().sub(b), (d4 - d3) / ((d4 - d3) + (d5 - d6)))
  }
  const denom = 1 / (va + vb + vc)
  return a.clone().addScaledVector(ab, vb * denom).addScaledVector(ac, vc * denom)
}

function replaceBridgeMaps(target: MeshBridgeData, source: MeshBridgeData) {
  target.strToNumVertId.clear()
  target.numToStrVertId.clear()
  target.strToNumFaceId.clear()
  target.numToStrFaceId.clear()
  for (const [num, str] of source.numToStrVertId) {
    target.numToStrVertId.set(num, str)
    target.strToNumVertId.set(str, num)
  }
  for (const [num, str] of source.numToStrFaceId) {
    target.numToStrFaceId.set(num, str)
    target.strToNumFaceId.set(str, num)
  }
}

/** Blender Poke Faces: insert a centroid and fan triangles. */
export function pokeFaces(mesh: MeshObject, faceIds: string[], bridge?: MeshBridgeData): OperationResult {
  if (faceIds.length === 0) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: [] }
  }
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  const nums = faceIds
    .map(id => bridge.strToNumFaceId.get(id))
    .filter((id): id is number => id !== undefined)
  const created = MeshTopologyService.pokeFaces(bridge.mesh, nums)
  return {
    mesh: MeshBridge.editableMeshToMeshObject(
      bridge.mesh,
      mesh,
      bridge.numToStrVertId,
      bridge.numToStrFaceId
    ),
    selectedFaceIds: created.map(id => bridge.numToStrFaceId.get(id) || `f_${id}`),
    selectedVertexIds: []
  }
}

/** Split selected quads into two triangles (shortest diagonal). */
export function triangulateFaces(mesh: MeshObject, faceIds: string[], bridge?: MeshBridgeData): OperationResult {
  if (faceIds.length === 0) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: [] }
  }
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  const nums = faceIds
    .map(id => bridge.strToNumFaceId.get(id))
    .filter((id): id is number => id !== undefined)
  const created = MeshTopologyService.triangulateFaces(bridge.mesh, nums)
  return {
    mesh: MeshBridge.editableMeshToMeshObject(
      bridge.mesh,
      mesh,
      bridge.numToStrVertId,
      bridge.numToStrFaceId
    ),
    selectedFaceIds: created.map(id => bridge.numToStrFaceId.get(id) || `f_${id}`),
    selectedVertexIds: []
  }
}

/**
 * Merges selected vertices into a single vertex at their midpoint.
 */
export function mergeVertices(mesh: MeshObject, vertexIds: string[], bridge?: MeshBridgeData): OperationResult {
  return mergeVerticesAdvanced(mesh, vertexIds, 'center', 0.05, bridge)
}

/**
 * Flips the normal/winding order of selected faces.
 */
export function flipNormals(mesh: MeshObject, faceIds: string[], bridge?: MeshBridgeData): OperationResult {
  if (faceIds.length === 0) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: [] }
  }
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  const nums = faceIds
    .map(id => bridge.strToNumFaceId.get(id))
    .filter((id): id is number => id !== undefined)
  MeshTopologyService.flipNormals(bridge.mesh, nums)
  return {
    mesh: MeshBridge.editableMeshToMeshObject(
      bridge.mesh,
      mesh,
      bridge.numToStrVertId,
      bridge.numToStrFaceId
    ),
    selectedFaceIds: faceIds,
    selectedVertexIds: []
  }
}

/**
 * Deletes selected faces or vertices cleanly.
 */
export function deleteElements(mesh: MeshObject, mode: 'vertex' | 'edge' | 'face', selectedIds: string[], bridge?: MeshBridgeData): OperationResult {
  if (selectedIds.length === 0) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: [] }
  }

  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  if (mode === 'face') {
    const nums = selectedIds
      .map(id => bridge.strToNumFaceId.get(id))
      .filter((id): id is number => id !== undefined)
    MeshTopologyService.deleteFaces(bridge.mesh, nums)
  } else if (mode === 'vertex') {
    const nums = selectedIds
      .map(id => bridge.strToNumVertId.get(id))
      .filter((id): id is number => id !== undefined)
    MeshTopologyService.deleteVertices(bridge.mesh, nums)
  } else {
    const knownVerts = mesh.vertices.map(v => v.id)
    const edgeNums: number[] = []
    for (const id of selectedIds) {
      const parsed = parseUndirectedEdgeId(id, knownVerts)
      if (!parsed) continue
      const n1 = bridge.strToNumVertId.get(parsed.v1)
      const n2 = bridge.strToNumVertId.get(parsed.v2)
      if (n1 == null || n2 == null) continue
      const eId = DissolveKernel.findEdgeId(bridge.mesh, n1, n2)
      if (eId != null) edgeNums.push(eId)
    }
    MeshTopologyService.deleteEdges(bridge.mesh, edgeNums)
  }

  return {
    mesh: MeshBridge.editableMeshToMeshObject(
      bridge.mesh,
      mesh,
      bridge.numToStrVertId,
      bridge.numToStrFaceId
    ),
    selectedFaceIds: [],
    selectedVertexIds: []
  }
}

/**
 * Bevels / Chamfers selected faces with an offset distance.
 */
export function bevelFaces(mesh: MeshObject, faceIds: string[], offset = 0.2, edgeIds: string[] = [], bridge?: MeshBridgeData): OperationResult {
  if (faceIds.length === 0 && edgeIds.length === 0) {
    return { mesh, selectedFaceIds: faceIds, selectedVertexIds: [] }
  }

  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  const numFaces = faceIds
    .map(id => bridge.strToNumFaceId.get(id))
    .filter((id): id is number => id !== undefined)
  if (numFaces.length === 0 && edgeIds.length === 0) {
    return { mesh, selectedFaceIds: faceIds, selectedVertexIds: [] }
  }

  const selectedEdges = edgeIds.length ? getMeshEdges(mesh).filter(e => edgeIds.includes(e.id)).flatMap(e => {
    const a = bridge.strToNumVertId.get(e.v1), b = bridge.strToNumVertId.get(e.v2)
    if (a === undefined || b === undefined) return []
    const id = DissolveKernel.findEdgeId(bridge.mesh, a, b)
    return id === null ? [] : [id]
  }) : [...new Set(numFaces.flatMap(id => bridge.mesh.faces.get(id)?.edgeIds ?? []))]
  const result = bevelEdges(bridge.mesh, selectedEdges, {
    width: offset,
    segments: 1,
    clampOverlap: true
  })
  const out = MeshBridge.editableMeshToMeshObject(
    bridge.mesh,
    mesh,
    bridge.numToStrVertId,
    bridge.numToStrFaceId
  )
  return {
    mesh: out,
    selectedFaceIds: result.beveledFaceIds.map(id => bridge.numToStrFaceId.get(id) || `f_${id}`),
    selectedVertexIds: result.beveledVertexIds.map(id => bridge.numToStrVertId.get(id) || `v_${id}`)
  }
}

export type MergeMode = 'center' | 'first' | 'last' | 'distance' | 'cursor' | 'vertex'

/**
 * Merge vertices at their center, the first or last selected vertex, the 3D
 * cursor, a chosen vertex, or by distance (weld).
 */
export function mergeVerticesAdvanced(
  mesh: MeshObject,
  vertexIds: string[],
  type: MergeMode = 'center',
  threshold = 0.05,
  bridge?: MeshBridgeData,
  target?: { position?: { x: number; y: number; z: number }; keepId?: string }
): OperationResult {
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)

  if (type === 'distance') {
    const only = vertexIds
      .map(id => bridge.strToNumVertId.get(id))
      .filter((id): id is number => id !== undefined)
    const welded = MergeKernel.mergeByDistance(
      bridge.mesh,
      threshold,
      vertexIds.length > 0 ? only : undefined
    )
    const out = MeshBridge.editableMeshToMeshObject(
      bridge.mesh,
      mesh,
      bridge.numToStrVertId,
      bridge.numToStrFaceId
    )
    return {
      mesh: out,
      selectedFaceIds: [],
      selectedVertexIds: welded > 0 ? [] : vertexIds
    }
  }

  if (vertexIds.length < 2) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: vertexIds }
  }

  const selectedVerts = [...new Set(vertexIds)].map(id => mesh.vertices.find(v => v.id === id)).filter((v): v is NonNullable<typeof v> => !!v)
  if (selectedVerts.length === 0) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: [] }
  }

  let targetPos = selectedVerts[0].position
  let keepId = vertexIds[0]
  if (type === 'center') {
    targetPos = computeCentroid(selectedVerts.map(v => v.position))
  } else if (type === 'first') {
    targetPos = { ...selectedVerts[0].position }
    keepId = selectedVerts[0].id
  } else if (type === 'last') {
    const last = selectedVerts[selectedVerts.length - 1]
    targetPos = { ...last.position }
    keepId = last.id
  } else if (type === 'cursor' || type === 'vertex') {
    const pos = target?.position
    if (!pos || ![pos.x, pos.y, pos.z].every(Number.isFinite)) {
      return { mesh, selectedFaceIds: [], selectedVertexIds: vertexIds }
    }
    targetPos = { x: pos.x, y: pos.y, z: pos.z }
    if (type === 'vertex' && target?.keepId) {
      const kept = selectedVerts.find(v => v.id === target.keepId) ?? mesh.vertices.find(v => v.id === target.keepId)
      if (!kept) return { mesh, selectedFaceIds: [], selectedVertexIds: vertexIds }
      keepId = kept.id
    }
  }

  const numIds = vertexIds
    .map(id => bridge.strToNumVertId.get(id))
    .filter((id): id is number => id !== undefined)
  const keepNum = bridge.strToNumVertId.get(keepId)
  if (!keepNum || numIds.length < 2) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: vertexIds }
  }

  MergeKernel.mergeVertices(
    bridge.mesh,
    numIds,
    new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z),
    keepNum
  )
  const out = MeshBridge.editableMeshToMeshObject(
    bridge.mesh,
    mesh,
    bridge.numToStrVertId,
    bridge.numToStrFaceId
  )
  return {
    mesh: out,
    selectedFaceIds: [],
    selectedVertexIds: [keepId]
  }
}

/**
 * Walk selected vertices along existing mesh edges into a closed loop.
 * Falls back to a planar angular sort if the verts are not a connected chain.
 */
function orderFillLoop(mesh: MeshObject, vertexIds: string[]): string[] {
  const want = new Set(vertexIds)
  const adj = new Map<string, Set<string>>()
  const link = (a: string, b: string) => {
    if (!want.has(a) || !want.has(b) || a === b) return
    if (!adj.has(a)) adj.set(a, new Set())
    if (!adj.has(b)) adj.set(b, new Set())
    adj.get(a)!.add(b)
    adj.get(b)!.add(a)
  }
  for (const face of mesh.faces) {
    const ids = face.vertexIds
    for (let i = 0; i < ids.length; i++) {
      link(ids[i], ids[(i + 1) % ids.length])
    }
  }

  const start =
    vertexIds.find(id => (adj.get(id)?.size ?? 0) === 1) ||
    vertexIds.find(id => (adj.get(id)?.size ?? 0) > 0) ||
    vertexIds[0]
  const loop: string[] = [start]
  const used = new Set([start])
  let prev = ''
  let cur = start
  while (loop.length < vertexIds.length) {
    const nbrs = [...(adj.get(cur) || [])].filter(n => n !== prev)
    const next = nbrs.find(n => !used.has(n))
    if (!next) break
    loop.push(next)
    used.add(next)
    prev = cur
    cur = next
  }

  if (loop.length >= 3 && loop.length === vertexIds.length) return loop

  const vertMap = new Map(mesh.vertices.map(v => [v.id, v]))
  const pts = vertexIds.map(id => vertMap.get(id)?.position).filter(Boolean) as Vector3D[]
  if (pts.length < 3) return vertexIds
  const nrm = computeFaceNormal(pts)
  const c = computeCentroid(pts)
  const ref = subVec3(pts[0], c)
  let u = ref
  if (lengthVec3(u) < 1e-8) u = { x: 1, y: 0, z: 0 }
  u = normalizeVec3(u)
  let v = crossVec3(nrm, u)
  if (lengthVec3(v) < 1e-8) {
    u = { x: 0, y: 1, z: 0 }
    v = crossVec3(nrm, u)
  }
  v = normalizeVec3(v)
  const ranked = vertexIds
    .map(id => {
      const p = vertMap.get(id)?.position
      if (!p) return { id, ang: 0 }
      const d = subVec3(p, c)
      return { id, ang: Math.atan2(dotVec3(d, v), dotVec3(d, u)) }
    })
    .sort((a, b) => a.ang - b.ang)
  return ranked.map(r => r.id)
}

function faceHasDirectedEdge(face: Face, a: string, b: string): boolean {
  const ids = face.vertexIds
  const n = ids.length
  for (let i = 0; i < n; i++) {
    if (ids[i] === a && ids[(i + 1) % n] === b) return true
  }
  return false
}

/**
 * CCW winding matches outward neighbors: shared edges must run opposite
 * the existing face. If there are no neighbors, point away from the mesh center.
 */
function orientFillLoop(mesh: MeshObject, loop: string[], viewDirection?: Vector3D): string[] {
  const ordered = [...loop]
  let sameDir = 0
  let oppositeDir = 0
  const n = ordered.length
  for (let i = 0; i < n; i++) {
    const a = ordered[i]
    const b = ordered[(i + 1) % n]
    for (const face of mesh.faces) {
      if (faceHasDirectedEdge(face, a, b)) sameDir++
      if (faceHasDirectedEdge(face, b, a)) oppositeDir++
    }
  }
  if (sameDir + oppositeDir > 0) {
    if (sameDir > oppositeDir) ordered.reverse()
    return ordered
  }

  const vertMap = new Map(mesh.vertices.map(v => [v.id, v]))
  const pts = ordered.map(id => vertMap.get(id)?.position).filter(Boolean) as Vector3D[]
  if (pts.length < 3) return ordered
  const faceN = computeFaceNormal(pts)

  // Blockbench: if the new face looks away from the camera, invert it.
  if (viewDirection && lengthVec3(viewDirection) > 1e-8) {
    if (dotVec3(faceN, viewDirection) > 0) ordered.reverse()
    return ordered
  }

  const faceC = computeCentroid(pts)
  const meshC = computeCentroid(mesh.vertices.map(v => v.position))
  const outward = subVec3(faceC, meshC)
  if (lengthVec3(outward) > 1e-8 && dotVec3(faceN, outward) < 0) {
    ordered.reverse()
  }
  return ordered
}

/**
 * Creates a new polygon face from selected vertices (Blender 'F' key).
 */
export function fillFaceFromVertices(
  mesh: MeshObject,
  vertexIds: string[],
  viewDirection?: Vector3D,
  bridge?: MeshBridgeData
): OperationResult {
  if (vertexIds.length < 3) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: vertexIds }
  }

  const unique = [...new Set(vertexIds)]
  if (unique.length < 3) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: vertexIds }
  }

  const loop = orientFillLoop(mesh, orderFillLoop(mesh, unique), viewDirection)
  const vertMap = new Map(mesh.vertices.map(v => [v.id, v]))
  const pts = loop.map(id => vertMap.get(id)?.position).filter(Boolean) as Vector3D[]
  if (pts.length < 3) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: vertexIds }
  }

  const normal = computeFaceNormal(pts)
  let materialIndex = 0
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]
    const b = loop[(i + 1) % loop.length]
    const neighbor = mesh.faces.find(f => faceHasDirectedEdge(f, b, a) || faceHasDirectedEdge(f, a, b))
    if (neighbor) {
      materialIndex = neighbor.materialIndex
      break
    }
  }

  const uAxis = normalizeVec3(subVec3(pts[1], pts[0]))
  const vAxis = normalizeVec3(crossVec3(normal, uAxis))
  const origin = pts[0]
  const uvs = pts.map(p => {
    const d = subVec3(p, origin)
    return new THREE.Vector2(dotVec3(d, uAxis), dotVec3(d, vAxis))
  })

  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  const nums = loop
    .map(id => bridge.strToNumVertId.get(id))
    .filter((id): id is number => id !== undefined)
  const newNumId = MeshTopologyService.fillBoundary(bridge.mesh, nums, uvs)
  if (newNumId == null) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: loop }
  }
  const filled = bridge.mesh.faces.get(newNumId)
  if (filled) filled.materialIndex = materialIndex

  const out = MeshBridge.editableMeshToMeshObject(
    bridge.mesh,
    mesh,
    bridge.numToStrVertId,
    bridge.numToStrFaceId
  )
  const newFaceId = bridge.numToStrFaceId.get(newNumId) || `f_${newNumId}`
  return {
    mesh: out,
    selectedFaceIds: [newFaceId],
    selectedVertexIds: loop
  }
}

/**
 * Flattens selected vertices on X, Y, or Z axis to their common average coordinate.
 */
export function flattenVerticesOnAxis(mesh: MeshObject, vertexIds: string[], axis: 'x' | 'y' | 'z', bridge?: MeshBridgeData): OperationResult {
  if (vertexIds.length === 0) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: [] }
  }
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  const nums = vertexIds
    .map(id => bridge.strToNumVertId.get(id))
    .filter((id): id is number => id !== undefined)
  MeshTopologyService.flattenVertices(bridge.mesh, nums, axis)
  return {
    mesh: MeshBridge.editableMeshToMeshObject(
      bridge.mesh,
      mesh,
      bridge.numToStrVertId,
      bridge.numToStrFaceId
    ),
    selectedFaceIds: [],
    selectedVertexIds: vertexIds
  }
}

/**
 * Dissolves selected edges or vertices without removing surrounding geometry.
 */
export function dissolveElements(mesh: MeshObject, mode: 'vertex' | 'edge' | 'face', targetIds: string[], bridge?: MeshBridgeData): OperationResult {
  if (targetIds.length === 0) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: [] }
  }

  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  if (mode === 'vertex') {
    for (const id of targetIds) {
      const num = bridge.strToNumVertId.get(id)
      if (num != null) MeshTopologyService.dissolveVertex(bridge.mesh, num)
    }
  } else if (mode === 'face') {
    const nums = targetIds
      .map(id => bridge.strToNumFaceId.get(id))
      .filter((id): id is number => id !== undefined)
    MeshEditOps.dissolveFaces(bridge.mesh, nums)
  } else {
    const knownVerts = mesh.vertices.map(v => v.id)
    for (const edgeId of targetIds) {
      const parsed = parseUndirectedEdgeId(edgeId, knownVerts)
      if (!parsed) continue
      const n1 = bridge.strToNumVertId.get(parsed.v1)
      const n2 = bridge.strToNumVertId.get(parsed.v2)
      if (n1 == null || n2 == null) continue
      const kernelEdge = DissolveKernel.findEdgeId(bridge.mesh, n1, n2)
      if (kernelEdge != null) DissolveKernel.dissolveEdge(bridge.mesh, kernelEdge)
    }
  }

  return {
    mesh: MeshBridge.editableMeshToMeshObject(
      bridge.mesh,
      mesh,
      bridge.numToStrVertId,
      bridge.numToStrFaceId
    ),
    selectedFaceIds: [],
    selectedVertexIds: []
  }
}

/**
 * Connects two selected vertices on a shared face, dividing it into two faces.
 */
export function connectTwoVertices(mesh: MeshObject, vAId: string, vBId: string, bridge?: MeshBridgeData): OperationResult {
  const targetFace = mesh.faces.find(f => f.vertexIds.includes(vAId) && f.vertexIds.includes(vBId))
  if (!targetFace || targetFace.vertexIds.length < 4) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: [vAId, vBId] }
  }

  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  const nA = bridge.strToNumVertId.get(vAId)
  const nB = bridge.strToNumVertId.get(vBId)
  const nFace = bridge.strToNumFaceId.get(targetFace.id)
  if (nA == null || nB == null || nFace == null) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: [vAId, vBId] }
  }

  const split = TopologyOps.splitFace(bridge.mesh, nFace, nA, nB)
  if (!split) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: [vAId, vBId] }
  }

  return {
    mesh: MeshBridge.editableMeshToMeshObject(
      bridge.mesh,
      mesh,
      bridge.numToStrVertId,
      bridge.numToStrFaceId
    ),
    selectedFaceIds: [
      bridge.numToStrFaceId.get(split.face1.id) || `f_${split.face1.id}`,
      bridge.numToStrFaceId.get(split.face2.id) || `f_${split.face2.id}`
    ],
    selectedVertexIds: [vAId, vBId]
  }
}

/**
 * Safe cleanup of mesh: removes degenerate faces (<3 verts), orphan vertices, updates normals.
 */
export function cleanupMeshGeometry(mesh: MeshObject, bridge?: MeshBridgeData): OperationResult {
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  MeshTopologyService.cleanupMesh(bridge.mesh)
  return {
    mesh: MeshBridge.editableMeshToMeshObject(
      bridge.mesh,
      mesh,
      bridge.numToStrVertId,
      bridge.numToStrFaceId
    ),
    selectedFaceIds: [],
    selectedVertexIds: []
  }
}

/**
 * Bridges two opposing edge loops or two selected edges with connecting quad faces (Blender Bridge Edge Loops).
 */
export function bridgeEdgeLoops(mesh: MeshObject, selectedEdgeIds: string[], bridge?: MeshBridgeData): OperationResult {
  if (selectedEdgeIds.length < 2) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: [] }
  }

  return bridgeEdgeLoopsAdvanced(mesh, selectedEdgeIds, 1, 0, bridge)
}

/**
 * Generates an internal quad grid inside a closed boundary loop (Blender Grid Fill).
 */
export function gridFill(mesh: MeshObject, boundaryVertexIds: string[], bridge?: MeshBridgeData): OperationResult {
  if (boundaryVertexIds.length < 4 || boundaryVertexIds.length % 2 !== 0) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: boundaryVertexIds }
  }

  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  const nums = boundaryVertexIds
    .map(id => bridge.strToNumVertId.get(id))
    .filter((id): id is number => id !== undefined)
  const created = MeshTopologyService.gridFillBoundary(bridge.mesh, nums)

  return {
    mesh: MeshBridge.editableMeshToMeshObject(
      bridge.mesh,
      mesh,
      bridge.numToStrVertId,
      bridge.numToStrFaceId
    ),
    selectedFaceIds: created.map(id => bridge.numToStrFaceId.get(id) || `f_${id}`),
    selectedVertexIds: boundaryVertexIds.length === 4 ? boundaryVertexIds : []
  }
}

function projectSeamResult(mesh: MeshObject, bridge: MeshBridgeData): OperationResult {
  return {
    mesh: MeshBridge.editableMeshToMeshObject(
      bridge.mesh,
      mesh,
      bridge.numToStrVertId,
      bridge.numToStrFaceId
    ),
    selectedFaceIds: [],
    selectedVertexIds: [],
  }
}

function kernelEdgeForDocumentId(mesh: MeshObject, bridge: MeshBridgeData, edgeId: string) {
  const parsed = parseUndirectedEdgeId(edgeId, mesh.vertices.map(v => v.id))
  if (!parsed) return undefined
  const n1 = bridge.strToNumVertId.get(parsed.v1)
  const n2 = bridge.strToNumVertId.get(parsed.v2)
  if (n1 == null || n2 == null) return undefined
  return bridge.mesh.findEdge(n1, n2)
}

/** Mark or clear `edge.seam` on the kernel. Document `seamEdgeIds` come from the projection. */
export function setSeamEdges(
  mesh: MeshObject,
  edgeIds: string[],
  seam: boolean,
  bridge?: MeshBridgeData
): OperationResult {
  if (edgeIds.length === 0) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: [] }
  }
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  for (const id of edgeIds) {
    const edge = kernelEdgeForDocumentId(mesh, bridge, id)
    if (edge) edge.seam = seam
  }
  return projectSeamResult(mesh, bridge)
}

export function clearAllSeamEdges(mesh: MeshObject, bridge?: MeshBridgeData): OperationResult {
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  for (const edge of bridge.mesh.edges.values()) {
    if (edge.seam) edge.seam = false
  }
  return projectSeamResult(mesh, bridge)
}

/** Mark or clear `edge.sharp`. Document `sharpEdgeIds` come from the projection. */
export function setSharpEdges(
  mesh: MeshObject,
  edgeIds: string[],
  sharp: boolean,
  bridge?: MeshBridgeData
): OperationResult {
  if (edgeIds.length === 0) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: [] }
  }
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  for (const id of edgeIds) {
    const edge = kernelEdgeForDocumentId(mesh, bridge, id)
    if (edge) edge.sharp = sharp
  }
  return projectSeamResult(mesh, bridge)
}

function projectEdit(
  mesh: MeshObject,
  bridge: MeshBridgeData,
  faceIds: number[] = [],
  vertexIds: number[] = []
): OperationResult {
  return {
    mesh: MeshBridge.editableMeshToMeshObject(bridge.mesh, mesh, bridge.numToStrVertId, bridge.numToStrFaceId),
    selectedFaceIds: faceIds.map(id => bridge.numToStrFaceId.get(id) || `f_${id}`),
    selectedVertexIds: vertexIds.map(id => bridge.numToStrVertId.get(id) || `v_${id}`)
  }
}

function kernelEdgeIds(mesh: MeshObject, bridge: MeshBridgeData, edgeIds: string[]): number[] {
  const known = mesh.vertices.map(v => v.id)
  const out: number[] = []
  for (const id of edgeIds) {
    const parsed = parseUndirectedEdgeId(id, known)
    if (!parsed) continue
    const a = bridge.strToNumVertId.get(parsed.v1)
    const b = bridge.strToNumVertId.get(parsed.v2)
    if (a == null || b == null) continue
    const edge = bridge.mesh.findEdge(a, b)
    if (edge) out.push(edge.id)
  }
  return out
}

function kernelVertIds(bridge: MeshBridgeData, ids: string[]): number[] {
  return ids.map(id => bridge.strToNumVertId.get(id)).filter((id): id is number => id !== undefined)
}

function kernelFaceIds(bridge: MeshBridgeData, ids: string[]): number[] {
  return ids.map(id => bridge.strToNumFaceId.get(id)).filter((id): id is number => id !== undefined)
}

export function flipEdges(mesh: MeshObject, edgeIds: string[], bridge?: MeshBridgeData): OperationResult {
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  MeshEditOps.flipEdges(bridge.mesh, kernelEdgeIds(mesh, bridge, edgeIds))
  return projectEdit(mesh, bridge)
}

export function recalculateOutside(mesh: MeshObject, bridge?: MeshBridgeData): OperationResult {
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  MeshEditOps.recalculateOutside(bridge.mesh)
  return projectEdit(mesh, bridge)
}

export function connectVertexPath(mesh: MeshObject, vertexIds: string[], bridge?: MeshBridgeData): OperationResult {
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  const nums = kernelVertIds(bridge, vertexIds)
  if (nums.length === 2) return connectTwoVertices(mesh, vertexIds[0], vertexIds[1], bridge)
  MeshEditOps.connectVertexPath(bridge.mesh, nums)
  return projectEdit(mesh, bridge, [], nums)
}

export function trisToQuads(mesh: MeshObject, faceIds: string[], bridge?: MeshBridgeData): OperationResult {
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  MeshEditOps.trisToQuads(bridge.mesh, faceIds.length ? kernelFaceIds(bridge, faceIds) : undefined)
  return projectEdit(mesh, bridge)
}

export function makePlanarFaces(mesh: MeshObject, faceIds: string[], vertexIds: string[] = [], bridge?: MeshBridgeData): OperationResult {
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  const faces = kernelFaceIds(bridge, faceIds)
  if (faces.length) MeshEditOps.makePlanarFaces(bridge.mesh, faces)
  else {
    const verts = new Set(kernelVertIds(bridge, vertexIds))
    const ids = verts.size
      ? [...bridge.mesh.faces.values()].filter(f => f.vertexIds.every(id => verts.has(id))).map(f => f.id)
      : [...bridge.mesh.faces.keys()]
    MeshEditOps.makePlanarFaces(bridge.mesh, ids)
  }
  return projectEdit(mesh, bridge)
}

export function fillHoles(mesh: MeshObject, bridge?: MeshBridgeData): OperationResult {
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  const created = MeshEditOps.fillHoles(bridge.mesh)
  return projectEdit(mesh, bridge, created)
}

export function limitedDissolve(mesh: MeshObject, angleDeg = 5, bridge?: MeshBridgeData): OperationResult {
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  MeshEditOps.limitedDissolve(bridge.mesh, angleDeg)
  return projectEdit(mesh, bridge)
}

export function deleteOnlyFaces(mesh: MeshObject, faceIds: string[], bridge?: MeshBridgeData): OperationResult {
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  MeshEditOps.deleteOnlyFaces(bridge.mesh, kernelFaceIds(bridge, faceIds))
  return projectEdit(mesh, bridge)
}

export function deleteOnlyEdges(mesh: MeshObject, edgeIds: string[], bridge?: MeshBridgeData): OperationResult {
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  MeshEditOps.deleteOnlyEdges(bridge.mesh, kernelEdgeIds(mesh, bridge, edgeIds))
  return projectEdit(mesh, bridge)
}

export function ripEdges(mesh: MeshObject, edgeIds: string[], fill = false, bridge?: MeshBridgeData): OperationResult {
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  const ids = kernelEdgeIds(mesh, bridge, edgeIds)
  const verts = fill ? MeshEditOps.ripFill(bridge.mesh, ids) : MeshEditOps.ripEdges(bridge.mesh, ids)
  return projectEdit(mesh, bridge, [], verts)
}

export function splitSelectedFaces(mesh: MeshObject, faceIds: string[], bridge?: MeshBridgeData): OperationResult {
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  const verts = MeshEditOps.splitFaces(bridge.mesh, kernelFaceIds(bridge, faceIds))
  return projectEdit(mesh, bridge, kernelFaceIds(bridge, faceIds), verts)
}

export function knifeProjectOnMesh(
  mesh: MeshObject,
  polylines: { x: number; y: number; z: number }[][],
  bridge?: MeshBridgeData
): OperationResult {
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  MeshEditOps.knifeProject(bridge.mesh, polylines.map(line => line.map(p => new THREE.Vector3(p.x, p.y, p.z))))
  return projectEdit(mesh, bridge)
}

export function vertexBevel(
  mesh: MeshObject,
  vertexIds: string[],
  width = 0.1,
  bridge?: MeshBridgeData,
  segments = 1
): OperationResult {
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  MeshEditOps.vertexBevel(bridge.mesh, kernelVertIds(bridge, vertexIds), width, Math.max(1, Math.round(segments) || 1))
  return projectEdit(mesh, bridge)
}

/** Insert a vertex at factor `t` along each selected edge and split the adjacent faces. */
export function splitEdges(
  mesh: MeshObject,
  edgeIds: string[],
  t = 0.5,
  bridge?: MeshBridgeData
): OperationResult {
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  const factor = Number.isFinite(t) ? Math.min(0.99, Math.max(0.01, t)) : 0.5
  const created: number[] = []
  for (const edgeId of kernelEdgeIds(mesh, bridge, edgeIds)) {
    const live = bridge.mesh.edges.get(edgeId)
    if (!live) continue
    const result = TopologyOps.splitEdge(bridge.mesh, live.id, factor)
    if (result) created.push(result.newVertexId)
  }
  return projectEdit(mesh, bridge, [], created)
}

export function bridgeEdgeLoopsAdvanced(
  mesh: MeshObject,
  selectedEdgeIds: string[],
  segments = 1,
  twist = 0,
  bridge?: MeshBridgeData
): OperationResult {
  const unchanged = { mesh, selectedFaceIds: [], selectedVertexIds: [] }
  if (selectedEdgeIds.length < 2) return unchanged
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  // Blender: exactly two chains of the same length, both open or both closed.
  const chains = edgeChainsFromIds(bridge.mesh, kernelEdgeIds(mesh, bridge, selectedEdgeIds))
  if (chains.length !== 2) return unchanged
  const [a, b] = chains as [typeof chains[0], typeof chains[0]]
  if (a.verts.length !== b.verts.length || a.closed !== b.closed) return unchanged
  const created = MeshEditOps.bridgeLoopsAdvanced(bridge.mesh, a.verts, b.verts, segments, twist, a.closed)
  if (!created.length) return unchanged
  return projectEdit(mesh, bridge, created)
}

export function solidifySelectedFaces(mesh: MeshObject, faceIds: string[], thickness: number, bridge?: MeshBridgeData): OperationResult {
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  MeshEditOps.solidifyFaces(bridge.mesh, kernelFaceIds(bridge, faceIds), thickness)
  return projectEdit(mesh, bridge)
}

export function latheProfile(
  mesh: MeshObject,
  vertexIds: string[],
  axis: 'x' | 'y' | 'z' = 'y',
  steps = 8,
  bridge?: MeshBridgeData
): OperationResult {
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  const axisVec = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0)
  MeshEditOps.lathe(bridge.mesh, kernelVertIds(bridge, vertexIds), new THREE.Vector3(), axisVec, steps)
  return projectEdit(mesh, bridge)
}

/** Keep the outer surface and add an inner wall. `openingFaceIds` are removed when they are a partial selection. */
export function shellMesh(
  mesh: MeshObject,
  openingFaceIds: string[],
  thickness: number,
  bridge?: MeshBridgeData
): OperationResult {
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  MeshEditOps.shell(bridge.mesh, kernelFaceIds(bridge, openingFaceIds), thickness)
  return projectEdit(mesh, bridge)
}

export function symmetrizeMesh(mesh: MeshObject, axis: 'x' | 'y' | 'z', bridge?: MeshBridgeData): OperationResult {
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  MeshEditOps.symmetrize(bridge.mesh, axis)
  return projectEdit(mesh, bridge)
}

export function shrinkFattenVertices(mesh: MeshObject, vertexIds: string[], distance: number, bridge?: MeshBridgeData): OperationResult {
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  MeshEditOps.shrinkFatten(bridge.mesh, kernelVertIds(bridge, vertexIds), distance)
  return projectEdit(mesh, bridge)
}

export function smoothMeshVertices(mesh: MeshObject, vertexIds: string[], factor = 0.5, bridge?: MeshBridgeData): OperationResult {
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  MeshEditOps.smoothVertices(bridge.mesh, kernelVertIds(bridge, vertexIds), factor)
  return projectEdit(mesh, bridge)
}

export function circleMeshVertices(mesh: MeshObject, vertexIds: string[], bridge?: MeshBridgeData): OperationResult {
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  CircleLoop.circleVertices(bridge.mesh, kernelVertIds(bridge, vertexIds))
  return projectEdit(mesh, bridge)
}

/** Reshape the boundary of the selected faces into a circle. Interior vertices stay. */
export function circleFaceOutline(mesh: MeshObject, faceIds: string[], bridge?: MeshBridgeData): OperationResult {
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  CircleLoop.circleVertices(bridge.mesh, CircleLoop.outlineVertexIds(bridge.mesh, kernelFaceIds(bridge, faceIds)))
  return projectEdit(mesh, bridge)
}

export function straightenVertices(
  mesh: MeshObject,
  vertexIds: string[],
  direction: StraightenDirection,
  bridge?: MeshBridgeData
): OperationResult {
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  Straighten.apply(bridge.mesh, kernelVertIds(bridge, vertexIds), direction)
  return projectEdit(mesh, bridge)
}

export function randomizeMeshVertices(mesh: MeshObject, vertexIds: string[], amount: number, bridge?: MeshBridgeData): OperationResult {
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  MeshEditOps.randomizeVertices(bridge.mesh, kernelVertIds(bridge, vertexIds), amount)
  return projectEdit(mesh, bridge)
}

export function unsubdivideMesh(mesh: MeshObject, bridge?: MeshBridgeData): OperationResult {
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  MeshEditOps.unsubdivide(bridge.mesh)
  return projectEdit(mesh, bridge)
}

export function decimateMesh(mesh: MeshObject, ratio = 0.5, bridge?: MeshBridgeData): OperationResult {
  bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)
  MeshEditOps.decimate(bridge.mesh, ratio)
  return projectEdit(mesh, bridge)
}

export function booleanMeshes(a: MeshObject, b: MeshObject, op: BooleanOp, bridgeA?: MeshBridgeData): OperationResult {
  bridgeA = bridgeA ?? MeshBridge.meshObjectToEditableMesh(a)
  const other = MeshBridge.meshObjectToEditableMesh(b)
  const offset = new THREE.Vector3(b.position.x - a.position.x, b.position.y - a.position.y, b.position.z - a.position.z)
  for (const v of other.mesh.vertices.values()) v.position.add(offset)
  BooleanKernel.operate(bridgeA.mesh, other.mesh, op)
  return projectEdit(a, bridgeA)
}

export type { BooleanOp }


