# Knife and primitives

Knife keeps a live preview until confirmation. Strokes can start outside an object and cross several faces. Visible-only cutting is the default; cut-through also splits hidden surfaces of the active object.

| Control | Action |
| --- | --- |
| K | Start Knife |
| Click | Add a point |
| Shift | Snap to edge midpoints |
| Ctrl | Temporarily bypass vertex and edge snapping |
| A | Toggle angle snapping; type an angle to change its increment |
| X / Y / Z | Toggle a world-axis constraint |
| C | Toggle cut-through |
| E / right-click | End the current stroke |
| Ctrl+Z / Backspace | Undo a point or reopen the preceding stroke |
| Ctrl+Shift+Z | Redo |
| Enter | Apply all strokes |
| Esc | Cancel and restore the original mesh |

The floating panel provides the main actions without duplicating the full shortcut line. Newly created edges remain selected after applying cuts. Vertex and edge snaps stay snapped when the cut is applied, and Shift snaps to a midpoint only while it is held. Edge snapping accounts for perspective, surface picking handles concave polygons, and interior cut points interpolate UV coordinates. Invalid previews restore the source mesh instead of committing damaged geometry.

This is a polygon cutting workflow, not automatic quad retopology. A point inside a quad or n-gon splits it with one chord through the point, so a quad becomes two quads at any face size and any distance from the centre. Only a point inside a triangle fans into triangles. When the stroke runs from a click inside one face onto the next face, the chord aims at the spot where the stroke crosses the shared edge on screen, so both faces meet at one vertex there. A straight line that leaves through the edge next to where it entered cuts off a corner, and that corner is a triangle. Cuts that end inside a face can still leave n-gons. Cut-through operates on the active mesh, not every object in the scene.

## Loop Cut

Start with Ctrl+R and hover a quad or any even-sided face. The preview sits under the pointer. Scroll or type a count (1–64). Ctrl snaps that position to 10% steps. The first click or Enter locks the position; move to slide, then click or press Enter to apply. Type a slide value from -1 to 1, with 0 centred. Shift gives precision movement and Ctrl snaps the slide in increments. Right-click during sliding applies centred cuts; Esc cancels the entire operation. The panel also offers Apply centered.

Ring traversal preserves direction across opposite even n-gon edges (quads, hexes, …), so off-centre previews and committed cuts agree regardless of vertex numbering. Multiple cuts remain evenly spaced and cannot collapse onto one another at the slide limits. New loop edges stay selected. Tracing stops at triangles, odd n-gons, and non-manifold edges. Hovering a face with no ring does not create a fake loop.

## Primitives

The Add panel (`AddPrimitivePopout.vue`) is the only placement chrome. Draw / Place, Surface / World, settings, live size, Confirm, and Back live there. The viewport operator HUD does not open for primitives. Shortcut help stays in the status bar. Viewport ghost drawing is unchanged.

- Boxes and planes support genuine quad subdivisions. Box borders share vertices.
- Cylinders support height divisions and independent end caps.
- All 16 primitive presets are checked for valid topology and outward winding. Open plane and circle presets retain their intended open surface.
- Placement follows translated, rotated, and scaled mesh surfaces.
- CAD drawing accepts typed sizes and heights, Shift constrains a square footprint, and grid snapping applies to mouse-driven dimensions. Typed dimensions remain exact.
- Scroll adjusts detail; the ghost is a translucent mesh with a dashed bounding box (logical edges show on non-box shapes) and caches geometry while moving.

Cylinder caps and several other presets use n-gons. Use subdivision or triangulation where the target workflow requires only quads or triangles.

## Validation

Regression coverage includes cross-face strokes, visible-only and through cuts, concave cut area and UV interpolation, perspective edge snapping, surface transforms, all default primitive meshes, and welded box and plane grids. Live browser checks cover Knife previews and confirmation plus cylinder parameter editing and placement.
