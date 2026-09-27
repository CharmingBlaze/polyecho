# PolyEcho system

PolyEcho is a desktop polygon modeler for game assets: model, UV, paint, rig, animate, export. It works the way Blender and Blockbench work under the hood. Faces are loops of vertices (triangles, quads, n-gons). The GPU only ever sees throwaway triangles.

This file is the whole-system design and the target every change moves toward. `ARCHITECTURE.md` describes today's file layout, `CODEMAP.md` finds files, `INVARIANTS.md` is the do-not-break list. When they disagree with this file, this file wins and the other doc gets fixed.

---

## 1. The one model

```
             ┌──────────── user edits ────────────┐
             ▼                                    │
  MeshObject (document) ──MeshBridge──► EditableMesh (kernel) ──► tools
      │  ▲                                  │
      │  └──────── publish (commit) ────────┘
      ▼
  Render cache: fill triangles + cage lines + pick maps  ──► WebGL
```

| Layer | What it stores | Who touches it | Blender equivalent |
|---|---|---|---|
| `MeshObject` (`types/mesh.ts`) | The saved document. String ids. Each face is `vertexIds` + one `uvs` entry per corner, `materialIndex`. Vertices carry position, color, bone weights. Edge flags (seam, sharp) by undirected id. | Save, undo, export, inspectors | `Mesh` |
| `EditableMesh` (`mesh/MeshKernel.ts`) | Live half-edge copy. Numeric ids. The polygon is the half-edge walk. Each slot is a corner that owns the UV. `face.vertexIds` / `face.uvs` are a cache of that walk. | Every modeling tool | `BMesh` |
| `MeshRepository` | One resident kernel per mesh, leased by the active tool. | Store only | edit-mode BMesh |
| `MeshBridge` | The only conversion between document and kernel. Keeps ids stable. | Store only | `BM_mesh_bm_from_me` / `to_me` |
| `MeshTransaction` | Atomic edit, rollback, and a change summary (topology / position / attribute). | Store only | undo push |
| Render cache (`geometry/Converters.ts`) | `faceTriIndexSets` fill triangles, `faceIndexMap`, face-boundary `wireframeGeometry`, vertex points. Rebuilt from the document. Never saved. | Viewport, export, raycast | looptris + draw cache |

**Topology rules** (full list in `INVARIANTS.md`):

1. A face loop is the topology. The triangle that fills it is not an edge. A bent convex quad stays one face. Nothing snaps it flat or splits it on release.
2. Only Triangulate, Poke, and Connect store a diagonal. Any other tool that leaves a triangle where a quad was is a bug in that tool.
3. Inside the kernel, the corner owns the UV and `face.uvs[i]` is that vector. Change a loop with `setFaceUvs` or `replaceFace`. On the saved `MeshObject`, `uvs[i]` is the parallel array for `vertexIds[i]`. Full model: `docs/TOPOLOGY.md`.
4. One triangle source: `surfaceTriangles` (via `faceTriIndexSets`). One edge source: face boundaries (`getMeshEdges`, half-edges).
5. Never `THREE.EdgesGeometry`, never `material.wireframe` on a mesh, never an angle threshold to hide edges. `WireframeGeometry` is for bone gizmos only.
6. Caps are one n-gon. Triangles are stored only where faces meet a point.

---

## 2. Editing

### Selection
Vertex, edge, face, and object modes read the face loops. A face click hits a fill triangle, then `faceIndexMap` returns the parent face. An edge click tests `getMeshEdges` segments in screen space. A vertex click hits the shared corner. Selection is stored as document ids in `projectStore`, converted through the bridge maps when a tool needs kernel ids. Mode switches convert selection (`SelectionConversion.ts`).

### Two kinds of command, one write path

