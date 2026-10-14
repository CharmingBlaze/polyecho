import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { RenderPassOrder, ViewportLayerManager } from './ViewportLayers'

describe('ViewportLayerManager', () => {
  it('adds scene groups in increasing render-pass order', () => {
    const scene = new THREE.Scene()
    const layers = new ViewportLayerManager(scene)
    const groups = [
      layers.modelGroup,
      layers.shadowGroup,
      layers.gridGroup,
      layers.selectionGroup,
      layers.wireframeGroup,
      layers.gizmoGroup,
      layers.previewGroup,
      layers.hoverGroup,
    ]
    expect(groups.map((g) => g.renderOrder)).toEqual([
      RenderPassOrder.MODEL_GEOMETRY,
      RenderPassOrder.SHADOWS_AO,
      RenderPassOrder.GRID_AXES,
      RenderPassOrder.SELECTION,
      RenderPassOrder.VERTICES_EDGES,
      RenderPassOrder.GIZMOS,
      RenderPassOrder.TOOL_PREVIEWS,
      RenderPassOrder.HOVER_OVERLAY,
    ])
    for (let i = 1; i < groups.length; i++) {
      expect(groups[i]!.renderOrder).toBeGreaterThan(groups[i - 1]!.renderOrder)
    }
    expect(scene.children).toEqual(groups)
  })

  it('disposes child geometry when clearing a group', () => {
    const scene = new THREE.Scene()
    const layers = new ViewportLayerManager(scene)
    const geometry = new THREE.BufferGeometry()
    let disposed = false
    geometry.dispose = () => {
      disposed = true
    }
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
    layers.previewGroup.add(mesh)
    layers.clearPreviews()
    expect(layers.previewGroup.children).toHaveLength(0)
    expect(disposed).toBe(true)
  })

  it('removes every pass group from the scene on dispose', () => {
    const scene = new THREE.Scene()
    const layers = new ViewportLayerManager(scene)
    layers.dispose(scene)
    expect(scene.children).toHaveLength(0)
  })
})
