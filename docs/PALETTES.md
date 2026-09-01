# Palettes

Three objects, three verbs. Do not invent a fourth path.

```
Texture Pixels  →  Active Palette Swatches  →  Palette Library (PICO-8, Game Boy, Custom)
                          ↑
                activePaletteId = Swatch target
```

| Thing | What it is | What it is not |
| :--- | :--- | :--- |
| **Palette** (`Palette`) | A named collection of hex colors in the library (e.g. `PSX Classic 16`, `PICO-8`, `Game Boy DMG`). | Not a texture image. Not shading properties. |
| **Active Swatch Target** (`activePaletteId`) | Which palette is currently active in the palette picker and used by drawing tools & color pickers. | Not the colors permanently baked into an image unless applied. |
| **Texture Pixels** (`PixelBuffer`) | The actual RGB/RGBA raster pixels on a texture map. | Not constrained to a palette unless remapped. |

`projectStore.activePalette` is a computed helper for the currently selected swatch palette.

---

## The three verbs

All of these live on `projectStore`. UI must call them instead of mutating `activePalette` / colors by hand.

### 1. `selectPalette(id)`

Sets the active swatch target (`activePaletteId`). Does **not** change any texture pixels or mesh colors. No undo step.

- **Use**: Swatch bar dropdown, Palette Library click, quick console preset switching.

### 2. `createPalette(name, colors, options?)`

Adds a palette to the project library and selects it. Does **not** alter any texture.

- `options.record` default `true` (one undo item).
- `options.select` default `true` (becomes the active swatch target).
- `options.category` default `'Custom'`.
- Automatically persists custom palettes to `localStorage`.

- **Use**: + New Palette dialog, Lospec `.hex` / `.gpl` file imports, `extractPaletteFromActiveTexture()`.

### 3. `applyPaletteToTexture(textureId, paletteId, ditherMode?)`

Quantizes and remaps all pixels of that texture to the target palette colors.

- Supports `ditherMode`:
  - `'nearest'`: Fast nearest-neighbor Euclidean distance color quantization.
  - `'floyd-steinberg'`: Classic 4-neighbor 2D error diffusion dithering.
  - `'atkinson'`: Macintosh classic 6-neighbor crisp error diffusion dithering.
- Records an undo state (`Apply Palette (Name) to TextureName`).
- Calls `markTextureUpdated()` so WebGL shaders and 2D canvases re-render.

- **Use**: 1-click "Remap Texture to Palette" button, Palette Library "Apply to Active Texture" action.

Related:
- `applyPaletteToAllTextures(paletteId, ditherMode?)` — bulk retro console conversion across every texture in the scene.
- `extractPaletteFromActiveTexture(name?, colorCount?)` — extracts dominant colors from the active texture and registers a new palette.
- `deletePalette(id)` — deletes custom palette from library.

---

## When the active palette auto-follows

| Situation | Syncs `activePaletteId`? |
| :--- | :--- |
| Click a swatch in the Palette Library modal | **Yes** (`selectPalette`) |
| Import a palette file (`.hex` / `.gpl`) | **Yes** (`createPalette` with `select: true`) |
| Select a texture or 3D object | **No** (active swatch palette remains stable for painting) |

---

## Which UI does what

| UI | New | Select | Apply |
| :--- | :--- | :--- | :--- |
| **PalettePicker (UV/Paint)** | `createPalette` | `selectPalette` | 1-Click "Remap Active Texture" |
| **PaletteLibraryModal** | `createPalette` / Import | `selectPalette` | "Apply to Active Texture" / "Apply to All" |
| **ImportTextureModal** | `extractPaletteFromActiveTexture` | `selectPalette` | optional on import |

---

## Do not

- Mutate `palette.colors` directly on built-in console presets. Clone to a custom palette first.
- Quantize a texture silently when the user only wanted to pick a brush color swatch.
- Invent ad-hoc palette conversion loops in Vue components. Use `projectStore.applyPaletteToTexture()`.
