/** Local-space live mirror: move existing counterparts to stay opposite selected verts. */

export interface LiveSymmetryAxes {
  x?: boolean
  y?: boolean
  z?: boolean
}

export interface LiveSymmetryVert {
  id: string | number
  position: { x: number; y: number; z: number }
}

export function liveSymmetryEnabled(axes: LiveSymmetryAxes): boolean {
  return !!(axes.x || axes.y || axes.z)
}

/** Default 5 cm — same as the gizmo path. Only updates verts that are already near a mirror. */
export function applyLiveSymmetry(
  verts: LiveSymmetryVert[],
  movingIds: { has(id: string | number): boolean },
  axes: LiveSymmetryAxes,
  tol = 0.05
): void {
  if (!liveSymmetryEnabled(axes)) return

  for (const v of verts) {
    if (movingIds.has(v.id)) continue
    for (const sel of verts) {
      if (!movingIds.has(sel.id)) continue
      const sx = sel.position.x
      const sy = sel.position.y
      const sz = sel.position.z
      if (
        axes.x
        && Math.abs(v.position.x + sx) < tol
        && Math.abs(v.position.y - sy) < tol
        && Math.abs(v.position.z - sz) < tol
      ) {
        v.position.x = -sx
        v.position.y = sy
        v.position.z = sz
      }
      if (
        axes.y
        && Math.abs(v.position.y + sy) < tol
        && Math.abs(v.position.x - sx) < tol
        && Math.abs(v.position.z - sz) < tol
      ) {
        v.position.x = sx
        v.position.y = -sy
        v.position.z = sz
      }
      if (
        axes.z
        && Math.abs(v.position.z + sz) < tol
        && Math.abs(v.position.x - sx) < tol
        && Math.abs(v.position.y - sy) < tol
      ) {
        v.position.x = sx
        v.position.y = sy
        v.position.z = -sz
      }
    }
  }
}
