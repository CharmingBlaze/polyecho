# PolyEcho architecture

PolyEcho is a browser DCC: Vue 3 + TypeScript + Pinia + Three.js + Vite. The product name is PolyEcho; some project-file and default-name strings still say `PSXModeller` / `PSX_LowPoly_Model`. Keep those identifiers stable unless you are intentionally changing the `.psxproj` format.

This document is the source of truth for layout and data flow. `README.md` is the product overview.

## Layers

Keep math and topology out of Vue files. Keep Three.js scene objects out of Pinia stores. Stores own serializable editor state; the viewport owns the live WebGL scene.

```
UI (Vue SFC)
  → Pinia stores (project, tools, animation, history, layout, theme, keymap)
  → core/ (operators, mesh kernels, exporters, painting, shaders)
  → types/ (plain interfaces)
```

| Layer | Lives in | Owns |
| :--- | :--- | :--- |
| Shell | `src/App.vue`, `src/components/layout/` | Chrome, global shortcuts, modal visibility |
| Viewport | `src/components/viewport/Viewport3D.vue` | Three.js scene, picking, modal operator session |
| Project data | `src/stores/projectStore.ts` | Meshes, selection, materials, textures |
| Pose / clips | `src/stores/animationStore.ts` | Armature, clips, playback, weights |
| Tools / view flags | `src/stores/toolStore.ts` | App mode, select mode, snap, viewport shading |
| History | `src/stores/historyStore.ts` | Undo / redo snapshots |
| Pure mesh math | `src/core/geometry/`, `src/core/mesh/` | Topology and one-shot ops |
| Interactive tools | `src/core/operators/` | Grab, rotate, scale, extrude, knife, loop cut, placement |
| I/O | `src/core/import/`, `src/core/export/`, `src/core/project/` | GLB, OBJ, Blockbench, `.psxproj` |

## Two mesh representations

This split is load-bearing. Do not collapse it without a dedicated migration.

1. **`MeshObject`** (`src/types/mesh.ts`) — document model. String IDs, JSON-friendly. Stored in `projectStore.meshes`. Used by one-shot ops in `src/core/geometry/Operations.ts`, converters, serializers, exporters.
2. **`EditableMesh`** (`src/core/mesh/MeshKernel.ts`) — edit kernel. Numeric IDs, `Map`s, half-edges. Used by modal operators and kernels under `src/core/mesh/operations/`.

`MeshBridge` converts both ways. Modal tools in `Viewport3D.vue` convert the active `MeshObject` to `EditableMesh`, run the operator, then write back with `editableMeshToMeshObject`. Selection IDs must be remapped through the bridge maps; do not assume string IDs survive a round trip unless the maps are passed through.

The same tool can exist on **both** paths. Example: `E` in the viewport is `ExtrudeOperator` + `ExtrudeKernel`; a menu/`performExtrude()` call still uses `Operations.ts`. Changing only one path makes the menu and the hotkey disagree. Prefer kernel-first for topology, then keep or bridge the store path. Full operator rules: `docs/MODELING_OPERATORS.md`.

`geometryRevision` / `textureRevision` on the project store tell the viewport to rebuild buffers. After committing mesh or pixel changes, bump the matching revision.

## Stores

All stores use Pinia setup stores (`defineStore('id', () => { ... })`).

| Store | File | Responsibility |
| :--- | :--- | :--- |
| `project` | `stores/projectStore.ts` | Meshes, selection, materials, textures, `PixelBuffer`, one-shot modeling actions |
| `tool` | `stores/toolStore.ts` | `appMode` (`model` / `blockout` / `uvpaint` / `rig` / `animate`), `selectMode`, paint/rig tools, snap, viewport flags |

Blockout uses the same mesh operators as Modeling and a **Front \| Side \| Persp** triple split in `Viewport3D.vue`. Reference images live on `projectStore.referenceImages` (not the texture library). See `docs/BLOCKOUT.md`.
| `animation` | `stores/animationStore.ts` | Bones, clips, keys, playback, skinning / weight paint |
| `history` | `stores/historyStore.ts` | Deep snapshots of project + armature; undo / redo |
| `layout` | `stores/layoutStore.ts` | Panel visibility, floating chrome, last inspector tab per workspace |
| `theme` | `stores/themeStore.ts` | Color presets and CSS variables |
| `keymap` | `stores/keymapStore.ts` | Live chord matching + remaps persisted in `localStorage` (`docs/SYSTEMS.md`) |

**Shortcuts & Action Registry:** `App.vue` is the live dispatcher: it matches `keydown` against `keymapStore` and runs the same verbs as the palette. `ActionRegistry` / `setupDefaultActions.ts` still feed the command palette. `HotkeyModal.vue` lists current bindings; remaps are Preferences → Keyboard. Copy/paste and a few rig/timeline keys stay hardcoded.

## Commands and operators

Entry paths:

1. **`ActionRegistry` & `setupDefaultActions.ts`** — Centralized catalog of commands, tools, shortcuts, and handlers.
2. **`App.vue` key handler** — Matches `keymapStore.matchingActionIds`, then leftover copy/paste / timeline / rig keys.
3. **Window events** — `src/core/commands/editorCommands.ts` (`requestModalTool`, `requestCameraView`, primitive placement) consumed by `Viewport3D.vue`.
4. **Modal operators** — subclass `ModalOperator`, start via `operatorManager.start` from the viewport. Confirm writes through `onCommit`; Escape restores the `EditableMesh` snapshot. Undo is blocked while an operator is active.
5. **Command palette / menus** — query `actionRegistry.getAll()` or call `projectStore.perform*` directly.

