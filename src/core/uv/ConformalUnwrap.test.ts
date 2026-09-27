import { describe, expect, it } from 'vitest'
import { MeshObject, Vector3D } from '../../types/mesh'
import { createCube, createCylinder, createSphere } from '../geometry/Primitives'
import { undirectedEdgeId } from '../geometry/EdgeUtils'
import { conformalUnwrapFaces, findOverlappingFaces } from './ConformalUnwrap'
import { boxUnwrap, projectFromView, restorePinnedUvs, seamEdgesFromUvIslands, smartUvProject } from '../geometry/UVUnwrap'
import { createPlane } from '../geometry/Primitives'
import { SeamUnwrapper } from './SeamUnwrapper'
import { findUvIslands } from './UVIslands'

function positionsOf(mesh: MeshObject): Map<string, Vector3D> {
  return new Map(mesh.vertices.map(v => [v.id, v.position]))
}

/** Bent sheet: an n×n grid folded 90° along its middle column. */
function bentGrid(n: number): MeshObject {
  const vertices = []
  const faces = []
  const id = (i: number, j: number) => `v${i}_${j}`
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const s = i / n * 2
      const position = s <= 1 ? { x: s, y: j / n * 2, z: 0 } : { x: 1, y: j / n * 2, z: s - 1 }
      vertices.push({ id: id(i, j), position, color: '#ffffff' })
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      faces.push({
        id: `f${i}_${j}`,
        vertexIds: [id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1)],
        uvs: [{ u: 0, v: 0 }, { u: 0, v: 0 }, { u: 0, v: 0 }, { u: 0, v: 0 }],
        materialIndex: 0
      })
    }
  }
  return {
    id: 'grid', name: 'grid', visible: true, locked: false, materialId: 'default_material',
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
    shadeMode: 'flat', vertices, faces
  } as MeshObject
}

function signedUvArea(uvs: { u: number; v: number }[]): number {
  let sum = 0
  for (let i = 0; i < uvs.length; i++) {
    const a = uvs[i], b = uvs[(i + 1) % uvs.length]
    sum += a.u * b.v - b.u * a.v
  }
  return sum / 2
}

function expectPackedAndUnflipped(mesh: MeshObject) {
  for (const face of mesh.faces) {
    expect(face.uvs).toHaveLength(face.vertexIds.length)
    for (const uv of face.uvs) {
      expect(uv.u).toBeGreaterThanOrEqual(0)
      expect(uv.u).toBeLessThanOrEqual(1)
      expect(uv.v).toBeGreaterThanOrEqual(0)
      expect(uv.v).toBeLessThanOrEqual(1)
    }
    expect(signedUvArea(face.uvs)).toBeGreaterThan(0)
  }
  const boxes = findUvIslands(mesh).map(island => {
    const uvs = island.flatMap(i => mesh.faces[i].uvs)
    return { x: Math.min(...uvs.map(p => p.u)), y: Math.min(...uvs.map(p => p.v)), r: Math.max(...uvs.map(p => p.u)), t: Math.max(...uvs.map(p => p.v)) }
  })
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j]
    expect(a.r <= b.x + 1e-7 || b.r <= a.x + 1e-7 || a.t <= b.y + 1e-7 || b.t <= a.y + 1e-7).toBe(true)
  }
}

