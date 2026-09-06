import { MeshObject, Vector3D } from '../../types/mesh'
import { computeFaceNormal } from '../../utils/math'
import { packUVIslands } from '../geometry/UVUnwrap'

interface UVIsland {
  faceIndices: number[]
}

/**
 * Splits mesh into UV islands separated by marked seams, projects each island
 * onto its average plane, then packs. Islands are not individually normalized
 * into 0..1 — that stacked every island on top of the others.
 */
export class SeamUnwrapper {
  static unwrapMesh(
    mesh: MeshObject,
    onlyFaceIndices?: number[],
    textureSize = 64,
    marginPixels = 2
  ): void {
    if (!mesh || mesh.faces.length === 0) return

    const seamSet = new Set<string>(mesh.seamEdgeIds || [])
    const allowed = onlyFaceIndices && onlyFaceIndices.length > 0
      ? new Set(onlyFaceIndices.filter(i => i >= 0 && i < mesh.faces.length))
      : null
    const getEdgeKey = (v1: string, v2: string) => (v1 < v2 ? `${v1}_${v2}` : `${v2}_${v1}`)

    const numFaces = mesh.faces.length
    const visited = new Uint8Array(numFaces)
    const islands: UVIsland[] = []

    const edgeToFaces = new Map<string, number[]>()
    for (let fIdx = 0; fIdx < numFaces; fIdx++) {
      if (allowed && !allowed.has(fIdx)) continue
      const face = mesh.faces[fIdx]
      const n = face.vertexIds.length
      for (let i = 0; i < n; i++) {
        const eKey = getEdgeKey(face.vertexIds[i], face.vertexIds[(i + 1) % n])
        const linked = edgeToFaces.get(eKey) || []
        linked.push(fIdx)
        edgeToFaces.set(eKey, linked)
      }
    }

    const seeds = allowed ? Array.from(allowed) : mesh.faces.map((_, i) => i)
    for (const fIdx of seeds) {
      if (visited[fIdx]) continue

      const islandFaces: number[] = []
      const queue: number[] = [fIdx]
      visited[fIdx] = 1

      while (queue.length > 0) {
        const currIdx = queue.pop()!
        islandFaces.push(currIdx)
        const face = mesh.faces[currIdx]
        const n = face.vertexIds.length

        for (let i = 0; i < n; i++) {
          const eKey = getEdgeKey(face.vertexIds[i], face.vertexIds[(i + 1) % n])
          if (seamSet.has(eKey)) continue
          for (const nbIdx of edgeToFaces.get(eKey) || []) {
            if (visited[nbIdx] || (allowed && !allowed.has(nbIdx))) continue
            visited[nbIdx] = 1
            queue.push(nbIdx)
          }
        }
      }

      islands.push({ faceIndices: islandFaces })
    }

    const vertMap = new Map<string, Vector3D>()
    for (const v of mesh.vertices) {
      vertMap.set(v.id, v.position)
    }

    for (let islandIndex = 0; islandIndex < islands.length; islandIndex++) {
      this.unwrapIsland(mesh, islands[islandIndex], vertMap, islandIndex)
    }

    const packed = packUVIslands(
      mesh,
      Number.isFinite(marginPixels) ? marginPixels : 2,
      Number.isFinite(textureSize) ? textureSize : 64,
      allowed ? Array.from(allowed) : undefined
    )
    mesh.faces = packed.faces
  }

  private static unwrapIsland(
    mesh: MeshObject,
    island: UVIsland,
    vertMap: Map<string, Vector3D>,
    islandIndex: number
  ): void {
    if (island.faceIndices.length === 0) return

    let avgNx = 0, avgNy = 0, avgNz = 0
    for (const fIdx of island.faceIndices) {
      const face = mesh.faces[fIdx]
      const faceVerts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
      if (faceVerts.length >= 3) {
        const fn = face.normal || computeFaceNormal(faceVerts)
        avgNx += fn.x
        avgNy += fn.y
        avgNz += fn.z
      }
    }
    const len = Math.hypot(avgNx, avgNy, avgNz)
    if (len < 0.35) {
      island.faceIndices.forEach((fIdx, localIndex) => {
        this.projectFace(mesh, fIdx, vertMap, islandIndex * 10000 + localIndex * 100)
      })
      return
    }
    const normal = { x: avgNx / len, y: avgNy / len, z: avgNz / len }

    let tangent: Vector3D = Math.abs(normal.x) > 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 }
    const dot = tangent.x * normal.x + tangent.y * normal.y + tangent.z * normal.z
    tangent = {
      x: tangent.x - dot * normal.x,
      y: tangent.y - dot * normal.y,
      z: tangent.z - dot * normal.z
    }
    const tLen = Math.hypot(tangent.x, tangent.y, tangent.z) || 1
    tangent = { x: tangent.x / tLen, y: tangent.y / tLen, z: tangent.z / tLen }

    const bitangent: Vector3D = {
      x: normal.y * tangent.z - normal.z * tangent.y,
      y: normal.z * tangent.x - normal.x * tangent.z,
      z: normal.x * tangent.y - normal.y * tangent.x
    }

    for (const fIdx of island.faceIndices) {
      this.projectFaceOntoBasis(mesh, fIdx, vertMap, tangent, bitangent, islandIndex * 10000)
    }
  }

  private static projectFace(
    mesh: MeshObject,
    faceIndex: number,
    vertMap: Map<string, Vector3D>,
    offsetU: number
  ): void {
    const face = mesh.faces[faceIndex]
    const points = face.vertexIds.map(id => vertMap.get(id)).filter(Boolean) as Vector3D[]
    const normal = face.normal || computeFaceNormal(points)
    let tangent: Vector3D = Math.abs(normal.x) > 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 }
    const dot = tangent.x * normal.x + tangent.y * normal.y + tangent.z * normal.z
    tangent = {
      x: tangent.x - dot * normal.x,
      y: tangent.y - dot * normal.y,
      z: tangent.z - dot * normal.z
    }
    const tLen = Math.hypot(tangent.x, tangent.y, tangent.z) || 1
    tangent = { x: tangent.x / tLen, y: tangent.y / tLen, z: tangent.z / tLen }
    const bitangent: Vector3D = {
      x: normal.y * tangent.z - normal.z * tangent.y,
      y: normal.z * tangent.x - normal.x * tangent.z,
      z: normal.x * tangent.y - normal.y * tangent.x
    }
    this.projectFaceOntoBasis(mesh, faceIndex, vertMap, tangent, bitangent, offsetU)
  }

  private static projectFaceOntoBasis(
    mesh: MeshObject,
    faceIndex: number,
    vertMap: Map<string, Vector3D>,
    tangent: Vector3D,
    bitangent: Vector3D,
    offsetU: number
  ): void {
    const face = mesh.faces[faceIndex]
    face.uvs = face.vertexIds.map(vId => {
      const p = vertMap.get(vId) || { x: 0, y: 0, z: 0 }
      return {
        u: p.x * tangent.x + p.y * tangent.y + p.z * tangent.z + offsetU,
        v: p.x * bitangent.x + p.y * bitangent.y + p.z * bitangent.z
      }
    })
  }
}
