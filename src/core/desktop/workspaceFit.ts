/** Widest the properties column may be while a usable 3D view remains. */
export function sidebarWidthLimit(windowWidth: number): number {
  const chrome = 48
  const keepView = windowWidth < 1280 ? Math.round(windowWidth * 0.5) : 560
  return Math.max(200, Math.min(600, windowWidth - chrome - keepView))
}

/** Timeline height that leaves a modeling view on a short laptop panel. */
export function timelineHeightFor(windowHeight: number): number {
  if (windowHeight >= 900) return 280
  if (windowHeight >= 760) return 200
  return 148
}
