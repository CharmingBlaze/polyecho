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

Atlas cells: the UV canvas draws the same tile size as the tileset picker and redraws when that size changes. The active tileset tile is highlighted in amber. **Align & Snap** and the UV inspector **Atlas** section fit the current selection into a cell (`performMapUVsToAtlasCell`). Set the grid on the Texture tab or in the tileset panel. See `docs/TEXTURES.md`.

## Texel Density

- **Sample**: `sampleFaceTexelDensity(mesh, faceIdx, texSize)` calculates exact pixel-to-unit ratio of the active face.
- **Apply / Set**: `applyTargetTexelDensity(mesh, density, texSize, faceIndices?)` rescales target UV islands around their centroids.
- **Equalize**: `equalizeTexelDensity(mesh)` normalizes island scale across all faces to maintain consistent pixel density.

## Layout

The app left toolbar is hidden in UV/Paint; select modes and paint tools live on the in-canvas strips. UV Layout and Paint share the same 3D vs canvas split (default 50/50). Opening the UV editor fits the texture into the 2D view once; pan and zoom stay put after that (F / Frame still frames a selection). **Inspect** starts closed and opens when UV corners are selected; dismissing it keeps it closed until the selection is cleared. Workspace chrome (UV/Paint tabs, Smart UV, inspect sections, sliders) uses the shared inspector family (`inspector-seg`, `inspector-range`, `inspector-head`). Island drawing, cyan selection, and red seams stay on the canvas.

## Paint feedback and inspector

UV Layout and Paint keep Texture / Smart UV / Edit menus on the same header row as the UV/Paint tabs. If the pane is tight, those menus scroll sideways. Paint also has a dedicated contextual tool settings row, a palette above the status bar, and pointer-isolated canvas overlays. The shared help button lists shortcuts; UV transform buttons are disabled until a selection exists.

The inspector follows the workspace tab: UV shows unwrap settings (cut angle and pixel margin) and atlas controls; Paint shows brush size, opacity, shape, foreground color, and pen pressure. The paint canvas previews the brush footprint with a contrasting outline. Dither and shading strokes interpolate between pointer samples, excluding the previous sample so stationary movement does not repeatedly shade a pixel. Leaving the texture breaks stroke interpolation to avoid drawing a bridge on re-entry.

## Adding a UV tool

1. Change UV coords on `MeshObject.faces[].uvs` (same length as `vertexIds`).
2. `recordState` first, then `markGeometryUpdated`.
3. Use `getTargetFaces()` so you do not touch unselected islands.
4. Do not import Vue into `src/core/uv/`.


## Precision workbench and general meshes

The canvas now has a collapsible **Precision** panel with pixel / UV units, selection position and size, proportional sizing, numeric move / rotate / scale, and selection / individual-island / texture-center pivots. U points right and V points up; position describes the lower-left selection bound. Numeric operations use the selected pivot; direct gizmos keep their opposite-edge / opposite-corner anchoring. Rotation is computed in texture pixels, including on rectangular images.

- Arrow keys move selected corners one texture pixel; Shift moves ten. **L** expands to connected UV islands. **Home** fits the texture.
- **Snap corners to pixels** snaps actual coordinates, while drag snapping quantizes displacement and preserves spacing. Picking always uses unsnapped pointer coordinates.
- **Relax interiors** performs boundary-preserving Laplacian smoothing on selected welded UV nodes. Unselected corners, island borders, marked seam endpoints and pinned nodes stay fixed. This works with triangles, quads and n-gons; a border-only selection has nothing to relax.
- **Inspect** selects faces outside the texture or with zero UV area. These are diagnostics, not automatic errors: intentional tiling can lie outside 0–1. Checker and stretch views remain available.
- **Export layout** writes a transparent SVG wireframe at the texture dimensions for external texture authoring.

`src/core/uv/UVEditing.ts` resolves selection at corner granularity and calculates changes without mutating the mesh. Numeric actions record undo only for real changes. Vertex selection published to the 3D view does not echo back and select split UV corners on unrelated islands. Pins and align / fit actions use the current selection mode.

Smart UV projects actual geometric face normals, rather than trusting stale imported normals. Triangles, quads, n-gons, curved surfaces and disconnected parts use the same topology-based workflow. Projection and packing accept a separate texture height. Packing uses rotating best-short-side-fit rectangles and reuses free space, preserving pixel proportions and margins on rectangular textures. Existing callers that supply only texture width retain square-texture behavior. Packing is a bounding-box heuristic; it does not interlock concave island outlines, and an impossible margin can leave a layout unchanged. Complex organic models can still benefit from authored seams and inspection of stretch.

Regression coverage: `UVEditing.test.ts` checks exact selection, pins, rectangular rotation, individual pivots and relaxation. `UVGeneralMesh.test.ts` exercises offset / deformed cubes, spheres, cylinders, cones, mixed polygons, non-overlapping packing, rectangular texture proportions, and selected-face isolation.
