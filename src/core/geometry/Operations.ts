import { MeshObject, Vertex, Face, Vector3D } from '../../types/mesh'
import { addVec3, scaleVec3, computeCentroid, computeFaceNormal, subVec3, lengthVec3, crossVec3, normalizeVec3, dotVec3 } from '../../utils/math'
import { MeshBridge } from '../mesh/MeshBridge'
import { InsetKernel } from '../mesh/operations/InsetKernel'
import { ExtrudeKernel } from '../mesh/operations/ExtrudeKernel'
import { BevelKernel } from '../mesh/operations/BevelKernel'

function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).substring(2, 9)}`
}

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

  const result = ExtrudeKernel.extrudeFaces(bridge.mesh, numFaces)
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

/**
 * Subdivides faces into smaller quads/triangles.
 */
export function subdivideFaces(mesh: MeshObject, faceIds: string[]): OperationResult {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  const newFaces: Face[] = []
  const newSelectedFaces: string[] = []

  const vertMap = new Map<string, Vertex>()
  for (const v of newMesh.vertices) {
    vertMap.set(v.id, v)
  }

  for (const face of newMesh.faces) {
    if (!faceIds.includes(face.id)) {
      newFaces.push(face)
      continue
    }

    const faceVerts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
    if (faceVerts.length === 4) {
      const centroid = computeCentroid(faceVerts.map(v => v.position))
      const cId = genId('v_mid')
      newMesh.vertices.push({ id: cId, position: centroid, color: '#ffffff' })

      const midIds: string[] = []
      for (let i = 0; i < 4; i++) {
        const next = (i + 1) % 4
        const mPos = scaleVec3(addVec3(faceVerts[i].position, faceVerts[next].position), 0.5)
        const mId = genId('v_edge')
        newMesh.vertices.push({ id: mId, position: mPos, color: '#ffffff' })
        midIds.push(mId)
      }

      const f1 = { id: genId('f_sub'), vertexIds: [face.vertexIds[0], midIds[0], cId, midIds[3]], uvs: [{ u: 0, v: 0 }, { u: 0.5, v: 0 }, { u: 0.5, v: 0.5 }, { u: 0, v: 0.5 }], materialIndex: face.materialIndex, selected: true }
      const f2 = { id: genId('f_sub'), vertexIds: [midIds[0], face.vertexIds[1], midIds[1], cId], uvs: [{ u: 0.5, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 0.5 }, { u: 0.5, v: 0.5 }], materialIndex: face.materialIndex, selected: true }
      const f3 = { id: genId('f_sub'), vertexIds: [cId, midIds[1], face.vertexIds[2], midIds[2]], uvs: [{ u: 0.5, v: 0.5 }, { u: 1, v: 0.5 }, { u: 1, v: 1 }, { u: 0.5, v: 1 }], materialIndex: face.materialIndex, selected: true }
      const f4 = { id: genId('f_sub'), vertexIds: [midIds[3], cId, midIds[2], face.vertexIds[3]], uvs: [{ u: 0, v: 0.5 }, { u: 0.5, v: 0.5 }, { u: 0.5, v: 1 }, { u: 0, v: 1 }], materialIndex: face.materialIndex, selected: true }

      newFaces.push(f1, f2, f3, f4)
      newSelectedFaces.push(f1.id, f2.id, f3.id, f4.id)
    } else if (faceVerts.length === 3) {
      const m01 = scaleVec3(addVec3(faceVerts[0].position, faceVerts[1].position), 0.5)
      const m12 = scaleVec3(addVec3(faceVerts[1].position, faceVerts[2].position), 0.5)
      const m20 = scaleVec3(addVec3(faceVerts[2].position, faceVerts[0].position), 0.5)

      const id01 = genId('v_m')
      const id12 = genId('v_m')
      const id20 = genId('v_m')
      newMesh.vertices.push(
        { id: id01, position: m01, color: '#ffffff' },
        { id: id12, position: m12, color: '#ffffff' },
        { id: id20, position: m20, color: '#ffffff' }
      )

      const f1 = { id: genId('f_sub'), vertexIds: [face.vertexIds[0], id01, id20], uvs: [{ u: 0, v: 0 }, { u: 0.5, v: 0 }, { u: 0, v: 0.5 }], materialIndex: face.materialIndex, selected: true }
      const f2 = { id: genId('f_sub'), vertexIds: [id01, face.vertexIds[1], id12], uvs: [{ u: 0.5, v: 0 }, { u: 1, v: 0 }, { u: 0.5, v: 0.5 }], materialIndex: face.materialIndex, selected: true }
      const f3 = { id: genId('f_sub'), vertexIds: [id20, id12, face.vertexIds[2]], uvs: [{ u: 0, v: 0.5 }, { u: 0.5, v: 0.5 }, { u: 0, v: 1 }], materialIndex: face.materialIndex, selected: true }
      const f4 = { id: genId('f_sub'), vertexIds: [id01, id12, id20], uvs: [{ u: 0.5, v: 0 }, { u: 0.5, v: 0.5 }, { u: 0, v: 0.5 }], materialIndex: face.materialIndex, selected: true }

      newFaces.push(f1, f2, f3, f4)
      newSelectedFaces.push(f1.id, f2.id, f3.id, f4.id)
    } else {
      newFaces.push(face)
    }
  }

  newMesh.faces = newFaces
  return {
    mesh: newMesh,
    selectedFaceIds: newSelectedFaces,
    selectedVertexIds: []
  }
}

/**
 * Merges selected vertices into a single vertex at their midpoint.
 */
export function mergeVertices(mesh: MeshObject, vertexIds: string[]): OperationResult {
  if (vertexIds.length < 2) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: vertexIds }
  }
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))

  const selectedVerts = newMesh.vertices.filter(v => vertexIds.includes(v.id))
  if (selectedVerts.length === 0) {
    return { mesh: newMesh, selectedFaceIds: [], selectedVertexIds: [] }
  }

  const targetMidpoint = computeCentroid(selectedVerts.map(v => v.position))
  const keepId = vertexIds[0]

  const keepVert = newMesh.vertices.find(v => v.id === keepId)
  if (keepVert) {
    keepVert.position = targetMidpoint
  }

  for (const face of newMesh.faces) {
    face.vertexIds = face.vertexIds.map(vid => (vertexIds.includes(vid) ? keepId : vid))
    face.vertexIds = face.vertexIds.filter((vid, idx, arr) => vid !== arr[(idx + 1) % arr.length])
  }

  newMesh.faces = newMesh.faces.filter(f => f.vertexIds.length >= 3)
  const removeIds = new Set(vertexIds.slice(1))
  newMesh.vertices = newMesh.vertices.filter(v => !removeIds.has(v.id))

  return {
    mesh: newMesh,
    selectedFaceIds: [],
    selectedVertexIds: [keepId]
  }
}

/**
 * Flips the normal/winding order of selected faces.
 */
export function flipNormals(mesh: MeshObject, faceIds: string[]): OperationResult {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  for (const face of newMesh.faces) {
    if (faceIds.includes(face.id)) {
      face.vertexIds.reverse()
      face.uvs.reverse()
      if (face.normal) {
        face.normal = scaleVec3(face.normal, -1)
      }
    }
  }
  return {
    mesh: newMesh,
    selectedFaceIds: faceIds,
    selectedVertexIds: []
  }
}

/**
 * Deletes selected faces or vertices cleanly.
 */
export function deleteElements(mesh: MeshObject, mode: 'vertex' | 'edge' | 'face', selectedIds: string[]): OperationResult {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  const idSet = new Set(selectedIds)

  if (mode === 'face') {
    newMesh.faces = newMesh.faces.filter(f => !idSet.has(f.id))
    const usedVerts = new Set<string>()
    for (const f of newMesh.faces) {
      for (const vid of f.vertexIds) {
        usedVerts.add(vid)
      }
    }
    newMesh.vertices = newMesh.vertices.filter(v => usedVerts.has(v.id))
  } else if (mode === 'vertex' || mode === 'edge') {
    newMesh.vertices = newMesh.vertices.filter(v => !idSet.has(v.id))
    newMesh.faces = newMesh.faces.filter(f => !f.vertexIds.some(vid => idSet.has(vid)))
  }

  return {
    mesh: newMesh,
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
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))

  if (type === 'distance') {
    // Weld by distance across all vertices (or selected vertices if provided)
    const candidates = vertexIds.length > 0 
      ? newMesh.vertices.filter(v => vertexIds.includes(v.id))
      : newMesh.vertices

    const merged = new Set<string>()
    const remapped = new Map<string, string>()

    for (let i = 0; i < candidates.length; i++) {
      const vA = candidates[i]
      if (merged.has(vA.id)) continue

      for (let j = i + 1; j < candidates.length; j++) {
        const vB = candidates[j]
        if (merged.has(vB.id)) continue

        const dx = vA.position.x - vB.position.x
        const dy = vA.position.y - vB.position.y
        const dz = vA.position.z - vB.position.z
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

        if (dist <= threshold) {
          remapped.set(vB.id, vA.id)
          merged.add(vB.id)
        }
      }
    }

    if (remapped.size === 0) {
      return { mesh: newMesh, selectedFaceIds: [], selectedVertexIds: vertexIds }
    }

    for (const face of newMesh.faces) {
      face.vertexIds = face.vertexIds.map(vid => remapped.get(vid) || vid)
      face.vertexIds = face.vertexIds.filter((vid, idx, arr) => vid !== arr[(idx + 1) % arr.length])
    }
    newMesh.faces = newMesh.faces.filter(f => f.vertexIds.length >= 3)
    newMesh.vertices = newMesh.vertices.filter(v => !merged.has(v.id))

    return { mesh: newMesh, selectedFaceIds: [], selectedVertexIds: [] }
  }

  if (vertexIds.length < 2) {
    return { mesh: newMesh, selectedFaceIds: [], selectedVertexIds: vertexIds }
  }

  const selectedVerts = newMesh.vertices.filter(v => vertexIds.includes(v.id))
  if (selectedVerts.length === 0) {
    return { mesh: newMesh, selectedFaceIds: [], selectedVertexIds: [] }
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

  const keepVert = newMesh.vertices.find(v => v.id === keepId)
  if (keepVert) {
    keepVert.position = targetPos
  }

  for (const face of newMesh.faces) {
    face.vertexIds = face.vertexIds.map(vid => (vertexIds.includes(vid) ? keepId : vid))
    face.vertexIds = face.vertexIds.filter((vid, idx, arr) => vid !== arr[(idx + 1) % arr.length])
  }

  newMesh.faces = newMesh.faces.filter(f => f.vertexIds.length >= 3)
  const removeIds = new Set(vertexIds.filter(id => id !== keepId))
  newMesh.vertices = newMesh.vertices.filter(v => !removeIds.has(v.id))

  return {
    mesh: newMesh,
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

  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  const loop = orientFillLoop(newMesh, orderFillLoop(newMesh, unique), viewDirection)
  const vertMap = new Map(newMesh.vertices.map(v => [v.id, v]))
  const pts = loop.map(id => vertMap.get(id)?.position).filter(Boolean) as Vector3D[]
  if (pts.length < 3) {
    return { mesh: newMesh, selectedFaceIds: [], selectedVertexIds: vertexIds }
  }

  const normal = computeFaceNormal(pts)
  const newFaceId = genId('f_fill')
  let materialIndex = 0
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]
    const b = loop[(i + 1) % loop.length]
    const neighbor = newMesh.faces.find(f => faceHasDirectedEdge(f, b, a) || faceHasDirectedEdge(f, a, b))
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
    return { u: dotVec3(d, uAxis), v: dotVec3(d, vAxis) }
  })

  newMesh.faces.push({
    id: newFaceId,
    vertexIds: loop,
    uvs,
    normal,
    materialIndex,
    selected: true
  })

  return {
    mesh: newMesh,
    selectedFaceIds: [newFaceId],
    selectedVertexIds: loop
  }
}

/**
 * Flattens selected vertices on X, Y, or Z axis to their common average coordinate.
 */
export function flattenVerticesOnAxis(mesh: MeshObject, vertexIds: string[], axis: 'x' | 'y' | 'z'): OperationResult {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  const selectedVerts = newMesh.vertices.filter(v => vertexIds.includes(v.id))
  if (selectedVerts.length === 0) {
    return { mesh: newMesh, selectedFaceIds: [], selectedVertexIds: vertexIds }
  }

  const avgVal = selectedVerts.reduce((sum, v) => sum + v.position[axis], 0) / selectedVerts.length
  for (const v of selectedVerts) {
    v.position[axis] = avgVal
  }

  for (const face of newMesh.faces) {
    const faceVerts = face.vertexIds.map(id => newMesh.vertices.find(v => v.id === id)!).filter(Boolean)
    if (faceVerts.length >= 3) {
      face.normal = computeFaceNormal(faceVerts.map(v => v.position))
    }
  }

  return {
    mesh: newMesh,
    selectedFaceIds: [],
    selectedVertexIds: vertexIds
  }
}

/**
 * Dissolves selected edges or vertices without removing surrounding geometry.
 */
export function dissolveElements(mesh: MeshObject, mode: 'vertex' | 'edge', targetIds: string[]): OperationResult {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  if (targetIds.length === 0) return { mesh: newMesh, selectedFaceIds: [], selectedVertexIds: [] }

  if (mode === 'edge') {
    // For each edge to dissolve, find adjacent faces
    for (const edgeId of targetIds) {
      const parts = edgeId.split('_')
      const vA = parts[1]
      const vB = parts[2]
      if (!vA || !vB) continue

      const adjFaces = newMesh.faces.filter(f => f.vertexIds.includes(vA) && f.vertexIds.includes(vB))
      if (adjFaces.length === 2) {
        const [f1, f2] = adjFaces
        const verts1 = f1.vertexIds
        const idxA = verts1.indexOf(vA)
        const n1 = verts1.length

        const loop1: string[] = []
        for (let i = 0; i < n1; i++) {
          loop1.push(verts1[(idxA + i) % n1])
        }

        const verts2 = f2.vertexIds
        const otherVerts2 = verts2.filter(vid => vid !== vA && vid !== vB)

        const mergedVerts: string[] = []
        for (const v of loop1) {
          mergedVerts.push(v)
          if (v === vB) {
            mergedVerts.push(...otherVerts2)
          }
        }

        f1.vertexIds = mergedVerts
        newMesh.faces = newMesh.faces.filter(f => f.id !== f2.id)
      }
    }
  }

  return {
    mesh: newMesh,
    selectedFaceIds: [],
    selectedVertexIds: []
  }
}

/**
 * Connects two selected vertices on a shared face, dividing it into two faces.
 */
export function connectTwoVertices(mesh: MeshObject, vAId: string, vBId: string): OperationResult {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  const targetFace = newMesh.faces.find(f => f.vertexIds.includes(vAId) && f.vertexIds.includes(vBId))
  if (!targetFace || targetFace.vertexIds.length < 4) {
    return { mesh: newMesh, selectedFaceIds: [], selectedVertexIds: [vAId, vBId] }
  }

  const verts = targetFace.vertexIds
  const idxA = verts.indexOf(vAId)
  const idxB = verts.indexOf(vBId)

  const face1Verts: string[] = []
  let curr = idxA
  while (curr !== idxB) {
    face1Verts.push(verts[curr])
    curr = (curr + 1) % verts.length
  }
  face1Verts.push(vBId)

  const face2Verts: string[] = []
  curr = idxB
  while (curr !== idxA) {
    face2Verts.push(verts[curr])
    curr = (curr + 1) % verts.length
  }
  face2Verts.push(vAId)

  const newF1Id = genId('f_conn1')
  const newF2Id = genId('f_conn2')

  newMesh.faces = newMesh.faces.filter(f => f.id !== targetFace.id)
  newMesh.faces.push({
    id: newF1Id,
    vertexIds: face1Verts,
    uvs: face1Verts.map(() => ({ u: 0, v: 0 })),
    materialIndex: targetFace.materialIndex,
    selected: true
  })
  newMesh.faces.push({
    id: newF2Id,
    vertexIds: face2Verts,
    uvs: face2Verts.map(() => ({ u: 0, v: 0 })),
    materialIndex: targetFace.materialIndex,
    selected: true
  })

  return {
    mesh: newMesh,
    selectedFaceIds: [newF1Id, newF2Id],
    selectedVertexIds: [vAId, vBId]
  }
}

/**
 * Safe cleanup of mesh: removes degenerate faces (<3 verts), orphan vertices, updates normals.
 */
export function cleanupMeshGeometry(mesh: MeshObject): OperationResult {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))

  // 1. Remove duplicate/degenerate face vertices
  for (const face of newMesh.faces) {
    face.vertexIds = face.vertexIds.filter((v, idx, arr) => arr.indexOf(v) === idx)
  }
  newMesh.faces = newMesh.faces.filter(f => f.vertexIds.length >= 3)

  // 2. Remove orphan vertices
  const usedVerts = new Set(newMesh.faces.flatMap(f => f.vertexIds))
  newMesh.vertices = newMesh.vertices.filter(v => usedVerts.has(v.id))

  // 3. Recalculate face normals
  for (const face of newMesh.faces) {
    const faceVerts = face.vertexIds.map(id => newMesh.vertices.find(v => v.id === id)!).filter(Boolean)
    if (faceVerts.length >= 3) {
      face.normal = computeFaceNormal(faceVerts.map(v => v.position))
    }
  }

  return {
    mesh: newMesh,
    selectedFaceIds: [],
    selectedVertexIds: []
  }
}

/**
 * Bridges two opposing edge loops or two selected edges with connecting quad faces (Blender Bridge Edge Loops).
 */
export function bridgeEdgeLoops(mesh: MeshObject, selectedEdgeIds: string[]): OperationResult {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  if (selectedEdgeIds.length < 2) {
    return { mesh: newMesh, selectedFaceIds: [], selectedVertexIds: [] }
  }

  // Parse edge vertices
  const edgeList: Array<{ id: string; v1: string; v2: string }> = []
  for (const eId of selectedEdgeIds) {
    const parts = eId.split('_')
    if (parts.length >= 3) {
      edgeList.push({ id: eId, v1: parts[1], v2: parts[2] })
    }
  }

  if (edgeList.length === 2) {
    const e1 = edgeList[0]
    const e2 = edgeList[1]

    const vertMap = new Map(newMesh.vertices.map(v => [v.id, v]))
    const p1a = vertMap.get(e1.v1)?.position
    const p1b = vertMap.get(e1.v2)?.position
    const p2a = vertMap.get(e2.v1)?.position
    const p2b = vertMap.get(e2.v2)?.position

    if (p1a && p1b && p2a && p2b) {
      const distNormal = Math.hypot(p1a.x - p2a.x, p1a.y - p2a.y, p1a.z - p2a.z) + Math.hypot(p1b.x - p2b.x, p1b.y - p2b.y, p1b.z - p2b.z)
      const distCross = Math.hypot(p1a.x - p2b.x, p1a.y - p2b.y, p1a.z - p2b.z) + Math.hypot(p1b.x - p2a.x, p1b.y - p2a.y, p1b.z - p2a.z)

      const vertIds = distNormal <= distCross
        ? [e1.v1, e1.v2, e2.v2, e2.v1]
        : [e1.v1, e1.v2, e2.v1, e2.v2]

      const newFaceId = genId('f_bridge')
      newMesh.faces.push({
        id: newFaceId,
        vertexIds: vertIds,
        uvs: [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }, { u: 0, v: 1 }],
        materialIndex: 0,
        selected: true
      })

      return {
        mesh: newMesh,
        selectedFaceIds: [newFaceId],
        selectedVertexIds: []
      }
    }
  }

  // Multi-edge loop bridge
  const half = Math.floor(edgeList.length / 2)
  const loop1 = edgeList.slice(0, half)
  const loop2 = edgeList.slice(half)

  const newFaceIds: string[] = []
  const count = Math.min(loop1.length, loop2.length)

  for (let i = 0; i < count; i++) {
    const e1 = loop1[i]
    const e2 = loop2[i]
    const fId = genId('f_bridge')
    newMesh.faces.push({
      id: fId,
      vertexIds: [e1.v1, e1.v2, e2.v2, e2.v1],
      uvs: [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }, { u: 0, v: 1 }],
      materialIndex: 0,
      selected: true
    })
    newFaceIds.push(fId)
  }

  return {
    mesh: newMesh,
    selectedFaceIds: newFaceIds,
    selectedVertexIds: []
  }
}

/**
 * Generates an internal quad grid inside a closed boundary loop (Blender Grid Fill).
 */
export function gridFill(mesh: MeshObject, boundaryVertexIds: string[]): OperationResult {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  if (boundaryVertexIds.length < 4 || boundaryVertexIds.length % 2 !== 0) {
    return { mesh: newMesh, selectedFaceIds: [], selectedVertexIds: boundaryVertexIds }
  }

  const n = boundaryVertexIds.length

  if (n === 4) {
    const newFaceId = genId('f_grid')
    newMesh.faces.push({
      id: newFaceId,
      vertexIds: [...boundaryVertexIds],
      uvs: [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }, { u: 0, v: 1 }],
      materialIndex: 0,
      selected: true
    })
    return {
      mesh: newMesh,
      selectedFaceIds: [newFaceId],
      selectedVertexIds: boundaryVertexIds
    }
  }

  const vertMap = new Map(newMesh.vertices.map(v => [v.id, v]))
  const boundaryPositions = boundaryVertexIds.map(id => vertMap.get(id)?.position).filter(Boolean) as Array<{ x: number; y: number; z: number }>
  const centerPos = computeCentroid(boundaryPositions)

  const centerVertId = genId('v_grid_center')
  newMesh.vertices.push({
    id: centerVertId,
    position: centerPos,
    color: '#ffffff'
  })

  const newFaceIds: string[] = []
  for (let i = 0; i < n; i += 2) {
    const v1 = boundaryVertexIds[i]
    const v2 = boundaryVertexIds[(i + 1) % n]
    const v3 = boundaryVertexIds[(i + 2) % n]

    const fId = genId('f_grid')
    newMesh.faces.push({
      id: fId,
      vertexIds: [v1, v2, v3, centerVertId],
      uvs: [{ u: 0, v: 0 }, { u: 0.5, v: 0 }, { u: 1, v: 0 }, { u: 0.5, v: 0.5 }],
      materialIndex: 0,
      selected: true
    })
    newFaceIds.push(fId)
  }

  return {
    mesh: newMesh,
    selectedFaceIds: newFaceIds,
    selectedVertexIds: []
  }
}


