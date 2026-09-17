import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { meshPlacementMatrix, perspectiveEdgeParameter, surfaceTriangles } from './SurfaceGeometry'

describe('surface geometry for tools', () => {
  it('converts a screen midpoint to the matching point on a perspective edge', () => {
    const camera = new THREE.PerspectiveCamera(60,1,0.1,100)
    camera.updateMatrixWorld()
    const a = new THREE.Vector3(-1,0,-2), b = new THREE.Vector3(1,0,-8)
    const t = perspectiveEdgeParameter(0.5,a,b,camera)
    const projected = a.clone().lerp(b,t).project(camera)
    expect(projected.x).toBeCloseTo((a.clone().project(camera).x+b.clone().project(camera).x)/2)
  })
  it('places local surfaces using rotation and nonuniform scale', () => {
    const matrix = meshPlacementMatrix({position:{x:3,y:4,z:5},rotation:{x:0,y:0,z:90},scale:{x:2,y:3,z:4}})
    expect(new THREE.Vector3(1,0,0).applyMatrix4(matrix).distanceTo(new THREE.Vector3(3,6,5))).toBeLessThan(1e-10)
  })
  it('triangulates an L shaped surface without covering the missing corner', () => {
    const ps = [[0,0],[3,0],[3,1],[1,1],[1,3],[0,3]].map(([x,y])=>new THREE.Vector3(x,y,0))
    const area = surfaceTriangles(ps).reduce((sum,[a,b,c])=>sum+new THREE.Triangle(ps[a],ps[b],ps[c]).getArea(),0)
    expect(area).toBeCloseTo(5)
  })
})
