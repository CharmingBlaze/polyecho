import { MeshObject, Vertex, Face, UV, MirrorModifier } from '../../types/mesh'
import { lerpVec3 } from '../../utils/math'

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

function coordOf(v: Vertex, axis: 'x' | 'y' | 'z'): number {
  return v.position[axis]
}

/**
 * Sutherland–Hodgman clip against axis = 0, keeping coord >= -eps.
 */
function bisectAlongAxis(
  vertices: Vertex[],
  faces: Face[],
  axis: 'x' | 'y' | 'z',
  eps: number
): { vertices: Vertex[]; faces: Face[] } {
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
      const ca = coordOf(a, axis)
      const cb = coordOf(b, axis)
      const aIn = ca >= -eps
      const bIn = cb >= -eps

      if (aIn) {
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

export function evaluateMirror(mesh: MeshObject): { vertices: Vertex[]; faces: Face[] } {
  if (!mesh.mirror || !mesh.mirror.enabled) {
    return { vertices: mesh.vertices, faces: mesh.faces }
  }

  const mod: MirrorModifier = mesh.mirror
  const hasAxis = mod.axisX || mod.axisY || mod.axisZ
  if (!hasAxis) {
    return { vertices: mesh.vertices, faces: mesh.faces }
  }

  let outVertices = cloneVerts(mesh.vertices)
  let outFaces = cloneFaces(mesh.faces)
  const mergeT = Math.max(0, mod.mergeThreshold ?? 0.001)
  const doBisect = mod.bisect === true

  const axes: Array<{ axis: 'x' | 'y' | 'z'; mult: { x: number; y: number; z: number } }> = []
  if (mod.axisX) axes.push({ axis: 'x', mult: { x: -1, y: 1, z: 1 } })
  if (mod.axisY) axes.push({ axis: 'y', mult: { x: 1, y: -1, z: 1 } })
  if (mod.axisZ) axes.push({ axis: 'z', mult: { x: 1, y: 1, z: -1 } })

  if (doBisect) {
    for (const { axis } of axes) {
      const cut = bisectAlongAxis(outVertices, outFaces, axis, mergeT)
      outVertices = cut.vertices
      outFaces = cut.faces
    }
  }

  for (const { axis, mult } of axes) {
    const currentBaseVerts = [...outVertices]
    const currentBaseFaces = [...outFaces]
    const vertMap = new Map<string, string>()

    for (const v of currentBaseVerts) {
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

    for (const f of currentBaseFaces) {
      const mirroredVertexIds = f.vertexIds.map(vid => vertMap.get(vid) || vid)
      if (mirroredVertexIds.every((id, i) => id === f.vertexIds[i])) continue
      if (new Set(mirroredVertexIds).size < 3) continue

      mirroredVertexIds.reverse()
      const mirroredUVs = f.uvs.map(uv => ({
        u: mod.flipU ? 1 - uv.u : uv.u,
        v: mod.flipV ? 1 - uv.v : uv.v
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
  }

  return { vertices: outVertices, faces: outFaces }
}

export function applyMirror(mesh: MeshObject): void {
  if (!mesh.mirror || !mesh.mirror.enabled) return
  const { vertices, faces } = evaluateMirror(mesh)
  mesh.vertices = vertices
  mesh.faces = faces
  mesh.mirror.enabled = false
}