describe('conformal unwrap', () => {
  it('flattens a folded sheet isometrically', () => {
    const mesh = bentGrid(6)
    const result = conformalUnwrapFaces(mesh, mesh.faces.map((_, i) => i), new Set(), positionsOf(mesh))!
    expect(result).not.toBeNull()
    expect(result.stretch).toBeLessThan(1.001)
    const lookup = positionsOf(mesh)
    for (const [fi, uvs] of result.uvs) {
      const ids = mesh.faces[fi].vertexIds
      for (let c = 0; c < ids.length; c++) {
        const a = lookup.get(ids[c])!, b = lookup.get(ids[(c + 1) % ids.length])!
        const d3 = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
        const d2 = Math.hypot(uvs[c].u - uvs[(c + 1) % ids.length].u, uvs[c].v - uvs[(c + 1) % ids.length].v)
        expect(d2).toBeCloseTo(d3, 4)
      }
      expect(signedUvArea(uvs)).toBeGreaterThan(0)
    }
  })

  it('unrolls a seamed cylinder wall into one undistorted strip', () => {
    const segments = 16
    const mesh = createCylinder('cyl', 1, 3, segments)
    const side = mesh.faces.slice(0, segments)
    const seams = new Set([undirectedEdgeId(side[0].vertexIds[0], side[0].vertexIds[3])])
    for (const f of side) {
      seams.add(undirectedEdgeId(f.vertexIds[0], f.vertexIds[1]))
      seams.add(undirectedEdgeId(f.vertexIds[2], f.vertexIds[3]))
    }
    const wall = side.map((_, i) => i)
    const result = conformalUnwrapFaces(mesh, wall, seams, positionsOf(mesh))!
    expect(result.stretch).toBeLessThan(1.001)
    const all = [...result.uvs.values()].flat()
    const width = Math.max(...all.map(p => p.u)) - Math.min(...all.map(p => p.u))
    const height = Math.max(...all.map(p => p.v)) - Math.min(...all.map(p => p.v))
    const perimeter = 2 * segments * Math.sin(Math.PI / segments)
    expect(Math.max(width, height)).toBeCloseTo(perimeter, 3)
    expect(Math.min(width, height)).toBeCloseTo(3, 3)
  })

  it('cuts a tube open when only the cap rings are seams', () => {
    const segments = 12
    const mesh = createCylinder('tube', 1, 2, segments)
    const seams = new Set<string>()
    for (const f of mesh.faces.slice(0, segments)) {
      seams.add(undirectedEdgeId(f.vertexIds[0], f.vertexIds[1]))
      seams.add(undirectedEdgeId(f.vertexIds[2], f.vertexIds[3]))
    }
    const wall = mesh.faces.slice(0, segments).map((_, i) => i)
    expect(conformalUnwrapFaces(mesh, wall, seams, positionsOf(mesh))).toBeNull()
    const cut = conformalUnwrapFaces(mesh, wall, seams, positionsOf(mesh), { allowCuts: true })!
    expect(cut.stretch).toBeLessThan(1.001)
  })

  it('refuses closed charts so callers can segment them', () => {
    const mesh = createCube()
    expect(conformalUnwrapFaces(mesh, mesh.faces.map((_, i) => i), new Set(), positionsOf(mesh))).toBeNull()
  })
})

