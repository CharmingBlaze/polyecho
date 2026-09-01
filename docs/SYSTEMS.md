# Core Systems & Architecture Guide

This document describes the core systems inspired by modern DCC suites (Blockbench, Blender) integrated into PolyEcho.

---

## 1. Unified Action Registry & Command System

### Overview
Instead of scattering keyboard listeners and hardcoding actions across multiple components, PolyEcho uses a centralized **Action Registry** (`src/core/commands/ActionRegistry.ts`).

### Key Files
- `src/core/commands/ActionRegistry.ts`: Defines `CommandAction`, scope grouping, category definitions, shortcut normalization, and execution methods.
- `src/core/commands/setupDefaultActions.ts`: Bootstraps and registers standard modeling, selection, transform, topology, shading, UV, and system actions.
- `src/stores/keymapStore.ts`: Tracks customized keybindings and persists user remappings in `localStorage`.
- `src/components/modals/CommandPaletteModal.vue`: Dynamically queries `actionRegistry.getAll()` to show all searchable tools and updated shortcut badges.

### How to Add a New Action
1. Register your command in `src/core/commands/setupDefaultActions.ts`:
   ```ts
   actionRegistry.register({
     id: 'my_custom_tool',
     label: 'My Custom Tool',
     category: 'Modeling',
     shortcut: 'Ctrl+Shift+M',
     icon: 'tool-icon',
     scope: 'viewport',
     handler: () => {
       // Perform action or invoke modal tool
     }
   })
   ```
2. Add a matching default row in `src/stores/keymapStore.ts` (`DEFAULT_KEYBINDINGS`) if it is rebindable.

---

## 2. Texel Density Normalizer & Sampler (px/unit)

### Overview
In retro low-poly art (PS1, DS, N64) and pixel-art 3D models, consistent texture pixel size across all geometry is vital. The Texel Density system measures and equalizes linear texel density ($D = \sqrt{\text{Pixel Area} / \text{World Area}}$).

### Key Functions
- `sampleFaceTexelDensity(mesh, faceIndex, textureSize)`: Samples the exact pixels-per-world-unit ratio of the active/selected face.
- `applyTargetTexelDensity(mesh, targetDensityPxPerUnit, textureSize, targetFaceIndices?)`: Uniformly scales UV islands around their centroids to match the target density.
- `equalizeTexelDensity(mesh)`: Balances UV island scaling across the entire mesh to eliminate disproportionate texture stretching.

### Usage in Stores & UI
- `projectStore.performApplyTexelDensity(density, faceIndices?)`
- `projectStore.performEqualizeTexelDensity()`
- Access via the **Texel** dropdown in the UV Editor header toolbar.

---

## 3. Transform Coordinate Spaces & Pivot Modes

### Overview
When manipulating meshes, vertices, edges, or bones in 3D, developers and artists need the transform gizmo to align with various coordinate spaces and pivot centers.

### Supported Coordinate Spaces (`toolStore.transformOrientation`)
1. **`global` (World Space)**: Aligned with fixed world XYZ axes.
2. **`local` (Object Space)**: Aligned with the active object's rotation matrix.
3. **`normal` (Surface Normal Space)**: Aligned with the average surface normal $\vec{N}$ of selected faces/vertices. $+Y$ points along the surface normal.
4. **`view` (Camera Plane Space)**: Aligned with the current active camera's viewing plane.
5. **`cursor` (3D Cursor Space)**: Oriented relative to the 3D Cursor.

### Supported Pivot Modes (`toolStore.pivotPoint`)
1. **`median` (Median Point)**: Centroid of all currently selected vertices/faces/meshes.
2. **`active` (Active Element)**: Positioned at the last selected vertex, edge, or face.
3. **`cursor` (3D Cursor)**: Positioned at the 3D Cursor coordinates (`toolStore.cursor3D`).

### Viewport Integration
- Gizmo pose is `updateTransformGizmo()` in `src/components/viewport/Viewport3D.vue` (not a function named `updateTransformProxy`). Attach rules and snap pitfalls: `docs/MODELING_OPERATORS.md`.
- Space and Pivot modes are toggleable via the floating header in the 3D viewport.
- `toolStore.snapping.vertex` / `.edge` feed `OperatorContext` and gizmo component drag. `snapping.grid` is the magnet toggle; **G** increment snap is Ctrl + `gridSize` only.

---

## 4. 3D Texture Painting Seam Padding & X-Symmetry

### Overview
Painting 3D surfaces in real-time can produce dark or transparent seam artifacts along UV island edges when sampled by the GPU with bilinear or mipmapped filtering. Additionally, character modeling benefits from simultaneous mirrored painting.

### 1-Pixel Seam Dilation (`dilateSeamPadding`)
- Located in `src/core/painting/PixelCanvas.ts` (`PixelBuffer.dilateSeamPadding(margin = 1)`).
- Expands non-transparent painted pixel colors 1px outward into adjacent transparent pixels, eliminating seam artifacts.

### 3D Viewport X-Symmetry
- Controlled by `toolStore.viewport.symmetryX`.
- When enabled in `Viewport3D.vue` `paintRaycastHit()`, strokes on $+X$ coordinates are simultaneously reflected and applied to $-X$ geometry.

---

## 5. Target Engine & Retro Hardware Profiles

### Overview
Different target game engines and retro consoles enforce strict technical constraints. PolyEcho includes profile validation to warn artists before exporting models.

### Defined Profiles (`src/core/profiles/ModelProfiles.ts`)
| Profile | Target | Constraints & Budgets |
| :--- | :--- | :--- |
| **PSX / Retro 3D** | PS1 / Retro software renderers | 1500 verts, 1200 faces, 256x256 max texture, rigid joint hierarchy |
| **Godot 4 Low-Poly** | Godot 4 GLTF/GLB importer | 15000 verts, 10000 faces, 1024x1024 texture, 4-influence smooth skinning |
| **Unity Humanoid** | Unity Mecanim Humanoid | 20000 verts, 15000 faces, 2048x2048 texture, 4-influence skinning |
| **Blockbench / Box Style** | Minecraft / Box modeling | 4000 verts, 3000 faces, 256x256 texture, 16px texel density |

### Validation Engine
- `validateMeshAgainstProfile(mesh, profile, textureSize)`: Inspects vertex count, face count, texture resolution, and N-gons.
- `src/components/layout/StatusBar.vue`: Displays active profile selector and budget warning badges with detailed hover tooltips.
