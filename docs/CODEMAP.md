# Code map

Use this to find the right file instead of scanning the whole tree. Paths are from the repo root.

## Entry

| Path | Role |
| :--- | :--- |
| `index.html` | Vite HTML shell |
| `electron/main.mjs` | Desktop window, native file IPC |
| `electron/preload.cjs` | `window.polyechoDesktop` bridge |
| `src/main.ts` | Vue + Pinia bootstrap |
| `src/App.vue` | App chrome, **authoritative global key handler**, workspace layout |
| `src/style.css` | Global / Tailwind layers |
| `vite.config.ts` | Vite + `@` alias |

## Types

| Path | Role |
| :--- | :--- |
| `src/types/mesh.ts` | `MeshObject`, `Vertex`, `Face`, `Edge`, modifiers; `shadeMode` (`flat` / `smooth` / `auto`) + `autoSmoothAngle` |
| `src/types/animation.ts` | `Armature`, `Bone`, clips, keys, bindings |
| `src/types/texture.ts` | `Material`, `Palette`, `TextureMap` |
| `src/types/tools.ts` | Modes, tools, snap, viewport settings |
| `src/types/reference.ts` | Blockout reference images |

## Stores

| Path | Role |
| :--- | :--- |
| `src/stores/projectStore.ts` | Document, modeling, texture + material verbs (`docs/TEXTURES.md`, `docs/MATERIALS.md`) |
| `src/composables/useTextureApply.ts` | Apply-to-object + shared-material prompt |
| `src/composables/useFloatingDrag.ts` | Pointer-capture drag for floating chrome |
| `src/composables/useFastTitleTips.ts` | Fast icon hover labels (replaces slow OS `title`) |
| `src/components/modals/TextureSharePrompt.vue` | This object vs all objects on material |
| `src/stores/toolStore.ts` | Modes, tools, snap, viewport flags; UV/Paint tab + last modeling select mode |
| `src/test/setup.ts` | Vitest canvas 2D stub (`canvas2dStub.ts`) |
| `src/stores/animationStore.ts` | Rig, clips, playback, weights |
| `src/stores/historyStore.ts` | Undo / redo + dirty epoch (`isDirty` / `markClean`) |
| `src/stores/layoutStore.ts` | Panel chrome, inspector tab per workspace, Blockout pane split fractions |
| `src/core/theme/` | Theme engine: tokens, color math, CSS apply, builtin presets. |
| `src/stores/themeStore.ts` | Theme persistence, custom token edits, user presets, UI scale. Apply remaps wells away from the accent and sets `--ui-on-accent`. |
| `src/stores/keymapStore.ts` | Live shortcut chords + Preferences remaps (`App.vue` matches events here) |
| `src/stores/runtimeStore.ts` | Last uncaught error for the status bar |

## Mesh and modeling

