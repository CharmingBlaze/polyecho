import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { EditableMesh } from '../MeshKernel'
import { Straighten } from './Straighten'

describe('Straighten', () => {
  it('makes a crooked edge one level line', () => {
    const mesh = new EditableMesh()
    const a = mesh.addVertex(new THREE.Vector3(0, 0.2, 0.4)).id
    const b = mesh.addVertex(new THREE.Vector3(1, 0.8, -0.3)).id
    const c = mesh.addVertex(new THREE.Vector3(2, 0.1, 0.5)).id
    mesh.getOrCreateEdge(a, b)
    mesh.getOrCreateEdge(b, c)
    Straighten.apply(mesh, [a, b, c], 'horizontal')
    const pts = [a, b, c].map(id => mesh.vertices.get(id)!.position)
    expect(pts.every(p => Math.abs(p.y - pts[0].y) < 1e-6)).toBe(true)
    const ab = pts[1].clone().sub(pts[0])
    const ac = pts[2].clone().sub(pts[0])
    expect(ab.clone().cross(ac).length()).toBeLessThan(1e-5)
    expect(pts[1].x).toBeGreaterThan(pts[0].x)
    expect(pts[2].x).toBeGreaterThan(pts[1].x)
  })

  it('stands a leaning edge upright without changing its heights', () => {
    const mesh = new EditableMesh()
    const a = mesh.addVertex(new THREE.Vector3(0, 0, 0)).id
    const b = mesh.addVertex(new THREE.Vector3(0.4, 2, 0.3)).id
    mesh.getOrCreateEdge(a, b)
    Straighten.apply(mesh, [a, b], 'vertical')
    const pa = mesh.vertices.get(a)!.position
    const pb = mesh.vertices.get(b)!.position
    expect(pa.x).toBeCloseTo(pb.x)
    expect(pa.z).toBeCloseTo(pb.z)
    expect(pa.y).toBeCloseTo(0)
    expect(pb.y).toBeCloseTo(2)
  })

  it('lays a face flat without pulling its corners together', () => {
    const mesh = new EditableMesh()
    const ids = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(2, 0.4, 0),
      new THREE.Vector3(2, 0.2, 1),
      new THREE.Vector3(0, 0.6, 1)
    ].map(p => mesh.addVertex(p).id)
    mesh.addFace(ids)
    Straighten.apply(mesh, ids, 'horizontal')
    const y = mesh.vertices.get(ids[0])!.position.y
    for (const id of ids) expect(mesh.vertices.get(id)!.position.y).toBeCloseTo(y)
    expect(mesh.vertices.get(ids[1])!.position.x).toBeCloseTo(2)
    expect(mesh.vertices.get(ids[2])!.position.z).toBeCloseTo(1)
  })

  it('stands a face in a vertical plane', () => {
    const mesh = new EditableMesh()
    const ids = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(2, 0.2, 0.4),
      new THREE.Vector3(2, 1.5, 0.5),
      new THREE.Vector3(0, 1.2, 0.15)
    ].map(p => mesh.addVertex(p).id)
    mesh.addFace(ids)
    Straighten.apply(mesh, ids, 'vertical')
    const pts = ids.map(id => mesh.vertices.get(id)!.position.clone())
    const center = pts.reduce((acc, p) => acc.add(p), new THREE.Vector3()).multiplyScalar(0.25)
    const normal = pts[1].clone().sub(pts[0]).cross(pts[3].clone().sub(pts[0])).normalize()
    expect(Math.abs(normal.y)).toBeLessThan(1e-4)
    expect(pts[2].y - pts[0].y).toBeGreaterThan(0.5)
    for (const p of pts) expect(Math.abs(p.clone().sub(center).dot(normal))).toBeLessThan(1e-4)
  })
})
