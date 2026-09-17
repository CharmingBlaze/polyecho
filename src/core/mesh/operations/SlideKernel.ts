import * as THREE from 'three'
import { EditableMesh } from '../MeshKernel'
import { LoopCutKernel } from './LoopCutKernel'

export interface SlideRail {
  vertexId: number
  a: THREE.Vector3
  b: THREE.Vector3
}

/** Rails for edge slide: each selected-edge vertex moves between its two unselected neighbors. */
export function edgeSlideRails(mesh: EditableMesh, edgeIds: number[]): SlideRail[] {
  const selected = new Set(edgeIds)
  const rails = new Map<number, { a?: THREE.Vector3; b?: THREE.Vector3 }>()
  for (const eId of edgeIds) {
    const edge = mesh.edges.get(eId)
    if (!edge) continue
    for (const fId of edge.faceIds) {
      const face = mesh.faces.get(fId)
      if (!face) continue
      for (const vid of [edge.v1, edge.v2]) {
        const i = face.vertexIds.indexOf(vid)
        if (i < 0) continue
        const n = face.vertexIds.length
        const prev = face.vertexIds[(i + n - 1) % n]
        const next = face.vertexIds[(i + 1) % n]
        const other = vid === edge.v1 ? edge.v2 : edge.v1
        const neighbor = prev === other ? next : prev
        const neighEdge = mesh.findEdge(vid, neighbor)
        if (!neighEdge || selected.has(neighEdge.id)) continue
        const slot = rails.get(vid) ?? {}
        const pos = mesh.vertices.get(neighbor)!.position.clone()
        if (!slot.a) slot.a = pos
        else if (!slot.b && slot.a.distanceToSquared(pos) > 1e-12) slot.b = pos
        rails.set(vid, slot)
      }
    }
  }
  const out: SlideRail[] = []
  for (const [vertexId, slot] of rails) {
    const here = mesh.vertices.get(vertexId)!.position.clone()
    const a = slot.a ?? here
    const b = slot.b ?? here.clone().add(here.clone().sub(a))
    out.push({ vertexId, a, b })
  }
  return out
}

export function applyEdgeSlide(mesh: EditableMesh, rails: SlideRail[], factor: number): void {
  const t = THREE.MathUtils.clamp(factor, -0.999, 0.999)
  for (const rail of rails) {
    const v = mesh.vertices.get(rail.vertexId)
    if (!v) continue
    if (t >= 0) v.position.copy(rail.a).lerp(rail.b, 0.5 + t * 0.5)
    else v.position.copy(rail.b).lerp(rail.a, 0.5 + (-t) * 0.5)
  }
  mesh.recalculateNormals()
}

export function vertexSlideRails(mesh: EditableMesh, vertexId: number, alongEdgeId?: number): SlideRail | null {
  const v = mesh.vertices.get(vertexId)
  if (!v) return null
  const edge = (alongEdgeId !== undefined ? mesh.edges.get(alongEdgeId) : null)
    ?? mesh.edges.get(v.edgeIds[0]!)
  if (!edge) return null
  return {
    vertexId,
    a: mesh.vertices.get(edge.v1)!.position.clone(),
    b: mesh.vertices.get(edge.v2)!.position.clone()
  }
}

export function applyVertexSlide(mesh: EditableMesh, rail: SlideRail, factor: number): void {
  const t = THREE.MathUtils.clamp(0.5 + factor * 0.5, 0.001, 0.999)
  const v = mesh.vertices.get(rail.vertexId)
  if (!v) return
  v.position.copy(rail.a).lerp(rail.b, t)
  mesh.recalculateNormals()
}

export function firstRingEdge(mesh: EditableMesh, edgeIds: number[]): number | null {
  for (const id of edgeIds) {
    if (LoopCutKernel.ringEdges(mesh, id).length > 0) return id
  }
  return edgeIds[0] ?? null
}
