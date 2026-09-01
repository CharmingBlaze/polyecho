import { Vertex, Face, UV, SubdivisionType } from '../../types/mesh'
import { computeCentroid } from '../../utils/math'

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`
}

function avgUv(uvs: UV[]): UV {
  if (uvs.length === 0) return { u: 0, v: 0 }
  let u = 0
  let v = 0
  for (const uv of uvs) {
    u += uv.u
    v += uv.v
  }
  return { u: u / uvs.length, v: v / uvs.length }
}

function midUv(a: UV, b: UV): UV {
  return { u: (a.u + b.u) * 0.5, v: (a.v + b.v) * 0.5 }
}

interface EdgeRec {
  key: string
  v1: string
  v2: string
  faces: number[]
}

function oneLevel(
  vertices: Vertex[],
  faces: Face[],
  type: SubdivisionType
): { vertices: Vertex[]; faces: Face[] } {
  const vertMap = new Map(vertices.map(v => [v.id, v]))
  const edges = new Map<string, EdgeRec>()

  for (let fi = 0; fi < faces.length; fi++) {
    const f = faces[fi]
    const n = f.vertexIds.length
    for (let i = 0; i < n; i++) {
      const a = f.vertexIds[i]
      const b = f.vertexIds[(i + 1) % n]
      const key = edgeKey(a, b)
      let rec = edges.get(key)
      if (!rec) {
        rec = { key, v1: a, v2: b, faces: [] }
        edges.set(key, rec)
      }
      rec.faces.push(fi)
    }
  }

  const facePointPos = faces.map(f => {
    const pts = f.vertexIds.map(id => vertMap.get(id)?.position).filter(Boolean) as { x: number; y: number; z: number }[]
    return computeCentroid(pts)
  })

  const facePointId = faces.map(f => `cc_f_${f.id}`)
  const newVerts: Vertex[] = vertices.map(v => ({
    ...v,
    position: { ...v.position },
    boneWeights: v.boneWeights ? { ...v.boneWeights } : undefined
  }))
  const newMap = new Map(newVerts.map(v => [v.id, v]))

  for (let fi = 0; fi < faces.length; fi++) {
    const src = vertMap.get(faces[fi].vertexIds[0])
    const fp: Vertex = {
      id: facePointId[fi],
      position: { ...facePointPos[fi] },
      color: src?.color
    }
    newVerts.push(fp)
    newMap.set(fp.id, fp)
  }

  const edgePointId = new Map<string, string>()
  const edgePointPos = new Map<string, { x: number; y: number; z: number }>()

  for (const rec of edges.values()) {
    const v1 = vertMap.get(rec.v1)!
    const v2 = vertMap.get(rec.v2)!
    let pos = {
      x: (v1.position.x + v2.position.x) * 0.5,
      y: (v1.position.y + v2.position.y) * 0.5,
      z: (v1.position.z + v2.position.z) * 0.5
    }
    if (type === 'catmull-clark' && rec.faces.length === 2) {
      const f0 = facePointPos[rec.faces[0]]
      const f1 = facePointPos[rec.faces[1]]
      pos = {
        x: (v1.position.x + v2.position.x + f0.x + f1.x) * 0.25,
        y: (v1.position.y + v2.position.y + f0.y + f1.y) * 0.25,
        z: (v1.position.z + v2.position.z + f0.z + f1.z) * 0.25
      }
    }
    const id = `cc_e_${rec.key}`
    edgePointId.set(rec.key, id)
    edgePointPos.set(rec.key, pos)
    const ev: Vertex = {
      id,
      position: { ...pos },
      color: v1.color,
      boneWeights: v1.boneWeights ? { ...v1.boneWeights } : undefined
    }
    newVerts.push(ev)
    newMap.set(id, ev)
  }

  if (type === 'catmull-clark') {
    const vertFaces = new Map<string, number[]>()
    const vertEdges = new Map<string, EdgeRec[]>()
    for (let fi = 0; fi < faces.length; fi++) {
      for (const vid of faces[fi].vertexIds) {
        let list = vertFaces.get(vid)
        if (!list) {
          list = []
          vertFaces.set(vid, list)
        }
        list.push(fi)
      }
    }
    for (const rec of edges.values()) {
      for (const vid of [rec.v1, rec.v2]) {
        let list = vertEdges.get(vid)
        if (!list) {
          list = []
          vertEdges.set(vid, list)
        }
        list.push(rec)
      }
    }

    for (const v of vertices) {
      const target = newMap.get(v.id)
      if (!target) continue
      const adjFaces = vertFaces.get(v.id) || []
      const adjEdges = vertEdges.get(v.id) || []
      const n = adjEdges.length
      if (n < 2) continue

      const boundary = adjEdges.filter(e => e.faces.length === 1)
      if (boundary.length === 2) {
        const n0 = boundary[0].v1 === v.id ? boundary[0].v2 : boundary[0].v1
        const n1 = boundary[1].v1 === v.id ? boundary[1].v2 : boundary[1].v1
        const a = vertMap.get(n0)!.position
        const b = vertMap.get(n1)!.position
        target.position = {
          x: v.position.x * 0.75 + a.x * 0.125 + b.x * 0.125,
          y: v.position.y * 0.75 + a.y * 0.125 + b.y * 0.125,
          z: v.position.z * 0.75 + a.z * 0.125 + b.z * 0.125
        }
        continue
      }
      if (boundary.length > 0) continue

      const F = computeCentroid(adjFaces.map(fi => facePointPos[fi]))
      const R = computeCentroid(
        adjEdges.map(e => {
          const a = vertMap.get(e.v1)!.position
          const b = vertMap.get(e.v2)!.position
          return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5, z: (a.z + b.z) * 0.5 }
        })
      )
      const valence = n
      target.position = {
        x: (F.x + 2 * R.x + (valence - 3) * v.position.x) / valence,
        y: (F.y + 2 * R.y + (valence - 3) * v.position.y) / valence,
        z: (F.z + 2 * R.z + (valence - 3) * v.position.z) / valence
      }
    }
  }

  const newFaces: Face[] = []
  for (let fi = 0; fi < faces.length; fi++) {
    const f = faces[fi]
    const n = f.vertexIds.length
    if (n < 3 || f.uvs.length !== n) {
      newFaces.push({ ...f, vertexIds: [...f.vertexIds], uvs: f.uvs.map(uv => ({ ...uv })) })
      continue
    }
    const faceUv = avgUv(f.uvs)
    for (let i = 0; i < n; i++) {
      const prev = (i + n - 1) % n
      const ePrev = edgeKey(f.vertexIds[prev], f.vertexIds[i])
      const eNext = edgeKey(f.vertexIds[i], f.vertexIds[(i + 1) % n])
      const midPrev = edgePointId.get(ePrev)!
      const midNext = edgePointId.get(eNext)!
      newFaces.push({
        id: `cc_${f.id}_${i}`,
        vertexIds: [f.vertexIds[i], midNext, facePointId[fi], midPrev],
        uvs: [
          { ...f.uvs[i] },
          midUv(f.uvs[i], f.uvs[(i + 1) % n]),
          { ...faceUv },
          midUv(f.uvs[prev], f.uvs[i])
        ],
        materialIndex: f.materialIndex
      })
    }
  }

  return { vertices: newVerts, faces: newFaces }
}

export function evaluateSubdivision(
  vertices: Vertex[],
  faces: Face[],
  level: number,
  type: SubdivisionType = 'catmull-clark'
): { vertices: Vertex[]; faces: Face[] } {
  const steps = Math.max(0, Math.min(3, Math.floor(level)))
  let currentVerts = vertices
  let currentFaces = faces
  for (let i = 0; i < steps; i++) {
    const next = oneLevel(currentVerts, currentFaces, type)
    currentVerts = next.vertices
    currentFaces = next.faces
  }
  return { vertices: currentVerts, faces: currentFaces }
}
