import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { screenSpaceClipOffset, vertexPointsToMarkerGeometry } from './VertexMarkers'

describe('VertexMarkers', () => {
  it('keeps NDC size constant when clip.w changes', () => {
    const a = screenSpaceClipOffset(1, 0.5, 8, 800)
    const b = screenSpaceClipOffset(4, 0.5, 8, 800)
    expect(a / 1).toBeCloseTo(b / 4)
  })

  it('builds one instance per vertex', () => {
    const src = new THREE.BufferGeometry()
    src.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3))
    src.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 1, 0, 0, 0, 1, 0], 3))
    const geo = vertexPointsToMarkerGeometry(src)
    expect(geo.instanceCount).toBe(3)
    expect(geo.getAttribute('instancePosition').count).toBe(3)
    src.dispose()
    geo.dispose()
  })
})
