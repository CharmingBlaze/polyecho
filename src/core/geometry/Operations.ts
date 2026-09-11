import { MeshObject, Face, Vector3D } from '../../types/mesh'
import { computeCentroid, computeFaceNormal, subVec3, lengthVec3, crossVec3, normalizeVec3, dotVec3 } from '../../utils/math'
import { MeshBridge } from '../mesh/MeshBridge'
import { InsetKernel } from '../mesh/operations/InsetKernel'
import { ExtrudeKernel } from '../mesh/operations/ExtrudeKernel'
import { BevelKernel } from '../mesh/operations/BevelKernel'
import { MergeKernel } from '../mesh/operations/MergeKernel'
import { DissolveKernel } from '../mesh/operations/DissolveKernel'
import { MeshTopologyService } from '../mesh/MeshTopologyService'
import { TopologyOps } from '../mesh/operations/TopologyOps'
import { parseUndirectedEdgeId, getMeshEdges } from './EdgeUtils'
import * as THREE from 'three'

export interface OperationResult {
  mesh: MeshObject
  selectedFaceIds: string[]
  selectedVertexIds: string[]
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
  }
): OperationResult {
  const distance = options.distance ?? 0.5
  const bridge = MeshBridge.meshObjectToEditableMesh(mesh)
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
    bridge.mesh.vertices.get(vid)?.position.add(offset)
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
  options?: { individual?: boolean; depth?: number; outset?: boolean; boundary?: boolean }
): OperationResult {
  if (faceIds.length === 0) {
    return { mesh, selectedFaceIds: faceIds, selectedVertexIds: [] }
  }

  const bridge = MeshBridge.meshObjectToEditableMesh(mesh)
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
  options?: SubdivideOptions
): OperationResult {
  const edgeIds = options?.edgeIds ?? []
  if (faceIds.length === 0 && edgeIds.length === 0) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: [] }
  }

  const bridge = MeshBridge.meshObjectToEditableMesh(mesh)
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
    selectedVertexIds: []
  }
}

/** Blender Poke Faces: insert a centroid and fan triangles. */
export function pokeFaces(mesh: MeshObject, faceIds: string[]): OperationResult {
  if (faceIds.length === 0) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: [] }
  }
  const bridge = MeshBridge.meshObjectToEditableMesh(mesh)
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
export function triangulateFaces(mesh: MeshObject, faceIds: string[]): OperationResult {
  if (faceIds.length === 0) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: [] }
  }
  const bridge = MeshBridge.meshObjectToEditableMesh(mesh)
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
export function mergeVertices(mesh: MeshObject, vertexIds: string[]): OperationResult {
  return mergeVerticesAdvanced(mesh, vertexIds, 'center')
}

/**
 * Flips the normal/winding order of selected faces.
 */
