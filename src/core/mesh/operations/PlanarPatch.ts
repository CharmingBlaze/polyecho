import * as THREE from 'three'
import { EditableMesh } from '../MeshKernel'
import { HalfEdgeTopology } from '../HalfEdgeTopology'
import { polygonPlanarity } from '../../geometry/PolygonGeometry'

/** Boundary of one face island, walked in the selected faces' winding. Null when the outline is not one simple loop. */
export function orientedFaceBoundary(mesh: EditableMesh, faceIds: number[]): number[] | null {
  const sel = new Set(faceIds)
  const next = new Map<number, number>()
  for (const edge of HalfEdgeTopology.findRegionBoundaryEdges(mesh, faceIds)) {
    let from: number | null = null
    let to: number | null = null
    for (const fid of edge.faceIds) {
      if (!sel.has(fid)) continue
      const face = mesh.faces.get(fid)
      if (!face) continue
      const ids = face.vertexIds
      const n = ids.length
      const ia = ids.indexOf(edge.v1)
      const ib = ids.indexOf(edge.v2)
      if (ia < 0 || ib < 0) continue
      if ((ia + 1) % n === ib) {
        from = edge.v1
        to = edge.v2
      } else if ((ib + 1) % n === ia) {
        from = edge.v2
        to = edge.v1
      }
    }
    if (from === null || to === null || next.has(from)) return null
    next.set(from, to)
  }
  if (next.size < 3) return null
  const start = next.keys().next().value
  if (start === undefined) return null
  const loop = [start]
  let cur = next.get(start)!
  while (cur !== start) {
    if (loop.length > next.size || !next.has(cur)) return null
    loop.push(cur)
    cur = next.get(cur)!
  }
  return loop.length === next.size ? loop : null
}

/** Flat triangle patch with one outline. Real quads and bent surfaces are left alone. */
export function isTriangulatedPlanarPatch(mesh: EditableMesh, faceIds: number[], loop: number[]): boolean {
  if (faceIds.length < 2 || loop.length < 3 || new Set(loop).size !== loop.length) return false
  const positions: THREE.Vector3[] = []
  const seen = new Set<number>()
  for (const id of faceIds) {
    const face = mesh.faces.get(id)
    if (!face || face.vertexIds.length !== 3) return false
    for (const vid of face.vertexIds) {
      if (seen.has(vid)) continue
      seen.add(vid)
      const vertex = mesh.vertices.get(vid)
      if (!vertex) return false
      positions.push(vertex.position)
    }
  }
  if (!polygonPlanarity(positions).planar) return false
  return loop.every((vid) => seen.has(vid))
}

export function loopUvs(mesh: EditableMesh, faceIds: number[], loop: number[]): THREE.Vector2[] {
  const sel = new Set(faceIds)
  return loop.map((vid) => {
    for (const fid of sel) {
      const face = mesh.faces.get(fid)
      if (!face) continue
      const idx = face.vertexIds.indexOf(vid)
      if (idx >= 0) return face.uvs[idx]?.clone() ?? new THREE.Vector2()
    }
    return new THREE.Vector2()
  })
}

/**
 * Interior edges of a flat triangle patch whose every edge is selected.
 * A face bevel passes those spokes along with the outline; they are not real edges to chamfer.
 */
export function planarTriPatchSpokes(mesh: EditableMesh, edgeIds: number[]): Set<number> {
  const selected = new Set(edgeIds)
  const triIds = [...mesh.faces.values()]
    .filter((face) => face.vertexIds.length === 3 && face.edgeIds.every((id) => selected.has(id)))
    .map((face) => face.id)
  const drop = new Set<number>()
  if (triIds.length < 2) return drop
  for (const comp of HalfEdgeTopology.connectedFaceComponents(mesh, triIds)) {
    const loop = orientedFaceBoundary(mesh, comp)
    if (!loop || !isTriangulatedPlanarPatch(mesh, comp, loop)) continue
    const boundary = new Set(HalfEdgeTopology.findRegionBoundaryEdges(mesh, comp).map((edge) => edge.id))
    for (const id of comp) {
      const face = mesh.faces.get(id)
      if (!face) continue
      for (const edgeId of face.edgeIds) {
        if (selected.has(edgeId) && !boundary.has(edgeId)) drop.add(edgeId)
      }
    }
  }
  return drop
}
