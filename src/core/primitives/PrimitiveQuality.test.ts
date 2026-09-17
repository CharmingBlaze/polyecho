import { describe, expect, it } from 'vitest'
import { PrimitiveRegistry } from './PrimitiveRegistry'
import { PrimitiveBuilder } from './PrimitiveBuilder'
import { MeshValidator } from '../mesh/MeshValidator'

describe('primitive quality', () => {
  for(const definition of PrimitiveRegistry.getAll()) it(`${definition.type} has valid, consistently wound surfaces`, () => {
    const mesh=PrimitiveBuilder.create(definition.type,{})
    expect(MeshValidator.validate(mesh).valid).toBe(true)
    if(!['PLANE','CIRCLE'].includes(definition.type)) {
      expect([...mesh.edges.values()].every(e=>e.faceIds.length===2)).toBe(true)
      expect([...mesh.halfEdges.values()].every(e=>e.twinId!==null)).toBe(true)
      let volume=0
      for(const face of mesh.faces.values()) {
        const ps=face.vertexIds.map(id=>mesh.vertices.get(id)!.position)
        for(let i=1;i<ps.length-1;i++) volume+=ps[0].dot(ps[i].clone().cross(ps[i+1]))/6
      }
      expect(volume).toBeGreaterThan(0)
    }
  })
  it('creates welded quad grids for boxes and planes', () => {
    const box=PrimitiveBuilder.create('BOX',{segmentsX:2,segmentsY:3,segmentsZ:4})
    expect(box.faces.size).toBe(52)
    expect([...box.faces.values()].every(f=>f.vertexIds.length===4)).toBe(true)
    expect([...box.edges.values()].every(e=>e.faceIds.length===2)).toBe(true)
    expect(PrimitiveBuilder.create('PLANE',{segmentsX:4,segmentsZ:3}).faces.size).toBe(12)
  })
  it('bounds counts and replaces nonfinite dimensions', () => {
    const mesh=PrimitiveBuilder.create('SPHERE',{radius:NaN,segments:4.7,rings:Infinity})
    expect(MeshValidator.validate(mesh).valid).toBe(true)
    expect([...mesh.vertices.values()].every(v=>v.position.toArray().every(Number.isFinite))).toBe(true)
  })
})
