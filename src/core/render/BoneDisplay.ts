/** Keep small joints readable without changing the actual rig or bind pose. */
export function boneDisplayMetrics(length: number, worldPerPixel: number, size = 1) {
  const pixels = Math.max(0, worldPerPixel)
  const scale = Math.max(.5, Math.min(2, size))
  return {
    radial: Math.max(length * .75, pixels * 2.5 / .15) * scale,
    joint: Math.max(length * .055, pixels * 3.5) * scale,
    tip: Math.max(length * .035, pixels * 2.5) * scale,
  }
}
