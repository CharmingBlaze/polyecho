import { MeshObject, Vertex, Face } from '../../types/mesh'
import { addVec3, scaleVec3, computeCentroid, computeFaceNormal, subVec3 } from '../../utils/math'

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
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  const targetFaceIndices = newMesh.faces
    .map((f, i) => (faceIds.includes(f.id) ? i : -1))
    .filter(i => i !== -1)

  if (targetFaceIndices.length === 0) {
    return { mesh: newMesh, selectedFaceIds: faceIds, selectedVertexIds: [] }
  }

  const newSelectedFaces: string[] = []
  const newSelectedVerts: string[] = []

  for (const fIdx of targetFaceIndices) {
    const originalFace = newMesh.faces[fIdx]
    const vertMap = new Map<string, Vertex>()
    for (const v of newMesh.vertices) {
      vertMap.set(v.id, v)
    }

    const faceVerts = originalFace.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
    const normal = originalFace.normal || computeFaceNormal(faceVerts.map(v => v.position))
    const offset = scaleVec3(normal, distance)

    // Create new extruded vertices
    const newVertIds: string[] = []
    for (const v of faceVerts) {
      const newVId = genId('v_ext')
      newMesh.vertices.push({
        id: newVId,
        position: addVec3(v.position, offset),
        color: v.color || '#ffffff',
        selected: true
      })
      newVertIds.push(newVId)
      newSelectedVerts.push(newVId)
    }

    // Build connecting side quad walls
    const count = originalFace.vertexIds.length
    for (let i = 0; i < count; i++) {
      const next = (i + 1) % count
      const vOld1 = originalFace.vertexIds[i]
      const vOld2 = originalFace.vertexIds[next]
      const vNew1 = newVertIds[i]
      const vNew2 = newVertIds[next]

      newMesh.faces.push({
        id: genId('f_side'),
        vertexIds: [vOld1, vOld2, vNew2, vNew1],
        uvs: [
          { u: 0, v: 0 },
          { u: 1, v: 0 },
          { u: 1, v: 1 },
          { u: 0, v: 1 }
        ],
        materialIndex: originalFace.materialIndex,
        selected: false
      })
    }

    // Replace original face vertices with new extruded vertices
    originalFace.vertexIds = newVertIds
    originalFace.selected = true
    newSelectedFaces.push(originalFace.id)
  }

  return {
    mesh: newMesh,
    selectedFaceIds: newSelectedFaces,
    selectedVertexIds: newSelectedVerts
  }
}

/**
 * Insets selected faces inward towards their center,
 * creating surrounding quad frames.
 */