| Kind | Examples | How it runs |
|---|---|---|
| Interactive (modal) | Grab / rotate / scale, extrude, inset, bevel, loop cut, knife, slide, Poly Draw, Shape Draw, placement | `ModalOperator` subclass started by `operatorManager` from the viewport. Leases the resident kernel, edits it live, Escape restores its snapshot, confirm publishes. |
| One-shot | Merge, dissolve, fill, bridge, grid fill, subdivide, triangulate, poke, boolean, cleanup, UV unwraps | `projectStore.perform*` → `runKernelOperation(label, (document, bridge) => kernelFn)` → validate → record history → publish. |

Both paths call the **same kernel function** in `src/core/mesh/operations/` or `MeshTopologyService`. A verb never has two implementations. Menu, hotkey, and command palette all reach the same `perform*` or operator.

### History
One undo step per user action, recorded after validation and before publish. Modal tools record on confirm, never per pointer move. In-memory history stores the resident kernel snapshot beside the document clone and restores both together, preserving numeric edge and corner identity. Kernel snapshots are not part of the project file.

### Revisions
Each mesh has `meshRevision(id)` counters for topology, position, and attribute changes. The viewport rebuilds only what changed. A position-only change reuses the render buffers (the drag path); a topology change rebuilds them.

---

## 3. Rendering

- **Fill:** `meshToThreeGeometry` triangulates each face with `faceTriIndexSets`, writes per-corner position / normal / UV / color, and stores `renderTopology` so a drag can update positions in place.
- **Cage:** line segments from each face boundary, deduplicated per undirected edge. Same source for wireframe shading, edge hover, selection highlight, onion skins, ghosts, and placement previews.
- **Normals:** `shadeMode` flat / smooth / auto (Blender Smooth by Angle) plus explicit sharp edges. Flat shading uses one normal per face loop, not per triangle.
- **Materials:** standard PBR or the PSX shader (vertex jitter, affine UVs, dither). Affine UVs deliberately bend textures along the fill diagonal; that is the PS1 look, not a topology bug.
- **Modifiers:** Mirror → Subdivision → Solidify are evaluated on the document for display and export. The stored mesh is not changed until Apply.

---

## 4. Workspaces

| Workspace | Edits | Reads |
|---|---|---|
| Model | Topology and positions through operators and `perform*` | Face loops, selection |
| Blockout | Same operators, Front / Side / Persp split, Poly Draw, Shape Draw, Poly Build, reference images | Same kernel |
| UV / Paint | Face-corner `uvs` (islands from loops + seams), pixel layers in `PixelBuffer` | 3D paint hit maps triangle → face → UV |
| Rig | Bones, vertex weights | Vertices only |
| Animate | Clips, keys, pose | Posed face boundaries for onion skins |

No workspace invents edges from the fill triangles.

---

## 5. Library assets

Textures, materials, palettes, armatures, and clips are separate library items with small verb sets (`TEXTURES.md`, `MATERIALS.md`, `PALETTES.md`, `ANIMATION.md`). Meshes point at a material; materials point at a texture. Painting writes the texture, never the mesh.

---

## 6. Files

| Direction | Format | Topology |
|---|---|---|
| Save / autosave | `.psxproj` JSON | Face loops exactly as edited |
| Export | GLB | Triangles from `faceTriIndexSets`, skin, clips, markers, embedded PNGs |
| Export | OBJ | Face loops as written (quads and n-gons) |
| Export | Blockbench `.bbmodel` | Cubes / meshes |
| Import | GLB / OBJ | `weldImportedMesh`: weld coincident corners, fold coplanar triangle pairs back into quads (UV cuts, seams, sharps, material changes stay split) |
| Import | Blockbench | One mesh per cube, six quads |

---

## 7. Input and commands

- Live shortcuts: `App.vue` matches `keymapStore` chords and runs the verb. The active modal operator gets keys first.
- Command palette and menus: `ActionRegistry` / `setupDefaultActions.ts`.
- Viewport requests from panels: `editorCommands.ts` window events (`requestModalTool`, placement, camera).
- Pointer and navigation: `INPUT.md`.

---

## 8. Performance and reliability model

`PerformanceBudget.test.ts` builds deterministic shared-vertex grids and gates the complete document → resident kernel → render-triangle path:

