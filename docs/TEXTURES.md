# Textures

Three objects, three verbs. Do not invent a fourth path.

```
Mesh.materialId  →  Material.textureId  →  TextureMap (pixels)
                       ↑
              activeTextureId = paint / UV target
```

| Thing | What it is | What it is not |
| :--- | :--- | :--- |
| **Texture** (`TextureMap`) | An image in the project library. Pixels live on `pixelBuffer` (`PixelBuffer` canvas). | Not a mesh. Not shading flags. |
| **Material** | How a mesh is shaded (PSX, dither, color). Points at a texture via `textureId`. | Not the image itself. |
| **Paint target** (`activeTextureId`) | Which library image the 2D editors and 3D paint brush write to. | Not “the texture on the selected object,” unless something applied or synced it. |

`projectStore.pixelBuffer` is an alias for the paint target’s buffer. Prefer `activeTexture.pixelBuffer`.

`TextureMap.layers` on the type is unused. Layers live on `PixelBuffer.layers`.

## The three verbs

All of these live on `projectStore`. UI must call them instead of writing `activeTextureId` / `material.textureId` by hand (except local display).

### 1. `selectTexture(id)`

Sets the paint target. Does **not** change any mesh or material. No undo step.

Use: gallery click, Texture panel dropdown, UV/Pixel **TEX** dropdown, 3D paint hitting a mesh (so you paint the image you clicked).

### 2. `createTexture(name, w, h, dataUrl?, buffer?, options?)`

Adds a library image and selects it as the paint target. Does **not** bind a mesh.

- `options.record` default `true` (one undo item)
- `options.select` default `true`

`addTexture(...)` is the same function (compat alias).

Use: Texture panel New, UV/Pixel New, import (with `record: false` if the caller already recorded a single import undo).

### 3. `applyTextureToMesh(meshId, textureId, policy)`

Puts the image on that object.

- `'this_object'` (default): if other meshes share the material, **fork** a new material (`Cube_1_Mat`) so only this object changes.
- `'shared_material'`: write `Material.textureId`; every mesh on that material updates.

Also sets the paint target to that texture. Clears material tint to white so the image is not stained.

`assignTextureToActiveMesh(id, policy?)` is a wrapper for the active mesh.

**Prompt:** if the material is shared, do not guess. Use `useTextureApply()` → `applyToActiveMesh(id)` and `TextureSharePrompt.vue` so the user picks This object vs All objects.

Related:

- `applyTextureToMaterial(matId, textureId | null)` — bind at the material (always shared). Material inspector.
- `applyTextureToAllMaterials(id)` — bulk.
- `unbindTextureFromMaterial(matId)` — `textureId = null`.
- `isMaterialShared(matId)` / `countMeshesUsingMaterial(matId)`.

## When the paint target auto-follows a mesh

| Situation | Syncs `activeTextureId` from the mesh? |
| :--- | :--- |
| Select an object in Model / Rig / Animate | **No** |
| Switch workspace to UV / Paint | **Yes** (`syncPaintTargetFromMesh`) |
| Change active object while already in UV / Paint | **Yes** |
| Paint / Texture inspector Library | Select only; use the explicit Apply action to bind |
| Paint / Texture inspector **New** or **Import** | Creates, then `applyTextureToMesh(..., 'this_object')` (forks if shared, no prompt) |
| Open Paint / Edit UV layout from Texture inspector | Retains the chosen library image after workspace entry |
| 3D pixel-paint a mesh | **Yes** (the image you hit) |
| Drop an image on a mesh in the viewport | Creates, then `applyTextureToMesh(..., 'this_object')` (forks if shared, no prompt) |

## Which UI does what

