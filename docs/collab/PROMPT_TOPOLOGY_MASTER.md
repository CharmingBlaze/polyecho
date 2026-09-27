# Topology master — faces, tools, games

Standing prompt for Cursor or DeepSeek. Paste the whole file, then send one slice name from **SLICES**.

Use MCP `polyecho-collab` if connected, otherwise `py -3 scripts/collab_bus.py`. Claim every file before writing it. Do not dual-write `projectStore.ts`, `Viewport3D.vue`, `Operations.ts`, `MeshRepository.ts`.

**Read first:** `docs/INVARIANTS.md` (Mesh section), `docs/CODEMAP.md`, `src/core/geometry/SurfaceGeometry.ts`, `src/core/geometry/Converters.ts`, `src/core/mesh/MeshBridge.ts`, `src/core/shapeDraw/ShapeTopology.ts`.

============================================================
THE MODEL (do not change it)
============================================================
Blender and Blockbench split topology from drawing. So do we.

| Layer | Role | Blender name |
|---|---|---|
| `MeshObject` | Saved document. Face = ordered `vertexIds` + one `uvs` entry per corner. | `Mesh` |
| `EditableMesh` | Half-edge kernel. Every tool edits this. | `BMesh` |
| `MeshBridge` | The only conversion between the two. | `BM_mesh_bm_from_me` / `to_me` |
| `faceTriIndexSets` → `surfaceTriangles` | Throwaway fill triangles for GPU, raycast, GLB. | looptris |
| `wireframeGeometry` / `getMeshEdges` | Cage and edge pick, from face boundaries only. | edit-mode edges |

Rules that make topology good for games and editing:

1. A face loop is the topology. The fill diagonal is never an edge. A bent convex quad stays one face.
2. Only **Triangulate**, **Poke**, and **Connect** store a diagonal on purpose. Any other tool that turns a quad into triangles is a bug in that tool. Fix the tool. Never hide edges with an angle threshold, `EdgesGeometry`, or `material.wireframe`.
3. `uvs[i]` belongs to `vertexIds[i]`. Any code that reorders, drops, or rotates `vertexIds` must do the same to `uvs` in the same statement, or go through `EditableMesh.replaceFace`. A mismatch looks exactly like "the wireframe is fine but the texture is folded or facing the wrong way on the diagonal".
4. One triangle source. Never hand-write a `for (i = 1; i < n - 1)` fan over a face loop; it is wrong for concave n-gons. Call `surfaceTriangles` / `faceTriIndexSets`.
5. Game export: GLB writes triangles, OBJ writes loops. Import runs `weldImportedMesh`, so our own files come back as quads.
6. Caps are one n-gon. Triangles are stored only where faces meet a point (cone, pyramid, wedge ends, sphere/capsule poles, icosphere).

============================================================
ALREADY DONE (do not redo)
============================================================
- Face-boundary cage, face picking via `faceIndexMap`, quad primitives, n-gon caps.
- `ImportWeld.ts`: glTF/OBJ weld + `mergePlanarPairs` (scored, UV/seam/sharp/material aware, keeps face ids). Boolean uses the same merge.
- Boolean input, `ObjectPick`, Poly Draw / Poly Build / Blockout Sketch previews use `surfaceTriangles`.
- Knife: an off-centre point on a quad now splits it with one chord (score was unit-dependent and fanned the quad into triangles on large faces).
- `cleanupMesh` keeps `uvs` aligned when it drops duplicate corners.
- Drag refresh checks topology with flat arrays (`renderTopology`), not per-corner JSON keys.
- **tool-audit, first pass** (`src/core/mesh/TopologyAudit.test.ts`): extrude, inset, bevel face/edge, subdivide, split edge, dissolve edge, delete face, solidify (open box), cleanup, limited dissolve, Catmull-Clark, symmetrize, triangulate → tris-to-quads, each on the 2-unit, 10-unit and bent cube. Bugs fixed in their kernels:
  - `DissolveKernel.dissolveEdge` spliced the second face in after the wrong vertex when the first face ran A→B (scrambled loop, folded UVs). Now walks both loops from the shared edge. Affects every edge dissolve, limited dissolve, tris-to-quads, blockout merge.
  - `MeshTopologyService.subdivideFaces` re-tessellated unselected neighbours into tri + quad. Neighbours now stay one n-gon (Blender).
  - `MeshEditOps.solidifyFaces` gave the inner layer the same winding as the outer one. The inner layer is now reversed.
  - `MeshEditOps.symmetrize` mirrored faces that straddle the plane onto themselves. It bisects on the plane first.
- **tool-audit, second pass**: the audit also runs loop cut (1 and 3 cuts), knife point (centre and off-centre), grid fill, F-fill, fill holes, flip all + recalculate outside, shell, negative solidify, split, rip, circle outline, make planar, smooth, unsubdivide, mirrored duplicate, and boolean difference / intersect / union. It now also fails a closed result whose signed volume is negative (inside out). Bugs fixed:
  - `MeshTopologyService.fillBoundary` used the boundary walk's arbitrary direction, so Fill Holes (and bisect fill) capped holes facing inward. It now runs opposite to the rim faces.
  - `BooleanKernel` difference and intersect never inverted the cutter's polygons at the end (csg.js merges them into A before the last invert). The inward pocket was then hidden by `recalculateOutside`, which also flipped loose BSP islands at random. Both fixed; the boolean keeps the BSP's own winding.
