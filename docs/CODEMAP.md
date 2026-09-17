# Code map

Use this to find the right file instead of scanning the whole tree. Paths are from the repo root.

## Entry

| Path | Role |
| :--- | :--- |
| `index.html` | Vite HTML shell |
| `electron/main.mjs` | Desktop window, native file IPC |
| `electron/preload.cjs` | `window.polyechoDesktop` bridge |
| `src/main.ts` | Vue + Pinia bootstrap |
| `src/App.vue` | App chrome, **authoritative global key handler**, workspace layout (UV/Paint hides the left toolbar; UV Layout and Paint share the 3D/canvas split) |
| `src/style.css` | Global / Tailwind layers; inspector-head / rail / Split-Scene-Inspect control |
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
| `src/composables/useTilesetWindow.ts` | Floating tileset panel + stamp/paint session (clip bounds stay after the panel closes). |
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
| `src/core/mesh/MeshRepository.ts` | Per-project resident kernels; document compatibility boundary; modal preview publication |
| `src/core/mesh/MeshTransaction.ts` | Atomic edit/rollback, structured failures, topology/position/attribute change summaries and object-scoped element references |
| `src/core/mesh/MeshBuilder.ts` | Validated construction using the existing kernel mutations |
| `src/core/mesh/attributes/AttributeInterpolator.ts` | Independent vertex attribute copies, edge weight/color and corner UV interpolation |
| `src/core/mesh/MeshResidency.test.ts`, `src/stores/meshResidency.test.ts` | Identity, attributes, resident commits, rollback, history and project round-trip regressions |
| `src/core/mesh/HalfEdgeTopology.ts` | Half-edge helpers |
| `src/core/mesh/MeshTopologyService.ts` | Topology queries + one-shot bridge / grid-fill / cleanup / subdivide / poke / triangulate |
| `src/core/mesh/MeshValidator.ts` | Sanity checks |
| `src/core/mesh/operations/*Kernel.ts` | Interactive + one-shot kernels (extrude/inset/bevel/merge/dissolve/…). Poly Draw box-unwraps the solid on confirm. Loop Cut / Knife batch splits use `TopologyOps.splitFaceUnchecked` and validate once on commit. |
| `src/core/geometry/MeshOrigin.ts` | Place object origin at local AABB center (Poly Draw / Poly Build) |
| `src/core/geometry/MeshTransform.ts` | `MeshObject` world matrix (degrees → radians); object-gizmo world delta onto drag-start TRS |
| `src/core/geometry/ObjectPick.ts` | Ray / overlay pick among visible meshes (Knife / Loop Cut retarget) |
| `src/core/geometry/ObjectSymmetry.ts` | Flip mesh through origin (H/V/Z), wrap Euler degrees, used by inspector Flip / Rotate / Mirror Copy |
| `src/core/geometry/Primitives.ts` | Legacy cube / plane helpers |
| `src/core/geometry/Converters.ts` | Three.js `BufferGeometry`, including object shade flat/smooth/auto-smooth normals |
| `src/core/geometry/MeshShading.ts` | Infer and persist Blender Shade Flat / Smooth / Smooth by Angle (`shadeMode`) for GLB / OBJ |
| `src/core/geometry/PolygonGeometry.ts` | Polygon area / planarity helpers used by validation and n-gon picking |
| `src/core/geometry/SurfaceGeometry.ts` | Concave-aware surface triangles and perspective edge parameters |
| `src/core/geometry/ComponentPicking.ts` | Vertex / edge / face hit tests with consistent pixel thresholds |
| `src/core/geometry/SelectionConversion.ts` | Convert the current selection when switching vertex / edge / face mode |
| `src/core/geometry/GeometryTolerance.ts` | Shared scale-relative epsilon for degeneracy and planarity |
| `src/core/render/VertexMarkers.ts` | Screen-space vertex circles (procedural discs, selection/hover fill, constant pixel size) |
| `src/core/render/BoneDisplay.ts` | Faceted bone shafts, L/R colors, pickable envelopes |
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
| `src/core/operators/ShapeDrawOperator.ts` | Blockout Shape Draw (outline / path / sections) |
| `src/core/shapeDraw/` | Recipe, quad grid, topology, persistence (`ShapeRecipe.ts`, `QuadGrid.ts`, `ShapeTopology.ts`) |
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
| `src/core/painting/PaintLayerStorage.ts` | Per-layer PNG bytes in `.psxproj` / autosave |
| `src/core/painting/PaintSelection.ts` | Marquee, clipboard, constrained paint |
| `src/core/painting/StrokePath.ts` | Pointer-sample interpolation for brushes |
| `src/core/painting/encodePng.ts` | 8-bit RGBA PNG from pixel bytes (no canvas `toDataURL`) |
| `src/core/painting/DefaultTextures.ts` | Starter texture (retro atlas, solid colors, checker) + File → Properties pref |
| `src/core/uv/` | Seams, pack, atlas bake, island find/stitch (`UVIslands.ts`: shared 3D edge + welded UVs), cell math (`AtlasCells.ts`), face-to-tile mapping (`TileMapping.ts`), 3D stamp (`TilesetStamp.ts`), UV island edit (`UVEditing.ts`) |
| `src/core/painting/TilePixels.ts` | Atlas cell pixel bounds + tile transforms |
| `src/core/shaders/PSXShader.ts` | Retro viewport shader |
| `src/core/animation/Armature.ts` | Track sampling; `resolveMeshBoneParentId` / `setMeshBoneParent` |
| `src/core/animation/AutoSkinning.ts` | Weight assignment |
| `src/core/animation/HumanoidRig.ts` | Landmark markers + 15/19-bone humanoid draft |
| `src/core/animation/JointFitting.ts` | Guided joint placement with connected-endpoint + L/R mirror |
| `src/core/animation/RiggingWorkflow.ts` | Skeleton templates, attach, checks, exclusive paint/test modes |
| `src/core/animation/IKSolver.ts` | Two-bone + CCD; `applyIKConstraints` |
| `src/core/animation/SpringPhysics.ts` | Spring bones |
| `src/core/export/` | GLB, OBJ, Blockbench, sprites, turntable. Texture maps keyed by **texture id** (`buildExportTextureMap`). `gltfBinary.ts` reads/writes GLB chunks, injects clip marker `extras`, and embeds painted PNGs. `engineHandoffScene.ts` is the character fixture; `npm run handoff:glb` writes `samples/engine-handoff.glb`. The handoff test also runs the Khronos `gltf-validator`. |
| `src/core/import/` | GLB (object TRS, skins, clips, materials/textures), OBJ (geometry, `usemtl`, vertex colors), Blockbench `.bbmodel` cubes (`BlockbenchImport.ts`), images |
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
| `src/components/layout/` | Header, toolbars, status; `RightSidebar.vue` (flush inspector chrome) |
| `src/components/viewport/` | 3D view (`Viewport3D`: picking, gizmo, fill camera, modal start). Space/pivot/snap/overlays/x-ray live in `HeaderMenu.vue`. `ShapeDrawPanel.vue` / `PolyDrawPanel.vue` are Blockout overlays. |
| `src/components/inspector/MeshToolsProps.vue` | Modeling Tools tab: object shading, mode readout, Subdivide cuts/smooth, Faces / Edges / Vertices, Mesh |
| `src/components/inspector/TransformProps.vue` | Object tab: Smooth shading on/off, TRS, flip/rotate, origin, parent; workspace jumps (UV / Rig) |
| `src/components/inspector/AnimationInspector.vue` | Animate sheet: clip readout, keys, pose, playback |
| `src/components/outliner/` | Object tree |
| `src/components/uvpaint/` | UV editor, pixel editor (`PixelCanvas.vue` is the UV/Paint tab router), palettes, `PaintLayers.vue` (`inspector-head`), `TilesetEditor.vue` (floating atlas / tilemap panel) |
| `src/components/animation/` | Timeline (no separate DopeSheet component); `PosePopout.vue` for copy/paste/mirror pose |
| `src/components/rigging/` | Rig Inspect sheets: `SkeletonPanel`, `RiggingPanel` (Bone), `BindingsPanel`, `WeightsPanel`; `HumanoidRigWizard.vue`, `RigFitPopout.vue`, `BoneHierarchyPopout.vue` |
| `src/components/modals/` | Export, import, **new image** (`NewTextureModal`), prefs, palette, command search, `AddPrimitivePopout.vue` (Shift+A) |
| `src/components/ui/` | Shared buttons, menus, fields; `UiSection` inspector sections |
| `src/components/icons/BlenderIcon.vue` | Editor glyphs — add names here (`docs/ICONS.md`) |
| `src/utils/` | Vectors, color, dither, gradients |

