import { describe, expect, it } from 'vitest'
import { createCube } from './Primitives'
import { offsetObjectAlong, reflectMeshAcrossPlane, resolveInstanceMesh, rotateObjectAround, snapObjectPosition } from './DuplicateTools'

describe('DuplicateTools', () => {
  it('reflects a copy across an offset plane', () => {
    const cube = createCube('Cube', 2)
    const before = cube.vertices[0].position.x
    reflectMeshAcrossPlane(cube, 'x', 2)
    expect(cube.vertices[0].position.x).toBeCloseTo(4 - before)
  })

  it('offsets linear copies and rotates radial copies', () => {
    const cube = createCube('Cube', 2)
    offsetObjectAlong(cube, 'x', 1.5, 2)
    expect(cube.position.x).toBeCloseTo(3)
    rotateObjectAround(cube, 'y', 1, 4)
    expect(cube.rotation.y).toBeCloseTo(90)
  })

  it('resolves an instance to the source vertices', () => {
    const source = createCube('Source', 2)
    const instance = { ...source, id: 'inst', instanceOf: source.id, vertices: [], faces: [] }
    const drawn = resolveInstanceMesh(instance, (id) => id === source.id ? source : undefined)
    expect(drawn.vertices).toBe(source.vertices)
    expect(drawn.position).toEqual(instance.position)
  })

  it('snaps an object origin to the grid', () => {
    const cube = createCube('Cube', 2)
    cube.position = { x: 0.12, y: -0.4, z: 1.8 }
    snapObjectPosition(cube, [], 'grid', 0.5)
    expect(cube.position).toEqual({ x: 0, y: -0.5, z: 2 })
  })
})