- **tool-audit, third pass**: bridge (rim to a floating lid), merge at centre, merge by distance, apply mirror modifier, separate (both sides), join. Booleans and bridge must also be **watertight** (every edge has a twin). Fixed:
  - `BooleanKernel.weldTJunctions`: a vertex resting on the middle of an open edge is inserted into that face loop, so boolean output is closed (no engine cracks).
  - Bridge was Blender-in-name-only. `bridgeEdgeLoops` paired edges by selection order; `bridgeLoopsAdvanced` never aligned the loops; `edgeLoopsFromIds` split an open chain in two when it started mid-chain. Now: `edgeChainsFromIds` walks both ends and reports open/closed; `alignBridgeLoop` picks direction and start by nearest corners; both bridge entry points require two chains of equal length and the same closure (else no-op, as Blender).
  - `bridgeTwoEdges` winds each new quad against its neighbours (same rule as `fillBoundary`). Solidify flips its inner layer before building walls.
- Audit coverage is now every one-shot tool that changes topology. Next slice: **uv-order**.

============================================================
SLICES (one per turn, in this order)
============================================================

**tool-audit** — one test file, `src/core/mesh/TopologyAudit.test.ts`. For each tool on a 2-unit cube **and** a 10-unit cube **and** a cube with one corner moved (bent quads): extrude, inset, bevel (edge + face), loop cut, knife (centre and off-centre points, one chord), bridge, grid fill, fill, dissolve, merge, solidify, subdivide, mirror, boolean, cleanup, flip normals, duplicate, separate/join. Assert:
- faces not touched by the tool keep their `vertexIds.length`;
- new walls and strips are quads;
- every face has `uvs.length === vertexIds.length`;
- no face's UV polygon self-intersects when its 3D polygon does not (catches rule 3);
- consistent winding across every manifold edge (half-edge twins run opposite).
Every failure is a tool bug. Fix the tool in its kernel, not the test.

**uv-order** — grep `src/core` for writes to `vertexIds` (`=`, `.reverse()`, `.splice`, `.shift`, `.unshift`, filters) and confirm `uvs` moves with them or `replaceFace` is used. Known safe: `MeshKernel.flip`, `ObjectEditTools`, `DuplicateTools`, `ObjectSymmetry`, `BooleanKernel.invert`. Add a test for each fix.

**tile-stamp** — `TilesetStamp` / `TileMapping` rescale a face's existing UVs into a tile. A triangle-stored side gets half a tile per triangle. When a selection's faces are triangles that pair into a planar or near-planar quad, stamp the pair as one quad island (reuse the `mergePlanarPairs` pairing, do not change topology). Stamping a quad must map corner order to the face's own box-projected orientation so the tile is upright on every side.

**winding** — after every `runKernelOperation`, faces on a closed manifold shell must face outward (`MeshEditOps.recalculateOutside` already exists). Add a cheap check in the kernel commit path for flipped islands and a Mesh → Normals → Recalculate Outside command if it is missing. Do not auto-flip open meshes.

**import-quads** — `weldImportedMesh` only folds coplanar pairs. Add an optional Blender-style **Tris to Quads** command (`performTrisToQuads`, Mesh menu + command palette, one undo step) with face-angle and shape thresholds (defaults 40°), reusing the scored pairing. Import keeps the strict coplanar default.

**drag-perf** — during a vertex drag, write only positions and normals for faces that touch moved vertices from a cached corner→vertex `Int32Array`; rebuild only when `renderTopology` changes. Needs a small `Viewport3D.vue` hook — hand off, do not dual-write. Target: 5k quads under 4 ms per frame.

**game-check** — export a cube, a cylinder, a bent quad, and a skinned mesh to GLB; re-import; assert faces return as quads/n-gons where coplanar, vertex count is welded, skin weights survive, and the shaded picture (triangle positions) is identical to the editor's `faceTriIndexSets` output.

============================================================
DO NOT
============================================================
- Switch the cage to `THREE.EdgesGeometry`, set `material.wireframe` on a mesh, or add an angle threshold to hide diagonals. `WireframeGeometry` stays on bone gizmos only.
- Replace `MeshObject` or the half-edge kernel, add WASM, or add a new framework or store.
- Snap a bent quad flat on release, or store the fill diagonal.
- Add `three-mesh-bvh` or a triangulation worker without a profile showing raycast or triangulation over 8 ms on a real scene (50k quads today: triangulate ~20 ms, raycast ~5 ms; the real costs are the drag refresh and bridge acquire).

============================================================
VERIFY EVERY SLICE
============================================================
- `npm run typecheck` and `npx vitest run` pass (known unrelated: `meshRevisions.test.ts` TRS case, `useCanvasLightwaveNav.ts` types).
- In the running editor: cube (every face 4), cylinder (one 8-sided cap, quad walls), drag one cube corner (still one face per side, texture stretches but does not change tile at the diagonal), knife one point off-centre on a big face (two quads), undo, and a click in vertex, edge, and face mode. Check the UV workspace shows one island per quad.
- Update `docs/INVARIANTS.md` if a rule changes and `docs/CODEMAP.md` for new modules.
- Post `kind=done` with the slice name, release claims, set HANDOFF Turn to the other agent.