| Path | Role |
| :--- | :--- |
| `src/core/mesh/MeshKernel.ts` | `EditableMesh` + snapshots |
| `src/core/mesh/MeshBridge.ts` | `MeshObject` ↔ `EditableMesh` |
| `src/core/mesh/HalfEdgeTopology.ts` | Half-edge helpers |
| `src/core/mesh/MeshTopologyService.ts` | Topology queries + one-shot bridge / grid-fill / cleanup / subdivide / poke / triangulate |
| `src/core/mesh/MeshValidator.ts` | Sanity checks |
| `src/core/mesh/operations/*Kernel.ts` | Interactive + one-shot kernels (extrude/inset/bevel/merge/dissolve/…). Poly Draw box-unwraps the solid on confirm. |
| `src/core/geometry/MeshOrigin.ts` | Place object origin at local AABB center (Poly Draw / Poly Build) |
| `src/core/geometry/MeshTransform.ts` | `MeshObject` world matrix (degrees → radians) |
| `src/core/geometry/ObjectPick.ts` | Ray / overlay pick among visible meshes (Knife / Loop Cut retarget) |
| `src/core/geometry/ObjectSymmetry.ts` | Flip mesh through origin (H/V/Z), wrap Euler degrees, used by inspector Flip / Rotate / Mirror Copy |
| `src/core/geometry/Primitives.ts` | Legacy cube / plane helpers |
| `src/core/geometry/Converters.ts` | Three.js `BufferGeometry`, including object shade flat/smooth/auto-smooth normals |
| `src/core/render/VertexMarkers.ts` | Screen-space vertex squares (Blockbench-style outline, constant pixel size at any zoom) |
| `src/core/geometry/ScreenGeometry.ts` | Screen rays, overlay mapping (`rayFromClient` / `worldToOverlay` match renderer `clientWidth`), Blockout column splits (including maximized pane = full canvas), dashed Poly Draw / Poly Build preview |
| `src/core/geometry/EdgeUtils.ts` | Loops / rings; `undirectedEdgeId` / `parseUndirectedEdgeId` (ids may contain `_`) |
| `src/core/geometry/UVUnwrap.ts` | Planar / box / cylindrical / Smart UV + pack |
| `src/core/geometry/Modifiers.ts` | Stack (`Mirror` → `Subdiv` → `Solidify`) + defaults + apply |
| `src/core/geometry/MirrorModifier.ts` | Bisect / merge / UV flip |
| `src/core/geometry/SubdivisionModifier.ts` | Catmull–Clark + Simple |
| `src/core/geometry/SolidifyModifier.ts` | Thickness, offset, rim |
| `src/core/primitives/PrimitiveRegistry.ts` | Primitive catalog |
| `src/core/primitives/builders/` | Box, radial, architectural builders |

## Operators and input

| Path | Role |
| :--- | :--- |
| `src/core/operators/ModalOperator.ts` | Modal tool base (G/R/S style) |
| `src/core/operators/OperatorManager.ts` | Single active operator |
| `src/core/operators/MoveOperator.ts` | Grab |
| `src/core/operators/RotateOperator.ts` | Rotate |
| `src/core/operators/ScaleOperator.ts` | Scale |
| `src/core/operators/ExtrudeOperator.ts` | Extrude |
| `src/core/operators/InsetOperator.ts` | Inset |
| `src/core/operators/BevelOperator.ts` | Bevel |
| `src/core/operators/knife/KnifeOperator.ts` | Knife |
| `src/core/mesh/operations/KnifeKernel.ts` | Knife splits, surface poke, cut-through |
| `src/core/operators/loopCut/LoopCutOperator.ts` | Loop cut |
| `src/core/mesh/operations/LoopCutKernel.ts` | Edge-ring loop cut (any even n-gon strip / tri edge) |
| `src/core/operators/adoptEditMesh.ts` | Retarget Knife / Loop Cut to the mesh under the pointer |
| `src/core/operators/placement/PrimitivePlacementOperator.ts` | Shift+A placement |
| `src/core/operators/PolyDrawOperator.ts` | Blockout / Modeling outline + extrude |
| `src/core/operators/PolyBuildOperator.ts` | Blockout: snap to existing mesh verts, then fill quads |
| `src/core/mesh/operations/PolyDrawKernel.ts` | Planar face from clicked points |
| `src/core/commands/editorCommands.ts` | Window events into the viewport (`requestModalTool`, `requestFillFace`, …) |
| `src/core/commands/ActionRegistry.ts` | Centralized command registry with scope, category & shortcuts (`docs/SYSTEMS.md`) |
| `src/core/commands/setupDefaultActions.ts` | Registers default operators, tools, and shortcuts into `ActionRegistry` |
| `src/core/profiles/ModelProfiles.ts` | Target engine profiles (PSX, Godot 4, Unity, Blockbench) & budget validation |
| `src/core/transform/SnapManager.ts` | Linear/angle/scale snap; `findRigidSnapOffset` (vertex/edge, whole selection) |
| `src/core/transform/LiveSymmetry.ts` | Live X/Y/Z counterpart follow (gizmo + G/R/S) |
| `src/core/transform/` | Pivot, numeric input, coordinate spaces |

