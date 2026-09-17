import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { closestScreenSegment, visibleWorldPoint } from './ComponentPicking'

describe('component picking', () => {
  it('uses a circular pixel tolerance in a narrow viewport', () => {
    const point = new THREE.Vector3()
    expect(closestScreenSegment(new THREE.Vector2(0.1,0),point,point,200,800).distance).toBe(10)
    expect(closestScreenSegment(new THREE.Vector2(0,0.025),point,point,200,800).distance).toBe(10)
  })
  it('respects depth, x-ray, and the camera clipping planes', () => {
    const camera = new THREE.OrthographicCamera(-2,2,2,-2,0.1,20)
    camera.position.z=5; camera.updateMatrixWorld()
    const box = new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshBasicMaterial())
    box.updateMatrixWorld()
    expect(visibleWorldPoint(new THREE.Vector3(0,0,1),camera,[box])).toBe(true)
    expect(visibleWorldPoint(new THREE.Vector3(0,0,-1),camera,[box])).toBe(false)
    expect(visibleWorldPoint(new THREE.Vector3(0,0,-1),camera,[box],true)).toBe(true)
    expect(visibleWorldPoint(new THREE.Vector3(0,0,10),camera,[box],true)).toBe(false)
    box.geometry.dispose(); (box.material as THREE.Material).dispose()
  })
})