export function flipNormals(mesh: MeshObject, faceIds: string[]): OperationResult {
  if (faceIds.length === 0) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: [] }
  }
  const bridge = MeshBridge.meshObjectToEditableMesh(mesh)
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
export function deleteElements(mesh: MeshObject, mode: 'vertex' | 'edge' | 'face', selectedIds: string[]): OperationResult {
  if (selectedIds.length === 0) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: [] }
  }

  const bridge = MeshBridge.meshObjectToEditableMesh(mesh)
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
export function bevelFaces(mesh: MeshObject, faceIds: string[], offset = 0.2): OperationResult {
  if (faceIds.length === 0) {
    return { mesh, selectedFaceIds: faceIds, selectedVertexIds: [] }
  }

  const bridge = MeshBridge.meshObjectToEditableMesh(mesh)
  const numFaces = faceIds
    .map(id => bridge.strToNumFaceId.get(id))
    .filter((id): id is number => id !== undefined)
  if (numFaces.length === 0) {
    return { mesh, selectedFaceIds: faceIds, selectedVertexIds: [] }
  }

  const result = BevelKernel.bevelFaces(bridge.mesh, numFaces, {
    width: Math.max(0.001, offset),
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

/**
 * Advanced merge vertices supporting Center, First, Last, and Distance (Weld).
 */
export function mergeVerticesAdvanced(
  mesh: MeshObject,
  vertexIds: string[],
  type: 'center' | 'first' | 'last' | 'distance' = 'center',
  threshold = 0.05
): OperationResult {
  const bridge = MeshBridge.meshObjectToEditableMesh(mesh)

  if (type === 'distance') {
    const only = vertexIds
      .map(id => bridge.strToNumVertId.get(id))
      .filter((id): id is number => id !== undefined)
    const welded = MergeKernel.mergeByDistance(
      bridge.mesh,
      threshold,
      only.length > 0 ? only : undefined
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

  const selectedVerts = mesh.vertices.filter(v => vertexIds.includes(v.id))
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
  viewDirection?: Vector3D
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

  const bridge = MeshBridge.meshObjectToEditableMesh(mesh)
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
export function flattenVerticesOnAxis(mesh: MeshObject, vertexIds: string[], axis: 'x' | 'y' | 'z'): OperationResult {
  if (vertexIds.length === 0) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: [] }
  }
  const bridge = MeshBridge.meshObjectToEditableMesh(mesh)
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
export function dissolveElements(mesh: MeshObject, mode: 'vertex' | 'edge', targetIds: string[]): OperationResult {
  if (targetIds.length === 0) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: [] }
  }

  const bridge = MeshBridge.meshObjectToEditableMesh(mesh)
  if (mode === 'vertex') {
    for (const id of targetIds) {
      const num = bridge.strToNumVertId.get(id)
      if (num != null) MeshTopologyService.dissolveVertex(bridge.mesh, num)
    }
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
export function connectTwoVertices(mesh: MeshObject, vAId: string, vBId: string): OperationResult {
  const targetFace = mesh.faces.find(f => f.vertexIds.includes(vAId) && f.vertexIds.includes(vBId))
  if (!targetFace || targetFace.vertexIds.length < 4) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: [vAId, vBId] }
  }

  const bridge = MeshBridge.meshObjectToEditableMesh(mesh)
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
export function cleanupMeshGeometry(mesh: MeshObject): OperationResult {
  const bridge = MeshBridge.meshObjectToEditableMesh(mesh)
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
export function bridgeEdgeLoops(mesh: MeshObject, selectedEdgeIds: string[]): OperationResult {
  if (selectedEdgeIds.length < 2) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: [] }
  }

  const knownVerts = mesh.vertices.map(v => v.id)
  const edgeList: Array<{ v1: string; v2: string }> = []
  for (const eId of selectedEdgeIds) {
    const parsed = parseUndirectedEdgeId(eId, knownVerts)
    if (parsed) edgeList.push({ v1: parsed.v1, v2: parsed.v2 })
  }
  if (edgeList.length < 2) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: [] }
  }

  const bridge = MeshBridge.meshObjectToEditableMesh(mesh)
  const toNum = (id: string) => bridge.strToNumVertId.get(id)
  const created: number[] = []

  if (edgeList.length === 2) {
    const e1 = edgeList[0]
    const e2 = edgeList[1]
    const n1 = toNum(e1.v1)
    const n2 = toNum(e1.v2)
    const n3 = toNum(e2.v1)
    const n4 = toNum(e2.v2)
    if (n1 != null && n2 != null && n3 != null && n4 != null) {
      const id = MeshTopologyService.bridgeTwoEdges(bridge.mesh, n1, n2, n3, n4)
      if (id != null) created.push(id)
    }
  } else {
    const half = Math.floor(edgeList.length / 2)
    const loop1 = edgeList.slice(0, half)
    const loop2 = edgeList.slice(half)
    const count = Math.min(loop1.length, loop2.length)
    for (let i = 0; i < count; i++) {
      const n1 = toNum(loop1[i].v1)
      const n2 = toNum(loop1[i].v2)
      const n3 = toNum(loop2[i].v1)
      const n4 = toNum(loop2[i].v2)
      if (n1 == null || n2 == null || n3 == null || n4 == null) continue
      const id = MeshTopologyService.bridgeTwoEdges(bridge.mesh, n1, n2, n3, n4)
      if (id != null) created.push(id)
    }
  }

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
 * Generates an internal quad grid inside a closed boundary loop (Blender Grid Fill).
 */
export function gridFill(mesh: MeshObject, boundaryVertexIds: string[]): OperationResult {
  if (boundaryVertexIds.length < 4 || boundaryVertexIds.length % 2 !== 0) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: boundaryVertexIds }
  }

  const bridge = MeshBridge.meshObjectToEditableMesh(mesh)
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


