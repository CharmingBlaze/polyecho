import { describe, expect, it } from 'vitest'
import {
  collectionAllLocked,
  collectionAllVisible,
  groupByCollection,
  nextCollectionName,
  normalizeCollectionName,
  renameCollection,
  setCollectionLocked,
  setCollectionVisible,
  setMeshesCollection,
} from './ObjectCollections'

function item(id: string, collection?: string, visible = true, locked = false) {
  return { id, collection, visible, locked }
}

describe('ObjectCollections', () => {
  it('groups named collections first, then the ungrouped Scene list', () => {
    const meshes = [item('a', 'Props'), item('b'), item('c', 'Props'), item('d', 'Chars')]
    const groups = groupByCollection(meshes)
    expect(groups.map(group => group.name)).toEqual(['Chars', 'Props', null])
    expect(groups[1]!.meshes.map(mesh => mesh.id)).toEqual(['a', 'c'])
    expect(groups[2]!.meshes.map(mesh => mesh.id)).toEqual(['b'])
  })

  it('assigns and clears collection names on a selection', () => {
    const meshes = [item('a'), item('b'), item('c', 'Old')]
    expect(setMeshesCollection(meshes, ['a', 'b'], '  Props  ')).toBe(2)
    expect(meshes[0]!.collection).toBe('Props')
    expect(setMeshesCollection(meshes, ['c'], undefined)).toBe(1)
    expect(meshes[2]!.collection).toBeUndefined()
  })

  it('renames a collection and picks the next unused Collection N', () => {
    const meshes = [item('a', 'Collection 1'), item('b', 'Collection 2')]
    expect(nextCollectionName(meshes)).toBe('Collection 3')
    expect(renameCollection(meshes, 'Collection 1', 'Heroes')).toBe(1)
    expect(meshes[0]!.collection).toBe('Heroes')
    expect(normalizeCollectionName('  ')).toBeUndefined()
  })

  it('toggles visibility and lock for every member', () => {
    const meshes = [item('a', 'Props', true, false), item('b', 'Props', false, false), item('c')]
    expect(collectionAllVisible(meshes, 'Props')).toBe(false)
    expect(setCollectionVisible(meshes, 'Props', true)).toBe(1)
    expect(collectionAllVisible(meshes, 'Props')).toBe(true)
    expect(setCollectionLocked(meshes, 'Props', true)).toBe(2)
    expect(collectionAllLocked(meshes, 'Props')).toBe(true)
    expect(meshes[2]!.visible).toBe(true)
    expect(meshes[2]!.locked).toBe(false)
  })
})
