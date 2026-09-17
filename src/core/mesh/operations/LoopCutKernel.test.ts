import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createCube, createCylinder, createPlane } from '../../geometry/Primitives'
import { MeshBridge } from '../MeshBridge'
import { EditableMesh } from '../MeshKernel'
import { LoopCutKernel } from './LoopCutKernel'
import { MeshValidator } from '../MeshValidator'

function uniquePositions(mesh: { vertices: Map<number, { position: { x: number; y: number; z: number } }> }) {
  const keys = new Set<string>()
  for (const v of mesh.vertices.values()) {
    keys.add(`${v.position.x.toFixed(4)},${v.position.y.toFixed(4)},${v.position.z.toFixed(4)}`)
  }
  return keys.size
}

describe('LoopCutKernel', () => {
  it('keeps off-center and multiple loops aligned and identical to their preview', () => {
    for (const params of [[0.2], [0.15,0.4,0.65]]) {
      const {mesh} = MeshBridge.meshObjectToEditableMesh(createCube('Cube',2))
      const edge = [...mesh.edges.values()].find(e => {
        const a=mesh.vertices.get(e.v1)!.position,b=mesh.vertices.get(e.v2)!.position
        return Math.abs(a.y-b.y)>1
      })!
      const preview = LoopCutKernel.previewSegments(mesh,edge.id,params)
      expect(preview.every(s=>Math.abs(s.p1.y-s.p2.y)<1e-8)).toBe(true)
      const result = LoopCutKernel.cutLoop(mesh,edge.id,params)
      expect(result.newEdgeIds.length).toBe(4*params.length)
      for (const id of result.newEdgeIds) {
        const cut=mesh.edges.get(id)!, a=mesh.vertices.get(cut.v1)!.position,b=mesh.vertices.get(cut.v2)!.position
        expect(preview.some(s=>(s.p1.distanceTo(a)<1e-8 && s.p2.distanceTo(b)<1e-8)||(s.p2.distanceTo(a)<1e-8 && s.p1.distanceTo(b)<1e-8))).toBe(true)
      }
      expect([...mesh.faces.values()].every(f=>f.vertexIds.length===4)).toBe(true)
      expect([...mesh.edges.values()].every(e=>e.faceIds.length===2)).toBe(true)
      expect(MeshValidator.validate(mesh).valid).toBe(true)
    }
  })
  it('finds the four parallel edges of a cube belt', () => {
    const { mesh } = MeshBridge.meshObjectToEditableMesh(createCube('Cube', 2))
    const vertical = [...mesh.edges.values()].find((e) => {
      const a = mesh.vertices.get(e.v1)!.position
      const b = mesh.vertices.get(e.v2)!.position
      return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6 && Math.abs(a.y - b.y) > 0.5
    })
    expect(vertical).toBeTruthy()
    const ring = LoopCutKernel.ringEdges(mesh, vertical!.id)
    expect(ring).toHaveLength(4)
    for (const eId of ring) {
      const e = mesh.edges.get(eId)!
      const a = mesh.vertices.get(e.v1)!.position
      const b = mesh.vertices.get(e.v2)!.position
      expect(Math.abs(a.x - b.x)).toBeLessThan(1e-6)
      expect(Math.abs(a.z - b.z)).toBeLessThan(1e-6)
    }
  })

  it('shares ring vertices instead of duplicating them', () => {
    const { mesh } = MeshBridge.meshObjectToEditableMesh(createCube('Cube', 2))
    const vertical = [...mesh.edges.values()].find((e) => {
      const a = mesh.vertices.get(e.v1)!.position
      const b = mesh.vertices.get(e.v2)!.position
      return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6 && Math.abs(a.y - b.y) > 0.5
    })!
    const beforeVerts = mesh.vertices.size
    const result = LoopCutKernel.cutLoop(mesh, vertical.id, 0.5)
    expect(result.newVertexIds).toHaveLength(4)
    expect(mesh.vertices.size).toBe(beforeVerts + 4)
    expect(uniquePositions(mesh)).toBe(mesh.vertices.size)
    expect(mesh.faces.size).toBe(10)
    for (const face of mesh.faces.values()) {
      expect(face.uvs.length).toBe(face.vertexIds.length)
      expect(face.vertexIds.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('cuts a single quad plane into two faces', () => {
    const { mesh } = MeshBridge.meshObjectToEditableMesh(createPlane('Plane', 2))
    const edge = [...mesh.edges.values()][0]!
    expect(LoopCutKernel.ringEdges(mesh, edge.id)).toHaveLength(2)
    const result = LoopCutKernel.cutLoop(mesh, edge.id, 0.5)
    expect(result.newVertexIds).toHaveLength(2)
    expect(mesh.vertices.size).toBe(6)
    expect(mesh.faces.size).toBe(2)
    for (const face of mesh.faces.values()) {
      expect(face.vertexIds.length).toBe(4)
    }
  })

  it('walks the vertical belt of a cylinder', () => {
    const { mesh } = MeshBridge.meshObjectToEditableMesh(createCylinder('Cyl', 1, 2, 8))
    const vertical = [...mesh.edges.values()].find((e) => {
      const a = mesh.vertices.get(e.v1)!.position
      const b = mesh.vertices.get(e.v2)!.position
      const radial = Math.hypot(a.x, a.z)
      return radial > 0.5 && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6 && Math.abs(a.y - b.y) > 0.5
    })
    expect(vertical).toBeTruthy()
    expect(LoopCutKernel.ringEdges(mesh, vertical!.id)).toHaveLength(8)
    const before = mesh.vertices.size
    LoopCutKernel.cutLoop(mesh, vertical!.id, 0.5)
    expect(mesh.vertices.size).toBe(before + 8)
  })

  it('stops at a triangle without creating a fake loop', () => {
    const mesh = new EditableMesh()
    const a = mesh.addVertex(new THREE.Vector3(0, 0, 0))
    const b = mesh.addVertex(new THREE.Vector3(2, 0, 0))
    const c = mesh.addVertex(new THREE.Vector3(1, 0, 2))
    mesh.addFace([a.id, b.id, c.id])
    const edge = [...mesh.edges.values()].find((e) =>
      (e.v1 === a.id && e.v2 === b.id) || (e.v1 === b.id && e.v2 === a.id)
    )!
    expect(LoopCutKernel.ringEdges(mesh, edge.id)).toHaveLength(0)
    LoopCutKernel.cutLoop(mesh, edge.id, 0.5)
    expect(mesh.vertices.size).toBe(3)
    expect(mesh.faces.size).toBe(1)
    expect([...mesh.faces.values()][0]!.vertexIds.length).toBe(3)
  })

  it('keeps 64 dense cuts distinct without collapsing neighboring loops', () => {
    const { mesh } = MeshBridge.meshObjectToEditableMesh(createCube('Cube', 2))
    const vertical = [...mesh.edges.values()].find((e) => {
      const a = mesh.vertices.get(e.v1)!.position
      const b = mesh.vertices.get(e.v2)!.position
      return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6 && Math.abs(a.y - b.y) > 0.5
    })!
    const spacing = 1 / 65
    const params = Array.from({ length: 64 }, (_, i) => (i + 1) * spacing)
    const result = LoopCutKernel.cutLoop(mesh, vertical.id, params)
    expect(result.newEdgeIds).toHaveLength(256)
    expect(new Set(result.newVertexIds.map(id => {
      const p = mesh.vertices.get(id)!.position
      return p.y.toFixed(5)
    })).size).toBe(64)
    expect([...mesh.faces.values()].every(f => f.vertexIds.length === 4)).toBe(true)
    expect(MeshValidator.validate(mesh).valid).toBe(true)
  })

  it('preview belt sits on the ring, not on a face outline', () => {
    const { mesh } = MeshBridge.meshObjectToEditableMesh(createCube('Cube', 2))
    const vertical = [...mesh.edges.values()].find((e) => {
      const a = mesh.vertices.get(e.v1)!.position
      const b = mesh.vertices.get(e.v2)!.position
      return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6 && Math.abs(a.y - b.y) > 0.5
    })!
    const segs = LoopCutKernel.previewSegments(mesh, vertical.id, [0.5])
    expect(segs).toHaveLength(4)
    for (const seg of segs) {
      expect(Math.abs(seg.p1.y - 0)).toBeLessThan(1e-5)
      expect(Math.abs(seg.p2.y - 0)).toBeLessThan(1e-5)
      expect(seg.p1.distanceTo(seg.p2)).toBeGreaterThan(0.5)
    }
  })
})
