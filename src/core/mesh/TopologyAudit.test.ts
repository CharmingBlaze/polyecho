import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import type { MeshObject } from '../../types/mesh'
import { createCube } from '../geometry/Primitives'
import { undirectedEdgeId } from '../geometry/EdgeUtils'
import { reflectMeshAcrossPlane } from '../geometry/DuplicateTools'
import { applyMirror } from '../geometry/MirrorModifier'
import { joinMeshObjects, separateMeshFaces } from '../geometry/MeshJoin'
import { MeshBridge } from './MeshBridge'
import { KnifeKernel } from './operations/KnifeKernel'
import { LoopCutKernel } from './operations/LoopCutKernel'
import {
  bevelFaces, booleanMeshes, bridgeEdgeLoops, mergeVerticesAdvanced, catmullClarkSubdivide, circleFaceOutline, cleanupMeshGeometry, deleteElements,
  dissolveElements, extrudeFaces, extrudeSelection, fillFaceFromVertices, fillHoles, flipNormals, gridFill,
  insetFaces, limitedDissolve, makePlanarFaces, recalculateOutside, ripEdges, shellMesh, smoothMeshVertices,
  solidifySelectedFaces, splitEdges, splitSelectedFaces, subdivideFaces, symmetrizeMesh, triangulateFaces,
  trisToQuads, unsubdivideMesh, straightenVertices, vertexBevel, type OperationResult
} from '../geometry/Operations'

/** Every face loop rule a tool must keep (docs/SYSTEM.md §1). */
function audit(mesh: MeshObject, allowTriangles: boolean, watertight = false) {
  const pos = new Map(mesh.vertices.map(v => [v.id, v.position]))
  const directed = new Set<string>()
  for (const face of mesh.faces) {
    expect(face.uvs.length, `face ${face.id} uvs`).toBe(face.vertexIds.length)
    if (!allowTriangles) expect(face.vertexIds.length, `face ${face.id} became a triangle`).toBeGreaterThanOrEqual(4)
    for (let i = 0; i < face.vertexIds.length; i++) {
      const key = `${face.vertexIds[i]}>${face.vertexIds[(i + 1) % face.vertexIds.length]}`
      expect(directed.has(key), `edge ${key} runs the same way in two faces`).toBe(false)
      directed.add(key)
    }
    if (face.vertexIds.length === 4 && !uvsAreDegenerate(face.uvs)) {
      expect(quadIsBowtie(face.uvs.map(uv => [uv.u, uv.v])), `face ${face.id} uvs fold across the diagonal`).toBe(false)
    }
    for (const id of face.vertexIds) expect(pos.has(id), `face ${face.id} missing vertex ${id}`).toBe(true)
  }
  const closed = [...directed].every(key => directed.has(key.split('>').reverse().join('>')))
  if (watertight) {
    const cracks = [...directed].filter(key => !directed.has(key.split('>').reverse().join('>')))
    expect(cracks, 'open edges (cracks or T-junctions)').toEqual([])
  }
  if (closed && mesh.faces.length > 0) expect(signedVolume(mesh), 'closed mesh faces point inward').toBeGreaterThan(0)
}

/** Divergence-theorem volume. A fan is exact here: it sums signed areas, it does not draw them. */
function signedVolume(mesh: MeshObject) {
  const pos = new Map(mesh.vertices.map(v => [v.id, v.position]))
  let vol = 0
  for (const face of mesh.faces) {
    const a = pos.get(face.vertexIds[0])!
    for (let i = 1; i < face.vertexIds.length - 1; i++) {
      const b = pos.get(face.vertexIds[i])!, c = pos.get(face.vertexIds[i + 1])!
      vol += (a.x * (b.y * c.z - b.z * c.y) - a.y * (b.x * c.z - b.z * c.x) + a.z * (b.x * c.y - b.y * c.x)) / 6
    }
  }
  return vol
}