export function insetFaces(mesh: MeshObject, faceIds: string[], scaleFactor = 0.7): OperationResult {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  const targetFaceIndices = newMesh.faces
    .map((f, i) => (faceIds.includes(f.id) ? i : -1))
    .filter(i => i !== -1)

  if (targetFaceIndices.length === 0) {
    return { mesh: newMesh, selectedFaceIds: faceIds, selectedVertexIds: [] }
  }

  const newSelectedFaces: string[] = []
  const newSelectedVerts: string[] = []

  for (const fIdx of targetFaceIndices) {
    const face = newMesh.faces[fIdx]
    const vertMap = new Map<string, Vertex>()
    for (const v of newMesh.vertices) {
      vertMap.set(v.id, v)
    }

    const faceVerts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
    const centroid = computeCentroid(faceVerts.map(v => v.position))

    const newVertIds: string[] = []
    for (const v of faceVerts) {
      const newVId = genId('v_ins')
      const toCenter = subVec3(centroid, v.position)
      const insetPos = addVec3(v.position, scaleVec3(toCenter, 1 - scaleFactor))

      newMesh.vertices.push({
        id: newVId,
        position: insetPos,
        color: v.color || '#ffffff',
        selected: true
      })
      newVertIds.push(newVId)
      newSelectedVerts.push(newVId)
    }

    // Create perimeter quad faces
    const count = face.vertexIds.length
    for (let i = 0; i < count; i++) {
      const next = (i + 1) % count
      const vOld1 = face.vertexIds[i]
      const vOld2 = face.vertexIds[next]
      const vNew1 = newVertIds[i]
      const vNew2 = newVertIds[next]

      newMesh.faces.push({
        id: genId('f_inset_border'),
        vertexIds: [vOld1, vOld2, vNew2, vNew1],
        uvs: [
          { u: 0, v: 0 },
          { u: 1, v: 0 },
          { u: 1, v: 1 },
          { u: 0, v: 1 }
        ],
        materialIndex: face.materialIndex,
        selected: false
      })
    }

    // Update center face
    face.vertexIds = newVertIds
    face.selected = true
    newSelectedFaces.push(face.id)
  }

  return {
    mesh: newMesh,
    selectedFaceIds: newSelectedFaces,
    selectedVertexIds: newSelectedVerts
  }
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
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  const targetFaceIndices = newMesh.faces
    .map((f, i) => (faceIds.includes(f.id) ? i : -1))
    .filter(i => i !== -1)

  if (targetFaceIndices.length === 0) {
    return { mesh: newMesh, selectedFaceIds: faceIds, selectedVertexIds: [] }
  }

  const newSelectedFaces: string[] = []
  const newSelectedVerts: string[] = []

  for (const fIdx of targetFaceIndices) {
    const face = newMesh.faces[fIdx]
    const vertMap = new Map<string, Vertex>()
    for (const v of newMesh.vertices) {
      vertMap.set(v.id, v)
    }

    const faceVerts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
    const centroid = computeCentroid(faceVerts.map(v => v.position))
    const normal = face.normal || computeFaceNormal(faceVerts.map(v => v.position))

    const newVertIds: string[] = []
    const scaleFactor = Math.max(0.05, Math.min(0.95, 1 - (offset / 1.5)))
    for (const v of faceVerts) {
      const newVId = genId('v_bev')
      const toCenter = subVec3(centroid, v.position)
      const insetPos = addVec3(v.position, scaleVec3(toCenter, 1 - scaleFactor))
      const chamferPos = addVec3(insetPos, scaleVec3(normal, offset * 0.3))

      newMesh.vertices.push({
        id: newVId,
        position: chamferPos,
        color: v.color || '#ffffff',
        selected: true
      })
      newVertIds.push(newVId)
      newSelectedVerts.push(newVId)
    }

    // Create perimeter bevel chamfer quad faces
    const count = face.vertexIds.length
    for (let i = 0; i < count; i++) {
      const next = (i + 1) % count
      const vOld1 = face.vertexIds[i]
      const vOld2 = face.vertexIds[next]
      const vNew1 = newVertIds[i]
      const vNew2 = newVertIds[next]

      newMesh.faces.push({
        id: genId('f_bevel_quad'),
        vertexIds: [vOld1, vOld2, vNew2, vNew1],
        uvs: [
          { u: 0, v: 0 },
          { u: 1, v: 0 },
          { u: 1, v: 1 },
          { u: 0, v: 1 }
        ],
        materialIndex: face.materialIndex,
        selected: false
      })
    }

    // Update center face
    face.vertexIds = newVertIds
    face.selected = true
    newSelectedFaces.push(face.id)
  }

  return {
    mesh: newMesh,
    selectedFaceIds: newSelectedFaces,
    selectedVertexIds: newSelectedVerts
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
 * Creates a new polygon face from selected vertices (Blender 'F' key).
 */
export function fillFaceFromVertices(mesh: MeshObject, vertexIds: string[]): OperationResult {
  if (vertexIds.length < 3) {
    return { mesh, selectedFaceIds: [], selectedVertexIds: vertexIds }
  }

  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  const selectedVerts = newMesh.vertices.filter(v => vertexIds.includes(v.id))
  if (selectedVerts.length < 3) {
    return { mesh: newMesh, selectedFaceIds: [], selectedVertexIds: vertexIds }
  }

  const normal = computeFaceNormal(selectedVerts.map(v => v.position))
  const newFaceId = genId('f_fill')

  // Generate planar UVs
  const uvs = selectedVerts.map((_, i) => {
    const angle = (i / selectedVerts.length) * Math.PI * 2
    return {
      u: 0.5 + Math.cos(angle) * 0.4,
      v: 0.5 + Math.sin(angle) * 0.4
    }
  })

  newMesh.faces.push({
    id: newFaceId,
    vertexIds: [...vertexIds],
    uvs,
    normal,
    materialIndex: 0,
    selected: true
  })

  return {
    mesh: newMesh,
    selectedFaceIds: [newFaceId],
    selectedVertexIds: vertexIds
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


