import { describe, expect, it } from 'vitest'
import type { MeshObject } from '../../types/mesh'
import { createCube } from './Primitives'
import { MeshBridge } from '../mesh/MeshBridge'
import { MeshValidator } from '../mesh/MeshValidator'
import {
  alignObjects, alignVertices, applyRotationAndScale, applyRotationAndScaleToEditableMesh,
  hasObjectRotationOrScale, makeUniqueMesh,
} from './ObjectEditTools'

describe('ObjectEditTools', () => {
  it('bakes rotation and scale into the vertices', () => {
    const cube = createCube('Cube', 2)
    const vertex = cube.vertices[0]
    const before = { ...vertex.position }
    cube.rotation.y = 90
    cube.scale = { x: 2, y: 1, z: 1 }
    applyRotationAndScale(cube)
    expect(cube.rotation).toEqual({ x: 0, y: 0, z: 0 })
    expect(cube.scale).toEqual({ x: 1, y: 1, z: 1 })
    expect(hasObjectRotationOrScale(cube)).toBe(false)
    expect(vertex.position.x).toBeCloseTo(before.z)
    expect(vertex.position.y).toBeCloseTo(before.y)
    expect(vertex.position.z).toBeCloseTo(-before.x * 2)
  })

  it('bakes into a resident kernel without replacing element identities', () => {
    const bridge = MeshBridge.meshObjectToEditableMesh(createCube('Cube', 2))
    const vertexIds = [...bridge.mesh.vertices.keys()]
    const edgeIds = [...bridge.mesh.edges.keys()]
    const faceIds = [...bridge.mesh.faces.keys()]
    applyRotationAndScaleToEditableMesh(
      bridge.mesh,
      { x: 0, y: 90, z: 0 },
      { x: -2, y: 1, z: 1 },
    )
    expect([...bridge.mesh.vertices.keys()]).toEqual(vertexIds)
    expect([...bridge.mesh.edges.keys()].sort()).toEqual(edgeIds.sort())
    expect([...bridge.mesh.faces.keys()]).toEqual(faceIds)
    expect(MeshValidator.validate(bridge.mesh).valid).toBe(true)
    expect(MeshValidator.validate(bridge.mesh).flippedEdges).toEqual([])
  })

  it('copies source geometry onto an instance and drops the link', () => {
    const source = createCube('Source', 2)
    const instance: MeshObject = { ...source, id: 'inst', name: 'Inst', instanceOf: source.id, vertices: [], faces: [] }
    expect(makeUniqueMesh(instance, id => id === source.id ? source : undefined)).toBe(true)
    expect(instance.instanceOf).toBeUndefined()
    expect(instance.vertices).toHaveLength(source.vertices.length)
    expect(instance.vertices[0]).not.toBe(source.vertices[0])
    expect(instance.vertices[0].position).toEqual(source.vertices[0].position)
  })

  it('aligns vertices to the selection minimum and objects to the cursor', () => {
    const cube = createCube('Cube', 2)
    alignVertices(cube, cube.vertices.slice(0, 2).map(v => v.id), 'x', 'min', 0)
    expect(cube.vertices[0].position.x).toBeCloseTo(cube.vertices[1].position.x)
    expect(cube.vertices[0].position.x).toBeCloseTo(-1)

    const a = createCube('A', 2)
    const b = createCube('B', 2)
    a.position = { x: 0, y: 0, z: 0 }
    b.position = { x: 4, y: 0, z: 0 }
    alignObjects([a, b], 'x', 'cursor', { x: 10, y: 0, z: 0 })
    expect(a.position.x).toBeCloseTo(10)
    expect(b.position.x).toBeCloseTo(10)
  })
})
