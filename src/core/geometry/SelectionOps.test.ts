import { describe, expect, it } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import type { MeshObject } from '../../types/mesh'
import { createCube } from './Primitives'
import { getMeshEdges, undirectedEdgeId } from './EdgeUtils'
import { pruneSelection, selectEverything, selectInverse, selectLess, selectLinked, selectMore } from './SelectionOps'
import { deleteElements } from './Operations'
import { useProjectStore } from '../../stores/projectStore'

const none = { vertices: [], edges: [], faces: [] }

function top(mesh: MeshObject) {
  const y = (id: string) => mesh.vertices.find(v => v.id === id)!.position.y
  return mesh.faces.find(f => f.vertexIds.every(id => y(id) > 0))!
}

/** Two cubes that share exactly one corner vertex and nothing else. */
function cubesTouchingAtACorner() {
  const a = createCube('A', 2)
  const b = createCube('B', 2)
  const rename = (id: string) => `b_${id}`
  const cornerA = a.vertices.find(v => v.position.x > 0 && v.position.y > 0 && v.position.z > 0)!
  const cornerB = b.vertices.find(v => v.position.x < 0 && v.position.y < 0 && v.position.z < 0)!
  const verts = b.vertices.filter(v => v.id !== cornerB.id).map(v => ({
    ...v, id: rename(v.id), position: { x: v.position.x + 2, y: v.position.y + 2, z: v.position.z + 2 }
  }))
  const faces = b.faces.map(f => ({ ...f, id: rename(f.id), vertexIds: f.vertexIds.map(id => id === cornerB.id ? cornerA.id : rename(id)) }))
  return { ...a, vertices: [...a.vertices, ...verts], faces: [...a.faces, ...faces] }
}

describe('SelectionOps (Blender select more / less / linked / invert)', () => {
  it('select more from one cube corner reaches the three faces around it', () => {
    const cube = createCube('Cube', 2)
    const corner = cube.vertices[0].id
    const grown = selectMore(cube, 'vertex', { ...none, vertices: [corner] })
    expect(grown.vertices).toHaveLength(7)
    expect(grown.faces).toEqual([])
  })

  it('select more works in edge mode and keeps edges between selected vertices', () => {
    const cube = createCube('Cube', 2)
    const face = top(cube)
    const edge = undirectedEdgeId(face.vertexIds[0], face.vertexIds[1])
    const grown = selectMore(cube, 'edge', { ...none, edges: [edge] })
    expect(grown.edges).toContain(edge)
    expect(grown.edges.length).toBeGreaterThan(1)
    const ids = new Set(getMeshEdges(cube).map(e => e.id))
    expect(grown.edges.every(id => ids.has(id))).toBe(true)
  })

  it('select less on five cube faces keeps only the face that touches no unselected face', () => {
    const cube = createCube('Cube', 2)
    const lid = top(cube)
    const rest = cube.faces.filter(f => f.id !== lid.id).map(f => f.id)
    const bottom = cube.faces.find(f => !f.vertexIds.some(id => lid.vertexIds.includes(id)))!
    expect(selectLess(cube, 'face', { ...none, faces: rest }).faces).toEqual([bottom.id])
  })

  it('select less on a fully selected closed mesh has no boundary to shrink from', () => {
    const cube = createCube('Cube', 2)
    const all = selectEverything(cube, 'vertex')
    expect(selectLess(cube, 'vertex', all).vertices).toHaveLength(8)
    const lid = top(cube)
    const others = cube.vertices.filter(v => !lid.vertexIds.includes(v.id)).map(v => v.id)
    expect(selectLess(cube, 'vertex', { ...none, vertices: others }).vertices).toEqual([])
  })

  it('select linked in face mode does not cross a single shared corner', () => {
    const mesh = cubesTouchingAtACorner()
    const start = mesh.faces[0].id
    const linked = selectLinked(mesh, 'face', { ...none, faces: [start] })
    expect(linked.faces).toHaveLength(6)
    expect(linked.faces.every(id => !id.startsWith('b_'))).toBe(true)
  })

  it('select linked in face mode can stop at seams', () => {
    const cube = createCube('Cube', 2)
    const lid = top(cube)
    const seams = lid.vertexIds.map((id, i) => undirectedEdgeId(id, lid.vertexIds[(i + 1) % 4]))
    const linked = selectLinked({ ...cube, seamEdgeIds: seams }, 'face', { ...none, faces: [lid.id] }, { delimitSeams: true })
    expect(linked.faces).toEqual([lid.id])
  })

  it('select linked in vertex and edge mode floods the whole island', () => {
    const cube = createCube('Cube', 2)
    expect(selectLinked(cube, 'vertex', { ...none, vertices: [cube.vertices[0].id] }).vertices).toHaveLength(8)
    const edge = getMeshEdges(cube)[0].id
    expect(selectLinked(cube, 'edge', { ...none, edges: [edge] }).edges).toHaveLength(12)
  })

  it('invert selects exactly the complement', () => {
    const cube = createCube('Cube', 2)
    const inv = selectInverse(cube, 'face', { ...none, faces: [cube.faces[0].id] })
    expect(inv.faces).toHaveLength(5)
    expect(inv.faces).not.toContain(cube.faces[0].id)
  })

  it('prune drops deleted faces, vertices and edges but keeps order', () => {
    const cube = createCube('Cube', 2)
    const lid = top(cube)
    const after = deleteElements(cube, 'face', [lid.id]).mesh
    const keep = cube.faces.find(f => f.id !== lid.id)!.id
    const edge = getMeshEdges(cube)[0].id
    const pruned = pruneSelection(after, { vertices: [], edges: [edge, 'nope_edge'], faces: [lid.id, keep] })
    expect(pruned.faces).toEqual([keep])
    expect(pruned.edges).toEqual([edge])
  })
})

describe('store selection commands', () => {
  it('select all in vertex mode clears a stale face selection (extrude would use it)', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const project = useProjectStore()
    const mesh = project.activeMesh!
    project.selectedFaceIds = [mesh.faces[0].id]
    project.selectAll('vertex')
    expect(project.selectedFaceIds).toEqual([])
    expect(project.selectedVertexIds).toHaveLength(mesh.vertices.length)
    expect(mesh.faces.every(f => !f.selected)).toBe(true)
    disposePinia(pinia)
  })

  it('an edit that keeps the old selection drops ids it deleted', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const project = useProjectStore()
    project.performSubdivide('object')
    const subdivided = project.activeMesh!
    const before = subdivided.faces.length
    project.selectedFaceIds = subdivided.faces.map(f => f.id)
    project.performLimitedDissolve(5)
    const live = project.activeMesh!
    expect(live.faces.length).toBeLessThan(before)
    expect(project.selectedFaceIds.every(id => live.faces.some(f => f.id === id))).toBe(true)
    disposePinia(pinia)
  })
})
