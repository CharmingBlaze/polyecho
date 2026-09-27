import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { EditableMesh } from '../MeshKernel'
import { CurveChain } from './CurveChain'

describe('Curve chain', () => {
  it('bows the middle of a straight edge and leaves the ends fixed', () => {
    const mesh = new EditableMesh()
    const ids = [0, 1, 2].map(i => mesh.addVertex(new THREE.Vector3(i, 0, 0)).id)
    mesh.getOrCreateEdge(ids[0], ids[1])
    mesh.getOrCreateEdge(ids[1], ids[2])
    const up = new THREE.Vector3(0, 1, 0)
    expect(CurveChain.apply(mesh, ids, 0, new THREE.Vector3(1, 0, 0), up)).toBe(0)
    CurveChain.apply(mesh, ids, 0.5, new THREE.Vector3(1, 0, 0), up)
    expect(mesh.vertices.get(ids[0])!.position.distanceTo(new THREE.Vector3(0, 0, 0))).toBeLessThan(1e-8)
    expect(mesh.vertices.get(ids[2])!.position.distanceTo(new THREE.Vector3(2, 0, 0))).toBeLessThan(1e-8)
    const mid = mesh.vertices.get(ids[1])!.position
    expect(mid.y).toBeGreaterThan(0.4)
    expect(mid.x).toBeCloseTo(1)
  })

  it('rounds a lumpy loop toward one radius', () => {
    const mesh = new EditableMesh()
    const ids = [
      new THREE.Vector3(2, 0, 0),
      new THREE.Vector3(0, 0.5, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, -0.5, 0)
    ].map(p => mesh.addVertex(p).id)
    mesh.addFace(ids)
    const before = ids.map(id => mesh.vertices.get(id)!.position.clone())
    const center = before.reduce((acc, p) => acc.add(p), new THREE.Vector3()).multiplyScalar(0.25)
    CurveChain.apply(mesh, ids, 1, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0))
    const radii = ids.map(id => mesh.vertices.get(id)!.position.distanceTo(center))
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(1e-4)
  })
})
