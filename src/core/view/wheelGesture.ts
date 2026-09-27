export interface WheelSample {
  deltaX: number
  deltaY: number
  deltaMode: number
  ctrlKey: boolean
  shiftKey: boolean
}

/**
 * Mouse wheel zooms. A laptop trackpad swipe (or Shift+wheel) pans.
 * Pinch arrives as Ctrl+wheel and stays a zoom.
 */
export function classifyWheel(sample: WheelSample): 'pan' | 'zoom' {
  if (sample.ctrlKey) return 'zoom'
  if (sample.shiftKey) return 'pan'
  if (Math.abs(sample.deltaX) > 1) return 'pan'
  return 'zoom'
}

/** Shift+wheel is a horizontal pan when the browser keeps the motion on deltaY. */
export function wheelPanDelta(sample: WheelSample): { x: number; y: number } {
  if (sample.shiftKey && Math.abs(sample.deltaX) < 1) return { x: sample.deltaY, y: 0 }
  return { x: sample.deltaX, y: sample.deltaY }
}

/** 3D viewport: one mouse notch (~100px) is about a 15% step. */
export const WHEEL_ZOOM_GAIN = 0.0014
/**
 * UV and paint canvases. A notch is about 7%, and trackpad pixels stay proportional
 * so a two-finger zoom is not a burst of fixed 15% jumps.
 */
export const CANVAS_WHEEL_ZOOM_GAIN = 0.0007

/**
 * One mouse notch (~100 device pixels) is about a 15% step at the default gain.
 * Trackpad pixels stay proportional so two-finger zoom is not a burst of 15% jumps.
 */
export function wheelZoomFactor(deltaY: number, deltaMode: number, invert = false, gain = WHEEL_ZOOM_GAIN): number {
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY
  const signed = pixels * (invert ? -1 : 1)
  const factor = Math.exp(-signed * gain)
  return Math.max(0.5, Math.min(2, factor))
}