## Paint, UV, animation, I/O

| Path | Role |
| :--- | :--- |
| `src/core/painting/PixelCanvas.ts` | `PixelBuffer` (layers, composite, fill, dither). `toPngBytes()` writes a real PNG. |
| `src/core/painting/encodePng.ts` | 8-bit RGBA PNG from pixel bytes (no canvas `toDataURL`) |
| `src/core/painting/DefaultTextures.ts` | Default atlas |
| `src/core/uv/` | Seams, pack, atlas bake, island find/stitch (`UVIslands.ts`: shared 3D edge + welded UVs), cell math (`AtlasCells.ts`) |
| `src/core/shaders/PSXShader.ts` | Retro viewport shader |
| `src/core/animation/Armature.ts` | Track sampling; `resolveMeshBoneParentId` / `setMeshBoneParent` |
| `src/core/animation/AutoSkinning.ts` | Weight assignment |
| `src/core/animation/IKSolver.ts` | Two-bone + CCD; `applyIKConstraints` |
| `src/core/animation/SpringPhysics.ts` | Spring bones |
| `src/core/export/` | GLB, OBJ, Blockbench, sprites, turntable. Texture maps keyed by **texture id** (`buildExportTextureMap`). `gltfBinary.ts` reads/writes GLB chunks, injects clip marker `extras`, and embeds painted PNGs. `engineHandoffScene.ts` is the character fixture; `npm run handoff:glb` writes `samples/engine-handoff.glb`. The handoff test also runs the Khronos `gltf-validator`. |
| `src/core/import/` | GLB (meshes, armature, clips, materials/textures when present), OBJ, images |
| `src/core/project/ProjectSerializer.ts` | `.psxproj` JSON (optional `referenceImages`); deserialize validates version and face UVs |
| `src/core/history/applyMeshDocument.ts` | Clone/apply mesh + selection slices for undo |
| `src/core/desktop/desktopApi.ts` | Native save/open when hosted in Electron; browser download fallback |
| `src/core/desktop/appIconRaster.ts` | Raster of `public/favicon.svg`; `encodeIco.ts` writes `build/icon.ico` |
| `src/core/project/projectIo.ts` | Serialize, save, and load the open editor project |
| `src/core/storage/ProjectStorage.ts` | Autosave (`isValidProjectData` rejects empty meshes / UV mismatch) |
| `src/**/*.test.ts` | Vitest unit tests (`npm test`, `docs/PRODUCTION.md`). PixelBuffer uses a 2D canvas stub. |

## Vue UI

| Folder | Role |
| :--- | :--- |
| `src/components/layout/` | Header, toolbars, status |
| `src/components/viewport/` | 3D view (`Viewport3D`: picking, gizmo, fill camera, modal start). Space/pivot/snap/shade/overlays/x-ray live in `HeaderMenu.vue`. |
| `src/components/inspector/MeshToolsProps.vue` | Modeling Tools tab: Subdivide (cuts/smoothness), extrude/inset/bevel, merge, poke, triangulate |
| `src/components/outliner/` | Object tree |
| `src/components/uvpaint/` | UV editor, pixel editor (`PixelCanvas.vue` is the UV/Paint tab router), palettes |
| `src/components/animation/` | Timeline (no separate DopeSheet component) |
| `src/components/rigging/` | Rig inspector: Skel (`SkeletonPanel` + `BoneTreeNode`), Bone (`RiggingPanel`), Bind, Weights |
| `src/components/modals/` | Export, import, **new image** (`NewTextureModal`), prefs, palette, command search |
| `src/components/ui/` | Shared buttons, menus, fields |
| `src/components/icons/BlenderIcon.vue` | Editor glyphs — add names here (`docs/ICONS.md`) |
| `src/utils/` | Vectors, color, dither, gradients |

Pointer: `docs/INPUT.md` (RMB pans views). Icons: `docs/ICONS.md`.
