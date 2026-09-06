# Invariants

Breaking any of these usually looks like “selection vanished”, “undo corrupted the mesh”, or “the viewport went blank”.

## IDs

- `MeshObject` vertices, faces, and meshes use **string** ids.
- `EditableMesh` vertices, edges, faces, and half-edges use **number** ids.
- After `MeshBridge` conversion, remap selection through the returned maps. Never mix the two id spaces in one array.
- `MeshObject` does not persist an `edges[]` list. Edge selection IDs are derived at runtime (`getMeshEdges()`). Do not invent a second edge-id scheme.
- Edge keys are `${minId}_${maxId}`. Vertex ids already contain `_` (`v_abc1234`), so **never** `split('_')` an edge id. Use `parseUndirectedEdgeId` from `EdgeUtils.ts`. This includes `seamEdgeIds` overlay drawing.

## Winding and UVs

- Face `vertexIds` and `uvs` are the same length (3 or 4).
- Winding is counter-clockwise for outward normals.
- Quad faces are triangulated at convert/export time (two tris). Do not drop the fourth vertex on the document model.

## History

- Record **before** mutating project or armature state.
- Texture undo requires cloning `PixelBuffer`, not only cloning the `dataUrl`.
- Modal operators restore an `EditableMesh` snapshot on cancel; they must not call `recordState` on every mouse move.

## Textures

- `selectTexture` never writes `Material.textureId`.
- `createTexture` never binds a mesh.
- Shared materials: prompt (or an explicit `TextureApplyPolicy`) before forking vs writing the shared slot.
- Paint target follows the mesh only in UV/Paint workspace or while 3D-painting. Not when selecting objects in Model mode.

## Pointer

- Idle **RMB** pans (or scrolls) the active view: 3D (`startLightWavePan`), UV/paint canvas, timeline dope sheet, graph editor. Suppress `contextmenu` on those surfaces.
- Idle **LMB drag** in a 3D perspective pane orbits (`startLightWaveRotate`). A short LMB click still selects (or paints). Modal operators, the gizmo, 3D paint, and box select keep LMB.
- Modal operators may use RMB for cancel / step back. Swatches may use RMB for secondary color. Canvas RMB is not a paint or select button.
- See `docs/INPUT.md`.

## Viewport sync

- Mesh edits that should appear in WebGL bump `projectStore.geometryRevision`.
- Pixel canvas edits bump `projectStore.textureRevision`.
- Do not keep a second long-lived copy of `meshes` inside a component except as a Three.js cache keyed by id + revision.
- Object `MeshObject.shadeMode` (`flat` / `smooth` / `auto` + `autoSmoothAngle`) wins over the viewport shade fallback. Split normals for auto-smooth live in `Converters.resolveMeshShadeMode` / `meshToThreeGeometry`.

## Operators

- Only one modal operator runs (`OperatorManager`). Starting another cancels the current one.
- Confirm goes through `onCommit`; cancel restores the kernel snapshot then `onCancel`. Viewport `onCancel` writes that restored kernel back with `replaceMesh` for mutating tools (not primitive / Poly Draw).
- Esc while the transform gizmo is dragging must not commit (`skipGizmoCommit` + history undo).
- Pointer / key events while a modal tool is active go to `OperatorManager` first (viewport + `App.vue` both check this). Global undo is disabled until the operator finishes.
- Live shortcuts come from `keymapStore` (`matchingActionIds` → `App.vue`). Digit-row **1–6** are selection modes; **Numpad 1/3/7/0/5** are camera views / quad. Workspace gates: **F** Fill in Model, Poly Draw in Blockout; **V** Poly Build in Blockout; paint_* only on the Paint tab; UV/Paint **1–4** stay in that workspace; UV-tab **P/V/U** pin, stitch, and Smart UV without Separate / Poly Build / paint tools. Paint-tab **X** swaps primary/secondary colors. `setAppMode('uvpaint')` does not reset the UV/Paint tab; leaving for Model restores the last mesh select mode. Animate: **I/K** insert keys, **E** does not extrude bones, **Shift+D** duplicates keys, **Ctrl+C/V** copy/paste pose, playback stops when leaving the workspace. Rebind in Preferences → Keyboard.
- Menu/`perform*` and modal kernel for the same verb must stay aligned. Inset / extrude / bevel / merge / edge dissolve one-shots go through those kernels; vertex dissolve uses `MeshTopologyService.dissolveVertex` (valence-2 only). `MeshTopologyService.mergeVertices` / `mergeByDistance` delegate to `MergeKernel`. Connect uses `TopologyOps.splitFace`; subdivide / fill / bridge / grid-fill / cleanup / delete / flatten / flip-normals go through `MeshTopologyService`. Edge delete uses undirected edge ids, not vertex ids. **I** in object mode must not inset the whole mesh.
- **F** is Fill in Model (`requestFillFace` → camera-local dir → `performFillFace`) and Poly Draw in Blockout. Do not bind both in the same workspace.
- Grab increment-snap is **Ctrl**, not `snapping.grid`. Magnet defaults **on**; rounding G delta to `gridSize` makes small moves disappear.
- Vertex/edge/face snap is a **rigid** offset for the whole selection (`SnapManager.findRigidSnapOffset`), on grab, component gizmo drag, and object gizmo (other meshes). Toggle UI is the magnet chevron on `HeaderMenu.vue` (increment sizes + vertex/edge/face targets).
- Live Mirror X/Y/Z (`LiveSymmetry.ts`) follows **existing** opposite verts (≈5 cm). It does not clone topology. Wire both gizmo drag and G/R/S. Object-mode grab skips it (whole mesh).

## Transform gizmo

- `updateTransformGizmo` in `Viewport3D.vue` must attach in object mode **and** in vertex/edge/face when that selection is non-empty. Do not put component-mode centroids inside `if (selectMode === 'object')`.
- After Blockout/triple-view, restore `transformControls.getHelper().visible = true` in the single-view render path.
- Blockout gizmos use the pane camera plus pane-local pointer NDC (`getGizmoPointer`). Before each triple-view render, set `transformControls.camera` to that pane and `updateMatrixWorld` so vertex/object handles stay on the selection and match that view’s zoom. Do not set `transformControls.enabled = false` when the hover axis is set. Do not detach the mesh gizmo because a reference image is selected.

## Skinning

- Smooth skin: at most four influences per vertex, weights normalized.
- Rigid parts: mesh `parentBoneId` + `parentType: 'bone'`. Do not store a bone id in `parentId` (that is mesh-to-mesh).
- Viewport skin uses posed world × inverse bind (rest pose channels = identity).
- GLB export builds a Three.js skeleton from `animationStore.armature`, `calculateInverses()`, and `resolveMeshBoneParentId` for unweighted verts.

## Project files

- `.psxproj` version is `'1.0'` and `appName` is `'PSXModeller'`. Changing either is a format break. `ProjectSerializer.migrateRaw` only fills missing 1.x fields (`version`/`appName` omitted, empty armature). Unknown versions still throw.
- Autosave goes through `ProjectStorage`. Guard restore so it does not immediately re-trigger save.
- Packaged File → Save / Open / Export use `desktopApi` native dialogs. Browser `dev:web` keeps `<input type="file">` and download fallbacks.
- Closing the desktop window with unsaved history (`historyStore.isDirty`) must prompt Save / Don't Save / Cancel. Cancel and a failed Save call `cancelClose` so the window stays open. If the renderer never answers, main force-closes after 8s. Load and New Project mark the document clean.
