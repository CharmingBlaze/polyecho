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
| **`G`** | Grab / Move | `MoveOperator` | Translates selection along view plane or locked axes (`X`/`Y`/`Z`). **Ctrl**: increment snap. Viewport **Vertex Snap** / **Edge Midpoint**: rigid snap of the whole selection to the closest unused vertex or edge midpoint. |
| **`R`** | Rotate | `RotateOperator` | Rotates selection around pivot axis based on angular pointer delta. |
| **`S`** | Scale | `ScaleOperator` | Scales selection uniformly or along constrained axes. |
| **`E`** | Extrude | `ExtrudeOperator` | Duplicates and projects boundary topology along face normals. |
| **`I`** | Inset | `InsetOperator` | Region inset (connected faces share one inner loop). Mouse = thickness from click. **`I`** individual, **`O`** outset, **`B`** boundary, **Ctrl** depth. |
| **`Ctrl+B`** | Bevel | `BevelOperator` | Splits sharp edges/vertices into chamfered/rounded bevel strips. |
| **`K`** | Knife Tool | `KnifeOperator` | Raycasts onto visible faces to cut arbitrary edges and vertices. |
| **`Ctrl+R`**| Loop Cut | `LoopCutOperator` | Detects quad edge rings and splits with interactive slide + scroll wheel count. |
| **Drag** | Primitive Placement | `PrimitivePlacementOperator` | Interactive click-and-drag grid spawner for boxes, cylinders, and spheres. |
| **F** (Model) | Fill | one-shot `Operations.fillFaceFromVertices` | See **Fill (F)** below. Not a modal operator. |
| **W** | Subdivide | one-shot `MeshTopologyService.subdivideFaces` | Object mode: every face on the selected mesh(es). Edit mode: current faces/edges. Number of Cuts + Smoothness in the Tools panel. Shared edge verts; neighbors tessellate. |
| **Alt+P** | Poke Faces | one-shot `MeshTopologyService.pokeFaces` | Centroid fan. Mesh workspace only (Rig Alt+P unbinds). |
| **Ctrl+T** | Triangulate | one-shot `MeshTopologyService.triangulateFaces` | Shortest diagonal on selected quads. |
| **Ctrl+X** | Dissolve | one-shot `DissolveKernel` / `dissolveVertex` | Vertices or edges. |
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
