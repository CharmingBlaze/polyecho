import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createCube, createPlane } from '../geometry/Primitives'
import { meshObjectWorldMatrix } from '../geometry/MeshTransform'
import { pickEditMesh } from '../geometry/ObjectPick'

describe('ObjectPick', () => {
  it('hits a translated cube instead of a plane at the origin', () => {
    const plane = createPlane('Plane', 2)
    const cube = createCube('Cube', 2)
    cube.position = { x: 8, y: 1, z: 0 }

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200)
    camera.position.set(8, 6, 8)
    camera.lookAt(8, 1, 0)
    camera.updateMatrixWorld()
    const el = document.createElement('div')

    const ray = new THREE.Ray(new THREE.Vector3(8, 6, 0), new THREE.Vector3(0, -1, 0))
    const hit = pickEditMesh([plane, cube], {
      overlay: new THREE.Vector2(0, 0),
      worldRay: ray,
      camera,
      element: el,
      vertexPx: 0,
      edgePx: 0,
    })
    expect(hit?.meshId).toBe(cube.id)
    expect(hit?.kind).toBe('face')
  })

  it('builds a world matrix from degrees and translation', () => {
    const cube = createCube('Cube', 2)
    cube.position = { x: 3, y: 4, z: 5 }
    cube.rotation = { x: 0, y: 90, z: 0 }
    const m = meshObjectWorldMatrix(cube)
    const p = new THREE.Vector3(1, 0, 0).applyMatrix4(m)
    expect(p.x).toBeCloseTo(3)
    expect(p.z).toBeCloseTo(4)
    expect(p.y).toBeCloseTo(4)
  })
})
