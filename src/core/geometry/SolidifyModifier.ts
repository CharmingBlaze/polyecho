import { Vertex, Face, UV } from '../../types/mesh'
import { computeFaceNormal } from '../../utils/math'

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`
}

export function evaluateSolidify(
  vertices: Vertex[],
  faces: Face[],
  thickness: number,
  offsetRatio = -1,
  fillRim = true
): { vertices: Vertex[]; faces: Face[] } {
  if (Math.abs(thickness) < 1e-8) {
    return {
      vertices: vertices.map(v => ({ ...v, position: { ...v.position } })),
      faces: faces.map(f => ({ ...f, vertexIds: [...f.vertexIds], uvs: f.uvs.map(uv => ({ ...uv })) }))
    }
  }

  const baseVerts = vertices.map(v => ({
    ...v,
    position: { ...v.position },
    boneWeights: v.boneWeights ? { ...v.boneWeights } : undefined
  }))
  const vertMap = new Map(baseVerts.map(v => [v.id, v]))
  const vertNormal = new Map<string, { x: number; y: number; z: number }>()
  for (const v of baseVerts) vertNormal.set(v.id, { x: 0, y: 0, z: 0 })

  for (const f of faces) {
    const fv = f.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
    if (fv.length < 3) continue
    const fn = computeFaceNormal(fv.map(v => v.position))
    for (const v of fv) {
      const acc = vertNormal.get(v.id)!
      acc.x += fn.x
      acc.y += fn.y
      acc.z += fn.z
    }
  }

  const ofsA = (offsetRatio + 1) * 0.5 * thickness
  const ofsB = (offsetRatio - 1) * 0.5 * thickness

  const shellMap = new Map<string, string>()
  const shellVerts: Vertex[] = []

  for (const v of baseVerts) {
    const acc = vertNormal.get(v.id) || { x: 0, y: 1, z: 0 }
    const len = Math.hypot(acc.x, acc.y, acc.z) || 1
    const nx = acc.x / len
    const ny = acc.y / len
    const nz = acc.z / len

    v.position.x += nx * ofsB
    v.position.y += ny * ofsB
    v.position.z += nz * ofsB

    const shellId = `sol_${v.id}`
    shellVerts.push({
      id: shellId,
      position: {
        x: v.position.x + nx * (ofsA - ofsB),
        y: v.position.y + ny * (ofsA - ofsB),
        z: v.position.z + nz * (ofsA - ofsB)
      },
      color: v.color,
      boneWeights: v.boneWeights ? { ...v.boneWeights } : undefined
    })
    shellMap.set(v.id, shellId)
  }

  const outFaces: Face[] = faces.map(f => ({
    ...f,
    vertexIds: [...f.vertexIds],
    uvs: f.uvs.map(uv => ({ ...uv }))
  }))

  for (const f of faces) {
    const shellIds = f.vertexIds.map(id => shellMap.get(id) || id).reverse()
    const shellUvs: UV[] = [...f.uvs].reverse().map(uv => ({ ...uv }))
    outFaces.push({
      id: `sol_f_${f.id}`,
      vertexIds: shellIds,
      uvs: shellUvs,
      materialIndex: f.materialIndex
    })
  }

  if (fillRim) {
    const edgeUse = new Map<string, { a: string; b: string; face: Face; ia: number; ib: number }[]>()
    for (const f of faces) {
      const n = f.vertexIds.length
      for (let i = 0; i < n; i++) {
        const a = f.vertexIds[i]
        const b = f.vertexIds[(i + 1) % n]
        const key = edgeKey(a, b)
        let list = edgeUse.get(key)
        if (!list) {
          list = []
          edgeUse.set(key, list)
        }
        list.push({ a, b, face: f, ia: i, ib: (i + 1) % n })
      }
    }

    for (const uses of edgeUse.values()) {
      if (uses.length !== 1) continue
      const { a, b, face, ia, ib } = uses[0]
      const sa = shellMap.get(a)
      const sb = shellMap.get(b)
      if (!sa || !sb) continue
      const uvA = face.uvs[ia] || { u: 0, v: 0 }
      const uvB = face.uvs[ib] || { u: 1, v: 0 }
      outFaces.push({
        id: `sol_rim_${face.id}_${ia}`,
        vertexIds: [a, b, sb, sa],
        uvs: [{ ...uvA }, { ...uvB }, { ...uvB }, { ...uvA }],
        materialIndex: face.materialIndex
      })
    }
  }

  return { vertices: [...baseVerts, ...shellVerts], faces: outFaces }
}
