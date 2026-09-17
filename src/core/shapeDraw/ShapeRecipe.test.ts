import { describe, expect, it } from 'vitest'
import { generateShape, shapeSourceIsCurrent, geometrySignature, type ShapeRecipe } from './ShapeRecipe'
import { MeshBridge } from '../mesh/MeshBridge'
import { MeshValidator } from '../mesh/MeshValidator'

export const recipe = (): ShapeRecipe => ({
  version: 1, points: [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }],
  origin: { x: 0, y: 0, z: 0 }, axisU: { x: 1, y: 0, z: 0 }, axisV: { x: 0, y: 1, z: 0 },
  depth: 1, roundness: 0.8, density: 0, style: 'rounded',
})

describe('Shape Draw geometry', () => {
  for (const style of ['rounded', 'blocky', 'organic'] as const) {
    for (const density of [0, 1, 2] as const) it(`${style}, detail=${density}: keeps full, broad end sections on a drawn body part`, () => {
      const r = recipe(); r.style = style; r.density = density
      r.points = [{ x: -0.7, y: 2 }, { x: 0.7, y: 2 }, { x: 1, y: 0 },
        { x: 0.5, y: -2 }, { x: -0.5, y: -2 }, { x: -1, y: 0 }]
      const mesh = generateShape(r)
      for (const y of [-2, 2]) {
        const cap = [...mesh.vertices.values()].map(v => v.position).filter(p => Math.abs(p.y - y) < 1e-7)
        expect(Math.max(...cap.map(p => p.z)) - Math.min(...cap.map(p => p.z))).toBeCloseTo(r.depth)
        // More than one full-depth point makes a broad face instead of a central ridge.
        expect(cap.filter(p => Math.abs(p.z - r.depth / 2) < 1e-7).length).toBeGreaterThanOrEqual(2)
      }
      expect(MeshValidator.validate(mesh).valid).toBe(true)
      expect([...mesh.edges.values()].every(e => e.faceIds.length === 2)).toBe(true)
      expect([...mesh.halfEdges.values()].every(e => e.twinId !== null)).toBe(true)
      for (const point of r.points) expect([...mesh.vertices.values()].some(v =>
        Math.abs(v.position.x - point.x) < 1e-7 && Math.abs(v.position.y - point.y) < 1e-7)).toBe(true)
    })
  }
  it('lets the side outline set the end thickness instead of pinching it', () => {
    const r = recipe()
    r.sideProfile = [{ x: -0.2, y: -1 }, { x: 0.2, y: -1 }, { x: 0.8, y: 1 }, { x: -0.8, y: 1 }]
    const mesh = generateShape(r)
    const span = (y: number) => {
      const zs = [...mesh.vertices.values()].filter(v => Math.abs(v.position.y - y) < 1e-7).map(v => v.position.z)
      return Math.max(...zs) - Math.min(...zs)
    }
    expect(span(-1)).toBeCloseTo(0.4)
    expect(span(1)).toBeCloseTo(1.6)
  })
  for (const style of ['flat', 'rounded', 'inflated', 'blocky'] as const) {
    for (const reverse of [false, true]) it(`${style}, reverse=${reverse}: closed, outward, valid shell`, () => {
      const r = recipe(); r.style = style
      if (reverse) r.points.reverse()
      const mesh = generateShape(r)
      expect(MeshValidator.validate(mesh).valid).toBe(true)
      expect([...mesh.edges.values()].every(e => e.faceIds.length === 2)).toBe(true)
      expect([...mesh.halfEdges.values()].every(e => e.twinId !== null)).toBe(true)
      let volume = 0
      for (const face of mesh.faces.values()) {
        const a = mesh.vertices.get(face.vertexIds[0])!.position
        for (let i = 1; i < face.vertexIds.length - 1; i++) {
          const b = mesh.vertices.get(face.vertexIds[i])!.position
          const c = mesh.vertices.get(face.vertexIds[i + 1])!.position
          volume += a.dot(b.clone().cross(c)) / 6
        }
      }
      expect(volume).toBeGreaterThan(0)
    })
  }
  it('adds actual volume variation, preserves the silhouette, and increases detail', () => {
    const r = recipe(), mesh = generateShape(r)
    const zs = new Set([...mesh.vertices.values()].map(v => Math.abs(v.position.z).toFixed(5)))
    expect(zs.size).toBeGreaterThan(1)
    expect([...mesh.vertices.values()].every(v => Math.abs(v.position.x) <= 1 && Math.abs(v.position.y) <= 1)).toBe(true)
    r.density = 1
    expect(generateShape(r).faces.size).toBeGreaterThan(mesh.faces.size)
  })
  it('handles concave outlines without open edges', () => {
    const r = recipe()
    r.points = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 0, y: 2 }]
    const mesh = generateShape(r)
    expect(MeshValidator.validate(mesh).valid).toBe(true)
    expect([...mesh.edges.values()].every(e => e.faceIds.length === 2)).toBe(true)
  })
  it('rejects crossed and nonfinite input', () => {
    const r = recipe(); [r.points[1], r.points[2]] = [r.points[2], r.points[1]]
    expect(() => generateShape(r)).toThrow()
    r.depth = NaN
    expect(() => generateShape(r)).toThrow()
  })
  for (const kind of ['path', 'loft'] as const) it(`${kind} produces closed tri/quad geometry`, () => {
    const r = recipe(); r.kind = kind
    if (kind === 'path') r.points = [{ x: 0, y: 0 }, { x: 0, y: 2 }, { x: 1, y: 3 }]
    else r.sections = [{ at: 0.5, points: r.points.map(p => ({ x: p.x * 0.6, y: p.y * 0.6 })) }, { at: 1, points: r.points }]
    const mesh = generateShape(r)
    expect(MeshValidator.validate(mesh).valid).toBe(true)
    expect([...mesh.edges.values()].every(e => e.faceIds.length === 2)).toBe(true)
    expect([...mesh.halfEdges.values()].every(e => e.twinId !== null)).toBe(true)
    expect([...mesh.faces.values()].every(f => f.vertexIds.length === 3 || f.vertexIds.length === 4)).toBe(true)
  })
  it('keeps curved corners valid and editable', () => {
    const r = recipe(); r.points[0].smooth = true
    const mesh = generateShape(r)
    expect(MeshValidator.validate(mesh).valid).toBe(true)
    expect(r.points).toHaveLength(4)
  })
  it('creates a through-hole with shared boundary edges', () => {
    const r = recipe()
    r.holes = [[{ x: -0.3, y: -0.3 }, { x: 0.3, y: -0.3 }, { x: 0.3, y: 0.3 }, { x: -0.3, y: 0.3 }]]
    const mesh = generateShape(r)
    expect(MeshValidator.validate(mesh).valid).toBe(true)
    expect([...mesh.edges.values()].every(e => e.faceIds.length === 2)).toBe(true)
    r.holes[0][0].x = -2
    expect(() => generateShape(r)).toThrow(/inside/)
  })
  it('retains collinear boundary samples and mismatched loft corners without gaps', () => {
    const r = recipe(); r.points.splice(1, 0, { x: 0, y: -1 })
    r.kind = 'loft'; r.sections = [{ at: 1, points: [{ x: -0.5, y: -0.8 }, { x: 0.8, y: -0.6 }, { x: 0.9, y: 1 }, { x: -0.8, y: 1 }] }]
    const mesh = generateShape(r)
    expect(MeshValidator.validate(mesh).valid).toBe(true)
    expect([...mesh.edges.values()].every(e => e.faceIds.length === 2)).toBe(true)
  })
  it('uses quad rows without a central fan for an eight-corner game prop', () => {
    const r = recipe()
    r.points = [{ x: -0.6, y: 1.4 }, { x: -1.2, y: 0.7 }, { x: -1.3, y: -0.4 }, { x: -0.7, y: -1.3 }, { x: 0.4, y: -1.4 }, { x: 1.1, y: -0.5 }, { x: 1.1, y: 1.1 }, { x: 0.6, y: 1.5 }]
    const mesh = generateShape(r), faces = [...mesh.faces.values()]
    expect(mesh.vertices.size).toBeLessThan(100)
    expect(faces.every(f => f.vertexIds.length === 4)).toBe(true)
    expect([...mesh.vertices.values()].every(v => v.edgeIds.length <= 4)).toBe(true)
    expect(MeshValidator.validate(mesh).valid).toBe(true)
    expect([...mesh.edges.values()].every(e => e.faceIds.length === 2)).toBe(true)
  })
  it('keeps triangle refinement bounded and all original silhouette corners exact', () => {
    const r = recipe(); r.topology = 'triangles'; r.density = 2
    const mesh = generateShape(r)
    expect(mesh.faces.size).toBeLessThan(100)
    for (const p of r.points) expect([...mesh.vertices.values()].some(v => v.position.x === p.x && v.position.y === p.y)).toBe(true)
    expect(MeshValidator.validate(mesh).valid).toBe(true)
  })
  it('mirrors a half outline into a closed volume', () => {
    const r = recipe(); r.symmetry = 'x'; r.points = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }]
    const mesh = generateShape(r), vertices = [...mesh.vertices.values()]
    expect(MeshValidator.validate(mesh).valid).toBe(true)
    for (const { position: p } of vertices) expect(vertices.some(v => Math.abs(v.position.x + p.x) < 1e-7 && Math.abs(v.position.y - p.y) < 1e-7 && Math.abs(v.position.z - p.z) < 1e-7)).toBe(true)
  })
  it('uses the side profile for depth and rejects contradictory heights', () => {
    const r = recipe(); r.sideProfile = [{ x: -0.2, y: -1 }, { x: 0.2, y: -1 }, { x: 0.8, y: 1 }, { x: -0.8, y: 1 }]
    const mesh = generateShape(r)
    expect(MeshValidator.validate(mesh).valid).toBe(true)
    r.sideProfile[2].y = 0.5; r.sideProfile[3].y = 0.5
    expect(() => generateShape(r)).toThrow(/full height/)
  })
  it('detects mesh and UV edits without rejecting object placement changes', () => {
    const r = recipe(), obj = MeshBridge.editableMeshToMeshObject(generateShape(r), 'Shape')
    obj.shapeSource = { recipe: r, evaluatedSignature: geometrySignature(obj) }
    obj.position.x += 2; obj.rotation.y = 20
    expect(shapeSourceIsCurrent(obj)).toBe(true)
    const clone = JSON.parse(JSON.stringify(obj))
    expect(shapeSourceIsCurrent(clone)).toBe(true)
    clone.faces[0].uvs[0].u += 0.2
    expect(shapeSourceIsCurrent(clone)).toBe(false)
    obj.vertices[0].position.x += 0.2
    expect(shapeSourceIsCurrent(obj)).toBe(false)
  })
})

