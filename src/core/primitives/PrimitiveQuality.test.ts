import { describe, expect, it } from 'vitest'
import { PrimitiveRegistry } from './PrimitiveRegistry'
import { PrimitiveBuilder } from './PrimitiveBuilder'
import { MeshValidator } from '../mesh/MeshValidator'
import { EditableMesh } from '../mesh/MeshKernel'

function ofLength(mesh: EditableMesh, length: number) {
  return [...mesh.faces.values()].filter((face) => face.vertexIds.length === length).length
}

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
  it('keeps caps as one face and uses triangles only where the shape meets a point', () => {
    const cylinder = PrimitiveBuilder.create('CYLINDER', { sides: 8, heightSegments: 1 })
    expect(ofLength(cylinder, 8)).toBe(2)
    expect(ofLength(cylinder, 4)).toBe(8)
    expect(ofLength(cylinder, 3)).toBe(0)

    const cone = PrimitiveBuilder.create('CONE', { sides: 8 })
    expect(ofLength(cone, 8)).toBe(1)
    expect(ofLength(cone, 3)).toBe(8)

    const sphere = PrimitiveBuilder.create('SPHERE', { segments: 8, rings: 6 })
    expect(ofLength(sphere, 3)).toBe(16)
    expect([...sphere.faces.values()].every((face) => face.vertexIds.length === 3 || face.vertexIds.length === 4)).toBe(true)

    const capsule = PrimitiveBuilder.create('CAPSULE', { segments: 8, rings: 3 })
    expect(ofLength(capsule, 3)).toBe(16)
    expect([...capsule.faces.values()].every((face) => face.vertexIds.length === 3 || face.vertexIds.length === 4)).toBe(true)

    expect(PrimitiveBuilder.create('ICOSPHERE', { subdivisions: 0 }).faces.size).toBe(20)
    const ico = PrimitiveBuilder.create('ICOSPHERE', { subdivisions: 1 })
    expect(ico.faces.size).toBe(80)
    expect(ofLength(ico, 3)).toBe(80)

    expect([...PrimitiveBuilder.create('CIRCLE', { sides: 8 }).faces.values()][0]!.vertexIds).toHaveLength(8)
    expect(ofLength(PrimitiveBuilder.create('PRISM', { sides: 5 }), 5)).toBe(2)
    expect(ofLength(PrimitiveBuilder.create('PRISM', { sides: 5 }), 4)).toBe(5)
    expect(ofLength(PrimitiveBuilder.create('PYRAMID', {}), 4)).toBe(1)
    expect(ofLength(PrimitiveBuilder.create('PYRAMID', {}), 3)).toBe(4)
    expect(ofLength(PrimitiveBuilder.create('WEDGE', {}), 4)).toBe(3)
    expect(ofLength(PrimitiveBuilder.create('WEDGE', {}), 3)).toBe(2)
    for (const type of ['TORUS', 'TUBE', 'BOX', 'PLANE', 'WALL', 'STAIRS', 'ARCH'] as const) {
      const mesh = PrimitiveBuilder.create(type, {})
      expect([...mesh.faces.values()].every((face) => face.vertexIds.length === 4)).toBe(true)
    }
  })
  it('bounds counts and replaces nonfinite dimensions', () => {
    const mesh=PrimitiveBuilder.create('SPHERE',{radius:NaN,segments:4.7,rings:Infinity})
    expect(MeshValidator.validate(mesh).valid).toBe(true)
    expect([...mesh.vertices.values()].every(v=>v.position.toArray().every(Number.isFinite))).toBe(true)
  })
})
