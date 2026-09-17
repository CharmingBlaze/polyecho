export interface PackRect { x: number; y: number; w: number; h: number }
export interface PackSize { w: number; h: number }

/** Best short-side fit, splitting free rectangles so gaps between islands can be reused. */
export function packUvRectangles(boxes: PackSize[], width: number, height: number, margin: number, scale: number) {
  let free: PackRect[] = [{ x: margin, y: margin, w: width - margin, h: height - margin }]
  const result: (PackRect & { rotated: boolean })[] = []
  const eps = 1e-9
  for (const box of boxes) {
    let best: (PackRect & { rotated: boolean; score: number; long: number }) | null = null
    for (const rect of free) {
      for (const rotated of [false, true]) {
        const w = (rotated ? box.h : box.w) * scale + margin
        const h = (rotated ? box.w : box.h) * scale + margin
        if (w > rect.w + eps || h > rect.h + eps) continue
        const score = Math.min(rect.w - w, rect.h - h), long = Math.max(rect.w - w, rect.h - h)
        if (!best || score < best.score || (score === best.score && long < best.long)) best = { x: rect.x, y: rect.y, w, h, rotated, score, long }
      }
    }
    if (!best) return null
    const used = best
    result.push({ x: used.x, y: used.y, w: used.w - margin, h: used.h - margin, rotated: used.rotated })
    const next: PackRect[] = []
    for (const r of free) {
      if (used.x >= r.x + r.w - eps || used.x + used.w <= r.x + eps || used.y >= r.y + r.h - eps || used.y + used.h <= r.y + eps) { next.push(r); continue }
      if (used.x > r.x + eps) next.push({ ...r, w: used.x - r.x })
      if (used.x + used.w < r.x + r.w - eps) next.push({ ...r, x: used.x + used.w, w: r.x + r.w - used.x - used.w })
      if (used.y > r.y + eps) next.push({ ...r, h: used.y - r.y })
      if (used.y + used.h < r.y + r.h - eps) next.push({ ...r, y: used.y + used.h, h: r.y + r.h - used.y - used.h })
    }
    free = next.filter((r, i) => !next.some((s, j) => i !== j && r.x >= s.x - eps && r.y >= s.y - eps && r.x + r.w <= s.x + s.w + eps && r.y + r.h <= s.y + s.h + eps && (j < i || r.x > s.x + eps || r.y > s.y + eps || r.w < s.w - eps || r.h < s.h - eps)))
  }
  return result
}
