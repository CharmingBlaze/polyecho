import type { PixelBuffer } from './PixelCanvas'

export type PaintShapeTool = 'line' | 'rect' | 'circle'

/** The same stroke the 2D canvas commits for the line, rectangle, and circle tools. */
export function drawPaintShape(
  buffer: PixelBuffer,
  tool: PaintShapeTool,
  start: { x: number; y: number },
  end: { x: number; y: number },
  color: string,
  size: number,
  filled: boolean,
  opacity: number
) {
  if (tool === 'line') buffer.drawLine(start.x, start.y, end.x, end.y, color, size, opacity)
  else if (tool === 'rect') buffer.drawRect(start.x, start.y, end.x, end.y, color, size, filled, opacity)
  else buffer.drawCircle(start.x, start.y, Math.round(Math.hypot(end.x - start.x, end.y - start.y)), color, size, filled, opacity)
}
