import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createCube, createCylinder } from '../../geometry/Primitives'
import { MeshBridge } from '../MeshBridge'
import { EditableMesh } from '../MeshKernel'
import { MeshValidator } from '../MeshValidator'
import { bevelEdges } from './EdgeBevelKernel'
import { BevelKernel } from './BevelKernel'
import { MeshEditOps } from './MeshEditOps'

function verticalEdge(mesh: EditableMesh) {
  const side = [...mesh.faces.values()].find((face) => face.vertexIds.length === 4)!
  return side.edgeIds.find((id) => {
    const edge = mesh.edges.get(id)!
    const ya = mesh.vertices.get(edge.v1)!.position.y
    const yb = mesh.vertices.get(edge.v2)!.position.y
    return Math.abs(ya - yb) > 0.5
  })!
}

describe('bevel on any mesh', () => {
  it('chamfers a cube edge into quads and n-gons', () => {
    const mesh = MeshBridge.meshObjectToEditableMesh(createCube('C', 2)).mesh
    const edge = [...mesh.edges.values()][0]!
    const result = bevelEdges(mesh, [edge.id], { width: 0.2, segments: 1 })
    expect(result.error).toBeUndefined()
    for (const face of mesh.faces.values()) expect(face.vertexIds.length).toBeGreaterThanOrEqual(4)
  })

  it('bevels a cylinder edge and a rim shared with an n-gon cap', () => {
    const mesh = MeshBridge.meshObjectToEditableMesh(createCylinder('Y', 1, 2, 8)).mesh
    const vertical = bevelEdges(mesh, [verticalEdge(mesh)], { width: 0.08, segments: 1 })
    expect(vertical.error).toBeUndefined()
    expect(MeshValidator.validate(mesh).valid).toBe(true)
    expect([...mesh.edges.values()].every((edge) => edge.faceIds.length === 2)).toBe(true)
    for (const id of vertical.beveledFaceIds) {
      const face = mesh.faces.get(id)!
      if (vertical.beveledFaceIds.indexOf(id) < 1) expect(face.vertexIds).toHaveLength(4)
    }

    const rimMesh = MeshBridge.meshObjectToEditableMesh(createCylinder('Y2', 1, 2, 8)).mesh
    const side = [...rimMesh.faces.values()].find((face) => face.vertexIds.length === 4)!
    const rim = side.edgeIds.find((id) => id !== verticalEdge(rimMesh))!
    const result = bevelEdges(rimMesh, [rim], { width: 0.08, segments: 1 })
    expect(result.error).toBeUndefined()
    expect([...rimMesh.edges.values()].every((edge) => edge.faceIds.length === 2)).toBe(true)
    expect(rimMesh.faces.get(result.beveledFaceIds[0]!)!.vertexIds).toHaveLength(4)
  })

  it('bevels a triangulated cap along its outline instead of every spoke', () => {
    const mesh = new EditableMesh()
    const center = mesh.addVertex(new THREE.Vector3(0, 1, 0)).id
    const ring = Array.from({ length: 8 }, (_, i) => {
      const angle = (i / 8) * Math.PI * 2
      return mesh.addVertex(new THREE.Vector3(Math.cos(angle), 1, Math.sin(angle))).id
    })
    const bottom = ring.map((_, i) => {
      const angle = (i / 8) * Math.PI * 2
      return mesh.addVertex(new THREE.Vector3(Math.cos(angle), -1, Math.sin(angle))).id
    })
    const top: number[] = []
    for (let i = 0; i < 8; i++) {
      const next = (i + 1) % 8
      top.push(mesh.addFace([center, ring[i]!, ring[next]!])!.id)
      mesh.addFace([bottom[i]!, bottom[next]!, ring[next]!, ring[i]!])
    }
    mesh.addFace([...bottom].reverse())
    const edges = [...new Set(top.flatMap((id) => mesh.faces.get(id)!.edgeIds))]
    const result = bevelEdges(mesh, edges, { width: 0.05, segments: 1 })
    expect(result.error).toBeUndefined()
    const strips = result.beveledFaceIds.map((id) => mesh.faces.get(id)!).filter((face) => face.vertexIds.length === 4)
    expect(strips.length).toBe(top.length)
    expect([...mesh.edges.values()].every((edge) => edge.faceIds.length === 2)).toBe(true)
  })

  it('keeps a triangle cap and an n-gon cap, with quad bevel strips', () => {
    const tri = new EditableMesh()
    const t = [
      tri.addVertex(new THREE.Vector3(0, 0, 0)).id,
      tri.addVertex(new THREE.Vector3(2, 0, 0)).id,
      tri.addVertex(new THREE.Vector3(0, 2, 0)).id,
    ]
    const triFace = tri.addFace(t)!.id
    BevelKernel.bevelFaces(tri, [triFace], { width: 0.2, segments: 1 })
    const triCap = [...tri.faces.values()].find((face) => face.vertexIds.length === 3)
    expect(triCap).toBeTruthy()
    for (const face of tri.faces.values()) {
      if (face.id !== triCap!.id) expect(face.vertexIds).toHaveLength(4)
    }

    const hex = new EditableMesh()
    const h = Array.from({ length: 6 }, (_, i) => {
      const angle = (i / 6) * Math.PI * 2
      return hex.addVertex(new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0)).id
    })
    const hexFace = hex.addFace(h)!.id
    BevelKernel.bevelFaces(hex, [hexFace], { width: 0.15, segments: 1 })
    expect(hex.faces.get([...hex.faces.keys()].find((id) => hex.faces.get(id)!.vertexIds.length === 6)! )!.vertexIds).toHaveLength(6)
    expect([...hex.faces.values()].filter((face) => face.vertexIds.length === 4)).toHaveLength(6)
  })

  it('chamfers an open polygon edge with a quad and leaves the face as one loop', () => {
    const mesh = new EditableMesh()
    const ids = Array.from({ length: 6 }, (_, i) => {
      const angle = (i / 6) * Math.PI * 2
      return mesh.addVertex(new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0)).id
    })
    const faceId = mesh.addFace(ids)!.id
    const edgeId = mesh.faces.get(faceId)!.edgeIds[0]!
    MeshEditOps.bevelBoundaryEdges(mesh, [edgeId], 0.1)
    expect(mesh.faces.get(faceId)!.vertexIds.length).toBeGreaterThanOrEqual(6)
    const added = [...mesh.faces.values()].filter((face) => face.id !== faceId)
    expect(added).toHaveLength(1)
    expect(added[0]!.vertexIds).toHaveLength(4)
  })
})
