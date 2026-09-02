# Code map

Use this to find the right file instead of scanning the whole tree. Paths are from the repo root.

## Entry

| Path | Role |
| :--- | :--- |
| `index.html` | Vite HTML shell |
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
| `src/components/modals/TextureSharePrompt.vue` | This object vs all objects on material |
| `src/stores/toolStore.ts` | Modes, tools, snap, viewport flags |
| `src/stores/animationStore.ts` | Rig, clips, playback, weights |
| `src/stores/historyStore.ts` | Undo / redo |
| `src/stores/layoutStore.ts` | Panel chrome, inspector tab per workspace, Blockout pane split fractions |
| `src/stores/themeStore.ts` | Themes |
| `src/stores/keymapStore.ts` | Live shortcut chords + Preferences remaps (`App.vue` matches events here) |

## Mesh and modeling

| Path | Role |
| :--- | :--- |
| `src/core/mesh/MeshKernel.ts` | `EditableMesh` + snapshots |
| `src/core/mesh/MeshBridge.ts` | `MeshObject` ↔ `EditableMesh` |
| `src/core/mesh/HalfEdgeTopology.ts` | Half-edge helpers |
| `src/core/mesh/MeshTopologyService.ts` | Topology queries |
| `src/core/mesh/MeshValidator.ts` | Sanity checks |
| `src/core/mesh/operations/*Kernel.ts` | Interactive op kernels |
| `src/core/geometry/Operations.ts` | One-shot `MeshObject` ops (fill loop/winding, 2-vert connect, merge, dissolve, …) |
| `src/core/geometry/Primitives.ts` | Legacy cube / plane helpers |
| `src/core/geometry/Converters.ts` | Three.js `BufferGeometry`, including object shade flat/smooth/auto-smooth normals |
| `src/core/geometry/ScreenGeometry.ts` | Screen rays, pane rects, Blockout column splits, dashed Poly Draw / Poly Build preview |
| `src/core/geometry/EdgeUtils.ts` | Loops / rings |
| `src/core/geometry/UVUnwrap.ts` | Planar / box / cylindrical |
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
| `src/core/operators/loopCut/LoopCutOperator.ts` | Loop cut |
| `src/core/operators/placement/PrimitivePlacementOperator.ts` | Shift+A placement |
| `src/core/operators/PolyDrawOperator.ts` | Blockout / Modeling outline + extrude |
| `src/core/operators/PolyBuildOperator.ts` | Blockout: snap to existing mesh verts, then fill quads |
| `src/core/mesh/operations/PolyDrawKernel.ts` | Planar face from clicked points |
| `src/core/commands/editorCommands.ts` | Window events into the viewport (`requestModalTool`, `requestFillFace`, …) |
| `src/core/commands/ActionRegistry.ts` | Centralized command registry with scope, category & shortcuts (`docs/SYSTEMS.md`) |
| `src/core/commands/setupDefaultActions.ts` | Registers default operators, tools, and shortcuts into `ActionRegistry` |
| `src/core/profiles/ModelProfiles.ts` | Target engine profiles (PSX, Godot 4, Unity, Blockbench) & budget validation |
| `src/core/input/InputRouter.ts` | Key routing utilities |
| `src/core/transform/SnapManager.ts` | Linear/angle/scale snap; `findRigidSnapOffset` (vertex/edge, whole selection) |
| `src/core/transform/LiveSymmetry.ts` | Live X/Y/Z counterpart follow (gizmo + G/R/S) |
| `src/core/transform/` | Pivot, numeric input, coordinate spaces |

## Paint, UV, animation, I/O

| Path | Role |
| :--- | :--- |
| `src/core/painting/PixelCanvas.ts` | `PixelBuffer` (layers, composite, fill, dither) |
| `src/core/painting/DefaultTextures.ts` | Default atlas |
| `src/core/uv/` | Seams, pack, atlas bake, island find/stitch (`UVIslands.ts`), cell math (`AtlasCells.ts`) |
| `src/core/shaders/PSXShader.ts` | Retro viewport shader |
| `src/core/animation/Armature.ts` | Track sampling; `resolveMeshBoneParentId` / `setMeshBoneParent` |
| `src/core/animation/AutoSkinning.ts` | Weight assignment |
| `src/core/animation/IKSolver.ts` | Two-bone + CCD; `applyIKConstraints` |
| `src/core/animation/SpringPhysics.ts` | Spring bones |
| `src/core/export/` | GLB, OBJ, Blockbench, sprites, turntable. Texture maps keyed by **texture id** (`buildExportTextureMap`). |
| `src/core/import/` | GLB, OBJ, images |
| `src/core/project/ProjectSerializer.ts` | `.psxproj` JSON (optional `referenceImages`) |
| `src/core/storage/ProjectStorage.ts` | Autosave |

## Vue UI

| Folder | Role |
| :--- | :--- |
| `src/components/layout/` | Header, toolbars, status (`DockviewLayout.vue` exists but is not mounted) |
| `src/components/viewport/` | 3D view (`Viewport3D`: picking, gizmo, fill camera, modal start). `ViewportNav.vue` is the Space/pivot/snap/shade/overlay bar. |
| `src/components/inspector/` | Transform, material, texture, modifiers, references (`ReferenceProps`), animation (`AnimationInspector` = Animate workspace) |
| `src/components/outliner/` | Object tree |
| `src/components/uvpaint/` | UV editor, pixel editor (`PixelCanvas.vue` is the UV/Paint tab router), palettes |
| `src/components/animation/` | Timeline (no separate DopeSheet component) |
| `src/components/rigging/` | Rig inspector: Skel (`SkeletonPanel`), Bone (`RiggingPanel`), Bind, Weights |
| `src/components/modals/` | Export, import, prefs, palette, command search |
| `src/components/ui/` | Shared buttons, menus, fields |
| `src/utils/` | Vectors, color, dither, gradients |
