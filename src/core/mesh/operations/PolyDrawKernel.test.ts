import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { EditableMesh } from '../MeshKernel'
import { ExtrudeKernel } from './ExtrudeKernel'
import { PolyDrawKernel } from './PolyDrawKernel'
import { MeshValidator } from '../MeshValidator'

const polygon = (coords: number[][]) => coords.map(([x, y, z = 0]) => new THREE.Vector3(x, y, z))

describe('game asset topology', () => {
  it.each([
    [[0, 0], [2, 2], [0, 2], [2, 0]],
    [[0, 0], [1, 0], [2, 0]],
    [[0, 0], [2, 0], [2, 2], [0, 0], [0, 2]],
    [[0, 0], [2, 0], [1, 0], [2, 2], [0, 2]]
  ])('rejects an invalid loop without adding geometry: %j', (...coords) => {
    const mesh = new EditableMesh()
    expect(PolyDrawKernel.createPlanarCaps(mesh, polygon(coords))).toBeNull()
    expect(mesh.vertices.size).toBe(0)
    expect(mesh.faces.size).toBe(0)
  })

  it('keeps every boundary segment and winding on a concave extrusion', () => {
    for (const reverse of [false, true]) {
      const points = polygon([[1, 1], [1, 2], [0, 2], [0, 0], [2, 0], [2, 1]])
      if (reverse) points.reverse()
      const mesh = new EditableMesh()
      const cap = PolyDrawKernel.createPlanarCaps(mesh, points)!
      expect(cap).not.toBeNull()
      const normal = PolyDrawKernel.newellNormal(points)
      for (const id of cap.faceIds) expect(mesh.faces.get(id)!.normal.dot(normal)).toBeGreaterThan(0.99)
      const extrude = ExtrudeKernel.extrudeFaces(mesh, cap.faceIds)
      for (const id of extrude.newVertexIds) mesh.vertices.get(id)!.position.add(normal)
      PolyDrawKernel.capDrawBase(mesh, cap.outlineVertIds)
      expect(MeshValidator.validate(mesh).valid).toBe(true)
      expect([...mesh.edges.values()].filter(e => e.faceIds.length > 0).every(e => e.faceIds.length === 2)).toBe(true)
      for (const he of mesh.halfEdges.values()) {
        expect(he.twinId).not.toBeNull()
        const twin = mesh.halfEdges.get(he.twinId!)!
        expect(twin.vertexId).toBe(mesh.halfEdges.get(he.nextId)!.vertexId)
      }
    }
  })

  it('uses triangles for a bent quad without moving its corners', () => {
    const points = polygon([[0, 0], [2, 0], [2, 2, 1], [0, 2]])
    const loops = PolyDrawKernel.tessellateLoopIndices(points)
    expect(loops).toHaveLength(2)
    expect(loops.every(loop => loop.length === 3)).toBe(true)
    expect(new Set(loops.flat()).size).toBe(4)
  })

  it('handles small models and collinear boundary subdivisions', () => {
    const points = polygon([[0, 0], [1, 0], [2, 0], [2, 1], [0, 1]])
    for (const scale of [0.0001, 1, 10000]) {
      const loops = PolyDrawKernel.tessellateLoopIndices(points.map(p => p.clone().multiplyScalar(scale)))
      expect(new Set(loops.flat()).size).toBe(5)
      expect(loops.reduce((sum, loop) => sum + loop.length - 2, 0)).toBe(3)
    }
  })

  it('orients a new angled patch against its shared edge and prevents a third face', () => {
    const mesh = new EditableMesh()
    const ids = polygon([[0, 0], [1, 0], [1, 1], [0, 1], [1, 1, 1], [0, 1, 1], [0.5, 2, 1]])
      .map(p => mesh.addVertex(p).id)
    mesh.addFace(ids.slice(0, 4))
    const added = PolyDrawKernel.fillExistingLoop(mesh, [ids[2], ids[3], ids[5], ids[4]])
    expect(added).toHaveLength(1)
    const face = mesh.faces.get(added[0])!
    expect(face.vertexIds[(face.vertexIds.indexOf(ids[3]) + 1) % 4]).toBe(ids[2])
    const count = mesh.faces.size
    expect(PolyDrawKernel.fillExistingLoop(mesh, [ids[2], ids[3], ids[6]])).toEqual([])
    expect(mesh.faces.size).toBe(count)
    expect(PolyDrawKernel.fillExistingLoop(mesh, face.vertexIds)).toEqual([])
  })

  it('keeps UVs continuous between generated faces in a patch', () => {
    const mesh = new EditableMesh()
    const ids = polygon([[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]]).map(p => mesh.addVertex(p).id)
    const added = PolyDrawKernel.fillExistingLoop(mesh, ids)
    expect(added.length).toBeGreaterThan(1)
    const seen = new Map<number, THREE.Vector2>()
    for (const id of added) {
      const face = mesh.faces.get(id)!
      face.vertexIds.forEach((vid, i) => {
        if (seen.has(vid)) expect(face.uvs[i].distanceTo(seen.get(vid)!)).toBeLessThan(1e-8)
        seen.set(vid, face.uvs[i])
      })
    }
  })
})

