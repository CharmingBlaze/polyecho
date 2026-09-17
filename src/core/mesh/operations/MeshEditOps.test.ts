import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createCube } from '../../geometry/Primitives'
import { MeshBridge } from '../MeshBridge'
import { MeshValidator } from '../MeshValidator'
import { MeshTopologyService } from '../MeshTopologyService'
import { MeshEditOps } from './MeshEditOps'
import { BooleanKernel } from './BooleanKernel'
import { LoopCutKernel } from './LoopCutKernel'
import {
  flipEdges,
  recalculateOutside,
  connectVertexPath,
  trisToQuads,
  fillHoles,
  deleteOnlyFaces
} from '../../geometry/Operations'

const cubeKernel = () => MeshBridge.meshObjectToEditableMesh(createCube('Cube', 2)).mesh

describe('MeshEditOps', () => {
  it('dissolves two cube faces into an n-gon', () => {
    const mesh = cubeKernel()
    const edge = [...mesh.edges.values()].find(e => e.faceIds.length === 2)!
    const n = MeshEditOps.dissolveFaces(mesh, [...edge.faceIds])
    expect(n).toBeGreaterThan(0)
    expect(MeshValidator.validate(mesh).valid).toBe(true)
    expect([...mesh.faces.values()].some(f => f.vertexIds.length > 4)).toBe(true)
  })

  it('flips a triangulated diagonal', () => {
    const mesh = cubeKernel()
    const face = [...mesh.faces.values()][0]!
    MeshTopologyService.triangulateFaces(mesh, [face.id])
    const diag = [...mesh.edges.values()].find(e => e.faceIds.length === 2 && e.faceIds.every(id => {
      const f = mesh.faces.get(id)
      return f && f.vertexIds.length === 3
    }))!
    expect(MeshEditOps.flipEdges(mesh, [diag.id])).toBe(1)
    expect(MeshValidator.validate(mesh).valid).toBe(true)
  })

  it('recalculates outside winding on a reversed cube face', () => {
    const mesh = cubeKernel()
    const face = [...mesh.faces.values()][0]!
    mesh.reverseFace(face.id)
    MeshEditOps.recalculateOutside(mesh)
    const mid = new THREE.Vector3()
    for (const id of mesh.faces.get(face.id)!.vertexIds) mid.add(mesh.vertices.get(id)!.position)
    mid.multiplyScalar(0.25)
    expect(mesh.faces.get(face.id)!.normal.dot(mid)).toBeGreaterThan(0)
  })

  it('connects a vertex path across a quad', () => {
    const mesh = cubeKernel()
    const face = [...mesh.faces.values()][0]!
    const [a, , c] = face.vertexIds
    expect(MeshEditOps.connectVertexPath(mesh, [a, c])).toBe(1)
    expect(mesh.findEdge(a, c)).toBeTruthy()
  })

  it('fills a deleted-face hole', () => {
    const mesh = cubeKernel()
    const face = [...mesh.faces.values()][0]!
    mesh.removeFace(face.id)
    const created = MeshEditOps.fillHoles(mesh)
    expect(created.length).toBe(1)
    expect(mesh.faces.size).toBe(6)
  })

  it('delete-only-faces keeps neighboring verts', () => {
    const mesh = cubeKernel()
    const beforeVerts = mesh.vertices.size
    const face = [...mesh.faces.values()][0]!
    MeshEditOps.deleteOnlyFaces(mesh, [face.id])
    expect(mesh.faces.size).toBe(5)
    expect(mesh.vertices.size).toBe(beforeVerts)
  })

  it('limited dissolve does not throw on a cube', () => {
    const mesh = cubeKernel()
    MeshEditOps.limitedDissolve(mesh, 5)
    expect(mesh.faces.size).toBeGreaterThan(0)
    expect(MeshValidator.validate(mesh).valid).toBe(true)
  })

  it('rips a manifold edge into a boundary', () => {
    const mesh = cubeKernel()
    const edge = [...mesh.edges.values()].find(e => e.faceIds.length === 2)!
    MeshEditOps.ripEdges(mesh, [edge.id])
    expect([...mesh.edges.values()].some(e => e.faceIds.length === 1)).toBe(true)
    expect(MeshValidator.validate(mesh).valid).toBe(true)
  })

  it('splits selected faces from neighbors', () => {
    const mesh = cubeKernel()
    const face = [...mesh.faces.values()][0]!
    const before = mesh.vertices.size
    MeshEditOps.splitFaces(mesh, [face.id])
    expect(mesh.vertices.size).toBeGreaterThan(before)
  })

  it('makes selected faces planar', () => {
    const mesh = cubeKernel()
    const face = [...mesh.faces.values()][0]!
    mesh.vertices.get(face.vertexIds[0]!)!.position.y += 0.2
    MeshEditOps.makePlanarFaces(mesh, [face.id])
    const pts = face.vertexIds.map(id => mesh.vertices.get(id)!.position)
    const n = mesh.faces.get(face.id)!.normal
    const d = pts.map(p => n.dot(p.clone().sub(pts[0])))
    expect(Math.max(...d.map(Math.abs))).toBeLessThan(1e-6)
  })

  it('solidifies a face and keeps a valid mesh', () => {
    const mesh = cubeKernel()
    const face = [...mesh.faces.values()][0]!
    MeshEditOps.solidifyFaces(mesh, [face.id], 0.2)
    expect(mesh.faces.size).toBeGreaterThan(6)
    expect(MeshValidator.validate(mesh).valid).toBe(true)
  })

  it('bisects a cube and can fill the cut', () => {
    const mesh = cubeKernel()
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)
    MeshEditOps.bisect(mesh, plane, true, false)
    expect(mesh.faces.size).toBeGreaterThan(6)
    expect(MeshValidator.validate(mesh).valid).toBe(true)
  })

  it('cleanupManifoldExtrude keeps a valid mesh after an in-plane cap move', () => {
    const mesh = cubeKernel()
    const face = [...mesh.faces.values()].find(f => Math.abs(f.normal.y) > 0.9)!
    const result = MeshEditOps.extrudeManifold(mesh, [face.id])
    for (const id of result.newVertexIds) {
      mesh.vertices.get(id)!.position.y += 0.5
    }
    MeshEditOps.cleanupManifoldExtrude(mesh, result.extrudedFaceIds, result.newVertexIds)
    expect(MeshValidator.validate(mesh).valid).toBe(true)
  })

  it('smooths vertices without dropping topology', () => {
    const mesh = cubeKernel()
    const ids = [...mesh.vertices.keys()]
    MeshEditOps.smoothVertices(mesh, ids, 0.5)
    expect(mesh.vertices.size).toBe(8)
    expect(mesh.faces.size).toBe(6)
  })
})

