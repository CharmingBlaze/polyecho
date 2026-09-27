/** Brush diameter for 2D paint. The value in the toolbar is the full-pressure size. */

export const BRUSH_SIZE_MIN = 1
export const BRUSH_SIZE_MAX = 128
/** Screen pixels of drag that change the brush by one texel. */
export const BRUSH_SIZE_DRAG_PX = 6
/**
 * Slider curve. 1 is linear. Lower values give diameters near 1 more of the track
 * so a size of 4 or 8 is a real grab, not a sliver at the left end.
 */
export const BRUSH_SIZE_CURVE = 0.45
/** Pixel-art diameters. The rest of 1–128 stays on the slider. */
export const BRUSH_SIZE_PRESETS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 64, 128] as const

const SIZED_TOOLS = new Set(['brush', 'eraser', 'dither', 'shade', 'line', 'rect', 'circle'])

export function clampBrushSize(value: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return BRUSH_SIZE_MIN
  return Math.max(BRUSH_SIZE_MIN, Math.min(BRUSH_SIZE_MAX, Math.round(n)))
}

/** Map a diameter onto 0–1 for the size slider. */
export function brushSizeToUnit(size: number): number {
  const s = clampBrushSize(size)
  const t = (s - BRUSH_SIZE_MIN) / (BRUSH_SIZE_MAX - BRUSH_SIZE_MIN)
  return Math.pow(t, BRUSH_SIZE_CURVE)
}

/** Map a 0–1 slider position back to a diameter. */
export function brushSizeFromUnit(unit: number): number {
  const u = Math.max(0, Math.min(1, unit))
  const t = Math.pow(u, 1 / BRUSH_SIZE_CURVE)
  return clampBrushSize(BRUSH_SIZE_MIN + t * (BRUSH_SIZE_MAX - BRUSH_SIZE_MIN))
}

export function toolUsesBrushSize(tool: string): boolean {
  return SIZED_TOOLS.has(tool)
}

/**
 * Pen pressure scales the stamp down from the chosen size.
 * A mouse, a hovering pen (pressure 0), or a disabled preference keeps that size.
 */
export function pressureBrushSize(base: number, pressure: number, enabled: boolean): number {
  const size = clampBrushSize(base)
  if (!enabled || !(pressure > 0)) return size
  return clampBrushSize(Math.max(BRUSH_SIZE_MIN, size * Math.min(1, pressure)))
}

/** Up or right grows the brush. */
export function brushSizeFromDrag(startSize: number, dx: number, dy: number): number {
  return clampBrushSize(startSize + (dx - dy) / BRUSH_SIZE_DRAG_PX)
}

/** Alt+wheel: one texel per notch, five with Shift. Negative deltaY (wheel up) grows. */
export function brushSizeWheelStep(deltaY: number, shiftKey: boolean): number {
  const step = shiftKey ? 5 : 1
  return deltaY < 0 ? step : -step
}

export function brushResizeGesture(input: {
  button: number
  pointerType: string
  shiftKey: boolean
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  space: boolean
  tool: string
}): boolean {
  if (!toolUsesBrushSize(input.tool) || input.space || input.altKey) return false
  if (input.ctrlKey || input.metaKey) return false
  if (input.button === 0 && input.shiftKey) return true
  // Pen barrel / side button. Mouse right-drag stays a pan.
  if (input.pointerType === 'pen' && (input.button === 2 || input.button === 5)) return true
  return false
}
