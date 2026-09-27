# Topology

PolyEcho edits polygons. A face is a loop of vertices — three, four, or more. WebGL can only draw triangles, so the viewport fills each loop with throwaway triangles. Those triangles are not edges. Selecting one of them selects the whole face. Dragging a corner of a quad leaves the quad bent; the bend is not stored as a diagonal.

This is the same split Blender and the Block SDK use: a half-edge mesh is the document you edit, and a triangle buffer is a picture of it.

## The five records

All of them live on `EditableMesh` in `src/core/mesh/MeshKernel.ts`. Ids here are numbers. They are stable for the life of that element and are never buffer indexes.

| Record | What it is | What it stores |
| --- | --- | --- |
| **Vertex** | A point in space | Position, vertex color, bone weights, `documentId` |
| **Edge** | The link between two vertices | `v1`, `v2`, seam, sharp. At most the faces that use it |
| **Half-edge** | One directed step around one face | Origin vertex, `next`, `prev`, twin, parent edge, **corner** |
| **Corner** | One slot of one face | The vertex, the face, the half-edge, and the **UV** |
| **Face** | The polygon | Material, color, normal, and a cache of the loop |

The polygon itself is not the `vertexIds` array. It is the cycle you get by starting at `face.halfEdgeIds[0]` and following `next` until you return. `EditableMesh.walkFace(faceId)` does that walk.

```text
        Vertex (position)
          ▲
          │ origin
        Half-edge ── next / prev ──► around the face
          │  twin
          │
        Corner (UV for this slot)
          │
          ▼
        Face (material, normal)
```

A cube is 8 vertices, 12 edges, 6 faces, 24 half-edges, and 24 corners. Each face has four corners. The two triangles that fill a quad are not in this table.

### Corners own the UV

A UV belongs to a corner, not to a vertex. Two faces can share a vertex and carry different texture coordinates. That is how a seam works: the vertex stays one point, and each face has its own corner.

`face.uvs[i]` is that corner's `THREE.Vector2`. Writing `face.uvs[i].x = 0.2` updates the corner. These do not:

- `face.uvs = someNewArray`
- `face.uvs.splice(...)`
- `face.vertexIds.splice(...)` without rebuilding the half-edges

Use one of these instead:

| You want to | Call |
| --- | --- |
| Change UVs, keep the same vertices | `mesh.setFaceUvs(faceId, uvs)` |
| Replace the loop (split, dissolve, extrude cap) | `mesh.replaceFace(faceId, vertexIds, uvs, material, color)` |
| Add a polygon | `mesh.addFace(vertexIds, uvs, material, color)` |
| Read the loop | `mesh.walkFace(faceId)` |
| Refresh the cache after a half-edge edit | `mesh.publishLoop(faceId)` or `mesh.syncLoops()` |

`replaceFace` keeps the face id and the `documentId`. Edge ids survive when the same two vertices are still connected, and seam / sharp flags stay on those edges.

## The cache on the face

`face.vertexIds`, `face.uvs`, `face.edgeIds`, and `face.halfEdgeIds` are a cache of the walk, in the same order. Tools that only read the loop can keep using the arrays. `publishLoop` rewrites them from the half-edges and points `face.uvs[i]` back at the corner vector.

`MeshBridge` calls `syncLoops()` before it writes a `MeshObject`, so the saved file matches the corners.

## Two id spaces

The file and the editor session do not use the same id type.

| | `MeshObject` (the JSON file) | `EditableMesh` (the session) |
| --- | --- | --- |
| Vertex / face id | `string` (`v_3`, `f_1`) | `number` |
| UV | `face.uvs[i]` next to `face.vertexIds[i]` | the corner on that half-edge |
| Edges | not stored; derived when needed | real records |

`MeshBridge` is the only translator.

- `meshObjectToEditableMesh` builds half-edges and corners from the file arrays. Each vertex and face keeps its string on `documentId`.
- `editableMeshToMeshObject` walks the corners and writes the parallel arrays the file still uses.

Selection that came from the file is strings. Selection inside a modal tool is numbers. After a bridge conversion, remap through the maps the bridge returns. Do not put both kinds of id in one array.

The file stays arrays on purpose. `src/types/mesh.ts` is the save format, and older projects load as arrays. The bridge is what turns those arrays into corners. Do not add a second edge-id scheme to the file. Edge keys are `${minId}_${maxId}` from `parseUndirectedEdgeId` in `EdgeUtils.ts`.

## Fill triangles

`EditableMesh.fillTriangles(faceId)` asks `surfaceTriangles` for index triples into the loop, then returns the corner id and vertex id of each corner of each triangle.