describe('LoopCut even n-gons', () => {
  it('still cuts a cube quad ring', () => {
    const mesh = cubeKernel()
    const edge = [...mesh.edges.values()].find(e => e.faceIds.length === 2)!
    const ring = LoopCutKernel.ringEdges(mesh, edge.id)
    expect(ring.length).toBeGreaterThan(0)
    const result = LoopCutKernel.cutLoop(mesh, edge.id, 0.5)
    expect(result.newVertexIds.length).toBeGreaterThan(0)
    expect(MeshValidator.validate(mesh).valid).toBe(true)
  })
})

describe('BooleanKernel', () => {
  it('unions two overlapping cubes', () => {
    const a = cubeKernel()
    const b = cubeKernel()
    for (const v of b.vertices.values()) v.position.x += 1
    expect(BooleanKernel.operate(a, b, 'union')).toBe(true)
    expect(a.faces.size).toBeGreaterThan(0)
  })
})

describe('Operations wrappers', () => {
  it('flipEdges and recalculateOutside project a new mesh', () => {
    const cube = createCube('Cube', 2)
    const flipped = flipEdges(cube, [])
    expect(flipped.mesh).not.toBe(cube)
    const out = recalculateOutside(cube)
    expect(out.mesh.faces.length).toBe(6)
  })

  it('connectVertexPath splits a quad for two opposite verts', () => {
    const cube = createCube('Cube', 2)
    const face = cube.faces[0]
    const result = connectVertexPath(cube, [face.vertexIds[0], face.vertexIds[2]])
    expect(result.mesh.faces.length).toBeGreaterThan(cube.faces.length)
  })

  it('trisToQuads and fillHoles round-trip a hole', () => {
    const cube = createCube('Cube', 2)
    const opened = deleteOnlyFaces(cube, [cube.faces[0].id])
    expect(opened.mesh.faces.length).toBe(5)
    const filled = fillHoles(opened.mesh)
    expect(filled.mesh.faces.length).toBe(6)
    trisToQuads(filled.mesh, [])
  })
})
