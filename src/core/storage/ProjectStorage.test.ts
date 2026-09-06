import { describe, expect, it } from 'vitest'
import { ProjectStorage } from './ProjectStorage'

describe('ProjectStorage.isValidProjectData', () => {
  it('accepts a mesh with aligned face uvs', () => {
    expect(ProjectStorage.isValidProjectData({
      name: 'Autosave',
      meshes: [{
        vertices: [{ id: 'v0' }, { id: 'v1' }, { id: 'v2' }],
        faces: [{
          vertexIds: ['v0', 'v1', 'v2'],
          uvs: [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 0, v: 1 }]
        }]
      }]
    })).toBe(true)
  })

  it('rejects empty meshes and uv/vertex count mismatch', () => {
    expect(ProjectStorage.isValidProjectData({ name: 'x', meshes: [] })).toBe(false)
    expect(ProjectStorage.isValidProjectData({
      name: 'x',
      meshes: [{
        vertices: [{ id: 'v0' }],
        faces: [{ vertexIds: ['v0', 'v1', 'v2'], uvs: [{ u: 0, v: 0 }] }]
      }]
    })).toBe(false)
  })
})