Pointer: `docs/INPUT.md` (RMB pans views). Icons: `docs/ICONS.md`.

## Architecture docs

| Path | Role |
| :--- | :--- |
| `docs/ARCHITECTURE.md` | Layout and data flow |
| `docs/KERNEL_UNIFICATION.md` | Resident kernel boundary + remaining migration |
| `docs/ARCHITECTURE_IMPROVEMENT_PLAN.md` | Sequencing and write contract for that migration |
| `docs/INVARIANTS.md` | Do-not-break list |

## Agent collab

Cursor ↔ DeepSeek mailbox (docs + code). Protocol: `docs/collab/README.md`. Do not treat `docs/SUGGESTIONS_AND_IMPROVEMENTS.md` as a roadmap.

| Path | Role |
| :--- | :--- |
| `docs/collab/HANDOFF.md` | Whose turn + short status |
| `docs/collab/BACKLOG.md` | Architecture slices (K1–K5 seed + proposed) |
| `docs/collab/REVIEW.md` | Cursor’s last code check |
| `docs/collab/REJECTED.md` | Stale claims not to re-propose |
| `docs/collab/PROMPT_DEEPSEEK.md` | Paste into DeepSeek (first architecture turn) |
| `docs/collab/PROMPT_DEEPSEEK_NEXT.md` | Paste into DeepSeek (docs follow-up) |
| `docs/collab/PROMPT_DEEPSEEK_CODE.md` | Paste into DeepSeek (implementation; current slice T1.1) |
| `docs/collab/PROMPT_CURSOR.md` | How Cursor reviews a drop |
