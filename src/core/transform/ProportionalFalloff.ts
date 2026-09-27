import type { Vector3 } from 'three'

/**
 * Connected smooth falloff. Distance is the shortest path along edges, measured
 * in the positions given (world space during a grab). Selected verts stay at
 * full strength. Verts farther than `radius` are omitted.
 */
export function connectedFalloffWeights(
  positions: Map<number, Vector3>,
  neighbors: Map<number, number[]>,
  sources: Iterable<number>,
  radius: number
): Map<number, number> {
  const weights = new Map<number, number>()
  if (!(radius > 1e-8)) {
    for (const id of sources) if (positions.has(id)) weights.set(id, 1)
    return weights
  }

  const dist = new Map<number, number>()
  const heap: { id: number; d: number }[] = []
  for (const id of sources) {
    if (!positions.has(id)) continue
    dist.set(id, 0)
    heap.push({ id, d: 0 })
  }

  while (heap.length) {
    let best = 0
    for (let i = 1; i < heap.length; i++) {
      if (heap[i]!.d < heap[best]!.d) best = i
    }
    const cur = heap.splice(best, 1)[0]!
    if (cur.d > (dist.get(cur.id) ?? Infinity) + 1e-8) continue
    const from = positions.get(cur.id)
    if (!from) continue
    for (const next of neighbors.get(cur.id) ?? []) {
      const to = positions.get(next)
      if (!to) continue
      const nd = cur.d + from.distanceTo(to)
      if (nd >= radius - 1e-8) continue
      if (nd + 1e-8 < (dist.get(next) ?? Infinity)) {
        dist.set(next, nd)
        heap.push({ id: next, d: nd })
      }
    }
  }

  for (const [id, d] of dist) {
    const x = 1 - d / radius
    weights.set(id, x * x * (3 - 2 * x))
  }
  return weights
}
