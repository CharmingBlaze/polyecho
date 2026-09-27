import { describe, expect, it } from 'vitest'
import { createCube } from '../geometry/Primitives'
import { ProjectStorage } from './ProjectStorage'

describe('ProjectStorage.isValidProjectData', () => {
  it('accepts a mesh with aligned face uvs', () => {
    expect(ProjectStorage.isValidProjectData({
      name: 'Autosave',
      meshes: [createCube('Cube', 2)]
    })).toBe(true)
  })

  it('rejects empty meshes and uv/vertex count mismatch', () => {
    expect(ProjectStorage.isValidProjectData({ name: 'x', meshes: [] })).toBe(false)
    expect(ProjectStorage.isValidProjectData({
      name: 'x',
      meshes: [{
        id: 'mesh',
        name: 'Broken',
        vertices: [{ id: 'v0', position: { x: 0, y: 0, z: 0 } }],
        faces: [{ id: 'face', vertexIds: ['v0', 'v1', 'v2'], uvs: [{ u: 0, v: 0 }] }]
      }]
    })).toBe(false)
  })

  it('rejects autosave meshes that project loading would reject', () => {
    const missingIdentity = createCube('Cube', 2) as unknown as Record<string, unknown>
    delete missingIdentity.id
    expect(ProjectStorage.isValidProjectData({ name: 'x', meshes: [missingIdentity] })).toBe(false)

    const dangling = createCube('Cube', 2)
    dangling.faces[0].vertexIds[0] = 'missing'
    expect(ProjectStorage.isValidProjectData({ name: 'x', meshes: [dangling] })).toBe(false)
  })
})
