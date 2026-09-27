import { describe, expect, it } from 'vitest'
import {
  BRUSH_SIZE_MAX,
  BRUSH_SIZE_MIN,
  brushResizeGesture,
  brushSizeFromDrag,
  brushSizeFromUnit,
  brushSizeToUnit,
  brushSizeWheelStep,
  clampBrushSize,
  pressureBrushSize,
  toolUsesBrushSize
} from './BrushSize'

describe('brush size', () => {
  it('clamps to 1–128 texels', () => {
    expect(clampBrushSize(0)).toBe(1)
    expect(clampBrushSize(3.4)).toBe(3)
    expect(clampBrushSize(200)).toBe(128)
    expect(clampBrushSize(Number.NaN)).toBe(1)
  })

  it('gives small diameters more slider travel than a linear range', () => {
    const linear = (6 - BRUSH_SIZE_MIN) / (BRUSH_SIZE_MAX - BRUSH_SIZE_MIN)
    expect(brushSizeToUnit(1)).toBe(0)
    expect(brushSizeToUnit(128)).toBe(1)
    expect(brushSizeToUnit(6)).toBeGreaterThan(linear * 2)
    expect(brushSizeFromUnit(0)).toBe(1)
    expect(brushSizeFromUnit(1)).toBe(128)
    for (let size = BRUSH_SIZE_MIN; size <= BRUSH_SIZE_MAX; size++) {
      expect(brushSizeFromUnit(brushSizeToUnit(size))).toBe(size)
    }
  })

  it('treats the toolbar size as full pen pressure', () => {
    expect(pressureBrushSize(10, 1, true)).toBe(10)
    expect(pressureBrushSize(10, 0.45, true)).toBe(5)
    expect(pressureBrushSize(10, 0, true)).toBe(10)
    expect(pressureBrushSize(10, 0.2, false)).toBe(10)
  })

  it('grows when the drag goes up or right', () => {
    expect(brushSizeFromDrag(8, 0, -18)).toBe(11)
    expect(brushSizeFromDrag(8, 12, 0)).toBe(10)
    expect(brushSizeFromDrag(2, -30, 30)).toBe(1)
  })

  it('steps on alt-wheel', () => {
    expect(brushSizeWheelStep(-100, false)).toBe(1)
    expect(brushSizeWheelStep(100, true)).toBe(-5)
  })

  it('resizes from shift-drag or a pen side button, and leaves mouse right-drag alone', () => {
    const base = {
      button: 0,
      pointerType: 'mouse',
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      space: false,
      tool: 'brush'
    }
    expect(brushResizeGesture({ ...base, shiftKey: true })).toBe(true)
    expect(brushResizeGesture({ ...base, pointerType: 'pen', button: 2 })).toBe(true)
    expect(brushResizeGesture({ ...base, pointerType: 'pen', button: 5 })).toBe(true)
    expect(brushResizeGesture({ ...base, button: 2 })).toBe(false)
    expect(brushResizeGesture({ ...base, shiftKey: true, tool: 'picker' })).toBe(false)
    expect(brushResizeGesture({ ...base, shiftKey: true, altKey: true })).toBe(false)
    expect(toolUsesBrushSize('line')).toBe(true)
    expect(toolUsesBrushSize('bucket')).toBe(false)
  })
})
