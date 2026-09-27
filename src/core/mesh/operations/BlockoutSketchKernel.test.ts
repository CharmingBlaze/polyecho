import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { EditableMesh } from '../MeshKernel'
import { MeshBridge } from '../MeshBridge'
import { MeshValidator } from '../MeshValidator'
import { ExtrudeKernel } from './ExtrudeKernel'
import { BlockoutSketchKernel } from './BlockoutSketchKernel'
import { createCube } from '../../geometry/Primitives'

function cubeMesh() {
  return MeshBridge.meshObjectToEditableMesh(createCube('Cube', 2)).mesh
}

function faceFacing(mesh: EditableMesh, dir: THREE.Vector3) {
  let best = -1
  let bestDot = -Infinity
  for (const [id, face] of mesh.faces) {
    const d = face.normal.dot(dir)
    if (d > bestDot) {
      bestDot = d
      best = id
    }
  }
  return best
}

describe('Blockout Sketch kernel', () => {
  it('cuts an interior rectangle out of a face and keeps one N-gon', () => {
    const mesh = cubeMesh()
    const front = faceFacing(mesh, new THREE.Vector3(0, 0, 1))
    const cut = BlockoutSketchKernel.embedLoop(mesh, front, [
      new THREE.Vector3(-0.3, -0.3, 1),
      new THREE.Vector3(0.3, -0.3, 1),
      new THREE.Vector3(0.3, 0.3, 1),
      new THREE.Vector3(-0.3, 0.3, 1)
    ])
    expect('error' in cut).toBe(false)
    if ('error' in cut) return
    const inner = mesh.faces.get(cut.innerFaceId)!
    expect(inner.vertexIds).toHaveLength(4)
    expect(mesh.faces.has(front)).toBe(false)
    expect([...mesh.faces.values()].every(face => face.vertexIds.length >= 4)).toBe(true)
    expect([...mesh.edges.values()].every(edge => edge.faceIds.length === 2)).toBe(true)
    expect(MeshValidator.validate(mesh).valid).toBe(true)
  })

  it('turns a triangulated quad into quads before the cut', () => {
    const mesh = new EditableMesh()
    const ids = [
      new THREE.Vector3(-1, -1, 0),
      new THREE.Vector3(1, -1, 0),
      new THREE.Vector3(1, 1, 0),
      new THREE.Vector3(-1, 1, 0)
    ].map(p => mesh.addVertex(p).id)
    const tri = mesh.addFace([ids[0], ids[1], ids[2]])!
    mesh.addFace([ids[0], ids[2], ids[3]])
    mesh.recalculateNormals()
    const cut = BlockoutSketchKernel.embedLoop(mesh, tri.id, [
      new THREE.Vector3(-0.25, -0.25, 0),
      new THREE.Vector3(0.25, -0.25, 0),
      new THREE.Vector3(0.25, 0.25, 0),
      new THREE.Vector3(-0.25, 0.25, 0)
    ])
    expect('error' in cut).toBe(false)
    if ('error' in cut) return
    expect([...mesh.faces.values()].every(face => face.vertexIds.length === 4)).toBe(true)
    expect(mesh.faces.size).toBe(9)
    const inner = mesh.faces.get(cut.innerFaceId)!
    const extruded = ExtrudeKernel.extrudeFaces(mesh, [inner.id])
    for (const id of extruded.newVertexIds) mesh.vertices.get(id)!.position.z += 0.5
    mesh.recalculateNormals()
    expect([...mesh.faces.values()].every(face => face.vertexIds.length === 4)).toBe(true)
    expect(MeshValidator.validate(mesh).valid).toBe(true)
  })

  it('splits one face when a line joins two of its edges', () => {
    const mesh = new EditableMesh()
    const ids = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 0, 0), new THREE.Vector3(2, 2, 0), new THREE.Vector3(0, 2, 0)]
      .map(p => mesh.addVertex(p).id)
    const face = mesh.addFace(ids)!
    const split = BlockoutSketchKernel.splitFaceBySegment(mesh, face.id, new THREE.Vector3(0, 1, 0), new THREE.Vector3(2, 1, 0))
    expect(split).toHaveLength(2)
    expect(mesh.faces.size).toBe(2)
    expect(MeshValidator.validate(mesh).valid).toBe(true)
  })

  it('punches a drawn face through to the opposite side', () => {
    const mesh = cubeMesh()
    const front = faceFacing(mesh, new THREE.Vector3(0, 0, 1))
    const cut = BlockoutSketchKernel.embedLoop(mesh, front, [
      new THREE.Vector3(-0.3, -0.3, 1),
      new THREE.Vector3(0.3, -0.3, 1),
      new THREE.Vector3(0.3, 0.3, 1),
      new THREE.Vector3(-0.3, 0.3, 1)
    ])
    expect('error' in cut).toBe(false)
    if ('error' in cut) return
    const limit = BlockoutSketchKernel.inwardLimit(mesh, cut.innerFaceId)
    expect(limit).not.toBeNull()
    expect(BlockoutSketchKernel.punchThrough(mesh, cut.innerFaceId, limit!.faceId)).toBe(true)
    expect(mesh.faces.has(cut.innerFaceId)).toBe(false)
    expect([...mesh.edges.values()].every(edge => edge.faceIds.length === 2)).toBe(true)
    expect(MeshValidator.validate(mesh).valid).toBe(true)
  })

  it('seals a lone face into a solid and merges flush coplanar faces', () => {
    const mesh = new EditableMesh()
    const ids = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 1, 0), new THREE.Vector3(0, 1, 0)]
      .map(p => mesh.addVertex(p).id)
    const face = mesh.addFace(ids)!
    const base = [...face.vertexIds]
    const extruded = ExtrudeKernel.extrudeFaces(mesh, [face.id])
    for (const id of extruded.newVertexIds) mesh.vertices.get(id)!.position.z += 1
    expect(BlockoutSketchKernel.sealExtrudedBase(mesh, base, new THREE.Vector3(0, 0, 1))).not.toBeNull()
    expect(mesh.faces.size).toBe(6)
    expect(MeshValidator.validate(mesh).valid).toBe(true)

    const plane = new EditableMesh()
    const a = plane.addVertex(new THREE.Vector3(0, 0, 0)).id
    const b = plane.addVertex(new THREE.Vector3(1, 0, 0)).id
    const c = plane.addVertex(new THREE.Vector3(1, 1, 0)).id
    const d = plane.addVertex(new THREE.Vector3(0, 1, 0)).id
    const e = plane.addVertex(new THREE.Vector3(2, 0, 0)).id
    const f = plane.addVertex(new THREE.Vector3(2, 1, 0)).id
    plane.addFace([a, b, c, d])
    plane.addFace([b, e, f, c])
    plane.recalculateNormals()
    expect(BlockoutSketchKernel.healCoplanar(plane)).toBe(1)
    expect(plane.faces.size).toBe(1)
    expect([...plane.faces.values()][0].vertexIds.length).toBeGreaterThanOrEqual(4)
  })
})
