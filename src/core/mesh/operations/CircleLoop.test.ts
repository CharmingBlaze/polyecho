import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { EditableMesh } from '../MeshKernel'
import { CircleLoop } from './CircleLoop'

function quad(points: THREE.Vector3[]) {
  const mesh = new EditableMesh()
  const ids = points.map(p => mesh.addVertex(p).id)
  mesh.addFace(ids)
  mesh.recalculateNormals()
  return { mesh, ids }
}

function radii(mesh: EditableMesh, ids: number[]) {
  const center = new THREE.Vector3()
  for (const id of ids) center.add(mesh.vertices.get(id)!.position)
  center.multiplyScalar(1 / ids.length)
  return ids.map(id => mesh.vertices.get(id)!.position.distanceTo(center))
}

describe('Circle loop', () => {
  it('spaces an irregular quad evenly on one circle', () => {
    const { mesh, ids } = quad([
      new THREE.Vector3(1.4, 0.2, 0),
      new THREE.Vector3(0.3, -1.1, 0),
      new THREE.Vector3(-1.3, -0.2, 0),
      new THREE.Vector3(-0.1, 0.9, 0)
    ])
    expect(CircleLoop.circleVertices(mesh, ids)).toBe(4)
    const r = radii(mesh, ids)
    expect(Math.max(...r) - Math.min(...r)).toBeLessThan(1e-5)
    const center = new THREE.Vector3()
    for (const id of ids) center.add(mesh.vertices.get(id)!.position)
    center.multiplyScalar(0.25)
    const angles = ids.map(id => {
      const p = mesh.vertices.get(id)!.position.clone().sub(center)
      return Math.atan2(p.y, p.x)
    }).sort((a, b) => a - b)
    const steps = angles.map((angle, i) => {
      let d = (i + 1 < angles.length ? angles[i + 1] : angles[0] + Math.PI * 2) - angle
      return d
    })
    expect(Math.max(...steps) - Math.min(...steps)).toBeLessThan(1e-5)
  })

  it('flattens a bent loop onto the circle plane and leaves other verts', () => {
    const mesh = new EditableMesh()
    const loop = [
      new THREE.Vector3(1, 0, 0.4),
      new THREE.Vector3(0, -1, -0.3),
      new THREE.Vector3(-1, 0, 0.2),
      new THREE.Vector3(0, 1, -0.5)
    ].map(p => mesh.addVertex(p).id)
    const outsider = mesh.addVertex(new THREE.Vector3(4, 4, 4)).id
    mesh.addFace(loop)
    mesh.recalculateNormals()
    CircleLoop.circleVertices(mesh, loop)
    const moved = loop.map(id => mesh.vertices.get(id)!.position)
    const normal = new THREE.Vector3()
    const center = new THREE.Vector3()
    for (const p of moved) center.add(p)
    center.multiplyScalar(0.25)
    for (let i = 0; i < moved.length; i++) {
      normal.add(moved[i].clone().sub(center).cross(moved[(i + 1) % moved.length].clone().sub(center)))
    }
    normal.normalize()
    for (const p of moved) expect(Math.abs(p.clone().sub(center).dot(normal))).toBeLessThan(1e-5)
    expect(mesh.vertices.get(outsider)!.position.distanceTo(new THREE.Vector3(4, 4, 4))).toBeLessThan(1e-8)
  })

  it('circles only the outline of a face patch', () => {
    const mesh = new EditableMesh()
    const p = (x: number, y: number) => mesh.addVertex(new THREE.Vector3(x, y, 0)).id
    const v = [p(0, 0), p(1, 0), p(2, 0), p(0, 1), p(1, 1), p(2, 1), p(0, 2), p(1, 2), p(2, 2)]
    const faces = [
      mesh.addFace([v[0], v[1], v[4], v[3]])!,
      mesh.addFace([v[1], v[2], v[5], v[4]])!,
      mesh.addFace([v[3], v[4], v[7], v[6]])!,
      mesh.addFace([v[4], v[5], v[8], v[7]])!
    ]
    const outline = CircleLoop.outlineVertexIds(mesh, faces.map(face => face.id))
    expect(outline).not.toContain(v[4])
    expect(outline).toHaveLength(8)
    const before = mesh.vertices.get(v[4])!.position.clone()
    CircleLoop.circleVertices(mesh, outline)
    expect(mesh.vertices.get(v[4])!.position.distanceTo(before)).toBe(0)
    const r = radii(mesh, outline)
    expect(Math.max(...r) - Math.min(...r)).toBeLessThan(1e-5)
  })
})