/** Run a kernel edit on a clone and project it back, the way `runKernelOperation` does. */
function kernel(m: MeshObject, edit: (bridge: ReturnType<typeof MeshBridge.meshObjectToEditableMesh>) => void): OperationResult {
  const bridge = MeshBridge.meshObjectToEditableMesh(m)
  edit(bridge)
  return { mesh: MeshBridge.editableMeshToMeshObject(bridge.mesh, m, bridge.numToStrVertId, bridge.numToStrFaceId), selectedFaceIds: [], selectedVertexIds: [] }
}

function num(bridge: ReturnType<typeof MeshBridge.meshObjectToEditableMesh>, faceId: string) {
  return bridge.strToNumFaceId.get(faceId)!
}

function verticalEdge(bridge: ReturnType<typeof MeshBridge.meshObjectToEditableMesh>) {
  return [...bridge.mesh.edges.values()].find(e => {
    const a = bridge.mesh.vertices.get(e.v1)!.position, b = bridge.mesh.vertices.get(e.v2)!.position
    return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6
  })!.id
}

function faceCentre(m: MeshObject, faceId: string, towards = 0) {
  const face = m.faces.find(f => f.id === faceId)!
  const pts = face.vertexIds.map(id => m.vertices.find(v => v.id === id)!.position)
  const c = new Vector3()
  for (const p of pts) c.add(new Vector3(p.x, p.y, p.z))
  c.multiplyScalar(1 / pts.length)
  return c.lerp(new Vector3(pts[0].x, pts[0].y, pts[0].z), towards)
}

function uvsAreDegenerate(uvs: { u: number; v: number }[]) {
  const us = uvs.map(uv => uv.u), vs = uvs.map(uv => uv.v)
  return Math.max(...us) - Math.min(...us) < 1e-6 || Math.max(...vs) - Math.min(...vs) < 1e-6
}

/** A quad whose opposite sides cross: corner order and UV order disagree. */
function quadIsBowtie(p: number[][]) {
  const cross = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const segmentsCross = (a: number[], b: number[], c: number[], d: number[]) =>
    cross(a, b, c) * cross(a, b, d) < -1e-12 && cross(c, d, a) * cross(c, d, b) < -1e-12
  return segmentsCross(p[0], p[1], p[2], p[3]) || segmentsCross(p[1], p[2], p[3], p[0])
}

/** The most upward-facing face, so a dragged corner does not change which face is "top". */
function top(mesh: MeshObject) {
  const y = (id: string) => mesh.vertices.find(v => v.id === id)!.position.y
  const avg = (f: MeshObject['faces'][number]) => f.vertexIds.reduce((s, id) => s + y(id), 0) / f.vertexIds.length
  return mesh.faces.reduce((best, f) => avg(f) > avg(best) ? f : best)
}

function openBox(mesh: MeshObject) {
  return deleteElements(mesh, 'face', [top(mesh).id]).mesh
}

function topEdge(mesh: MeshObject) {
  const face = top(mesh)
  return undirectedEdgeId(face.vertexIds[0], face.vertexIds[1])
}

const cubes: Array<[string, () => MeshObject]> = [
  ['2-unit cube', () => createCube('Cube', 2)],
  ['10-unit cube', () => createCube('Cube', 10)],
  ['cube with one corner dragged (bent quads)', () => {
    const cube = createCube('Cube', 2)
    const corner = cube.vertices.reduce((best, v) => v.position.x + v.position.y + v.position.z > best.position.x + best.position.y + best.position.z ? v : best)
    corner.position = { x: corner.position.x + 0.4, y: corner.position.y + 0.3, z: corner.position.z - 0.2 }
    return cube
  }]
]

/** Open box plus a floating lid one unit above the hole, same corner order as the old top. */
function boxAndLid(m: MeshObject) {
  const hole = top(m)
  const box = openBox(m)
  const lid = hole.vertexIds.map((id, i) => {
    const p = m.vertices.find(v => v.id === id)!.position
    return { id: `lid_${i}`, position: { x: p.x, y: p.y + 1, z: p.z } }
  })
  box.vertices.push(...lid)
  box.faces.push({ ...structuredClone(hole), id: 'lid', vertexIds: lid.map(v => v.id) })
  return { box, rim: hole.vertexIds, lid: lid.map(v => v.id) }
}

