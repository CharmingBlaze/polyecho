import { MeshObject, Vertex, Face } from '../../types/mesh'
import { evaluateMirror } from './MirrorModifier'
import { computeFaceNormal, addVec3, scaleVec3, computeCentroid } from '../../utils/math'

function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Evaluates the non-destructive Blender modifier stack on a MeshObject.
 * Order of evaluation: Mirror -> Subdivision -> Solidify -> Bevel
 */
export function evaluateModifiers(mesh: MeshObject): { vertices: Vertex[]; faces: Face[] } {
  let { vertices, faces } = evaluateMirror(mesh)

  // 1. Subdivision Modifier
  if (mesh.subdivision && mesh.subdivision.enabled && mesh.subdivision.level > 0) {
    const subRes = evaluateSubdivisionInternal(vertices, faces, mesh.subdivision.level)
    vertices = subRes.vertices
    faces = subRes.faces
  }

  // 2. Solidify Modifier
  if (mesh.solidify && mesh.solidify.enabled && Math.abs(mesh.solidify.thickness) > 0.001) {
    const solRes = evaluateSolidifyInternal(vertices, faces, mesh.solidify.thickness, mesh.solidify.offset)
    vertices = solRes.vertices
    faces = solRes.faces
  }

  return { vertices, faces }
}

function evaluateSubdivisionInternal(vertices: Vertex[], faces: Face[], level: number): { vertices: Vertex[]; faces: Face[] } {
  let currentVerts = [...vertices.map(v => ({ ...v, position: { ...v.position } }))]
  let currentFaces = [...faces.map(f => ({ ...f, vertexIds: [...f.vertexIds], uvs: [...f.uvs] }))]

  for (let l = 0; l < Math.min(2, level); l++) {
    const newVerts = [...currentVerts]
    const newFaces: Face[] = []
    const vertMap = new Map(newVerts.map(v => [v.id, v]))
    const edgeMidMap = new Map<string, string>() // "v1_v2" -> midVertId

    const getOrAddEdgeMid = (id1: string, id2: string): string => {
      const key = id1 < id2 ? `${id1}_${id2}` : `${id2}_${id1}`
      if (edgeMidMap.has(key)) return edgeMidMap.get(key)!

      const v1 = vertMap.get(id1)!
      const v2 = vertMap.get(id2)!
      const midPos = scaleVec3(addVec3(v1.position, v2.position), 0.5)
      const midId = genId('v_sub_mid')

      const midVert: Vertex = {
        id: midId,
        position: midPos,
        color: v1.color || '#ffffff'
      }
      newVerts.push(midVert)
      vertMap.set(midId, midVert)
      edgeMidMap.set(key, midId)
      return midId
    }

    for (const f of currentFaces) {
      const fVerts = f.vertexIds.map(vid => vertMap.get(vid)!).filter(Boolean)
      if (fVerts.length === 4) {
        const centroidPos = computeCentroid(fVerts.map(v => v.position))
        const cId = genId('v_sub_c')
        const cVert: Vertex = { id: cId, position: centroidPos, color: fVerts[0].color || '#ffffff' }
        newVerts.push(cVert)
        vertMap.set(cId, cVert)

        const m0 = getOrAddEdgeMid(f.vertexIds[0], f.vertexIds[1])
        const m1 = getOrAddEdgeMid(f.vertexIds[1], f.vertexIds[2])
        const m2 = getOrAddEdgeMid(f.vertexIds[2], f.vertexIds[3])
        const m3 = getOrAddEdgeMid(f.vertexIds[3], f.vertexIds[0])

        newFaces.push(
          { id: genId('f_sub'), vertexIds: [f.vertexIds[0], m0, cId, m3], uvs: f.uvs, materialIndex: f.materialIndex },
          { id: genId('f_sub'), vertexIds: [m0, f.vertexIds[1], m1, cId], uvs: f.uvs, materialIndex: f.materialIndex },
          { id: genId('f_sub'), vertexIds: [cId, m1, f.vertexIds[2], m2], uvs: f.uvs, materialIndex: f.materialIndex },
          { id: genId('f_sub'), vertexIds: [m3, cId, m2, f.vertexIds[3]], uvs: f.uvs, materialIndex: f.materialIndex }
        )
      } else if (fVerts.length === 3) {
        const m01 = getOrAddEdgeMid(f.vertexIds[0], f.vertexIds[1])
        const m12 = getOrAddEdgeMid(f.vertexIds[1], f.vertexIds[2])
        const m20 = getOrAddEdgeMid(f.vertexIds[2], f.vertexIds[0])

        newFaces.push(
          { id: genId('f_sub'), vertexIds: [f.vertexIds[0], m01, m20], uvs: f.uvs, materialIndex: f.materialIndex },
          { id: genId('f_sub'), vertexIds: [m01, f.vertexIds[1], m12], uvs: f.uvs, materialIndex: f.materialIndex },
          { id: genId('f_sub'), vertexIds: [m20, m12, f.vertexIds[2]], uvs: f.uvs, materialIndex: f.materialIndex },
          { id: genId('f_sub'), vertexIds: [m01, m12, m20], uvs: f.uvs, materialIndex: f.materialIndex }
        )
      } else {
        newFaces.push(f)
      }
    }

    currentVerts = newVerts
    currentFaces = newFaces
  }

  return { vertices: currentVerts, faces: currentFaces }
}