Interactive topology (extrude / inset / bevel / loop cut / knife) belongs in a kernel + operator. Instant menu actions (merge, fill, dissolve, join) belong in `Operations.ts` + `projectStore.perform*`, and must call `recordState` **before** mutating. Gizmo attach, snap flags, Fill (F), and Blockbench `js/modeling` (what we copied vs skipped) are in `docs/MODELING_OPERATORS.md`. See `docs/SYSTEMS.md` for Action Registry, Texel Density, Transform Spaces, Seam Bleed, and Hardware Profiles.

## History

`historyStore.recordState(description)` snapshots meshes (JSON clone), selection, materials, palette, textures (`PixelBuffer.clone()`), and armature.

- Call `recordState` / `projectStore.recordState` **before** the mutation.
- Do not snapshot on every pointer-move of a modal tool; snapshot on commit (or before start if the operator mutates in place and cancel restores the kernel snapshot).
- Skip recording while `historyStore` is applying undo/redo.
- Stack is capped (currently 50). A new action clears redo.

## Rendering

- `meshToThreeGeometry()` in `src/core/geometry/Converters.ts` is the `MeshObject` → `BufferGeometry` path.
- Retro look lives in `src/core/shaders/PSXShader.ts` (jitter, affine UVs, Bayer). Material flags on `Material` drive it.
- Pixel textures use `PixelBuffer` + `CanvasTexture` with nearest filtering.

## Persistence

- `.psxproj` — `ProjectSerializer` + `ProjectStorage` (autosave).
- Export — `GltfExport.ts` (GLB via Three `GLTFExporter`), `ObjExport.ts`, `BlockbenchExport.ts`, `SpriteSheet.ts`, `TurntableRecorder.ts`.
- Import — `GltfImport.ts`, `ObjImport.ts`, `ImageImport.ts`.

## Extensibility (where to add things)

| Task | Where |
| :--- | :--- |
| New primitive | `PrimitiveType` + builder in `src/core/primitives/builders/`, register in `PrimitiveRegistry.ts` (popout lists the registry automatically) |
| One-shot mesh op | Pure function in `Operations.ts` (or kernel + bridge), wrap in `projectStore.perform*`, bind `App.vue` / palette / header |
| Interactive modal tool | Kernel under `src/core/mesh/operations/`, operator extending `ModalOperator`, `ModalToolCommand`, `Viewport3D.startModalOperator`, then `App.vue` key |
| Exporter | `src/core/export/`, hook `ExportModal.vue` |
| Importer | `src/core/import/`, hook the matching modal / menu |
| Inspector field | `src/components/inspector/` reading the owning store |
| New app mode panel | Component under the matching folder; gate with `toolStore.appMode` |

Right sidebar (`RightSidebar.vue`): List / context (Object, UV, or Anim) / Mod / Mat / Tex. UV workspace orders Tex before Mat and Mod. Rig uses Skel / Bone / Bind / Wts. The last tab is remembered per workspace (`layoutStore.setInspectorTab` / `restoreInspectorTab`) and restore lands on a tab visible in that workspace. Object vs vertex `selectMode` does not change the tab.

Left toolbar (`LeftToolbar.vue`) is a docked icon shelf: Object/Vertex/Edge/Face plus the workspace tools. T to toggle. Hover labels use `useFastTitleTips` (not OS `title` delay).

`HeaderMenu.vue` is the app chrome: File/Edit/Add, space+pivot, snap, live mirror X/Y/Z, workspace tabs, then view/overlays/shading/object shade/x-ray/command search. The floating LightWave cluster is pan / orbit / zoom / frame only.

## Alias

`@/` maps to `src/` (Vite + `tsconfig`).

## Modifiers

Generate stack (Mirror, Subdivision Surface, Solidify): `docs/MODIFIERS.md`.

## UV editor

Selection-scoped transforms and island picking: `docs/UV_EDITOR.md`.

## Textures

Images, materials, and the paint target are separate. The only verbs are `selectTexture`, `createTexture`, and `applyTextureToMesh` / `applyTextureToMaterial`. Full rules: `docs/TEXTURES.md`.

## Materials

Mesh shading, tint, and shader parameters point to a texture. The only verbs are `selectMaterial`, `createMaterial`, `applyMaterialToMesh`, and `forkMaterialForMesh`. Shared materials support explicit forking. Full rules: `docs/MATERIALS.md`.

## Palettes

Color swatch sets in the library are separate from pixel data. The verbs are `selectPalette`, `createPalette`, and `applyPaletteToTexture` (with dithering support). Full rules: `docs/PALETTES.md`.

## Animation & Armatures

Skeletal bone hierarchies and animation clips are library assets. The verbs are `selectClip`, `createClip`, and `evaluatePose` (with multi-clip standard GLTF/GLB game engine export). Full rules: `docs/ANIMATION.md`.

## Objects & Hierarchy

3D meshes in the scene hierarchy support parent-child transform inheritance. The verbs are `selectMesh`, `createMesh`, and `parentMesh` (with cyclic dependency prevention). Full rules: `docs/HIERARCHY.md`.