const loopEdges = (ids: string[]) => ids.map((id, i) => undirectedEdgeId(id, ids[(i + 1) % ids.length]))

const tools: Array<{ name: string; triangles?: boolean; watertight?: boolean; run: (m: MeshObject) => OperationResult }> = [
  { name: 'extrude', run: m => extrudeFaces(m, [top(m).id], 0.5) },
  { name: 'inset', run: m => insetFaces(m, [top(m).id], 0.1) },
  { name: 'bevel face', run: m => bevelFaces(m, [top(m).id], 0.1) },
  { name: 'bevel edge', triangles: true, run: m => bevelFaces(m, [], 0.1, [topEdge(m)]) },
  { name: 'subdivide', run: m => subdivideFaces(m, [top(m).id]) },
  { name: 'split edge', run: m => splitEdges(m, [topEdge(m)], 0.5) },
  { name: 'dissolve edge', run: m => dissolveElements(m, 'edge', [topEdge(m)]) },
  { name: 'delete face', run: m => deleteElements(m, 'face', [top(m).id]) },
  { name: 'solidify an open box', run: m => { const box = openBox(m); return solidifySelectedFaces(box, box.faces.map(f => f.id), 0.1) } },
  { name: 'cleanup', run: m => cleanupMeshGeometry(m) },
  { name: 'limited dissolve', run: m => limitedDissolve(m, 5) },
  { name: 'catmull-clark', run: m => catmullClarkSubdivide(m, 1) },
  { name: 'symmetrize', run: m => symmetrizeMesh(m, 'x') },
  { name: 'triangulate then tris to quads', run: m => {
    const tri = triangulateFaces(m, m.faces.map(f => f.id)).mesh
    return trisToQuads(tri, [])
  } },
  { name: 'extrude individual', run: m => extrudeSelection(m, { faceIds: [top(m).id], distance: 0.3, individual: true }) },
  { name: 'extrude twice', run: m => { const once = extrudeFaces(m, [top(m).id], 0.3); return extrudeFaces(once.mesh, once.selectedFaceIds, 0.3) } },
  { name: 'loop cut at 0.5', run: m => kernel(m, b => LoopCutKernel.cutLoop(b.mesh, verticalEdge(b), 0.5)) },
  { name: 'loop cut x3', run: m => kernel(m, b => LoopCutKernel.cutLoop(b.mesh, verticalEdge(b), [0.25, 0.5, 0.75])) },
  { name: 'knife point at face centre', run: m => kernel(m, b => { KnifeKernel.insertSurfaceVertex(b.mesh, faceCentre(m, top(m).id), num(b, top(m).id)) }) },
  { name: 'knife point off centre', run: m => kernel(m, b => { KnifeKernel.insertSurfaceVertex(b.mesh, faceCentre(m, top(m).id, 0.4), num(b, top(m).id)) }) },
  { name: 'grid fill a hole', run: m => { const hole = top(m); return gridFill(openBox(m), hole.vertexIds) } },
  { name: 'fill a hole (F)', run: m => { const hole = top(m); return fillFaceFromVertices(openBox(m), hole.vertexIds) } },
  { name: 'fill holes', run: m => fillHoles(openBox(m)) },
  { name: 'flip all normals', run: m => { const f = flipNormals(m, m.faces.map(x => x.id)); return recalculateOutside(f.mesh) } },
  { name: 'recalculate outside', run: m => recalculateOutside(m) },
  { name: 'shell with top opening', run: m => shellMesh(m, [top(m).id], 0.1) },
  { name: 'solidify inward (negative)', run: m => { const box = openBox(m); return solidifySelectedFaces(box, box.faces.map(f => f.id), -0.1) } },
  { name: 'split faces off', run: m => splitSelectedFaces(m, [top(m).id]) },
  { name: 'rip edge', run: m => ripEdges(m, [topEdge(m)]) },
  { name: 'circle face outline', run: m => circleFaceOutline(subdivideFaces(m, [top(m).id], { cuts: 3 }).mesh, [top(m).id]) },
  { name: 'make planar', run: m => makePlanarFaces(m, [top(m).id]) },
  { name: 'smooth', run: m => smoothMeshVertices(m, m.vertices.map(v => v.id), 0.5) },
  { name: 'straighten top face', run: m => straightenVertices(m, top(m).vertexIds, 'horizontal') },
  { name: 'vertex bevel', triangles: true, run: m => vertexBevel(m, [top(m).vertexIds[0]], 0.1) },
  { name: 'unsubdivide after subdivide', run: m => unsubdivideMesh(subdivideFaces(m, m.faces.map(f => f.id)).mesh) },
  { name: 'duplicate mirrored across x', run: m => { const copy = structuredClone(m); reflectMeshAcrossPlane(copy, 'x', 3); return { mesh: copy, selectedFaceIds: [], selectedVertexIds: [] } } },
  { name: 'bridge rim to a floating lid', watertight: true, run: m => {
    const { box, rim, lid } = boxAndLid(m)
    return bridgeEdgeLoops(box, [...loopEdges(rim), ...loopEdges(lid)])
  } },
  { name: 'merge two corners at centre', triangles: true, run: m => mergeVerticesAdvanced(m, top(m).vertexIds.slice(0, 2), 'center') },
  { name: 'merge by distance (nothing to weld)', watertight: true, run: m => mergeVerticesAdvanced(m, m.vertices.map(v => v.id), 'distance', 0.001) },
  { name: 'apply mirror modifier', watertight: true, run: m => {
    const copy = structuredClone(m)
    for (const v of copy.vertices) v.position.x += 2
    copy.mirror = { enabled: true, axisX: true, axisY: false, axisZ: false, clipping: false, merge: true, mergeThreshold: 0.001, flipU: false, flipV: false }
    applyMirror(copy)
    return { mesh: copy, selectedFaceIds: [], selectedVertexIds: [] }
  } },
  { name: 'separate top face (source side)', run: m => {
    const staged = separateMeshFaces(m, [top(m).id], MeshBridge.meshObjectToEditableMesh(m), { id: 'sep', name: 'Sep' })!
    const b = MeshBridge.meshObjectToEditableMesh(m)
    return { mesh: MeshBridge.editableMeshToMeshObject(staged.kernel, m, b.numToStrVertId, b.numToStrFaceId), selectedFaceIds: [], selectedVertexIds: [] }
  } },
  { name: 'separate top face (new object)', run: m => {
    const staged = separateMeshFaces(m, [top(m).id], MeshBridge.meshObjectToEditableMesh(m), { id: 'sep', name: 'Sep' })!
    return { mesh: staged.separated, selectedFaceIds: [], selectedVertexIds: [] }
  } },
  { name: 'join a second cube', watertight: true, run: m => {
    const other = createCube('Other', 1)
    for (const v of other.vertices) v.position.x += 5
    const bridge = MeshBridge.meshObjectToEditableMesh(m)
    const joined = joinMeshObjects(m, [other], bridge)
    return { mesh: MeshBridge.editableMeshToMeshObject(joined, m, bridge.numToStrVertId, bridge.numToStrFaceId), selectedFaceIds: [], selectedVertexIds: [] }
  } },
  { name: 'boolean difference', triangles: true, watertight: true, run: m => {
    const cutter = createCube('Cutter', 1)
    for (const v of cutter.vertices) v.position.y += 1
    return booleanMeshes(m, cutter, 'difference')
  } },
  { name: 'boolean intersect', triangles: true, watertight: true, run: m => {
    const other = createCube('Other', 1)
    for (const v of other.vertices) v.position.x += 0.8
    return booleanMeshes(m, other, 'intersect')
  } },
  { name: 'boolean union', triangles: true, watertight: true, run: m => {
    const other = createCube('Other', 1)
    for (const v of other.vertices) v.position.x += 1
    return booleanMeshes(m, other, 'union')
  } }
]

describe('topology audit: tools keep face loops', () => {
  for (const [label, make] of cubes) {
    describe(label, () => {
      for (const tool of tools) {
        it(tool.name, () => {
          const result = tool.run(make())
          audit(result.mesh, Boolean(tool.triangles), Boolean(tool.watertight))
        })
      }
    })
  }
})