describe('seam unwrap', () => {
  for (const [name, build, expectedIslands] of [
    ['cube', () => createCube(), 6],
    ['sphere', () => createSphere('s', 1, 10, 16), undefined],
    ['cylinder', () => createCylinder('c', 1, 3, 16), undefined]
  ] as const) {
    it(`segments a seamless ${name} into packed, unflipped islands`, () => {
      const mesh = build()
      SeamUnwrapper.unwrapMesh(mesh, undefined, 128, 2)
      expectPackedAndUnflipped(mesh)
      if (expectedIslands) expect(findUvIslands(mesh)).toHaveLength(expectedIslands)
    })
  }

  it('keeps a user-seamed cylinder as wall + two caps', () => {
    const segments = 16
    const mesh = createCylinder('c', 1, 3, segments)
    const side = mesh.faces.slice(0, segments)
    mesh.seamEdgeIds = [undirectedEdgeId(side[0].vertexIds[0], side[0].vertexIds[3])]
    for (const f of side) {
      mesh.seamEdgeIds.push(undirectedEdgeId(f.vertexIds[0], f.vertexIds[1]))
      mesh.seamEdgeIds.push(undirectedEdgeId(f.vertexIds[2], f.vertexIds[3]))
    }
    SeamUnwrapper.unwrapMesh(mesh, undefined, 256, 2)
    expectPackedAndUnflipped(mesh)
    expect(findUvIslands(mesh)).toHaveLength(3)
  })

  it('opens a tube-shaped island automatically instead of folding it flat', () => {
    const segments = 16
    const mesh = createCylinder('c', 1, 3, segments)
    mesh.seamEdgeIds = []
    for (const f of mesh.faces.slice(0, segments)) {
      mesh.seamEdgeIds.push(undirectedEdgeId(f.vertexIds[0], f.vertexIds[1]))
      mesh.seamEdgeIds.push(undirectedEdgeId(f.vertexIds[2], f.vertexIds[3]))
    }
    SeamUnwrapper.unwrapMesh(mesh, undefined, 256, 2)
    expectPackedAndUnflipped(mesh)
    expect(findUvIslands(mesh)).toHaveLength(3)
  })

  it('solves around two pins and leaves that island in place', () => {
    const segments = 16
    const mesh = createCylinder('c', 1, 3, segments)
    const side = mesh.faces.slice(0, segments)
    mesh.seamEdgeIds = [undirectedEdgeId(side[0].vertexIds[0], side[0].vertexIds[3])]
    for (const f of side) {
      mesh.seamEdgeIds.push(undirectedEdgeId(f.vertexIds[0], f.vertexIds[1]))
      mesh.seamEdgeIds.push(undirectedEdgeId(f.vertexIds[2], f.vertexIds[3]))
    }
    const f0 = mesh.faces[0]
    f0.uvs[0] = { u: 0.1, v: 0.2 }
    f0.uvs[3] = { u: 0.1, v: 0.6 }
    mesh.uvPinKeys = [`${f0.id}:${f0.vertexIds[0]}`, `${f0.id}:${f0.vertexIds[3]}`]
    SeamUnwrapper.unwrapMesh(mesh, undefined, 128, 2)
    expect(mesh.faces[0].uvs[0].u).toBeCloseTo(0.1, 9)
    expect(mesh.faces[0].uvs[0].v).toBeCloseTo(0.2, 9)
    expect(mesh.faces[0].uvs[3].u).toBeCloseTo(0.1, 9)
    expect(mesh.faces[0].uvs[3].v).toBeCloseTo(0.6, 9)
    // The wall edge is 3 units tall and pinned to 0.4 UV: its width scales to match.
    const wall = mesh.faces.slice(0, segments).flatMap(f => f.uvs)
    const width = Math.max(...wall.map(p => p.u)) - Math.min(...wall.map(p => p.u))
    expect(width).toBeCloseTo(0.4 / 3 * 2 * segments * Math.sin(Math.PI / segments), 3)
    for (const f of mesh.faces.slice(0, segments)) expect(signedUvArea(f.uvs)).toBeGreaterThan(0)
  })

  it('keeps a single pinned corner still', () => {
    const mesh = createCube()
    const f = mesh.faces[2]
    f.uvs[1] = { u: 0.7, v: 0.3 }
    mesh.uvPinKeys = [`${f.id}:${f.vertexIds[1]}`]
    SeamUnwrapper.unwrapMesh(mesh, undefined, 64, 2)
    expect(mesh.faces[2].uvs[1].u).toBeCloseTo(0.7, 9)
    expect(mesh.faces[2].uvs[1].v).toBeCloseTo(0.3, 9)
  })

  it('unwraps only the requested faces', () => {
    const mesh = createCube()
    const before = JSON.parse(JSON.stringify(mesh.faces))
    SeamUnwrapper.unwrapMesh(mesh, [0, 1], 64, 2)
    expect(mesh.faces.slice(2)).toEqual(before.slice(2))
  })
})

/** Flat spiral ramp: two full turns, so any single planar projection overlaps itself. */
function spiralRamp(stepsPerTurn: number, turns: number): MeshObject {
  const vertices = []
  const faces = []
  const steps = stepsPerTurn * turns
  for (let i = 0; i <= steps; i++) {
    const a = (i / stepsPerTurn) * Math.PI * 2
    const y = (i / steps) * 0.2
    vertices.push({ id: `in${i}`, position: { x: Math.cos(a), y, z: Math.sin(a) }, color: '#ffffff' })
    vertices.push({ id: `out${i}`, position: { x: Math.cos(a) * 2, y, z: Math.sin(a) * 2 }, color: '#ffffff' })
  }
  for (let i = 0; i < steps; i++) {
    faces.push({
      id: `f${i}`,
      vertexIds: [`in${i}`, `in${i + 1}`, `out${i + 1}`, `out${i}`],
      uvs: [{ u: 0, v: 0 }, { u: 0, v: 0 }, { u: 0, v: 0 }, { u: 0, v: 0 }],
      materialIndex: 0
    })
  }
  return {
    id: 'ramp', name: 'ramp', visible: true, locked: false, materialId: 'default_material',
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
    shadeMode: 'flat', vertices, faces
  } as MeshObject
}

