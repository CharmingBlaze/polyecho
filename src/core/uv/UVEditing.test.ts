import { describe, expect, it } from 'vitest'
import { createCube } from '../geometry/Primitives'
import { relaxUvCorners, selectedUvCorners, transformUvCorners, uvBounds } from './UVEditing'

describe('precision UV editing', () => {
  it('never falls back to faces when vertex or edge selection is empty', () => {
    const mesh = createCube('cube', 2)
    expect(selectedUvCorners(mesh, 'vertex', [0], [], [])).toEqual([])
    expect(selectedUvCorners(mesh, 'edge', [0], [], [])).toEqual([])
    expect(selectedUvCorners(mesh, 'island', [], [], [])).toEqual([])
  })
  it('transforms only the selected corner and measures its actual bounds', () => {
    const mesh = createCube('cube', 2)
    const before = JSON.stringify(mesh)
    const corners = selectedUvCorners(mesh, 'vertex', [0], [{ faceIndex: 0, vertIndex: 1 }], [])
    const edits = transformUvCorners(mesh, corners, { width: 128, height: 64, moveU: 1 / 128 })
    expect(edits).toHaveLength(1)
    expect(edits[0].u).toBeCloseTo(mesh.faces[0].uvs[1].u + 1 / 128)
    expect(uvBounds(mesh, corners)?.width).toBe(0)
    expect(JSON.stringify(mesh)).toBe(before)
  })
  it('rotates in texture pixels on non-square images', () => {
    const mesh = createCube('cube', 2)
    mesh.faces[0].uvs[0] = { u: .75, v: .5 }
    const edits = transformUvCorners(mesh, [{ faceIndex: 0, vertIndex: 0 }], { width: 128, height: 64, angle: 90, pivot: 'tile' })
    expect(edits[0].u).toBeCloseTo(.5)
    expect(edits[0].v).toBeCloseTo(1)
  })
  it('preserves pins, rejects non-finite input and omits identity edits', () => {
    const mesh = createCube('cube', 2), corners = [{ faceIndex: 0, vertIndex: 0 }]
    expect(transformUvCorners(mesh, corners, { width: 64, height: 64, moveU: 1 }, () => true)).toEqual([])
    expect(transformUvCorners(mesh, corners, { width: 64, height: 64, scaleU: NaN })).toEqual([])
    expect(transformUvCorners(mesh, corners, { width: 64, height: 64 })).toEqual([])
  })
  it('scales separate islands around their own centers', () => {
    const mesh = createCube('cube', 2)
    mesh.faces = mesh.faces.slice(0, 2)
    mesh.faces[0].vertexIds = ['a', 'b', 'c', 'd']
    mesh.faces[1].vertexIds = ['e', 'f', 'g', 'h']
    mesh.faces[0].uvs = [{ u: 0, v: 0 }, { u: .2, v: 0 }, { u: .2, v: .2 }, { u: 0, v: .2 }]
    mesh.faces[1].uvs = mesh.faces[0].uvs.map(p => ({ u: p.u + .6, v: p.v + .6 }))
    const corners = selectedUvCorners(mesh, 'face', [0, 1], [], [])
    const edits = transformUvCorners(mesh, corners, { width: 64, height: 64, scaleU: 2, scaleV: 2, pivot: 'islands' })
    for (const faceIndex of [0, 1]) {
      const group = edits.filter(c => c.faceIndex === faceIndex)
      expect(group.reduce((sum, c) => sum + c.u, 0) / 4).toBeCloseTo(faceIndex ? .7 : .1)
    }
  })
})

function fan() {
  const mesh = createCube('fan', 2)
  const points = [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }, { u: 0, v: 1 }, { u: .8, v: .6 }]
  mesh.faces = [0, 1, 2, 3].map(i => ({ id: `f${i}`, materialIndex: 0, vertexIds: [String(i), String((i + 1) % 4), '4'], uvs: [points[i], points[(i + 1) % 4], points[4]].map(p => ({ ...p })) }))
  return mesh
}
describe('UV relaxation', () => {
  it('smooths a welded interior while keeping the border fixed', () => {
    const mesh = fan(), corners = selectedUvCorners(mesh, 'face', [0, 1, 2, 3], [], [])
    const edits = relaxUvCorners(mesh, corners, 30)
    expect(edits).toHaveLength(4)
    for (const p of edits) { expect(p.vertIndex).toBe(2); expect(p.u).toBeCloseTo(.5); expect(p.v).toBeCloseTo(.5) }
    expect(mesh.faces[0].uvs[2].u).toBe(.8)
  })
  it('keeps the entire welded node fixed if one corner is pinned or unselected', () => {
    const mesh = fan(), corners = selectedUvCorners(mesh, 'face', [0, 1, 2, 3], [], [])
    expect(relaxUvCorners(mesh, corners, 10, c => c.faceIndex === 0 && c.vertIndex === 2)).toEqual([])
    expect(relaxUvCorners(mesh, corners.filter(c => c.faceIndex !== 0))).toEqual([])
    expect(relaxUvCorners(mesh, [])).toEqual([])
  })
})
