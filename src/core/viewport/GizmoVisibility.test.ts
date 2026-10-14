import { describe, expect, it } from 'vitest'
import { paintHidesTransformGizmo, shouldConcealTransformGizmo } from './GizmoVisibility'

describe('GizmoVisibility', () => {
  it('hides the gizmo on the Paint tab unless Select is active', () => {
    expect(paintHidesTransformGizmo('uvpaint', 'paint', 'brush')).toBe(true)
    expect(paintHidesTransformGizmo('uvpaint', 'paint', 'eraser')).toBe(true)
    expect(paintHidesTransformGizmo('uvpaint', 'paint', 'select')).toBe(false)
  })

  it('keeps the gizmo in Model and on the UV tab', () => {
    expect(paintHidesTransformGizmo('model', 'paint', 'brush')).toBe(false)
    expect(paintHidesTransformGizmo('uvpaint', 'uv', 'brush')).toBe(false)
  })

  it('also conceals during playback and weight paint', () => {
    expect(shouldConcealTransformGizmo({
      appMode: 'animate',
      uvWorkspaceTab: 'uv',
      paintTool: 'select',
      isPlaying: true
    })).toBe(true)
    expect(shouldConcealTransformGizmo({
      appMode: 'rig',
      uvWorkspaceTab: 'uv',
      paintTool: 'select',
      isWeightPaintActive: true
    })).toBe(true)
    expect(shouldConcealTransformGizmo({
      appMode: 'model',
      uvWorkspaceTab: 'uv',
      paintTool: 'brush'
    })).toBe(false)
  })
})