describe('SimpleCAD-parity unwrap tools', () => {
  it('splits a self-overlapping smart projection into non-overlapping islands', () => {
    const mesh = spiralRamp(24, 2)
    const result = smartUvProject(mesh, { textureSize: 128 })
    expect(findUvIslands(result).length).toBeGreaterThan(1)
    const all = new Map(result.faces.map((f, i) => [i, f.uvs]))
    expect(findOverlappingFaces(result.faces.map((_, i) => i), all).size).toBe(0)
    expectPackedAndUnflipped(result)
  })

  it('marks every island border as a seam after smart project', () => {
    const cube = smartUvProject(createCube(), { textureSize: 64 })
    expect(seamEdgesFromUvIslands(cube)).toHaveLength(12)
    const plane = createPlane()
    expect(seamEdgesFromUvIslands(plane)).toHaveLength(0)
  })

  it('keeps existing seams when adding island borders', () => {
    const mesh = createCube()
    mesh.seamEdgeIds = ['keep_me']
    expect(seamEdgesFromUvIslands(smartUvProject(mesh))).toContain('keep_me')
  })

  it('projects from an orthographic top view into the tile', () => {
    const mesh = createPlane('p', 2)
    const result = projectFromView(mesh, {
      position: { x: 0, y: 10, z: 0 },
      right: { x: 1, y: 0, z: 0 },
      up: { x: 0, y: 0, z: -1 },
      forward: { x: 0, y: -1, z: 0 },
      perspective: false
    }, undefined, 64, 64)
    const uvs = result.faces.flatMap(f => f.uvs)
    expect(Math.min(...uvs.map(p => p.u))).toBeCloseTo(0, 6)
    expect(Math.max(...uvs.map(p => p.u))).toBeCloseTo(1, 6)
    expect(Math.min(...uvs.map(p => p.v))).toBeCloseTo(0, 6)
    expect(Math.max(...uvs.map(p => p.v))).toBeCloseTo(1, 6)
    result.faces.forEach(f => f.vertexIds.forEach((id, c) => {
      const p = result.vertices.find(v => v.id === id)!.position
      expect(f.uvs[c].u).toBeCloseTo((p.x - result.vertices.reduce((m, v) => Math.min(m, v.position.x), Infinity)) / 2, 6)
    }))
  })

  it('keeps pixel proportions when projecting onto a wide texture', () => {
    const mesh = createPlane('p', 2)
    const result = projectFromView(mesh, {
      position: { x: 0, y: 10, z: 0 }, right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: -1 },
      forward: { x: 0, y: -1, z: 0 }, perspective: true
    }, undefined, 256, 64)
    const uvs = result.faces.flatMap(f => f.uvs)
    const w = (Math.max(...uvs.map(p => p.u)) - Math.min(...uvs.map(p => p.u))) * 256
    const h = (Math.max(...uvs.map(p => p.v)) - Math.min(...uvs.map(p => p.v))) * 64
    expect(w).toBeCloseTo(h, 6)
  })

  it('restores pinned corners after a projection', () => {
    const mesh = createCube()
    const f = mesh.faces[0]
    f.uvs[0] = { u: 0.33, v: 0.44 }
    mesh.uvPinKeys = [`${f.id}:${f.vertexIds[0]}`]
    const result = restorePinnedUvs(mesh, boxUnwrap(mesh))
    expect(result.faces[0].uvs[0]).toEqual({ u: 0.33, v: 0.44 })
    expect(result.faces[1].uvs).toEqual(boxUnwrap(mesh).faces[1].uvs)
  })
})
