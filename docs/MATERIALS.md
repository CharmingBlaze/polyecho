# Materials

Three objects, three verbs. Do not invent a fourth path.

```
Mesh.materialId  →  Material (Shading, PSX, Dither, Tint)  →  Material.textureId
                          ↑
               activeMaterialId = Inspector target
```

| Thing | What it is | What it is not |
| :--- | :--- | :--- |
| **Material** (`Material`) | How a mesh is shaded (PSX, Saturn, Dreamcast, PBR, tint color, dither, wireframe). Points at a texture via `textureId`. | Not the 3D mesh. Not the texture image itself. |
| **Texture** (`TextureMap`) | An image in the project library. Pixels live on `pixelBuffer`. | Not shading flags or console shader parameters. |
| **Inspector target** (`activeMaterialId`) | Which library material the Material Inspector is viewing and editing. | Not "the material on the selected object," unless explicitly assigned or synced on mesh selection. |

`projectStore.activeMaterial` is a computed helper for the currently inspected material.

## Fill

Each material has one surface fill. Shading (PBR, PS1, dither) still applies on top.

| Fill | What you see | Stored on |
| :--- | :--- | :--- |
| **Color** | Flat `color` | `fill: 'solid'` |
| **Gradient** | UV ramp. The Materials bar matches Illustrator: drag stops, drag the diamond midpoint, click the ramp to insert a stop, drag a stop down to delete it. Linear ramps also have a direction compass and an angle (0° is left to right). | `fill: 'gradient'` and `gradient` (`kind`, `angle`, `stops[].offset`, `stops[].midpoint`, `stops[].opacity`) |
| **Image** | Library texture, multiplied by `color` as a tint | `fill: 'image'` and `textureId` |

Older files omit `fill`: a bound `textureId` means Image, otherwise Color. Switching fill does not delete the other source, so Color → Image brings the previous texture back.

`setMaterialFill(id, fill)` is the mode switch (one undo step). Stop edits write `material.gradient` directly, same as tint and roughness. Viewport, glTF, OBJ, and sprite export all read `resolveMaterialSurface` in `src/core/materials/MaterialFill.ts`.

### Image tiling

Image fills have independent **Tile X** / **Tile Y** repeats (`material.tileX`, `material.tileY`). Missing legacy values resolve to `1 × 1`; accepted values are clamped to `0.01–64`. `setMaterialTextureTiling` is the undoable store verb. It updates material state and `geometryRevision` only—mesh UVs and image pixels remain unchanged.

Repeat transforms are material-local. Two materials may share one texture image while using different tiling. Standard and retro viewport shaders match; GLB preserves the transform and OBJ writes MTL texture scale metadata.

## Dither

The Dither tab is a live ordered-dither pass on the shaded pixel. It stays on top of PBR, flat, Gouraud, and unlit. Console shading (PS1, Saturn, Dreamcast, N64) keeps its own shader and uses the same pattern list.

Looks are grouped: Saturn mesh and 15-bit, Dreamcast 16-bit, Mega Drive, SNES, N64, GBA, PS1, plus print and display patterns. Strength, pixel size, color depth, screen / UV / world space, and RGB / luma / alpha are the fine controls. Turning a look on does not change the shading model.

---

## The three verbs

All of these live on `projectStore`. UI must call them instead of mutating `mesh.materialId` / `activeMaterialId` by hand (except local reactive input bindings).

### 1. `selectMaterial(id)`

Sets the inspector target (`activeMaterialId`). Does **not** change any mesh's material assignment. No undo step.

- **Use**: Material panel dropdown, Material picker clicks, library list navigation.

### 2. `createMaterial(name?, colorOrTextureId?, textureId?, options?)`

Adds a material to the library and selects it in the inspector. Does **not** bind to any mesh. New slots start untextured (`textureId: null`) unless you pass a texture id.

- `options.record` default `true` (one undo item).
- `options.select` default `true` (becomes the inspector target).
- `addMaterial(...)` is the same function (compatibility alias).

- **Use**: Material panel **+ New Material** button, preset duplication.

### 3. `applyMaterialToMesh(meshId, materialId)`

Binds the material onto that object (`mesh.materialId = materialId`).

- Also sets `activeMaterialId` to that material.
- Records an undo state (`Assign Material (Name) to MeshName`).
- Calls `markGeometryUpdated()` so Three.js rebuilds viewport shaders.

- **Use**: Material Inspector **Use** / "Apply to Sel".

`assignMaterialToActiveMesh(materialId)` is a convenience wrapper for the active mesh.

---

## Shared materials & forking

When multiple meshes share the same `materialId`:
- Editing material properties (e.g. switching PSX shading, jitter, or tint) affects **all** meshes on that material.
- To isolate changes to a single object, call `forkMaterialForMesh(meshId)` (or `makeActiveMeshMaterialUnique()`):
  - Clones the current material into a dedicated material (`Cube_1_Mat`).
  - Pushes it to `materials` array and binds it exclusively to that mesh.
  - Selects the new material in the inspector.

Related helper methods on `projectStore`:
- `isMaterialShared(matId)` — returns `true` if $>1$ mesh uses `matId`.
- `countMeshesUsingMaterial(matId)` — returns the exact mesh count.
- `deleteMaterial(matId)` — deletes material and falls back any assigned meshes to `default_material`.
- `duplicateMaterial(id)` — full-field clone into the library. Does **not** bind a mesh.
- `purgeUnusedMaterials()` — drops slots no mesh uses (undoable). Keeps at least one.
- `forkTextureForMesh(meshId)` — `PixelBuffer.clone()` of the bound map; forks the material if shared, then binds the copy to that object only.

---

## When the inspector auto-follows a mesh

| Situation | Syncs `activeMaterialId` from the mesh? |
| :--- | :--- |
| Select an object in Model / UV / Rig / Animate | **Yes** (inspects the selected object's material) |
| Click a material in the Material Inspector list | **No** (inspects chosen material without re-binding mesh) |
| Create a new material (`createMaterial`) | **No** (inspects new material without re-binding mesh) |
| Click "Assign to Active Object" | **Yes** (binds material to mesh and keeps it inspected) |

---

## Which UI does what

| UI | New | Select | Apply |
| :--- | :--- | :--- | :--- |
| **Material Inspector** | `createMaterial` | `selectMaterial` | **Use** / Apply to Sel. Slot + texture map, then Surface / Consoles / Dither. |
| **Object Inspector (Transform)** | — | — | Collapsed Shading links jump to Material / Texture tabs (no assignment dropdowns) |
| **UV / Paint props** | — | — | Unwrap, paint-target readout, and collapsed Material link |
| **Outliner / Hierarchy** | — | — | context menu "Assign Material" |

---

## Viewport / undo

- After changing material properties (color, shading, PSX flags): calls `markGeometryUpdated()` and `triggerAutosave()`.
- After assigning a material to a mesh: recorded in history stack for full `Ctrl+Z` / `Ctrl+Y` undo/redo.
- WebGL materials in `Viewport3D.vue` are rebuilt reactively from `projectStore.materials`.

---

## Do not

- Change `mesh.materialId` directly in component files. Use `applyMaterialToMesh()`.
- Mutate `activeMaterialId` to "apply" a material to an object.
- Automatically bind a newly created or duplicated material to the active mesh without user intent. Use **Apply to Active**.
- Invent ad-hoc material helper functions in Vue components. Extend the store verbs.
