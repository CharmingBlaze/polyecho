# Modeling Operators & Modal Tools

PolyEcho's interactive 3D viewport tools follow the Blender modal interaction paradigm.

```
Viewport Key/Click  →  ModalOperator Session  →  EditableMesh Kernel  →  MeshBridge Commit
                             ↓
                 Real-time Fast Viewport Preview
```

| Component | Responsibility |
| :--- | :--- |
| **`ModalOperator`** (`src/core/operators/ModalOperator.ts`) | Base class for interactive tools. Handles pointer movement, axis locking (`X`/`Y`/`Z`), numeric keypad input, and snapping. |
| **`MeshBridge`** (`src/core/mesh/MeshBridge.ts`) | Converts `MeshObject` (string IDs) to `EditableMesh` (numeric IDs) and back while preserving selection IDs. |
| **`OperatorManager`** (`src/core/operators/OperatorManager.ts`) | Controls the active operator lifecycle (captures mouse and keyboard events). |

---

## The Modal Operator Lifecycle

### 1. `begin(ctx, pointer)`
- Captures initial mesh snapshot (`ctx.mesh.createSnapshot()`).
- Disables `OrbitControls` so camera movement does not interfere with the tool.
- Initializes transformation pivot and screen-space origin.

### 2. `update(pointer, event)`
- Computes delta offset in screen or world space based on active camera.
- Handles modifier keys:
  - **`Shift`**: Precision mode (slows down delta movement $\times 0.1$).
  - **`Ctrl`**: Grid & angle snapping.
  - **`X` / `Y` / `Z`**: Axis locking (Global vs Local).
  - **`0`–`9`, `.`, `-`**: Numeric input override (e.g. typing `2.5` then `Enter`).
- Calls `ctx.onUpdatePreview()` for high-performance reactive mesh rendering without polluting the undo stack.

### 3. `commit(actionName)`
- Re-converts `EditableMesh` back to `MeshObject` using ID mapping tables.
- Updates `projectStore.meshes` via `replaceMesh()`.
- Records **one** undo step (`projectStore.recordState(actionName)`).
- Re-enables `OrbitControls`.

### 4. `cancel()`
- Triggered on `Escape` or Right Mouse Click (`RMB`).
- Restores initial snapshot onto `EditableMesh` and store.
- Re-enables `OrbitControls` with zero changes recorded in history.

### Snapping (`HeaderMenu.vue`)

Live controls sit next to Space / Pivot in the app header. Magnet + chevron: grid size, vertex, edge midpoint, face center.

- **Grid / magnet**: status bar shows `gridSize`. **G** increment-snaps only with **Ctrl**. Magnet-on-by-default must not round grab delta (that froze small moves).
- **Vertex / edge / face**: closest moving point to a non-moving target; **one** rigid offset (`SnapManager.findRigidSnapOffset`) on grab, component gizmo drag, and object-mode gizmo (other meshes).
- **Object gizmo + Ctrl**: snaps object translation to `gridSize`.

---

## Standard Low-Poly Operators

| Key | Tool | Operator Class | Description |
| :--- | :--- | :--- | :--- |
| **`G`** | Grab / Move | `MoveOperator` | Translates selection along view plane or locked axes (`X`/`Y`/`Z`). **Ctrl**: increment snap. Viewport **Vertex Snap** / **Edge Midpoint**: rigid snap of the whole selection to the closest unused vertex or edge midpoint. **O** toggles proportional editing (also Rotate and Scale): connected verts inside the radius follow with a smooth falloff. Scroll changes the radius. The Tools panel Falloff switch remembers it. |
| **`R`** | Rotate | `RotateOperator` | Rotates selection around pivot axis based on angular pointer delta. |
| **`S`** | Scale | `ScaleOperator` | Scales selection uniformly or along constrained axes. |
| **`E`** | Extrude | `ExtrudeOperator` | Duplicates and projects boundary topology along face normals. **`I`** individual, **`M`** manifold (dissolve coplanar side walls after the move). |
| **`I`** | Inset | `InsetOperator` | Region inset (connected faces share one inner loop). Mouse = thickness from click. **`I`** individual, **`O`** outset, **`B`** boundary, **Ctrl** depth. |
| **`Ctrl+B`** | Bevel | `BevelOperator` | Splits sharp edges/vertices into chamfered/rounded bevel strips. |
|  | Bridge | `BridgeOperator` | Two edge loops of equal length. The strip previews immediately. Drag sets segments, scroll sets twist, click confirms one undo step. A mismatched pair cancels with nothing recorded. |
| **`K`** | Knife Tool | `KnifeOperator` | Raycasts onto visible faces to cut arbitrary edges and vertices. |
| **`Ctrl+R`**| Loop Cut | `LoopCutOperator` | Detects even n-gon edge rings (quads, hexes, …) and splits with interactive slide + scroll wheel count. Odd faces (tris) still stop the ring. |
| **`Shift+G`** | Edge Slide | `EdgeSlideOperator` | Slides selected edges along neighboring rails. |
| **`Shift+V`** | Vertex Slide | `VertexSlideOperator` | Slides a vertex along a connected edge. |
| **`Ctrl+Shift+R`** | Offset Edge Loop | `OffsetEdgeLoopOperator` | Inserts a pair of loops on both sides of a ring (calls `LoopCutKernel.cutLoop`, does not change the Loop Cut tool). |
| **`Alt+S`** | Shrink/Fatten | `ShrinkFattenOperator` | Moves verts along their vertex normals. |
| **`Shift+Alt+S`** | To Sphere | `ToSphereOperator` | Interpolates selected verts toward a sphere around the pivot. |
| **`Ctrl+Shift+F`** | Rotate Edge | one-shot `MeshEditOps.flipEdges` | Flips the shared diagonal of two triangles. |
| **`Ctrl+Shift+N`** | Recalculate Outside | one-shot `MeshEditOps.recalculateOutside` | Flips faces that point toward the mesh centroid. |
| **`Ctrl+X`** | Dissolve | one-shot `DissolveKernel` / `dissolveVertex` / `MeshEditOps.dissolveFaces` | Vertices, edges, or faces. |
| **Drag** | Primitive Placement | `PrimitivePlacementOperator` | Interactive click-and-drag grid spawner for boxes, cylinders, and spheres. |
| **F** (Model) | Fill | one-shot `Operations.fillFaceFromVertices` | See **Fill (F)** below. Not a modal operator. |
| **F** (Blockout) | Poly Draw | `PolyDrawOperator` | Front/Side silhouette; Persp view-plane or mesh face (N = ground). Close, then extrude toward the camera (F flips). MMB orbit. New mesh on commit. |
| **V** (Blockout) | Poly Build | `PolyBuildOperator` | Draw an outline (new or existing verts), then close to fill **inside** that loop. Concave loops tessellate like Poly Draw. |

