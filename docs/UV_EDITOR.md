# UV editor

`src/components/uvpaint/UVEditor.vue` plus `src/core/uv/` and `src/core/geometry/UVUnwrap.ts`.

## Selection (do not treat empty as “everything”)

- **Vertex / edge / face** — only those elements. Edge select/drag also moves the welded twin on the other island face (same 3D verts + coincident UVs) and writes `selectedEdgeIds` so the 3D overlay follows.
- **Island** — click or box-select a face, then grow to the UV island (faces that share welded UV edges). See `expandFacesToIslands` in `src/core/uv/UVIslands.ts`.
- **Transforms** (move, rotate, flip, scale, align) run on `getTargetFaces()`. If nothing is selected, they no-op. They used to rewrite the whole mesh.
- **Unwrap / pack** — if faces (or an island) are selected, only those faces change. If nothing is selected, the whole mesh is the target (explicit menu action).

## Tools

| Input | Action |
| :--- | :--- |
| Space-drag, MMB, RMB, Alt-drag | Pan |
| Wheel | Zoom (cursor-centered) |
| F or double-click canvas | Frame selection, or all islands if none |
| View → Frame UV Canvas | Fit the 0..1 tile |
| V or Islands → Stitch | Move the neighboring island onto the selected UV edge (shared 3D edge) |
| P / Alt+P | Pin / unpin selected UV corners; pins stay put during transforms |
| Islands → Weld UVs | Average UVs that share the same 3D vertex |

Hovering a face in the UV view highlights its **whole island** in the 2D canvas and on the 3D mesh (`toolStore.uvHoverFaceIds`). Stitch lives in `stitchUvEdge` (`src/core/uv/UVIslands.ts`).

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