| UI | New | Dropdown / click | Apply |
| :--- | :--- | :--- | :--- |
| Texture panel | `createTexture`, then bind active object (`this_object`) | `selectTexture` (library list). **Replace** overwrites the current image’s pixels. **Delete** is `deleteTexture`. | **Use** on object → share prompt. Layers sit under Image (paint uses this instead of a floating canvas panel). |
| Material inspector | `createTexture` then `applyTextureToMaterial` | `applyTextureToMaterial` | n/a (already material-scoped) |
| Object inspector (Transform) | — | — | Shading links jump to Material / Texture tabs (no texture dropdown) |
| UV / Pixel **TEX** | `createTexture` then bind active object | `selectTexture` only (does not bind) | **Apply** binds the chosen image to the object |
| UV / Pixel **Import** | `createTexture` via modal, then bind active object | — | `this_object` (fork if shared) |
| Texture library click | — | UV/Paint: bind active object; Model: `selectTexture` | **Use on** + prompt |
| Import modal | `createTexture` only | — | caller may apply afterward |
| Viewport file drop | create + apply this object | — | silent fork if shared |

## Atlas workflow

A texture may carry `atlas: { cols, rows, spacing?, margin? }` (row 0 = top of the image). Spacing is the gutter between tiles; margin is the outer inset. That is metadata, not a fourth bind verb.

| Step | Where | Store / core |
| :--- | :--- | :--- |
| Mark a grid | Texture → Atlas (2×2, 4×4, custom) | `setTextureAtlasGrid` / `clearTextureAtlasGrid` |
| See cells | UV editor overlay (amber) | `TextureMap.atlas` |
| Put islands in a cell | UV Align & Snap, UV inspector Atlas, or Texture cell pad | `performMapUVsToAtlasCell` → `mapFacesToAtlasCell` |
| Pick a tile and stamp 3D faces | Floating tileset / tilemap panel (Stamp) | `stampFacesToRegion` (`TilesetStamp.ts`) via viewport click or selected faces |
| Paint inside one tile | Tileset panel Paint + Clip | `tilesetPaintClip` + `paintWithinSelection` (2D and 3D) |
| Extract tiles | Texture → Slice to library; Import modal “Atlas / Sprite Sheet” | `sliceTextureIntoTiles` / `createTexture` per tile |
| Merge maps | Texture → Bake scene atlas | `bakeSceneAtlas` (`AtlasBaker`) |

Math: `src/core/uv/AtlasCells.ts`. Do not remap UVs in Vue.

`deleteTexture` unbinds materials (`textureId = null`). It does not assign another library image.

## Viewport / undo

- **Starter texture:** File → Properties → 3D Viewport chooses the image new projects and **Restore starter texture** use (`tex_default`): retro atlas, white, black, grey, checker, or a custom color. Stored in `localStorage` (`polyecho_default_texture`).
- During a paint stroke: `markTexturePreview()` (bumps `textureRevision` so Three.js `CanvasTexture.needsUpdate` — no `toDataURL` / autosave).
- On pointer up (and one-shot edits): `markTextureUpdated(id)` (refreshes `dataUrl`, bumps `textureRevision`, autosave).
- After a bind: also `markGeometryUpdated()` so materials rebuild.
- History clones each `PixelBuffer` including its layer stack, not just `dataUrl`.
- Three.js `CanvasTexture`s are cached by texture id in `Viewport3D.vue`. Draw mutations write the active `PixelBuffer` layer, then `composite()`.
- **Seam Dilation (`PixelBuffer.dilateSeamPadding(margin)`):** Dilates painted non-transparent pixels 1px outward into adjacent transparent pixels to prevent UV edge rendering seams.
- **3D X-Symmetry:** `toolStore.viewport.symmetryX` mirrors 3D paint raycast hits across the X axis.

## Do not

- Set `activeTextureId` to “apply” a texture to an object.
- Call `assignTextureToActiveMesh` from Duplicate or library browse. New / Import bind with `this_object` (same as viewport drop).
- Add another create/select helper in a Vue file. Extend the store verbs.
- Auto-sync paint target from mesh selection in Model mode.

## Adding a new texture UI

1. New image → `createTexture`, then `applyTextureToMesh(..., 'this_object')` if an object is selected.
2. Browse / paint → `selectTexture`.
3. Show an existing library image on a mesh → `useTextureApply().applyToActiveMesh` or `applyTextureToMaterial`.
4. Update this table.
