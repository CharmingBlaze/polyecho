import { MeshObject, Vector3D } from '../../types/mesh'
import { computeFaceNormal } from '../../utils/math'
import { undirectedEdgeId } from '../geometry/EdgeUtils'
import { flattenClusters, meshWorldPoint, packUVIslands, type FlatChart } from '../geometry/UVUnwrap'
import { clusterFacesByNormal, conformalUnwrapFaces, findOverlappingFaces } from './ConformalUnwrap'

const FALLBACK_ANGLE_DEGREES = 66
/** Auto-cut tubes whose conformal strip stretches area more than this are segmented instead. */
const AUTO_CUT_MAX_STRETCH = 1.6

/**
 * Blender-style Unwrap: splits the mesh into islands at marked seams and
 * flattens each one with least-squares conformal maps, then packs.
 * Tubes are cut open automatically; closed or handled islands with no usable
 * seams are segmented by normal angle before flattening. Islands with pinned
 * corners solve around the pins and stay where they are; the rest are packed.
 */
export class SeamUnwrapper {
  static unwrapMesh(
    mesh: MeshObject,
    onlyFaceIndices?: number[],
    textureSize = 64,
    marginPixels = 2,
    textureHeight = textureSize
  ): void {
    if (!mesh || mesh.faces.length === 0) return

    const seamSet = new Set<string>(mesh.seamEdgeIds || [])
    const allowed = onlyFaceIndices && onlyFaceIndices.length > 0
      ? new Set(onlyFaceIndices.filter(i => i >= 0 && i < mesh.faces.length))
      : null
    const targets = allowed ? Array.from(allowed) : mesh.faces.map((_, i) => i)
    const islands = this.seamIslands(mesh, targets, seamSet)

    // Scale is part of the surface; rotation and translation do not change the flattening.
    const positions = new Map<string, Vector3D>()
    for (const v of mesh.vertices) positions.set(v.id, meshWorldPoint(mesh, v.position))

    const normals = new Map<number, Vector3D>()
    for (const fi of targets) {
      const points = mesh.faces[fi].vertexIds.map(id => positions.get(id)).filter(Boolean) as Vector3D[]
      normals.set(fi, points.length >= 3 ? computeFaceNormal(points) : { x: 0, y: 1, z: 0 })
    }

    const pins = new Set(mesh.uvPinKeys || [])
    const charts: FlatChart[] = []
    for (const island of islands) {
      const whole = conformalUnwrapFaces(mesh, island, seamSet, positions, { allowCuts: true, maxCutStretch: AUTO_CUT_MAX_STRETCH, pins })
      if (whole && (whole.pinned || findOverlappingFaces(island, whole.uvs).size === 0)) {
        charts.push({ uvs: whole.uvs, pinned: whole.pinned })
        continue
      }
      const clusters = clusterFacesByNormal(mesh, island, normals, seamSet, FALLBACK_ANGLE_DEGREES)
      charts.push(...flattenClusters(mesh, clusters, {
        seams: seamSet, positions, normals, angleLimitDegrees: FALLBACK_ANGLE_DEGREES, conformal: 'always', pins
      }))
    }

    const texW = Math.max(1, Number.isFinite(textureSize) ? textureSize : 64)
    const texH = Math.max(1, Number.isFinite(textureHeight) ? textureHeight : texW)
    const packFaces: number[] = []
    charts.forEach((chart, index) => {
      for (const [fi, uvs] of chart.uvs) {
        if (chart.pinned) {
          mesh.faces[fi].uvs = uvs.map(uv => ({ u: uv.u, v: uv.v }))
          continue
        }
        packFaces.push(fi)
        // Separate charts before packing so islands that meet at a seam are never read as welded.
        mesh.faces[fi].uvs = uvs.map(uv => ({ u: uv.u + index * 10000, v: uv.v * texW / texH }))
      }
    })
    if (packFaces.length === 0) return

    const everyChartPacks = charts.every(chart => !chart.pinned)
    const packed = packUVIslands(
      mesh,
      Number.isFinite(marginPixels) ? marginPixels : 2,
      texW,
      !allowed && everyChartPacks ? undefined : packFaces,
      texH
    )
    mesh.faces = packed.faces
  }

  private static seamIslands(mesh: MeshObject, targets: number[], seamSet: Set<string>): number[][] {
    const allowed = new Set(targets)
    const edgeToFaces = new Map<string, number[]>()
    for (const fIdx of targets) {
      const ids = mesh.faces[fIdx].vertexIds
      for (let i = 0; i < ids.length; i++) {
        const key = undirectedEdgeId(ids[i], ids[(i + 1) % ids.length])
        const linked = edgeToFaces.get(key)
        if (linked) linked.push(fIdx)
        else edgeToFaces.set(key, [fIdx])
      }
    }

    const visited = new Uint8Array(mesh.faces.length)
    const islands: number[][] = []
    for (const seed of targets) {
      if (visited[seed]) continue
      const island: number[] = []
      const stack = [seed]
      visited[seed] = 1
      while (stack.length > 0) {
        const current = stack.pop()!
        island.push(current)
        const ids = mesh.faces[current].vertexIds
        for (let i = 0; i < ids.length; i++) {
          const key = undirectedEdgeId(ids[i], ids[(i + 1) % ids.length])
          if (seamSet.has(key)) continue
          for (const next of edgeToFaces.get(key) || []) {
            if (visited[next] || !allowed.has(next)) continue
            visited[next] = 1
            stack.push(next)
          }
        }
      }
      islands.push(island)
    }
    return islands
  }
}
