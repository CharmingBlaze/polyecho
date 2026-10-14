import { describe, expect, it } from 'vitest'
import { createCube } from './Primitives'
import {
  defaultMirrorModifier,
  defaultSolidifyModifier,
  defaultSubdivisionModifier,
  evaluateModifiers,
  moveModifier,
  resolveModifierStack,
} from './Modifiers'

describe('modifier stack order', () => {
  it('defaults to Mirror then Subdivision then Solidify', () => {
    const mesh = createCube('Cube', 2)
    mesh.mirror = defaultMirrorModifier()
    mesh.subdivision = defaultSubdivisionModifier()
    mesh.solidify = defaultSolidifyModifier()
    expect(resolveModifierStack(mesh)).toEqual(['mirror', 'subdivision', 'solidify'])
  })

  it('moveModifier writes the swapped stack', () => {
    const mesh = createCube('Cube', 2)
    mesh.mirror = defaultMirrorModifier()
    mesh.solidify = defaultSolidifyModifier()
    expect(moveModifier(mesh, 'mirror', 1)).toBe(true)
    expect(mesh.modifierStack).toEqual(['solidify', 'mirror'])
    expect(moveModifier(mesh, 'mirror', 1)).toBe(false)
  })

  it('solidify before subdivision produces a different mesh than the default order', () => {
    const mesh = createCube('Cube', 2)
    mesh.subdivision = { ...defaultSubdivisionModifier(), level: 1 }
    mesh.solidify = { ...defaultSolidifyModifier(), thickness: 0.25, offset: 0 }
    const defaultEval = evaluateModifiers({ ...mesh })
    const swapped = evaluateModifiers({ ...mesh, modifierStack: ['solidify', 'subdivision'] })
    const radius = (verts: typeof mesh.vertices) =>
      Math.max(...verts.map(v => Math.hypot(v.position.x, v.position.y, v.position.z)))
    expect(radius(swapped.vertices)).not.toBeCloseTo(radius(defaultEval.vertices), 4)
  })
})
