import { describe, expect, it } from 'vitest'
import { createCube } from './Primitives'
import { bevelFaces, bridgeEdgeLoops, catmullClarkSubdivide, cleanupMeshGeometry, clearAllSeamEdges, connectTwoVertices, deleteElements, dissolveElements, extrudeFaces, fillFaceFromVertices, flattenVerticesOnAxis, flipNormals, gridFill, insetFaces, mergeVertices, mergeVerticesAdvanced, pokeFaces, setSeamEdges, spherizeVertices, splitEdges, subdivideFaces, triangulateFaces } from './Operations'
import { MeshBridge } from '../mesh/MeshBridge'
import type { MeshObject } from '../../types/mesh'
import { undirectedEdgeId } from './EdgeUtils'

describe('Operations', () => {
  it('mergeVertices clones the mesh and keeps face uvs aligned', () => {
    const cube = createCube('Cube', 2)
    const beforeVerts = cube.vertices.length
    const a = cube.vertices[0].id
    const b = cube.vertices[1].id
    const result = mergeVertices(cube, [a, b])

    expect(result.mesh).not.toBe(cube)
    expect(cube.vertices).toHaveLength(beforeVerts)
    expect(result.mesh.vertices.length).toBe(beforeVerts - 1)
    expect(result.selectedVertexIds).toEqual([a])
    for (const face of result.mesh.faces) {
      expect(face.uvs.length).toBe(face.vertexIds.length)
      expect(face.vertexIds.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('injected bridge reuses the same kernel instance', () => {
    const cube = createCube('Cube', 2)
    const bridge = MeshBridge.meshObjectToEditableMesh(cube)
    const kernel = bridge.mesh
    flipNormals(cube, [cube.faces[0].id], bridge)
    expect(bridge.mesh).toBe(kernel)
    const edgeId = undirectedEdgeId(cube.vertices[0].id, cube.vertices[1].id)
    setSeamEdges(cube, [edgeId], true, bridge)
    expect(bridge.mesh).toBe(kernel)
    expect([...bridge.mesh.edges.values()].some(e => e.seam)).toBe(true)
    clearAllSeamEdges(cube, bridge)
    expect(bridge.mesh).toBe(kernel)
    expect([...bridge.mesh.edges.values()].some(e => e.seam)).toBe(false)
    mergeVertices(cube, [cube.vertices[0].id, cube.vertices[1].id], bridge)
    expect(bridge.mesh).toBe(kernel)
  })

  it('splitEdges inserts a vertex on the selected edge', () => {
    const cube = createCube('Cube', 2)
    const a = cube.faces[0].vertexIds[0]
    const b = cube.faces[0].vertexIds[1]
    const result = splitEdges(cube, [undirectedEdgeId(a, b)], 0.5)
    expect(result.mesh.vertices.length).toBe(cube.vertices.length + 1)
    expect(result.selectedVertexIds).toHaveLength(1)
    const grown = result.mesh.faces.filter(face => face.vertexIds.length === 5)
    expect(grown.length).toBeGreaterThan(0)
    for (const face of result.mesh.faces) {
      expect(face.uvs.length).toBe(face.vertexIds.length)
    }
  })

  it('merge at cursor and at a chosen vertex keep one survivor', () => {
    const cube = createCube('Cube', 2)
    const a = cube.vertices[0]
    const b = cube.vertices[1]
    const atCursor = mergeVerticesAdvanced(cube, [a.id, b.id], 'cursor', 0.05, undefined, {
      position: { x: 3, y: 4, z: 5 }
    })
    const survivor = atCursor.mesh.vertices.find(v => v.id === a.id)
    expect(atCursor.mesh.vertices.length).toBe(cube.vertices.length - 1)
    expect(survivor?.position).toEqual({ x: 3, y: 4, z: 5 })

    const atVertex = mergeVerticesAdvanced(cube, [a.id, b.id], 'vertex', 0.05, undefined, {
      position: { ...b.position },
      keepId: b.id
    })
    expect(atVertex.selectedVertexIds).toEqual([b.id])
    expect(atVertex.mesh.vertices.some(v => v.id === a.id)).toBe(false)
  })

  it('merge by distance welds coincident verts through MergeKernel', () => {
    const cube = createCube('Cube', 2)
    const a = cube.vertices[0]
    const b = cube.vertices[1]
    b.position = { ...a.position }
    const result = mergeVerticesAdvanced(cube, [a.id, b.id], 'distance', 0.001)
    expect(result.mesh.vertices.length).toBe(cube.vertices.length - 1)
    for (const face of result.mesh.faces) {
      expect(face.uvs.length).toBe(face.vertexIds.length)
    }
  })

  it('extrudeFaces clones the mesh and adds side faces', () => {
    const cube = createCube('Cube', 2)
    const result = extrudeFaces(cube, [cube.faces[0].id], 0.5)
    expect(result.mesh).not.toBe(cube)
    expect(cube.faces).toHaveLength(6)
    expect(result.mesh.faces.length).toBeGreaterThan(6)
    expect(result.mesh.vertices.length).toBeGreaterThan(cube.vertices.length)
    expect(result.selectedFaceIds).toHaveLength(1)
    for (const face of result.mesh.faces) {
      expect(face.uvs.length).toBe(face.vertexIds.length)
      expect(face.vertexIds.length).toBe(4)
    }
  })

  it('bevelFaces clones the mesh and adds chamfer faces', () => {
    const cube = createCube('Cube', 2)
    const result = bevelFaces(cube, [cube.faces[0].id], 0.15)
    expect(result.mesh).not.toBe(cube)
    expect(cube.faces).toHaveLength(6)
    expect(result.mesh.faces.length).toBeGreaterThan(6)
    for (const face of result.mesh.faces) {
      expect(face.uvs.length).toBe(face.vertexIds.length)
      expect(face.vertexIds.length).toBe(4)
    }
  })

  it('insetFaces clones the mesh and adds a rim', () => {
    const cube = createCube('Cube', 2)
    const result = insetFaces(cube, [cube.faces[0].id], 0.1)
    expect(result.mesh).not.toBe(cube)
    expect(cube.faces).toHaveLength(6)
    expect(result.mesh.faces.length).toBeGreaterThan(6)
    for (const face of result.mesh.faces) {
      expect(face.uvs.length).toBe(face.vertexIds.length)
      expect(face.vertexIds.length).toBe(4)
    }
  })

  it('dissolveVertex drops a valence-2 mid-edge vertex and keeps uvs aligned', () => {
    const mesh = pentagonWithMidEdge()
    const result = dissolveElements(mesh, 'vertex', ['mid'])
    expect(result.mesh).not.toBe(mesh)
    expect(mesh.vertices).toHaveLength(5)
    expect(result.mesh.vertices.some(v => v.id === 'mid')).toBe(false)
    expect(result.mesh.vertices).toHaveLength(4)
    expect(result.mesh.faces).toHaveLength(1)
    expect(result.mesh.faces[0].vertexIds).toEqual(['v0', 'v1', 'v2', 'v3'])
    expect(result.mesh.faces[0].uvs).toHaveLength(4)
  })

  it('dissolveEdge merges two cube faces through DissolveKernel', () => {
    const cube = createCube('Cube', 2)
    const a = cube.faces[0].vertexIds[0]
    const b = cube.faces[0].vertexIds[1]
    const result = dissolveElements(cube, 'edge', [undirectedEdgeId(a, b)])
    expect(result.mesh.faces.length).toBe(cube.faces.length - 1)
    expect(cube.faces).toHaveLength(6)
    for (const face of result.mesh.faces) {
      expect(face.uvs.length).toBe(face.vertexIds.length)
      expect(face.vertexIds.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('connectTwoVertices splits a quad through TopologyOps', () => {
    const cube = createCube('Cube', 2)
    const face = cube.faces[0]
    const result = connectTwoVertices(cube, face.vertexIds[0], face.vertexIds[2])
    expect(result.mesh.faces.length).toBe(cube.faces.length + 1)
    expect(cube.faces).toHaveLength(6)
    expect(result.selectedFaceIds).toHaveLength(2)
    for (const f of result.mesh.faces) {
      expect(f.uvs.length).toBe(f.vertexIds.length)
    }
  })

  it('subdivideFaces turns one cube face into four and keeps neighbor edges shared', () => {
    const cube = createCube('Cube', 2)
    const result = subdivideFaces(cube, [cube.faces[0].id])
    expect(result.selectedFaceIds).toHaveLength(4)
    expect(cube.faces).toHaveLength(6)
    // 4 new quads + 4 neighbours kept as 5-gons (Blender) + 1 untouched back face
    expect(result.mesh.faces.length).toBe(9)
    expect(result.mesh.vertices.length).toBe(13)
    const sizes = result.mesh.faces.map(face => face.vertexIds.length).sort()
    expect(sizes).toEqual([4, 4, 4, 4, 4, 5, 5, 5, 5])
    for (const face of result.mesh.faces) expect(face.uvs.length).toBe(face.vertexIds.length)
  })

  it('subdivideFaces with 2 cuts makes a 3x3 grid on a selected quad', () => {
    const cube = createCube('Cube', 2)
    const result = subdivideFaces(cube, [cube.faces[0].id], { cuts: 2 })
    expect(result.selectedFaceIds).toHaveLength(9)
    expect(cube.faces).toHaveLength(6)
  })

  it('subdivideFaces shares a midpoint when two adjacent faces are subdivided', () => {
    const cube = createCube('Cube', 2)
    const a = cube.faces[0]
    const shared = new Set(a.vertexIds)
    const neighbor = cube.faces.find(f => f.id !== a.id && f.vertexIds.filter(id => shared.has(id)).length === 2)!
    const result = subdivideFaces(cube, [a.id, neighbor.id])
    expect(result.selectedFaceIds).toHaveLength(8)
    expect(result.mesh.vertices.length).toBeGreaterThan(cube.vertices.length)
    expect(result.mesh.vertices.length).toBeLessThan(cube.vertices.length + 16)
    for (const face of result.mesh.faces) expect(face.vertexIds.length).toBeGreaterThanOrEqual(4)
  })

  it('simple subdivide keeps the original corner positions', () => {
    const cube = createCube('Cube', 2)
    const corner = { ...cube.vertices[0].position }
    const result = subdivideFaces(cube, cube.faces.map(face => face.id), { cuts: 1, smoothness: 0 })
    expect(result.mesh.vertices.find(vertex => vertex.id === cube.vertices[0].id)?.position).toEqual(corner)
  })

  it('catmullClark rounds a cube into 24 quads', () => {
    const cube = createCube('Cube', 2)
    const before = { ...cube.vertices[0].position }
    const result = catmullClarkSubdivide(cube, 1)
    expect(result.mesh.faces).toHaveLength(24)
    expect(result.mesh.vertices.find(vertex => vertex.id === cube.vertices[0].id)?.position).not.toEqual(before)
    for (const face of result.mesh.faces) expect(face.uvs.length).toBe(face.vertexIds.length)
  })

  it('spherize moves vertices onto one radius', () => {
    const cube = createCube('Cube', 2)
    cube.vertices[0].position = { ...cube.vertices[0].position, x: cube.vertices[0].position.x + 0.8 }
    const ids = cube.vertices.map(vertex => vertex.id)
    const count = ids.length
    const center = cube.vertices.reduce(
      (sum, vertex) => ({ x: sum.x + vertex.position.x, y: sum.y + vertex.position.y, z: sum.z + vertex.position.z }),
      { x: 0, y: 0, z: 0 }
    )
    center.x /= count
    center.y /= count
    center.z /= count
    const result = spherizeVertices(cube, ids, 1)
    const distances = result.mesh.vertices.map(vertex => Math.hypot(
      vertex.position.x - center.x,
      vertex.position.y - center.y,
      vertex.position.z - center.z
    ))
    expect(Math.max(...distances) - Math.min(...distances)).toBeLessThan(1e-4)
  })

  it('subdivideFaces on every cube face makes 24 quads', () => {
    const cube = createCube('Cube', 2)
    const result = subdivideFaces(cube, cube.faces.map(f => f.id))
    expect(result.selectedFaceIds).toHaveLength(24)
    expect(result.mesh.faces.length).toBe(24)
    expect(result.mesh.vertices.length).toBe(26)
    expect(cube.faces).toHaveLength(6)
  })

  it('pokeFaces fans a quad into four triangles', () => {
    const cube = createCube('Cube', 2)
    const result = pokeFaces(cube, [cube.faces[0].id])
    expect(result.selectedFaceIds).toHaveLength(4)
    expect(result.mesh.faces.length).toBe(9)
    expect(result.mesh.vertices.length).toBe(9)
    expect(cube.faces).toHaveLength(6)
  })

  it('triangulateFaces splits a quad along the short diagonal', () => {
    const cube = createCube('Cube', 2)
    const result = triangulateFaces(cube, [cube.faces[0].id])
    expect(result.selectedFaceIds).toHaveLength(2)
    expect(result.mesh.faces.length).toBe(7)
    expect(result.mesh.vertices.length).toBe(8)
    expect(cube.faces).toHaveLength(6)
  })

  it('fillFaceFromVertices closes a deleted cube face', () => {
    const cube = createCube('Cube', 2)
    const hole = cube.faces[0]
    const opened = deleteElements(cube, 'face', [hole.id])
    expect(opened.mesh.faces).toHaveLength(5)
    const filled = fillFaceFromVertices(opened.mesh, hole.vertexIds)
    expect(filled.mesh.faces.length).toBe(6)
    expect(filled.selectedFaceIds).toHaveLength(1)
  })

  it('flipNormals reverses winding and uvs together', () => {
    const cube = createCube('Cube', 2)
    const face = cube.faces[0]
    const verts = [...face.vertexIds]
    const uvs = face.uvs.map(uv => ({ ...uv }))
    const result = flipNormals(cube, [face.id])
    const flipped = result.mesh.faces.find(f => f.id === face.id)!
    expect(flipped.vertexIds).toEqual([...verts].reverse())
    expect(flipped.uvs).toEqual([...uvs].reverse())
    expect(cube.faces[0].vertexIds).toEqual(verts)
  })

  it('bridgeEdgeLoops adds a quad between two parallel edges', () => {
    const mesh = twoQuads()
    const a0 = mesh.vertices[0].id
    const a1 = mesh.vertices[1].id
    const b0 = mesh.vertices[4].id
    const b1 = mesh.vertices[5].id
    const result = bridgeEdgeLoops(mesh, [undirectedEdgeId(a0, a1), undirectedEdgeId(b0, b1)])
    expect(result.mesh.faces.length).toBe(3)
    expect(mesh.faces).toHaveLength(2)
    expect(result.selectedFaceIds).toHaveLength(1)
  })

  it('gridFill closes a 4-vert hole', () => {
    const cube = createCube('Cube', 2)
    const hole = cube.faces[0]
    const opened = deleteElements(cube, 'face', [hole.id])
    const filled = gridFill(opened.mesh, hole.vertexIds)
    expect(filled.mesh.faces.length).toBe(6)
    expect(filled.selectedFaceIds).toHaveLength(1)
  })

  it('deleteElements removes faces that use a selected edge', () => {
    const cube = createCube('Cube', 2)
    const a = cube.faces[0].vertexIds[0]
    const b = cube.faces[0].vertexIds[1]
    const result = deleteElements(cube, 'edge', [undirectedEdgeId(a, b)])
    expect(result.mesh.faces.length).toBeLessThan(cube.faces.length)
    expect(cube.faces).toHaveLength(6)
  })

  it('flattenVerticesOnAxis averages the chosen axis', () => {
    const cube = createCube('Cube', 2)
    const a = cube.vertices[0]
    const b = cube.vertices[1]
    const result = flattenVerticesOnAxis(cube, [a.id, b.id], 'x')
    const xa = result.mesh.vertices.find(v => v.id === a.id)!.position.x
    const xb = result.mesh.vertices.find(v => v.id === b.id)!.position.x
    expect(xa).toBeCloseTo(xb)
    expect(xa).toBeCloseTo((a.position.x + b.position.x) / 2)
  })

  it('cleanupMeshGeometry drops unused vertices', () => {
    const cube = createCube('Cube', 2)
    cube.vertices.push({ id: 'orphan_v', position: { x: 9, y: 9, z: 9 } })
    const result = cleanupMeshGeometry(cube)
    expect(result.mesh.vertices.some(v => v.id === 'orphan_v')).toBe(false)
    expect(cube.vertices.some(v => v.id === 'orphan_v')).toBe(true)
  })
})

function pentagonWithMidEdge(): MeshObject {
  const verts = [
    { id: 'v0', position: { x: 0, y: 0, z: 0 } },
    { id: 'mid', position: { x: 0.5, y: 0, z: 0 } },
    { id: 'v1', position: { x: 1, y: 0, z: 0 } },
    { id: 'v2', position: { x: 1, y: 1, z: 0 } },
    { id: 'v3', position: { x: 0, y: 1, z: 0 } }
  ]
  const uvs = [
    { u: 0, v: 0 },
    { u: 0.5, v: 0 },
    { u: 1, v: 0 },
    { u: 1, v: 1 },
    { u: 0, v: 1 }
  ]
  return {
    id: 'pentagon',
    name: 'Pentagon',
    visible: true,
    locked: false,
    materialId: 'default_material',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    vertices: verts,
    faces: [{ id: 'f0', vertexIds: ['v0', 'mid', 'v1', 'v2', 'v3'], uvs, materialIndex: 0 }]
  }
}

function twoQuads(): MeshObject {
  const verts = [
    { id: 'a0', position: { x: 0, y: 0, z: 0 } },
    { id: 'a1', position: { x: 1, y: 0, z: 0 } },
    { id: 'a2', position: { x: 1, y: 1, z: 0 } },
    { id: 'a3', position: { x: 0, y: 1, z: 0 } },
    { id: 'b0', position: { x: 0, y: 0, z: 2 } },
    { id: 'b1', position: { x: 1, y: 0, z: 2 } },
    { id: 'b2', position: { x: 1, y: 1, z: 2 } },
    { id: 'b3', position: { x: 0, y: 1, z: 2 } }
  ]
  const uv = [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }, { u: 0, v: 1 }]
  return {
    id: 'two_quads',
    name: 'TwoQuads',
    visible: true,
    locked: false,
    materialId: 'default_material',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    vertices: verts,
    faces: [
      { id: 'fa', vertexIds: ['a0', 'a1', 'a2', 'a3'], uvs: uv, materialIndex: 0 },
      { id: 'fb', vertexIds: ['b0', 'b1', 'b2', 'b3'], uvs: uv, materialIndex: 0 }
    ]
  }
}