---

## Fill (F) — Model workspace

Instant command (not `ModalOperator`). Same verb from **F**, Mesh menu, left toolbar, command palette, and `EDITOR_EVENTS.fillFace`.

| Piece | Role |
| :--- | :--- |
| `App.vue` | `requestFillFace()` when `appMode === 'model'` |
| `editorCommands.requestFillFace` | Window event |
| `Viewport3D` `handleFillFaceEvent` | Camera look dir → object-local, then `projectStore.performFillFace(dir)` |
| `Operations.orderFillLoop` / `orientFillLoop` / `fillFaceFromVertices` | Topology + winding |
| `Operations.connectTwoVertices` | **Two verts selected** → split the shared quad (Blockbench create_face) |

Winding: prefer neighbor-edge orientation. If the hole has no neighbor, invert when `dot(faceNormal, viewDir) > 0` (camera look, **object-local**). Else mesh-centroid outward. Do not skip the camera pass — fills in ortho views were coming out flipped.

Object mode **I** must not inset the whole mesh (`startModalOperator` returns early). Fill in object mode is a no-op unless you explicitly want that.

---

## Transform gizmo (`updateTransformGizmo`)

Lives in `Viewport3D.vue`. Default is Three.js `TransformControls` (translate / rotate / scale as separate tools) on `transformProxy`. Overlays → **Combined gizmo** (toolbar button) switches to `@voluma/three-transform-gizmo` (`TransformGizmo`) on the **scene root**: Select and Move then show all TRS handles. Rotate / Scale tools still use dedicated modes. Origin edit stays translate-only. `scaleAnchor` is `'center'` so object position and scale stay independent; Ctrl uses the package snap stepped to `snapping.gridSize`. Do not parent that gizmo under `gizmoGroup`.

**Do not nest vertex / edge / face centroid logic inside `selectMode === 'object'`.** That made the gizmo stay at the object origin (or detach) in every edit mode. The attach condition is:

- object mode, or
- vertex / edge / face **with a non-empty selection**

Empty edit-mode selection → `detach()` and return.

With combined gizmo off, `'select'` / `'move'` are translate. With it on, they use `setMode('combined')`. `'rotate'` / `'scale'` always change `setMode`.

Single-view render must set `transformControls.getHelper().visible = true`. Triple/Blockout toggles helper visibility per column and can leave it `false` if you forget to restore when leaving that layout.

Gizmo vertex/edge/face drag writes `MeshObject` verts in `onGizmoObjectChange`. Grab (**G**) in **edit** mode writes `EditableMesh` via `MoveOperator`. Object-mode **G/R/S** write `MeshObject` position / rotation / scale (same world-delta path as the object gizmo) so the handles stay on the object origin. Do not bake object grab into verts — that leaves the gizmo at the old origin.

Object-mode gizmo (single or multi) applies `transformProxy.matrixWorld * inverse(dragStartProxy)` onto each mesh’s drag-start TRS. The proxy stays an identity-scale handle at the pivot, so a translate after scale cannot write scale `(1,1,1)` back onto the object. Origin edit still translates the origin and compensates verts. Bones / sockets return before this path.

