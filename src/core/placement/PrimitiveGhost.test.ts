import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { PrimitiveGhost } from './PrimitiveGhost'

describe('CAD primitive ghost', () => {
  it('draws a translucent mesh and a dashed bounding box instead of a solid slab', () => {
    const ghost = new PrimitiveGhost()
    ghost.update('BOX', { width: 2, depth: 1, height: 1.5 }, new THREE.Vector3())
    const fill = ghost.group.children.find(c => c instanceof THREE.Mesh) as THREE.Mesh
    const lines = ghost.group.children.filter(c => c instanceof THREE.LineSegments) as THREE.LineSegments[]
    const bounds = lines.find(l => l.material instanceof THREE.LineDashedMaterial && l.renderOrder === 80)!
    expect((fill.material as THREE.MeshBasicMaterial).transparent).toBe(true)
    expect((fill.material as THREE.MeshBasicMaterial).opacity).toBeLessThan(0.3)
    expect((fill.material as THREE.MeshBasicMaterial).depthWrite).toBe(false)
    expect(bounds.material).toBeInstanceOf(THREE.LineDashedMaterial)
    expect(bounds.geometry.getAttribute('position').count).toBe(24)
    expect(bounds.geometry.getAttribute('lineDistance')).toBeTruthy()
    ghost.dispose()
  })
})
