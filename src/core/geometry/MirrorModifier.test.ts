import { describe, expect, it } from 'vitest'
import { createCube } from './Primitives'
import { defaultMirrorModifier } from './Modifiers'
import { clipMirrorPosition, evaluateMirror } from './MirrorModifier'
import type { MeshObject } from '../../types/mesh'

function withMirror(mesh: MeshObject, patch: Partial<NonNullable<MeshObject['mirror']>> = {}): MeshObject {
  mesh.mirror = { ...defaultMirrorModifier(), ...patch }
  return mesh
}

describe('mirror modifier', () => {
  it('mirrors a +X triangle across X and flips its winding', () => {
    const mesh = withMirror({
      id: 'tri',
      name: 'Tri',
      vertices: [
        { id: 'a', position: { x: 1, y: 0, z: 0 } },
        { id: 'b', position: { x: 1, y: 1, z: 0 } },
        { id: 'c', position: { x: 1, y: 0, z: 1 } }
      ],
      faces: [{
        id: 'f',
        vertexIds: ['a', 'b', 'c'],
        uvs: [{ u: 0.2, v: 0.3 }, { u: 0.4, v: 0.3 }, { u: 0.2, v: 0.6 }],
        materialIndex: 0
      }],
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      visible: true,
      locked: false,
      materialId: 'mat'
    }, { flipU: true, offsetU: 0.1 })

    const out = evaluateMirror(mesh)
    expect(out.vertices).toHaveLength(6)
    expect(out.faces).toHaveLength(2)
    const copy = out.vertices.find(v => v.id === 'mir_x_a')
    expect(copy?.position.x).toBeCloseTo(-1)
    const mirrored = out.faces.find(f => f.id === 'mir_x_f')
    expect(mirrored?.vertexIds).toEqual(['mir_x_c', 'mir_x_b', 'mir_x_a'])
    expect(mirrored?.uvs[2].u).toBeCloseTo(1 - 0.2 + 0.1)
  })

  it('welds vertices inside the merge distance and does not duplicate them', () => {
    const mesh = withMirror({
      id: 'm',
      name: 'M',
      vertices: [
        { id: 'a', position: { x: 0.0004, y: 0, z: 0 } },
        { id: 'b', position: { x: 1, y: 0, z: 0 } },
        { id: 'c', position: { x: 1, y: 1, z: 0 } }
      ],
      faces: [{
        id: 'f',
        vertexIds: ['a', 'b', 'c'],
        uvs: [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }],
        materialIndex: 0
      }],
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      visible: true,
      locked: false,
      materialId: 'mat'
    })

    const out = evaluateMirror(mesh)
    expect(out.vertices.find(v => v.id === 'a')?.position.x).toBe(0)
    expect(out.vertices.some(v => v.id === 'mir_x_a')).toBe(false)
    expect(out.vertices.some(v => v.id === 'mir_x_b')).toBe(true)
    expect(out.vertices).toHaveLength(5)
  })

  it('bisects away the negative side, and flip keeps that side instead', () => {
    const cut = withMirror(createCube('Cut', 2), { axisX: false, bisectX: true, merge: false })
    const kept = evaluateMirror(cut)
    expect(kept.vertices.some(v => v.position.x < -0.01)).toBe(false)
    expect(kept.vertices.some(v => v.position.x > 0.01)).toBe(true)

    const flipped = withMirror(createCube('Flip', 2), { axisX: false, bisectX: true, flipX: true, merge: false })
    const negative = evaluateMirror(flipped)
    expect(negative.vertices.some(v => v.position.x > 0.01)).toBe(false)
    expect(negative.vertices.some(v => v.position.x < -0.01)).toBe(true)
  })

  it('treats a legacy bisect flag as a bisect on each enabled mirror axis', () => {
    const mesh = withMirror(createCube('Legacy', 2), { bisect: true, bisectX: undefined, merge: false })
    const out = evaluateMirror(mesh)
    expect(out.vertices.some(v => v.position.x < -0.01)).toBe(true)
    expect(out.vertices.filter(v => v.id.startsWith('bis_')).length).toBeGreaterThan(0)
  })

  it('mirrors X and Y into four quadrants', () => {
    const mesh = withMirror({
      id: 'q',
      name: 'Q',
      vertices: [{ id: 'a', position: { x: 1, y: 2, z: 0 } }],
      faces: [],
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      visible: true,
      locked: false,
      materialId: 'mat'
    }, { axisX: true, axisY: true, merge: false })

    const out = evaluateMirror(mesh)
    const signs = out.vertices.map(v => `${Math.sign(v.position.x)}:${Math.sign(v.position.y)}`).sort()
    expect(signs).toEqual(['-1:-1', '-1:1', '1:-1', '1:1'])
  })

  it('mirrors through another object origin', () => {
    const mesh = withMirror({
      id: 'src',
      name: 'Src',
      vertices: [{ id: 'a', position: { x: 0, y: 0, z: 0 } }],
      faces: [],
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      visible: true,
      locked: false,
      materialId: 'mat'
    }, { merge: false, mirrorObjectId: 'empty' })
    const empty: MeshObject = {
      ...mesh,
      id: 'empty',
      name: 'Empty',
      mirror: undefined,
      vertices: [],
      faces: [],
      position: { x: 2, y: 0, z: 0 }
    }

    const out = evaluateMirror(mesh, [mesh, empty])
    const xs = out.vertices.map(v => v.position.x).sort((a, b) => a - b)
    expect(xs[0]).toBeCloseTo(0)
    expect(xs[1]).toBeCloseTo(4)
  })

  it('clips a crossing vertex to the plane and sticks near vertices when merge is on', () => {
    const mod = defaultMirrorModifier()
    mod.clipping = true
    expect(clipMirrorPosition({ x: -0.4, y: 1, z: 0 }, { x: 0.4, y: 1, z: 0 }, mod).x).toBe(0)
    expect(clipMirrorPosition({ x: 0.0004, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, mod).x).toBe(0)
    mod.merge = false
    expect(clipMirrorPosition({ x: 0.0004, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, mod).x).toBeCloseTo(0.0004)
  })

  it('hides the mirror in edit mode or render when those switches are off', () => {
    const mesh = withMirror(createCube('Vis', 2), { showEdit: false, showRender: false })
    expect(evaluateMirror(mesh, undefined, 'viewport', true).vertices).toHaveLength(mesh.vertices.length)
    expect(evaluateMirror(mesh, undefined, 'render').vertices).toHaveLength(mesh.vertices.length)
    expect(evaluateMirror(mesh, undefined, 'apply').vertices.length).toBeGreaterThan(mesh.vertices.length)
  })
})