function evaluateSolidifyInternal(
  vertices: Vertex[], 
  faces: Face[], 
  thickness: number, 
  offsetRatio = -1
): { vertices: Vertex[]; faces: Face[] } {
  const outVertices: Vertex[] = [...vertices.map(v => ({ ...v, position: { ...v.position } }))]
  const outFaces: Face[] = [...faces.map(f => ({ ...f, vertexIds: [...f.vertexIds], uvs: [...f.uvs] }))]

  const vertMap = new Map(outVertices.map(v => [v.id, v]))
  const vertNormalMap = new Map<string, { x: number; y: number; z: number }>()

  for (const v of outVertices) {
    vertNormalMap.set(v.id, { x: 0, y: 0, z: 0 })
  }

  for (const f of faces) {
    const fv = f.vertexIds.map(vid => vertMap.get(vid)!).filter(Boolean)
    if (fv.length < 3) continue
    const fn = computeFaceNormal(fv.map(v => v.position))
    for (const v of fv) {
      const vn = vertNormalMap.get(v.id)!
      vn.x += fn.x
      vn.y += fn.y
      vn.z += fn.z
    }
  }

  // Create shell vertices
  const shellMap = new Map<string, string>() // originalId -> shellId
  const shellVerts: Vertex[] = []

  for (const v of outVertices) {
    const vn = vertNormalMap.get(v.id) || { x: 0, y: 1, z: 0 }
    const len = Math.hypot(vn.x, vn.y, vn.z) || 1
    const nx = vn.x / len
    const ny = vn.y / len
    const nz = vn.z / len

    const offsetDist = thickness * offsetRatio
    const shellId = `sol_${v.id}`
    const shellV: Vertex = {
      id: shellId,
      position: {
        x: v.position.x + nx * offsetDist,
        y: v.position.y + ny * offsetDist,
        z: v.position.z + nz * offsetDist
      },
      color: v.color
    }
    shellVerts.push(shellV)
    shellMap.set(v.id, shellId)
  }

  outVertices.push(...shellVerts)

  // Inverted shell faces
  for (const f of faces) {
    const shellFaceVertIds = f.vertexIds.map(vid => shellMap.get(vid) || vid)
    shellFaceVertIds.reverse() // Flip winding so normal faces outward
    outFaces.push({
      id: `sol_f_${f.id}`,
      vertexIds: shellFaceVertIds,
      uvs: [...f.uvs].reverse(),
      materialIndex: f.materialIndex
    })
  }

  return { vertices: outVertices, faces: outFaces }
}

/**
 * Applies a specific modifier non-destructively, baking its result into the base mesh.
 */
export function applyModifier(
  mesh: MeshObject, 
  type: 'mirror' | 'subdivision' | 'solidify' | 'all'
): void {
  if (type === 'all') {
    const { vertices, faces } = evaluateModifiers(mesh)
    mesh.vertices = vertices
    mesh.faces = faces
    if (mesh.mirror) mesh.mirror.enabled = false
    if (mesh.subdivision) mesh.subdivision.enabled = false
    if (mesh.solidify) mesh.solidify.enabled = false
    return
  }

  if (type === 'mirror' && mesh.mirror?.enabled) {
    const { vertices, faces } = evaluateMirror(mesh)
    mesh.vertices = vertices
    mesh.faces = faces
    mesh.mirror.enabled = false
  } else if (type === 'subdivision' && mesh.subdivision?.enabled) {
    const { vertices, faces } = evaluateSubdivisionInternal(mesh.vertices, mesh.faces, mesh.subdivision.level)
    mesh.vertices = vertices
    mesh.faces = faces
    mesh.subdivision.enabled = false
  } else if (type === 'solidify' && mesh.solidify?.enabled) {
    const { vertices, faces } = evaluateSolidifyInternal(mesh.vertices, mesh.faces, mesh.solidify.thickness, mesh.solidify.offset)
    mesh.vertices = vertices
    mesh.faces = faces
    mesh.solidify.enabled = false
  }
}
