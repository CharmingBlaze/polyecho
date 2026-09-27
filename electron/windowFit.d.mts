export const PREFERRED_MIN: { width: number; height: number }

export function minimumSizeFor(workArea: {
  x?: number
  y?: number
  width: number
  height: number
}): { width: number; height: number }

export function fitWindowBounds(
  saved: { x?: number; y?: number; width: number; height: number },
  workArea: { x: number; y: number; width: number; height: number },
  minSize: { width: number; height: number }
): { x: number; y: number; width: number; height: number }

export function needsRefit(
  bounds: { x: number; y: number; width: number; height: number },
  workArea: { x: number; y: number; width: number; height: number }
): boolean
