/** Preferred minimum. Shrinks further when the display work area is smaller. */
export const PREFERRED_MIN = { width: 960, height: 560 }

export function minimumSizeFor(workArea) {
  const width = Math.max(640, Math.min(PREFERRED_MIN.width, workArea.width))
  const height = Math.max(480, Math.min(PREFERRED_MIN.height, workArea.height))
  return {
    width: Math.round(width),
    height: Math.round(height)
  }
}

function clampSize(value, min, max) {
  const floor = Math.min(min, max)
  const n = Number.isFinite(value) ? value : floor
  return Math.round(Math.max(floor, Math.min(n, max)))
}

/**
 * Place a restored window inside the current display work area.
 * A saved rect from an unplugged monitor lands on the remaining screen.
 */
export function fitWindowBounds(saved, workArea, minSize) {
  const width = clampSize(saved.width, minSize.width, workArea.width)
  const height = clampSize(saved.height, minSize.height, workArea.height)
  let x = Number.isFinite(saved.x)
    ? saved.x
    : workArea.x + Math.round((workArea.width - width) / 2)
  let y = Number.isFinite(saved.y)
    ? saved.y
    : workArea.y + Math.round((workArea.height - height) / 2)

  if (x < workArea.x) x = workArea.x
  if (y < workArea.y) y = workArea.y
  if (x + width > workArea.x + workArea.width) {
    x = workArea.x + Math.max(0, workArea.width - width)
  }
  if (y + height > workArea.y + workArea.height) {
    y = workArea.y + Math.max(0, workArea.height - height)
  }
  return { x: Math.round(x), y: Math.round(y), width, height }
}

/** True when the title bar is off the work area, or the window is larger than it. */
export function needsRefit(bounds, workArea) {
  if (bounds.width > workArea.width + 8 || bounds.height > workArea.height + 8) return true
  const left = Math.max(bounds.x, workArea.x)
  const top = Math.max(bounds.y, workArea.y)
  const right = Math.min(bounds.x + bounds.width, workArea.x + workArea.width)
  const bottom = Math.min(bounds.y + bounds.height, workArea.y + workArea.height)
  const visibleW = right - left
  const visibleH = bottom - top
  return visibleW < 80 || visibleH < 48
}
