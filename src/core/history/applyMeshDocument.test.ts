import { describe, expect, it } from 'vitest'
import { createCube } from '../geometry/Primitives'
import { mergeVertices } from '../geometry/Operations'
import {
  applyMeshDocumentSlice,
  cloneMeshDocumentSlice,
  selectionExistsOnMeshes
} from './applyMeshDocument'

describe('applyMeshDocumentSlice', () => {
  it('restores meshes and keeps selection ids valid', () => {
    const cube = createCube('Cube', 2)
    const before = cloneMeshDocumentSlice({
      meshes: [cube],
      activeMeshId: cube.id,
      selectedMeshIds: [cube.id],
      selectedVertexIds: [cube.vertices[0].id],
      selectedEdgeIds: [],
      selectedFaceIds: [cube.faces[0].id]
    })
    expect(selectionExistsOnMeshes(before)).toBe(true)

    const merged = mergeVertices(cube, [cube.vertices[0].id, cube.vertices[1].id]).mesh
    const live = cloneMeshDocumentSlice({
      ...before,
      meshes: [merged],
      selectedVertexIds: [cube.vertices[0].id],
      selectedFaceIds: []
    })

    applyMeshDocumentSlice(live, before)
    expect(live.meshes[0].vertices).toHaveLength(cube.vertices.length)
    expect(live.selectedFaceIds).toEqual([cube.faces[0].id])
    expect(selectionExistsOnMeshes(live)).toBe(true)
    expect(live.meshes[0]).not.toBe(before.meshes[0])
  })
})
