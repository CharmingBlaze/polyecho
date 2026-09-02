# Invariants

Breaking any of these usually looks like “selection vanished”, “undo corrupted the mesh”, or “the viewport went blank”.

## IDs

- `MeshObject` vertices, faces, and meshes use **string** ids.
- `EditableMesh` vertices, edges, faces, and half-edges use **number** ids.
- After `MeshBridge` conversion, remap selection through the returned maps. Never mix the two id spaces in one array.
- `MeshObject` does not persist an `edges[]` list. Edge selection IDs are derived at runtime (`getMeshEdges()`). Do not invent a second edge-id scheme.

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
- Live shortcuts come from `keymapStore` (`matchingActionIds` → `App.vue`). Digit-row **1–6** are selection modes; **Numpad 1/3/7/0/5** are camera views / quad. Workspace gates: **F** Fill in Model, Poly Draw in Blockout; **V** Poly Build in Blockout; paint_* only in UV/Paint. Rebind in Preferences → Keyboard.
- Menu/`perform*` and modal kernel for the same verb must stay aligned. Inset / extrude / bevel one-shots go through `InsetKernel` / `ExtrudeKernel` / `BevelKernel` in `Operations.ts`. **I** in object mode must not inset the whole mesh.
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

- `.psxproj` version is `'1.0'` and `appName` is `'PSXModeller'`. Changing either is a format break.
- Autosave goes through `ProjectStorage`. Guard restore so it does not immediately re-trigger save.