One history snapshot per drag (`recordState` on session start). Esc (`skipGizmoCommit`) undoes that snapshot and must not also `commitProxyTransform`.

---

## Snapping (`toolStore.snapping` + `SnapManager`)

UI: header magnet chevron (`HeaderMenu.vue`). Flags were historically unused except the checkboxes.

| Flag | Default | What it does |
| :--- | :--- | :--- |
| `grid` | **true** | Visual magnet on. **Does not** round grab delta (that froze small G moves to 0 at 0.5 m). |
| `gridSize` | `0.1` | Ctrl increment step on grab; vertex-snap threshold uses `max(0.06, gridSize * 0.75)`. |
| `vertex` / `edge` | false | Rigid snap: closest moving point to a **non-moving** vertex or unused-edge midpoint; **one** offset applied to the whole selection (`SnapManager.findRigidSnapOffset`). Wired in `MoveOperator` and gizmo component drag. |

`OperatorContext.snapVertex` / `snapEdge` / `snapGrid` / `gridSize` are copied in `startModalOperator`. Increment snap on **G** is **Ctrl only**.

Do not snap each vertex independently (selection would squash). Skip edge midpoints if either endpoint is moving.

---

## Blockbench face topology

The document stays `MeshObject` / half-edges. What matches Blockbench is the face, not their vertex dictionary.

- A cube or plane is quads with shared corners, the same as one Blockbench cube. A Blockbench import keeps each cube as its own mesh, so corners are not welded to the next cube.
- Viewport wireframe, the material Wireframe checkbox, and onion skins draw those face boundaries. The indigo wireframe is not a second mesh of triangles.
- Extrude, inset, bevel, loop cut, knife, bridge, grid fill, fill, dissolve, merge, solidify, and subdivide edit the face loop. Extrude and bevel work on any mesh. Extrude keeps a triangle, quad, or n-gon cap and adds quad walls; a flat triangle patch extrudes as one outline. Bevel chamfers manifold edges on quads and on triangle corners (a cylinder rim as well as a cube). A face stored as a flat triangle fan is beveled along that outline, not along every spoke. Strips are quads. A corner where the chamfer meets three edges stays a triangle. A cube face stays quads: extrude and inset add side quads, bevel adds quad strips, loop cut and subdivide split quads into quads. A knife point inside a quad cuts one chord, so the face becomes two quads instead of a triangle fan. Subdivide on a longer face prefers quads into the center; only an odd remainder is a triangle. A knife point inside a triangle, and an edge-bevel corner where three edges meet, stay triangles.
- Boolean runs on triangles internally, then merges coplanar pairs back into quads so an uncut cube face does not keep a diagonal.
- GLB and OBJ import do the same: `weldImportedMesh` welds coincident corners and folds coplanar triangle pairs back into quads, so a cube exported as GLB comes back as six quads on eight vertices. OBJ export writes the face loops as-is.
- Triangulate, Poke, and Connect are the tools that store that diagonal. After they run, it is a real edge and every tool above will see it.
- Cylinder, cone, prism, and circle caps are one face each. Cone sides, pyramid sides, and wedge ends are real triangles because they meet at a point. Sphere and capsule poles are triangles; their bands are quads. An icosphere is triangles, and its subdivision count is applied. Cube, plane, torus, tube, wall, stairs, and arch faces are quads.

## Blockbench `js/modeling` (reference, not a port)

Upstream: [blockbench/js/modeling](https://github.com/JannisX11/blockbench/tree/master/js/modeling).

Their mesh is vertex-dict faces + UV-by-vertex-id. **Do not** replace `MeshObject` / half-edges with that.

| Upstream | Taken | Skipped |
| :--- | :--- | :--- |
| `mesh_editing.js` create_face / camera invert | Fill winding + 2-vert connect | Dict topology |
| `vertex_snap.js` | Rigid offset during G / gizmo | Two-click pick tool, cube scale-from-verts |
| `transform/` TransformerModule | Same lifecycle as `ModalOperator` | Replacing gizmos with their `transform_gizmo.js` |
| `mirror_modeling.ts` live counterpart | Viewport Mirror X/Y/Z follows existing opposite verts (`LiveSymmetry.ts`) on gizmo + G/R/S | Extra clone mesh / topology copy |
| `generate_bounding_box.ts`, splines, weight paint | — | Minecraft voxels / other domains |
| `auto_fix` after ops | — | Optional later (merge coincident, split concave) |

---

## Resident Kernel Boundary

- **Do NOT** run interactive modal operations directly on `MeshObject` strings.
- Acquire existing meshes through `projectStore.acquireEditableMesh()`, retain both ID maps, and publish projections with `publishEditableMesh()`. Primitive and procedural shape construction use isolated kernels.
- Preview publication bumps the render revision without scheduling an autosave per pointer move. Confirm validates; invalid topology takes the normal cancel path.
- `MeshBridge` remains the import/projection boundary. Legacy document edits are synchronized on the next acquire until the remaining migration is complete.
