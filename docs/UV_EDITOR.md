# UV editor

`src/components/uvpaint/UVEditor.vue` plus `src/core/uv/` and `src/core/geometry/UVUnwrap.ts`.

## Selection (do not treat empty as “everything”)

- Opening **UV / Paint** uses **face** select (`setAppMode('uvpaint')`). Vertex / edge / island stay available (1–4). The UV vs Paint tab is remembered when you leave and come back. Leaving for Modeling restores the last object/vertex/edge/face mode.
- **Vertex / edge / face** — only those elements. Edge select/drag also moves the welded twin on the other island face (same 3D verts + coincident UVs) and writes `selectedEdgeIds` so the 3D overlay follows.
- **Island** — click or box-select a face, then grow to the UV island (faces that share a 3D edge whose UV endpoints are welded). Matching UV coordinates alone do not merge stacked faces. See `expandFacesToIslands` in `src/core/uv/UVIslands.ts`.
- **Transforms** (move, rotate, flip, scale, align) run on `getTargetFaces()`. If nothing is selected, they no-op. They used to rewrite the whole mesh.
- **Unwrap / pack** — if faces (or an island) are selected, only those faces change. If nothing is selected, the whole mesh is the target (explicit menu action).

## Tools

| Input | Action |
| :--- | :--- |
| U / **Smart UV** | Automatically split by real mesh edges, marked seams, and cut angle; best-fit project each island; rotate and pack with pixel margin. Uses selected faces, or the whole mesh when selection is empty. |
| Space-drag, MMB, RMB, Alt-drag | Pan |
| Wheel | Zoom (cursor-centered) |
| A / Alt+A | Select all / deselect in the current UV mode |
| F or double-click canvas | Frame selection, or all islands if none |
| View → Frame UV Canvas | Fit the 0..1 tile |
| Ctrl+Shift+E / **Mark seam** | Mark selected UV/3D edges, or the border of selected faces / islands. Seams draw **red** in the UV canvas and the 3D viewport. |
| Ctrl+Alt+E / **Clear seam** | Clear those same target edges. |
| V or Islands → Stitch | Move the neighboring island onto the selected UV edge (shared 3D edge) |
| P / Alt+P | Pin / unpin selected UV corners; pins stay put during transforms |
| Islands → Weld UVs | Average UVs that share the same 3D vertex |

Hovering a face in the UV view always highlights its **whole island** in the 2D canvas and on the 3D mesh (`toolStore.uvHoverFaceIds`). Stitch lives in `stitchUvEdge` (`src/core/uv/UVIslands.ts`). Digit-row **1–4** stay in UV/Paint (vertex / edge / face / island) and do not switch back to Modeling.

### Smart UV workflow

Smart UV is the default general-purpose unwrap for boxes, props, curved meshes, imported models, and mixed topology. The **cut angle** controls how far surface normals may bend inside one planar island: lower values create more, flatter islands; higher values preserve larger continuous patches. Explicitly marked seams always split islands. The **island margin** is measured in pixels at the active texture resolution.

The store verb is `performSmartUvProject` (header, left rail, inspector Unwrap, U, and the command palette). Cut angle and island margin live on `toolStore` so every entry point uses the same values. Use the specialized Box, Cylinder, Sphere, Cone, Cubemap, and Planar projections only when you deliberately want those layouts — they now normalize to the target faces’ AABB (not a unit cube at the origin) and go through `performBoxUnwrap` / `performPlanarUnwrap` / etc. so undo and the 3D viewport stay in sync. Manual **Unwrap Using Marked Seams** remains available for authored seam workflows. **Gridify** is `performGridifyUvQuads`. Atlas bake remaps UVs and must bump `geometryRevision`.

UV-tab shortcuts are isolated from modeling shortcuts: P pins UVs without separating the mesh, V stitches without starting Poly Build, and paint shortcuts only activate on the Paint tab.

Atlas cells: if the paint target has `atlas`, the UV canvas draws that grid. **Align & Snap** and the UV inspector **Atlas** section fit the current selection into a cell (`performMapUVsToAtlasCell`). Set the grid on the Texture tab. See `docs/TEXTURES.md`.

## Texel Density

- **Sample**: `sampleFaceTexelDensity(mesh, faceIdx, texSize)` calculates exact pixel-to-unit ratio of the active face.
- **Apply / Set**: `applyTargetTexelDensity(mesh, density, texSize, faceIndices?)` rescales target UV islands around their centroids.
- **Equalize**: `equalizeTexelDensity(mesh)` normalizes island scale across all faces to maintain consistent pixel density.

## Adding a UV tool

1. Change UV coords on `MeshObject.faces[].uvs` (same length as `vertexIds`).
2. `recordState` first, then `markGeometryUpdated`.
3. Use `getTargetFaces()` so you do not touch unselected islands.
4. Do not import Vue into `src/core/uv/`.
