import { describe, expect, it } from 'vitest'
import {
  canHideSelected,
  canHideUnselected,
  canIsolateSelected,
  canShowHidden,
  hideSelected,
  hideUnselected,
  isolateSelected,
  isSelectionIsolated,
  showHidden,
} from './ObjectVisibility'

function scene(...visible: boolean[]) {
  return visible.map((v, i) => ({ id: `m${i}`, visible: v }))
}

describe('ObjectVisibility', () => {
  it('hides only the selected objects', () => {
    const meshes = scene(true, true, true)
    expect(hideSelected(meshes, ['m0', 'm2'])).toBe(2)
    expect(meshes.map(m => m.visible)).toEqual([false, true, false])
  })

  it('hides everything except the selection', () => {
    const meshes = scene(true, true, true)
    expect(hideUnselected(meshes, ['m1'])).toBe(2)
    expect(meshes.map(m => m.visible)).toEqual([false, true, false])
    expect(isSelectionIsolated(meshes, ['m1'])).toBe(true)
  })

  it('reveals every hidden object', () => {
    const meshes = scene(false, true, false)
    expect(showHidden(meshes)).toBe(2)
    expect(meshes.every(m => m.visible)).toBe(true)
  })

  it('isolates the selection, then toggles back to show all', () => {
    const meshes = scene(true, true, true)
    expect(isolateSelected(meshes, ['m0'])).toBe(2)
    expect(meshes.map(m => m.visible)).toEqual([true, false, false])
    expect(isolateSelected(meshes, ['m0'])).toBe(2)
    expect(meshes.every(m => m.visible)).toBe(true)
  })

  it('does nothing without a selection', () => {
    const meshes = scene(true, true)
    expect(hideUnselected(meshes, [])).toBe(0)
    expect(isolateSelected(meshes, [])).toBe(0)
    expect(isSelectionIsolated(meshes, [])).toBe(false)
    expect(canHideUnselected(meshes, [])).toBe(false)
    expect(canIsolateSelected(meshes, [])).toBe(false)
    expect(canHideSelected(meshes, ['m0'])).toBe(true)
    expect(canShowHidden(meshes)).toBe(false)
  })
})