describe('PolyDrawKernel.applyBoxUvs', () => {
  it('gives +X walls a shared ZY projection instead of a full 0–1 texture each', () => {
    const mesh = new EditableMesh()
    const loop = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(2, 0, 0),
      new THREE.Vector3(2, 1, 0),
      new THREE.Vector3(0, 1, 0)
    ]
    const faceId = PolyDrawKernel.createPlanarFace(mesh, loop)
    expect(faceId).not.toBeNull()
    const base = [...mesh.faces.get(faceId!)!.vertexIds]
    const extruded = ExtrudeKernel.extrudeFaces(mesh, [faceId!])
    for (const id of extruded.newVertexIds) {
      mesh.vertices.get(id)!.position.z += 0.5
    }
    PolyDrawKernel.capDrawBase(mesh, base)
    PolyDrawKernel.applyBoxUvs(mesh)

    const side = [...mesh.faces.values()].find(f => Math.abs(f.normal.x) > 0.9)
    expect(side).toBeTruthy()
    const us = side!.uvs.map(uv => uv.x)
    const vs = side!.uvs.map(uv => uv.y)
    expect(Math.max(...us) - Math.min(...us)).toBeGreaterThan(0.4)
    expect(Math.max(...vs) - Math.min(...vs)).toBeGreaterThan(0.4)
    expect(side!.uvs.length).toBe(side!.vertexIds.length)
  })
})

describe('PolyDrawKernel.tessellateLoopIndices', () => {
  it('keeps a convex quad as one face', () => {
    const loop = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(2, 0, 0),
      new THREE.Vector3(2, 1, 0),
      new THREE.Vector3(0, 1, 0)
    ]
    expect(PolyDrawKernel.tessellateLoopIndices(loop)).toEqual([[0, 1, 2, 3]])
  })

  it('splits a concave L without a fan that crosses the notch', () => {
    const loop = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(2, 0, 0),
      new THREE.Vector3(2, 1, 0),
      new THREE.Vector3(1, 1, 0),
      new THREE.Vector3(1, 2, 0),
      new THREE.Vector3(0, 2, 0)
    ]
    const faces = PolyDrawKernel.tessellateLoopIndices(loop)
    expect(faces.every(f => f.length === 3 || f.length === 4)).toBe(true)
    expect(faces.length).toBeGreaterThan(1)
    expect(faces.some(f => f.length > 4)).toBe(false)

    const mesh = new EditableMesh()
    const cap = PolyDrawKernel.createPlanarCaps(mesh, loop)
    expect(cap).not.toBeNull()
    expect(cap!.faceIds.length).toBeGreaterThan(1)
    for (const id of cap!.faceIds) {
      expect(mesh.faces.get(id)!.vertexIds.length).toBeLessThanOrEqual(4)
    }
  })
})

describe('PolyDrawKernel.fillExistingLoop', () => {
  it('tessellates a concave L on existing verts', () => {
    const mesh = new EditableMesh()
    const ids = [
      mesh.addVertex(new THREE.Vector3(0, 0, 0)).id,
      mesh.addVertex(new THREE.Vector3(2, 0, 0)).id,
      mesh.addVertex(new THREE.Vector3(2, 1, 0)).id,
      mesh.addVertex(new THREE.Vector3(1, 1, 0)).id,
      mesh.addVertex(new THREE.Vector3(1, 2, 0)).id,
      mesh.addVertex(new THREE.Vector3(0, 2, 0)).id
    ]
    const faces = PolyDrawKernel.fillExistingLoop(mesh, ids)
    expect(faces.length).toBeGreaterThan(1)
    for (const id of faces) {
      expect(mesh.faces.get(id)!.vertexIds.length).toBeLessThanOrEqual(4)
      expect(mesh.faces.get(id)!.uvs.length).toBe(mesh.faces.get(id)!.vertexIds.length)
    }
  })
})