| Size | CI budget |
|---|---|
| 5,000 quads | < 2 s |
| 20,000 quads | < 6 s |
| 50,000 quads | < 15 s |

The limits are deliberately generous for shared CI runners. Local profiling on a 50,000-quad grid gives the following design guidance:

| Step | Cost | Verdict |
|---|---|---|
| Triangulate every face | ~20 ms | Fine. No worker needed. |
| Raycast without BVH | ~5 ms | Fine. Add `three-mesh-bvh` only if a real scene exceeds 8 ms. |
| Drag refresh (whole mesh) | ~160 ms | Too slow at that size. Target: update only faces touching moved vertices. |
| Bridge acquire | ~600 ms | Paid once per tool start; resident kernels avoid it on repeat. |

At Blockbench scale (under 5k faces) everything is interactive today. The kernel stays TypeScript with `Map`s. A typed-array kernel is the next step only if the target grows past about 20k faces. No WASM.

Topology reliability is also sequence-tested. `TopologyFuzz.test.ts` runs deterministic seeded combinations of extrude, inset, poke, edge split, subdivide, triangulate, and cleanup, validating the resident half-edge mesh plus document UV/id invariants after every step. Failures print the seed and operation trace. Project loading and autosave share the same strict mesh validator; delete, load, recovery, and New Project prune or clear resident kernels so stale topology cannot cross document lifetimes.

---

## 9. Retire list (old systems)

Each old path is replaced, not kept alongside. Finish one row per slice; delete the old code in the same slice.

| Old | Replace with | Status |
|---|---|---|
| Document-only one-shot edits in `Operations.ts` that mutate `MeshObject` directly | `runKernelOperation` + a kernel function (resident commit) | 55 of 66 store writes already go through `runKernelOperation`; finish the rest (`ARCHITECTURE_IMPROVEMENT_PLAN.md`) |
| Writer-local `recordState` before mutation | History recorded by `runKernelOperation` after validation | Remove as each writer migrates |
| Global `geometryRevision` as the rebuild trigger | Per-object `meshRevision(id)` topology / position / attribute | Counters exist; move viewport rebuilds onto them |
| Whole-mesh drag refresh | Moved-face-only refresh from a cached corner→vertex table | Planned (`PROMPT_TOPOLOGY_MASTER.md` drag-perf) |
| `geometry/Primitives.ts` legacy cube / plane / cylinder helpers | `PrimitiveRegistry` builders | Still used by `projectStore` and the engine handoff fixture; move those callers, then delete |
| Hand-written triangle fans | `surfaceTriangles` | Done in app code; keep it that way |
| Triangle-soup imports | `weldImportedMesh` | Done for GLB and OBJ |
| Two shortcut catalogs (`keymapStore` live, `ActionRegistry` palette) | One action table: `ActionRegistry` owns ids, labels, handlers; `keymapStore` owns only chord bindings | Planned |
| Deep JSON history snapshots of every mesh | Per-object snapshots keyed by `meshRevision` (unchanged meshes shared) | Planned |
| `PSXModeller` / `PSX_LowPoly_Model` strings | `PolyEcho` | Only with a `.psxproj` version bump and a loader for the old name |

Do not remove a row's old path until its replacement has tests and the neighbouring workspaces (Model / UV / Rig / Animate) still work.

---

## 10. Where to add things

| Task | Where |
|---|---|
| Topology operation | Kernel function in `mesh/operations/` → `perform*` via `runKernelOperation` → keymap + `ActionRegistry` + menu. Add a cube test that face sizes and UV lengths hold. |
| Interactive tool | Same kernel, plus a `ModalOperator`, started with `requestModalTool` |
| Primitive | Builder in `primitives/builders/`, register in `PrimitiveRegistry` |
| Overlay or preview | Lines from face boundaries, fills from `surfaceTriangles` |
| Importer / exporter | `import/` (run `weldImportedMesh` on triangle input) / `export/` |
| New module | Add a row to `CODEMAP.md` |

Work order and acceptance tests for the remaining topology work: `collab/PROMPT_TOPOLOGY_MASTER.md`.
