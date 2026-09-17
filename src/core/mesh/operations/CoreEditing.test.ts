import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createCube } from '../../geometry/Primitives'
import { MeshBridge } from '../MeshBridge'
import { EditableMesh } from '../MeshKernel'
import { MeshValidator } from '../MeshValidator'
import { bevelEdges } from './EdgeBevelKernel'
import { ExtrudeKernel } from './ExtrudeKernel'
import { InsetKernel } from './InsetKernel'
import { MergeKernel } from './MergeKernel'

const cube = () => MeshBridge.meshObjectToEditableMesh(createCube('Cube', 2)).mesh
describe('core editing regressions', () => {
  it('supports inset after bevel and extrusion', () => {
    const source = cube()
    bevelEdges(source, [[...source.edges.keys()][0]], { width: 0.2, segments: 1 })
    for (const id of source.faces.keys()) {
      const mesh = source.clone()
      const extrude = ExtrudeKernel.extrudeFaces(mesh, [id])
      extrude.newVertexIds.forEach(v => mesh.vertices.get(v)!.position.addScaledVector(extrude.regionNormal, 0.3))
      mesh.recalculateNormals()
      expect(MeshValidator.validate(mesh).valid).toBe(true)
      const inset = InsetKernel.insetFaces(mesh, [id], { thickness: 0.01 })
      expect(inset.error).toBeUndefined()
      expect(inset.insetVertexIds.length).toBeGreaterThan(0)
    }
  })
  it('keeps scattered edge selections closed or leaves the source unchanged', () => {
    for (const mask of [5, 11, 25, 53, 91, 171, 341, 682, 1365, 2730, 4094]) {
      const mesh = cube(), before = mesh.createSnapshot()
      const ids = [...mesh.edges.keys()].filter((_, i) => mask & (1 << i))
      const result = bevelEdges(mesh, ids, { width: 0.3, segments: 3, profile: 0.5 })
      if (result.error) expect(mesh.createSnapshot()).toEqual(before)
      else expect([...mesh.edges.values()].every(e => e.faceIds.length === 2)).toBe(true)
    }
  })
  it('extrudes an open boundary with opposite half-edge winding', () => {
    const mesh = new EditableMesh()
    const ids = [[0,0],[1,0],[1,1],[0,1]].map(([x,y]) => mesh.addVertex(new THREE.Vector3(x,y,0)).id)
    mesh.addFace(ids); mesh.recalculateNormals()
    const edge = [...mesh.edges.values()][0]
    const result = ExtrudeKernel.extrudeEdges(mesh, [edge.id])
    result.newVertexIds.forEach(id => { mesh.vertices.get(id)!.position.z = 1 })
    mesh.recalculateNormals()
    expect(mesh.edges.get(edge.id)!.halfEdgeIds.every(id => mesh.halfEdges.get(id)!.twinId !== null)).toBe(true)
    expect(MeshValidator.validate(mesh).valid).toBe(true)
  })
  for (const count of [1, 2, 3, 12]) for (const segments of [1, 3]) it(`bevels ${count} cube edges with ${segments} segments without cracks`, () => {
    const mesh = cube()
    const result = bevelEdges(mesh, [...mesh.edges.keys()].slice(0, count), { width: 0.2, segments, profile: segments > 1 ? 0.5 : 0 })
    expect(result.beveledFaceIds.length).toBeGreaterThan(0)
    expect(MeshValidator.validate(mesh).valid).toBe(true)
    expect([...mesh.edges.values()].every(e => e.faceIds.length === 2)).toBe(true)
    expect([...mesh.halfEdges.values()].every(e => e.twinId !== null)).toBe(true)
    expect([...mesh.vertices.values()].every(v => v.faceIds.length > 0)).toBe(true)
  })
  it('does not alter the mesh for zero width bevel or inset', () => {
    const mesh = cube(), before = mesh.createSnapshot()
    bevelEdges(mesh, [...mesh.edges.keys()], { width: 0, segments: 1 })
    InsetKernel.insetFaces(mesh, [...mesh.faces.keys()], { thickness: 0 })
    expect(mesh.createSnapshot()).toEqual(before)
  })
  it('keeps individual extrusion directions for each cap', () => {
    const mesh = cube(), ids = [...mesh.faces.keys()].slice(0, 2)
    const normals = ids.map(id => mesh.faces.get(id)!.normal.clone())
    const result = ExtrudeKernel.extrude(mesh, { faceIds: ids, individual: true })
    ids.forEach((id, i) => mesh.faces.get(id)!.vertexIds.forEach(v => expect(result.vertexNormals!.get(v)!.distanceTo(normals[i])).toBeLessThan(1e-8)))
  })
  it('expands hole contours while shrinking the outside of a region inset', () => {
    const mesh = new EditableMesh()
    const points = [[-2,-2],[2,-2],[2,2],[-2,2],[-1,-1],[1,-1],[1,1],[-1,1]]
    const v = points.map(([x,y]) => mesh.addVertex(new THREE.Vector3(x,y,0)).id)
    for (let i=0;i<4;i++) mesh.addFace([v[i],v[(i+1)%4],v[(i+1)%4+4],v[i+4]])
    mesh.recalculateNormals()
    const result = InsetKernel.insetFaces(mesh,[...mesh.faces.keys()],{thickness:0.1})
    const coords = result.insetVertexIds.map(id => Math.abs(mesh.vertices.get(id)!.position.x))
    expect(coords.some(x => Math.abs(x-1.1)<1e-7)).toBe(true)
    expect(coords.some(x => Math.abs(x-1.9)<1e-7)).toBe(true)
    expect(MeshValidator.validate(mesh).valid).toBe(true)
  })
  it('welds transitive proximity clusters and respects an empty candidate set', () => {
    const mesh = new EditableMesh()
    for (const x of [0,0.09,0.18,3]) mesh.addVertex(new THREE.Vector3(x,0,0))
    expect(MergeKernel.mergeByDistance(mesh,0.1,[])).toBe(0)
    expect(MergeKernel.mergeByDistance(mesh,0.1)).toBe(2)
    expect(mesh.vertices.size).toBe(2)
  })
})