A convex quad becomes two triangles, `(0,1,2)` and `(0,2,3)` in loop order. An n-gon is filled the same way, including concave outlines. The result is for drawing, raycast, and picking. It is not written back onto the mesh.

`faceTriIndexSets` in `Converters.ts` is the same split for a `MeshObject` face, whose loop is the `vertexIds` array. One triangle source: fill, raycast, pick, previews, boolean input, and GLB export all use it. Do not fan a polygon by hand. A fan is wrong for a concave face.

GLB export writes triangles into the file only. OBJ export writes the loops. The document stays loops.

The viewport draws the cage from face boundaries (half-edges). Do not turn on Three.js `material.wireframe`. That strokes every fill triangle, so a quad looks like it has a diagonal that cannot be selected.

## Polygon normals

Face and region normals use `polygonAreaVector`, which sums the whole loop. Do not use only corners 0, 1, and 2. Splitting a straight boundary edge can make those leading corners collinear; the face is still valid, and extrude must still move along its actual polygon normal instead of a fallback axis.

## What a tool is allowed to do to a face

- A convex quad stays one face, including when it is bent.
- A concave outline is stored as triangles and convex quads, because a loop cannot cross itself.
- Cylinder, prism, and circle caps are one n-gon. Triangles are stored where faces meet a point: cone, pyramid, and wedge sides, sphere and capsule poles, and icosphere faces.
- Triangulate (`Ctrl+T`), Poke, and Connect on two opposite corners are the commands that write a real diagonal. If any other tool leaves a 3-vertex face where a quad was, that tool wrote the fill diagonal. Fix the tool.
- Knife across a quad, from one edge to the opposite edge, leaves two quads. A point inside a quad becomes one chord through that point. A triangle is the face that fans.
- Loop cut walks even rings (quads, hexes, and the rest). A triangle or an odd n-gon stops the ring. The new faces stay quads along a quad strip.

## Import

glTF and OBJ import run `weldImportedMesh` (`src/core/import/ImportWeld.ts`).

1. Corners that sit on the same point, with the same color and bone weights, become one vertex.
2. `mergePlanarPairs` folds a coplanar convex triangle pair back into a quad.

A pair stays split when the shared edge is a UV cut, a seam, a sharp edge, or a material change, and when the pair is bent. Boolean output uses the same merge. The importer does not guess a face size from the length of an index buffer. The glTF file is triangles; the weld step is what recovers quads, and only the pairs that were actually flat.

## Editing rules

1. Build and change polygons through `addFace` / `replaceFace` / `setFaceUvs`. Those keep the half-edge cycle and the corners together.
2. Splitting an edge goes through `TopologyOps.splitEdge` (and `MeshTopologyService.splitEdge`, which calls it). That inserts the vertex with `replaceFace`, copies seam and sharp onto the two new edges, and interpolates vertex color and weights. Do not splice `vertexIds` and leave the half-edges behind.
3. Read a loop with `walkFace` when the order matters. The cache matches it after `publishLoop`.
4. Undo stores corners. `createSnapshot` / `restoreSnapshot` copy corner ids and UVs. A snapshot from before corners existed rebuilds one corner per cached slot.
5. Modal tools restore that snapshot on cancel. They do not record history on every mouse move.
6. After a mesh edit that should show up, bump `geometryRevision`. After a pixel edit, bump `textureRevision`.

`TopologyAudit.test.ts` checks individual tools across small, large, and bent inputs. `TopologyFuzz.test.ts` adds deterministic seeded sequences and validates half-edges, face loops, UV lengths, and unique document ids after every operation. Keep both: the audit gives precise feature failures; the fuzz suite catches interaction bugs between otherwise valid edits.

## Where to change things

| Question | File |
| --- | --- |
| Add a field on a vertex, edge, corner, or face | `src/core/mesh/MeshKernel.ts` |
| Turn a file into a session mesh, or the reverse | `src/core/mesh/MeshBridge.ts` |
| Split, dissolve, fill, merge, triangulate | `src/core/mesh/MeshTopologyService.ts` and `src/core/mesh/operations/` |
| Fill triangles | `EditableMesh.fillTriangles`, `src/core/geometry/SurfaceGeometry.ts`, `src/core/geometry/Converters.ts` |
| Saved face shape | `src/types/mesh.ts` (`Face.vertexIds` + `Face.uvs`) |
| Do-not-break list | `docs/INVARIANTS.md` |

A new modeling tool follows the existing shape: a kernel function that takes an `EditableMesh` and returns a new loop via `replaceFace`, plus a test that a cube's faces stay quads and that `walkFace` matches `face.vertexIds` and the corners.
