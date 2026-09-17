# Paint editor

Pixel Paint combines layer-based image editing with a small pixel-art toolset, using the existing PolyEcho theme. The live texture feeds both the 2D editor and 3D material preview.

## Workspace and images

The header uses a compact UV Layout / Paint Texture switch. The Menus button reveals the existing editing menus without reserving a permanent header row. The image target, object assignment, and active-tool settings remain visible; undo and redo sit beside the Paint tool settings. UV component selection uses labeled buttons, and its inspector separates Selection, Transform, and Tools.


The Texture inspector has Image, Library, and Advanced sections. Image shows the preview, usage, explicit Apply action, rename and export. Library adds and browses images without changing material bindings. Advanced contains collapsed atlas and scene-wide tools. Resize and removal controls stay collapsed until needed. Layer editing and color effects live in Paint rather than being duplicated in the inspector.

Choosing, creating, or importing an image in Paint does not apply it to an object. Use Apply image to assign it. Opening Paint from the inspector retains the chosen image. Resizing with Scale pixels uses nearest-neighbor sampling.

## Selections

- **M** activates rectangular marquee selection. Drag to select; drag inside the rectangle to move its active-layer pixels. Shift-drag creates a replacement selection.
- **Ctrl/Cmd+A** selects the whole texture. **Ctrl/Cmd+D** or **Escape** deselects.
- **Ctrl/Cmd+C / X / V** copy, cut, and paste. Paste creates a transparent layer with the copied pixels. This is an internal Paint clipboard, retained while the Paint editor is mounted; it does not read the operating-system clipboard.
- **Delete / Backspace** clears selected pixels on the active layer. Arrow keys move them one pixel; Shift moves ten. Moves clamp at the texture boundary.
- The selection bar provides Copy, Fill, Flip H, Flip V, and Deselect. The Edit menu includes undo/redo and the clipboard commands.
- In the 2D canvas, a selection constrains brush, eraser, fill, shading, shapes, and color adjustments. It is independent of UV face selection and does not constrain 3D painting. Rotation in Effects rotates the full layer and clears the selection.
- Moving pixels previews without changing the stored texture until release. Pointer cancellation discards the move. Selected transparent pixels replace destination pixels in the active layer.

## Layers

The Layers button opens a panel with thumbnails, visibility, names, opacity, blend modes, duplicate/delete, and Move up/Move down. Properties sit directly below the layer list. It docks in wider panes and floats in compact panes. Paint strokes are blocked on hidden active layers. New layers remain transparent; they never inherit the merged image.

Layer edits and pixel mutations use the existing history system. Project files and autosave records include individual layer PNGs and metadata alongside the flattened texture for compatibility. Files predating layer storage still open as single-layer textures. Project loading retains texture IDs so saved material bindings remain intact.

## Pixel tools

Round brushes, erasers, and circles use integer raster pixels without antialiasing. Shape previews use the same drawing implementation as the committed shape. Dither/shade paths interpolate pointer samples. The brush outline shows its footprint, and the palette sits above the canvas status bar.

## Tileset atlas workflow

Open **Tileset** from the Paint image bar, UV workflow bar, or **Tileset atlas · Browse & edit tiles** in the Texture inspector. Pick tiles and stamp/paint from that floating tilemap — not from a second control strip. Closing the panel does not end the stamp/paint session. The 2D Paint canvas always paints the full atlas; **Clip paint** only limits 3D object painting to the selected tile.

The popup stays on the chosen library image while open. Switch images from the list, or **Replace image** / drop a file on the atlas preview to overwrite that image’s pixels. The picker is the main surface: the whole atlas fills the panel with a tile grid. Tiles / Edit / Advanced tabs keep pixel editing and region tools off the palette. Size uses a segmented 8/16/32/64 control, W×H, Gap (space between tiles), Margin (outer inset), Detect gap, square lock, and Fit. It does not block modeling or Paint shortcuts outside the panel. Drag its header, minimize it, or resize its width. The full atlas supports wheel zoom, Alt/middle-button pan, Pan mode, Fit, and 1:1. Pixel tools expand below the atlas when needed.

Choose Tile, Square, or Rectangle selection. Drag a region directly on the atlas; arrow keys move it one pixel (Shift: eight). Region extraction, painting, and face mapping use those exact pixel bounds. **Apply region on selection** commits mapping when selection finishes; **Save each brush stroke to atlas** commits pencil/eraser strokes on release. Both options are off by default. Grid setup supports 8/16/32/64 px presets and explicit tile dimensions for up to 128 rows/columns. A leftover 2×2 on a large sheet is replaced with 16px cells. A stale draft cannot overwrite changes painted on its layer elsewhere.

1. Click a cell on the full atlas (16px grid by default). Grid changes do not resize image pixels.
2. Edit the active layer's tile with pencil, eraser, contiguous fill, or eyedropper. Brush size, pixel grid, a 3×3 repeat preview, local undo/redo, flips, square-tile rotation, fill/clear, and same-size tile copy/paste are available. Import accepts an image matching the tile dimensions.
3. **Save tile to atlas** commits one pixel-history step. Lower layers and neighboring tiles remain untouched. Switching tiles auto-saves a dirty draft. Grid changes still require a clean draft. Closing a dirty draft offers an explicit discard action.
4. Stamp selected faces from the panel, or click faces in the 3D view. The atlas is applied to that object if needed. Face mapping supports per-face fill or preserving the group's relative layout, 0/90/180/270° rotation, horizontal mirroring, and a pixel inset (default 0.5 px).
5. Create a separate flattened image from one tile or slice all saved tiles into the library. Extraction does not apply images or remove the atlas. Export PNG saves the edited layer tile, including unsaved draft pixels.

Draft copy/paste and undo history are local to the popup. Repeat preview shows the active-layer draft. Uneven atlas dimensions use integer cell boundaries so slicing retains edge pixels. Use evenly divisible image dimensions for uniformly sized tiles.

Implementation: `PixelEditor.vue`, `PaintLayers.vue`, and `src/core/painting/`. Regression tests cover selection bounds, overlapping moves, masks, empty layers, stack ordering, pixel edges, and layered project round-trips.
