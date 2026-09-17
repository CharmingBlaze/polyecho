import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  paintVertexMarkerColors,
  screenSpaceClipOffset,
  VERTEX_COLOR_IDLE,
  VERTEX_COLOR_SELECTED,
  vertexPointsToMarkerGeometry
} from './VertexMarkers'

describe('VertexMarkers', () => {
  it('keeps NDC size constant when clip.w changes', () => {
    const a = screenSpaceClipOffset(1, 0.5, 8, 800)
    const b = screenSpaceClipOffset(4, 0.5, 8, 800)
    expect(a / 1).toBeCloseTo(b / 4)
  })

  it('builds one instance per vertex and copies fill colors', () => {
    const src = new THREE.BufferGeometry()
    src.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3))
    src.setAttribute('color', new THREE.Float32BufferAttribute([
      VERTEX_COLOR_IDLE.r, VERTEX_COLOR_IDLE.g, VERTEX_COLOR_IDLE.b,
      VERTEX_COLOR_SELECTED.r, VERTEX_COLOR_SELECTED.g, VERTEX_COLOR_SELECTED.b,
      VERTEX_COLOR_IDLE.r, VERTEX_COLOR_IDLE.g, VERTEX_COLOR_IDLE.b
    ], 3))
    const geo = vertexPointsToMarkerGeometry(src)
    expect(geo.instanceCount).toBe(3)
    expect(geo.getAttribute('instancePosition').count).toBe(3)
    const colors = geo.getAttribute('aMarkerColor') as THREE.InstancedBufferAttribute
    expect(colors).toBeInstanceOf(THREE.InstancedBufferAttribute)
    expect(colors.getX(1)).toBeCloseTo(VERTEX_COLOR_SELECTED.r)
    expect(colors.getY(1)).toBeCloseTo(VERTEX_COLOR_SELECTED.g)
    src.dispose()
    geo.dispose()
  })

  it('paints selected vertices orange without rebuilding', () => {
    const src = new THREE.BufferGeometry()
    src.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0], 3))
    src.setAttribute('color', new THREE.Float32BufferAttribute([
      VERTEX_COLOR_IDLE.r, VERTEX_COLOR_IDLE.g, VERTEX_COLOR_IDLE.b,
      VERTEX_COLOR_IDLE.r, VERTEX_COLOR_IDLE.g, VERTEX_COLOR_IDLE.b
    ], 3))
    const geo = vertexPointsToMarkerGeometry(src)
    expect(paintVertexMarkerColors(geo, ['a', 'b'], new Set(['b']))).toBe(true)
    const colors = geo.getAttribute('aMarkerColor') as THREE.InstancedBufferAttribute
    expect(colors.getX(0)).toBeCloseTo(VERTEX_COLOR_IDLE.r)
    expect(colors.getX(1)).toBeCloseTo(VERTEX_COLOR_SELECTED.r)
    expect(colors.getY(1)).toBeCloseTo(VERTEX_COLOR_SELECTED.g)
    src.dispose()
    geo.dispose()
  })
})
