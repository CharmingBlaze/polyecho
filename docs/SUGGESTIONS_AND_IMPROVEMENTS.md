# PolyEcho — Suggestions & Improvements

An audit-driven analysis of the codebase as of v1.1.0. Covers architecture, performance, testing, UX, feature gaps, technical debt, and developer experience. Each item is specific, actionable, and grounded in actual code read during the review.

---

## Table of Contents

1. [Architecture & Code Health](#1-architecture--code-health)
2. [Performance](#2-performance)
3. [Testing Coverage & Quality](#3-testing-coverage--quality)
4. [Feature Gaps & Missing Functionality](#4-feature-gaps--missing-functionality)
5. [UX & Polish](#5-ux--polish)
6. [Developer Experience & Tooling](#6-developer-experience--tooling)
7. [Potential Bugs & Edge Cases](#7-potential-bugs--edge-cases)
8. [Technical Debt](#8-technical-debt)
9. [Security & Production Hardening](#9-security--production-hardening)

---

## 1. Architecture & Code Health

### 1.1 projectStore Is a God Object (~2676 lines)

**Problem:** `stores/projectStore.ts` mixes mesh operations, material management, texture operations, UV unwrapping, file I/O orchestration, selection logic, modifier handling, and autosave. It imports from 30+ modules and exposes ~120 public methods.

**Suggestion:** Split into domain-focused stores/services:
- `meshStore.ts` — mesh CRUD, selection, topology ops, modifiers
- `materialStore.ts` — materials, textures, palettes, paint targets
- `projectStore.ts` — orchestration, history delegation, file I/O only

**Impact:** Testability, maintainability, reduced merge conflicts.

### 1.2 Viewport3D.vue Is Untestable (~700+ lines of imperative Three.js)

**Problem:** `components/viewport/Viewport3D.vue` is a monolithic script block with raw Three.js object pools (`_boneStart`, `_boneEnd`, `_hoverA`, etc.), raycaster logic, operator orchestration, bone rendering, paint-on-3D, and blockout layout. Almost nothing is extracted into testable services.

**Suggestion:** Extract into focused services:
- `ViewportRenderer` — Three.js scene management, buffer rebuild, resize
- `ViewportPicker` — raycaster, hover, component picking
- `ViewportPainter` — 3D paint surface hit-test and stamp
- `ViewportBoneRenderer` — bone display, onion skin
- Keep the Vue file as a thin orchestrator connecting these services to lifecycle hooks.

### 1.3 Dual Kernel ↔ Document Model Has Incomplete Migration

**Problem:** The `MeshObject` (string IDs, JSON-friendly) ↔ `EditableMesh` (half-edge, numeric IDs) bridge is still in progress (`docs/KERNEL_UNIFICATION.md`). Some operations go through the kernel (`ExtrudeKernel`, `InsetKernel`, `MergeKernel`, `DissolveKernel`) while others still operate directly on `MeshObject` in `Operations.ts`.

**Suggestion:** Prioritize migrating remaining `Operations.ts` functions (`pokeFaces`, `triangulateFaces`, `bridgeEdgeLoops`, `gridFill`, `flattenVerticesOnAxis`) to kernel implementations. Then consider eliminating `MeshBridge` entirely by making `EditableMesh` the single source of truth with JSON serialization support.

### 1.4 Weak Module Boundary: Store Accesses Other Stores Directly

**Pattern seen across multiple stores:**
- `projectStore` calls `useHistoryStore()` and `useAnimationStore()`
- `animationStore` calls `useProjectStore()` and `useToolStore()`
- `keymapStore` has a circular-esque dependency chain

**Suggestion:** Use a dependency injection pattern or an event bus (`EDITOR_EVENTS`) for cross-store communication. Currently the `editorCommands.ts` and `EDITOR_EVENTS` system already provides some of this — expand it so stores emit events rather than calling each other's methods directly. This decouples stores for easier testing and refactoring.

### 1.5 No Formal State Machine for App Mode Transitions

**Problem:** `toolStore.setAppMode()` manually handles `lastMeshSelectMode`, model tool restoration, select mode transitions, and UV/Paint entry/exit. This logic is fragile and grows with each new mode.

**Suggestion:** Implement a lightweight state machine (or use `xstate` if needed) that defines valid transitions, entry/exit guards, and automatic side-effects. Each workspace (model/blockout/uvpaint/rig/animate) would be a state with defined allowed tools and select modes.

### 1.6 Animation Store Has Dual Identity

**Problem:** `stores/animationStore.ts` (~2264 lines) handles both pose/animation data AND rendering state (onion skin, motion trail, bone display) AND weight painting tools. This is an even bigger god object than projectStore on a per-line basis.

**Suggestion:** Split into:
- `animationStore.ts` — clips, tracks, keyframes, playback state
- `armatureStore.ts` — bones, IK, constraints, skin bindings
- `weightPaintStore.ts` — weight paint tool settings, brush state
- Keep rendering flags in `toolStore.viewport` where they already partially live

### 1.7 Operator Manager Singleton Creates Testability Issues

**Problem:** `OperatorManager` is a global singleton (`operatorManager = OperatorManager.getInstance()`) with mutable internal state. Tests that involve modal operators must reset this global state.

**Suggestion:** Either:
- Make it injectable via Vue's `provide/inject`
- Or add a `reset()` method called in `beforeEach` test hooks
- Or integrate with Pinia so the operator state lives in a store

---

## 2. Performance

### 2.1 Full Mesh Serialization on Every Undo Snapshot

**Problem:** `historyStore.captureSnapshot()` calls `JSON.parse(JSON.stringify(projectStore.meshes))` for every undo record. For a mesh with 100K vertices, this allocates ~50MB+ per snapshot. Capped at 50 entries = potentially 2.5GB of dead allocations.

**Suggestion:** Use a structural sharing approach:
- Store mesh diffs (only changed vertex positions, added/removed faces) instead of full copies
- Or use `BufferGeometry` attribute-level snapshots
- Or at minimum use a pool/recycling mechanism for snapshot memory

### 2.2 Texture PixelBuffer Clones on Every Paint Undo

**Problem:** Similar issue: `historyStore.captureSnapshot()` calls `t.pixelBuffer.clone()` for each texture on every undo record. A 512×512 texture = ~1MB per clone.

**Suggestion:** Use copy-on-write for PixelBuffers during undo capture. Only clone when the buffer is about to be mutated. Most undo records don't involve texture changes — the `includeTextures` option already exists, but it defaults to `true` only in `recordPixels`.

### 2.3 Full Geometry Rebuild on Minor Edits

**Problem:** `projectStore.markGeometryUpdated()` triggers `geometryRevision++`, which causes `Viewport3D` to rebuild all Three.js `BufferGeometry` objects from scratch, even for single-vertex moves or UV edits.

**Suggestion:** Use granular revision counters:
- `positionRevision` — only vertex positions changed
- `topologyRevision` — faces/edges added/removed
- `uvRevision` — UV coordinates changed
- `attributeRevision` — vertex colors/weights changed
### 2.4 Scene-Wide Rebuild on Single Mesh Change

**Problem:** `editorCommands.ts` `EDITOR_EVENTS.GEOMETRY_CHANGED` handlers typically rebuild all meshes in the scene, not just the changed one.

**Suggestion:** Pass a `changedMeshId` in the event payload and have the viewport only rebuild that specific mesh's Three.js objects.

### 2.5 Vertex Marker Geometry Replaced Instead of Updated

**Problem:** In `VertexMarkers.ts`, `replaceVertexMarkerGeometry` creates new `BufferGeometry` objects instead of updating position attributes in place.

**Suggestion:** Pre-allocate a fixed-size `BufferGeometry` with `DYNAMIC_DRAW` usage and only update the `position` attribute when the vertex set changes. Mark unused vertices as hidden via a size attribute or draw range.

### 2.6 Full Mesh Serialization in Project File

**Problem:** `ProjectSerializer.serialize()` creates deep copies of all meshes via `JSON.parse(JSON.stringify(meshes))` and includes the entire texture `dataUrl` (base64 PNG). Large projects will produce enormous JSON files.

**Suggestion:** Use a binary project format or:
- Stream out to `ArrayBuffer` via a structured serializer
- Store texture data as compressed PNG blobs (already done) but optionally use webp or lossless compression
- Consider zipping the output (`.psxproj` could become a `.zip` with JSON + binary texture assets)

### 2.7 Shader Compilation on Every Material Change

**Problem:** The PSX shader (`createPSXMaterial`) creates a new `THREE.ShaderMaterial` instance on every material change, forcing WebGL shader recompilation.

**Suggestion:** Use a material cache keyed on shader variant (console mode, dither pattern, color depth). Only rebuild the shader when the variant actually changes; update uniforms in place for parameter changes like color, opacity, resolution.

### 2.8 No Texture Atlas Batching for Small Meshes

**Problem:** Many small meshes can each reference a separate texture, resulting in many draw calls. The bake scene atlas feature exists but is not used automatically.

**Suggestion:** Add an automatic "merge small textures into atlas" optimization that runs on export, grouping materials with similar settings onto shared texture atlases.

---

## 3. Testing Coverage & Quality

### 3.1 Critical Components Have Zero Tests

The following modules lack dedicated test files (found via directory scan):

| Module | Risk |
|---|---|
| `Viewport3D.vue` | Core 3D viewport — no rendering tests |
| `HeaderMenu.vue` | All file I/O, import, shortcuts — no integration tests |
| `RightSidebar.vue` | Inspector tab rendering — no tests |
| `LeftToolbar.vue` | Tool selection UX — no tests |
| `OutlinerTree.vue` | Outliner with drag/drop parenting — no tests |
| `BlenderPieMenu.vue` | Interactive menu — no tests |
| `Timeline.vue` | Animation timeline — no tests |
| `PolyDrawPanel.vue` / `ShapeDrawPanel.vue` | Blockout panels — no tests |
| `EditorEnvironment.ts` | Lighting, shadows — no tests |
| `ViewportLayers.ts` | Render layer architecture — no tests |
| `PSXShader.ts` | Shader code — no tests |
| `PrimitivePlacementOperator.ts` | Interactive placement — no tests |
| `BevelOperator.ts` | Modal bevel — no tests |
| `LoopCutOperator.ts` | Modal loop cut — no tests |
| Most `.vue` component files | UI rendering — no component tests |

**Suggestion:** Prioritize integration tests for the most business-critical paths:
- Viewport3D mesh rendering lifecycle (mount → add mesh → update → unmount)
- Import/export round-trips with real file assertions
- Keyboard shortcut execution through keymapStore → actionRegistry

### 3.2 Test Setup Lacks Three.js mocks

**Problem:** `src/test/setup.ts` only stubs Canvas2D. Tests that import Three.js will attempt to create real WebGL contexts or fail.

**Suggestion:** Use `@vitest/web-worker` or a lightweight Three.js mock/stub. At minimum, mock `THREE.WebGLRenderer`, `THREE.BufferGeometry`, and `THREE.Material` for unit tests. Consider using `vitest-canvas-mock` or a custom `setup.ts` that mocks `HTMLCanvasElement.getContext('webgl')`.

### 3.3 No Performance / Benchmark Tests

**Problem:** There are no tests that verify mesh operations perform within acceptable bounds on large meshes.

**Suggestion:** Add `@vitest/bench` tests for:
- Extrude 1000 faces on a 10K-vertex mesh
- Undo/redo serialization for a 100K-vertex document
- UV unwrap on a dense mesh
- GLTF export for a multi-material, multi-clip animated mesh

### 3.4 No Snapshot / Visual Regression Tests

**Problem:** Changes to the complex shader (`PSXShader.ts`) or Three.js conversion code (`Converters.ts`) have no visual regression safety net.

**Suggestion:** Set up `puppeteer` or `playwright` to capture rendered frames from the dev server and compare against baseline screenshots. Tag with the git commit hash for CI.

### 3.5 Edge Case Testing Missing

**Specific gaps noticed during code review:**

- `isDescendantOf` in projectStore: what happens when `childId === potentialAncestorId`? Should return `false` but the function checks `cur.parentId === childId` which would catch it — but better to guard at the top.
- `DissolveKernel.dissolveEdge`: assumes 2-face edges only; what about boundary edges with `faceIds.length === 1`? Returns `false` which is safe but untested.
- `KnifeKernel.resolvePointsToVertices`: what happens when `byEdge` contains the same edge in multiple cuts? The `tKey` string may collide.
## 4. Feature Gaps & Missing Functionality

### 4.1 No GLTF Import of Skeletal Animation

**Problem:** `GltfImport.ts` exists but the README and docs describe GLB *export* as the primary pipeline. The import code appears to handle static meshes and materials; full skeletal animation import (reading `animations` array, reconstructing clips/tracks) is not validated.

**Suggestion:** Add end-to-end test: export a multi-clip animated character → re-import → verify clips, keyframes, bone hierarchy match.

### 4.2 No Multi-Object Selection Transforms

**Problem:** When multiple meshes are selected (`selectedMeshIds`), transform tools (G/R/S) only operate on the active mesh (`activeMeshId`). The `selectedMeshIds` array supports multi-select, but `Viewport3D` never iterates over it for gizmo transforms.

**Suggestion:** Implement multi-object transforms: when `selectedMeshIds.length > 1`, move/rotate/scale all selected objects relative to their combined median pivot point.

### 4.3 No Layer Groups or Collections

**Problem:** The outliner supports parent-child hierarchy but no layer/collection grouping (Blender's collection system). All meshes appear flat under their parent.

**Suggestion:** Add a `collectionId` field to `MeshObject` and a simple collection data structure. The outliner can group by collection, toggle visibility/lock on entire collections.

### 4.4 No Localization / i18n

**Problem:** All UI strings are hardcoded in English.

**Suggestion:** Add `vue-i18n` or a simple `t()` function. Start with `docs/I18N.md` that defines the key structure. Given the niche audience (indie game devs), this may be low priority, but it would broaden adoption.

### 4.5 No Multi-Window / Undocked Panels

**Problem:** The left toolbar can float, but the right sidebar and inspector cannot be undocked to a separate monitor.

**Suggestion:** Use Electron's `BrowserWindow` API to spawn undocked inspector/timeline/outliner windows. This is desktop-specific but would significantly improve the ergonomics for multi-monitor users.

### 4.6 No Material Preview Swatch

**Problem:** The `MaterialProps.vue` inspector shows text-based material parameters but no visual swatch or preview of the material on a sphere or cube.

**Suggestion:** Add a small Three.js-rendered preview (a sphere or cube with the material applied) in the material inspector panel.

### 4.7 No Auto-Save on Timer

**Problem:** `projectStore.triggerAutosave()` exists but there's no automatic periodic autosave timer. Users must manually save or rely on recovery sessions.

**Suggestion:** Implement an interval-based autosave (every 5 minutes of non-idle time) that writes to a `.psxproj.autosave` file. Trigger recovery detection on launch.

---

## 5. UX & Polish

### 5.1 No Undo History Panel

**Problem:** Users cannot see the list of recent undo steps. The status bar shows only the most recent description.

**Suggestion:** Add a collapsible "History" panel in the inspector or a dedicated modal that lists recent undo entries with timestamps and types (mesh edit, paint, transform, etc.).

### 5.2 Font Sizing / UI Scale Has Blind Spots

**Problem:** The `themeStore.setScale()` changes CSS font-size on `:root` but many components use hardcoded pixel values (`text-[10px]`, `text-[9px]`, `w-5 h-5`) that don't scale proportionally.

**Suggestion:** Audit all template classes that use arbitrary pixel values and replace with `rem` or `em` units that respect the root font-size. Test at 75%, 100%, 125%, and 150% scale.

### 5.3 UV Editor Lacks Ruler / Guides

**Problem:** The UV editor (`UVEditor.vue`) has no measurement rulers, grid size indicators, or alignment guides.

**Suggestion:** Add pixel- or texel-accurate rulers along the top and left edges of the UV viewport, and snap-to-grid guides when moving UV islands.

### 5.4 Weight Painting Has No Visual Falloff

**Problem:** The weight brush radius is shown as a number but has no 3D viewport circle cursor indicating the brush area on the mesh surface.

**Suggestion:** Render a projected circle decal on the mesh surface under the cursor during weight painting, showing brush size and strength. This is already partially done via raycasting in `animationStore` — just needs a visual indicator.

### 5.5 Bone Names Not Editable In-Place

**Problem:** The bone skeleton panel shows bone names as static text. Users must open a separate rename action to change a bone name.

**Suggestion:** Make bone names inline-editable (click to edit, Enter to confirm, Esc to cancel) like Blender's outliner.

### 5.6 No Search in Outliner

**Problem:** The outliner tree (`OutlinerTree.vue`) has no search/filter field. In complex scenes with dozens of objects, finding a specific mesh is tedious.

### 5.7 No Modifier Stack Reordering

**Problem:** The `ModifiersProps.vue` panel allows toggling modifiers on/off and editing parameters, but the modifier stack order (Mirror → Subdivision → Solidify) is fixed and cannot be reordered.

**Suggestion:** Add drag-to-reorder in the modifiers panel, and evaluate modifiers in stack order during conversion.

### 5.8 Gizmo Interaction During Paint Mode

**Problem:** When switching to UV/Paint workspace and then selecting an object, the 3D viewport still shows the transform gizmo, which can interfere with painting.

**Suggestion:** Hide the gizmo automatically when `appMode === 'uvpaint'` and the active tool is a paint tool (not the select tool).

---

## 6. Developer Experience & Tooling

### 6.1 No ESLint Configuration

**Problem:** The project uses `vue-tsc` for type checking but has no ESLint configuration. There's no consistent code style enforcement beyond what TypeScript catches.

**Suggestion:** Add `eslint` with `@typescript-eslint`, `eslint-plugin-vue`, and `eslint-plugin-import`. Configure rules for import ordering, naming conventions, and prefer `const`.

### 6.2 No Pre-commit Hooks

**Problem:** There's no `.husky` or `lint-staged` configuration. Developers can commit code that fails typecheck or tests.

**Suggestion:** Add `husky` + `lint-staged` to run `vue-tsc --noEmit` and `vitest related` on staged files.

### 6.3 No Storybook / Component Playground

**Problem:** The many UI components (`UiButton`, `UiSection`, `UiTabs`, etc.) have no isolated rendering environment for visual development.

### 6.4 No API Documentation Generator

**Problem:** The TypeScript types are well-structured but there's no generated API documentation. New contributors must manually read source files.

**Suggestion:** Add `typedoc` to generate HTML documentation from JSDoc comments. Start by documenting the `types/` interfaces and `stores/` public API surfaces.

---

## 7. Potential Bugs & Edge Cases

### 7.1 Cyclic Parent Detection Missing Guard

**Problem:** `isDescendantOf` in projectStore doesn't guard the case where `childId === potentialAncestorId`. Add early return: `if (childId === potentialAncestorId) return false`.

### 7.2 Selection After Mesh Deletion

**Problem:** `deleteMesh` removes a mesh from `meshes`, but if it was the `activeMesh`, the store doesn't explicitly select another mesh. The `activeMesh` computed falls back to `meshes.value[0]`, which could be `undefined` if all meshes are deleted.

**Suggestion:** After deleting the active mesh, explicitly select the next available mesh. After deleting the last mesh, create a default cube or show an empty state.

### 7.3 Texture PixelBuffer Desync

**Problem:** `ensureTextureBuffer` creates a new `PixelBuffer` from `dataUrl` if one doesn't exist. But if `dataUrl` is stale (doesn't match pixel buffer state after edits), the recovery creates a buffer from an outdated image.

**Suggestion:** Add a `pixelRevision` counter alongside `textureRevision`. The `dataUrl` should only be considered authoritative when `pixelRevision === 0` (never edited).

### 7.4 Orphaned Seam Edge References

**Problem:** If a face with a seam edge is deleted, the `seamEdgeIds` array still references the deleted edge's ID, which no longer exists in any face's topology.

**Suggestion:** On face deletion, also clean up the `seamEdgeIds` array: remove any edge IDs whose vertices are no longer part of any face.

### 7.5 GLTF Bone Scaling Issue

**Problem:** `GltfExport.ts` computes bone positions as `head.x - parent.head.x` offsets. If a bone has non-uniform scaling, this local offset doesn't account for the parent's scale transform.

### 7.6 Concurrent Autosave and Manual Save Race

**Problem:** `triggerAutosave` may write a recovery file while the user is manually saving via `Ctrl+S`. Both serialize the same state simultaneously.

**Suggestion:** Use a save queue/mutex pattern. Drop redundant autosave requests if a manual save was just completed.

### 7.7 MeshRepository Memory Leak

**Problem:** `MeshRepository` retains kernels via `entries` Map. If a mesh is deleted without calling `retain()` with remaining IDs, the old kernel stays in memory.

**Suggestion:** Add a `watch` on `projectStore.meshes` that calls `meshRepository.retain()` with the current mesh IDs automatically.

---

## 8. Technical Debt

### 8.1 Old Naming Artifacts

**Problem:** `PsxProjectFile.appName = 'PSXModeller'` (kept for format compatibility), `DefaultTextures.ts` generates images named `PSX_LowPoly_Model`, and many variable names reference `psx` where features are now cross-console.

**Suggestion:** Document these as intentional in `docs/ARCHITECTURE.md` (already done). When the format next changes, `migrateRaw` can update the appName to `PolyEcho`.

### 8.2 Magic Numbers Everywhere

**Problem:** The codebase uses many bare numeric literals with no named constants:

| File | Magic Number | Meaning |
|---|---|---|
| `Viewport3D.vue` | `0.08`, `1e32`, `1e-20`, `1e-10` | Various epsilon values |
| `MeshValidator.ts` | `1e-8` | Snap tolerance |
| `EditorEnvironment.ts` | `0.35`, `0.85`, `0.95` | Light intensities |
| `PSXShader.ts` | `0.30`, `0.75`, `0.299`, `0.587`, `0.114` | Lighting/dithering |
| `Converters.ts` | `0.0005`, `0.02` | Shadow bias |

**Suggestion:** Extract thresholds into `GeometryTolerance.ts` or a new `Constants.ts`.

### 8.3 Obsolete / Dead Code

**Identified during review:**
- `types/mesh.ts`: `PrimitiveTransform` — appears unused
- `stores/keymapStore.ts`: duplicate key parsing logic also exists in `ActionRegistry`
- `.tmp_bb/` directory: experimental WIP scripts not integrated

**Suggestion:** Remove `.tmp_bb/` from version control. Deduplicate key parsing into a shared utility.

### 8.4 Console.log / Debug Statements

**Problem:** Several files contain `console.log` statements from development.

**Suggestion:** Audit and remove or gate behind `import.meta.env.DEV`.

### 8.5 Hardcoded Tailwind Color Values

**Problem:** Template code uses `bg-dcc-900`, `text-slate-200` alongside theme tokens. Theme changes won't affect these.

**Suggestion:** Migrate to CSS custom properties (`bg-ui-panel`, `text-ui-textPrimary`).

### 8.6 No Bundlesize Analysis

**Problem:** The three.js vendor chunk and main app bundle sizes are not tracked.

**Suggestion:** Add `vite-plugin-visualizer` to the build config. Track bundle sizes in CI.

---

## 9. Security & Production Hardening

### 9.1 CSP Needs Validation

**Problem:** `index.html` has no CSP meta tag fallback for the web version.

**Suggestion:** Add CSP to `index.html`:
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-eval'; connect-src 'self'">
```

### 9.2 Electron Security Settings

**Problem:** `nodeIntegration`, `contextIsolation`, and `sandbox` are not visible in reviewed code.

**Suggestion:** Verify `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`.

### 9.3 File Write Path Traversal

**Problem:** `crash.log` writes to `%APPDATA%/polyecho/crash.log` without path validation.

**Suggestion:** Use `electron.app.getPath('userData')`. Validate all desktop write paths.

### 9.4 Base64 Image Data in JSON Files

**Problem:** `PsxProjectFile` stores textures as base64 dataUrl strings (large files).

**Suggestion:** On desktop, extract images to separate PNG files alongside the JSON manifest.

---

## Summary of Top Priority Actions

| Priority | Area | Action |
|---|---|---|
| 🔴 **Critical** | Architecture | Split `projectStore` into domain stores |
| 🔴 **Critical** | Testing | Add tests for Viewport3D, animation, modal operators |
| 🔴 **Critical** | Performance | Implement granular revision counters for geometry |
| 🟠 **High** | Code Quality | Address magic numbers, dead code, logging |
| 🟠 **High** | Feature Gap | Implement multi-object transforms |
| 🟠 **High** | DX | Add ESLint + pre-commit hooks |
| 🟡 **Medium** | Testing | Add benchmark tests for mesh operations |
| 🟡 **Medium** | UX | Add undo history panel and outliner search |
| 🟡 **Medium** | Architecture | Complete kernel unification migration |
| 🟢 **Low** | Polish | Rename PSX artifacts, add i18n |
| 🟢 **Low** | Tooling | Add Storybook for UI components |
| 🟢 **Low** | Security | Verify Electron sandbox settings |

---

*Generated from code review — Sep 2026*