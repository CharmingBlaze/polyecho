# Shape Draw

Use the green Shape Draw button in Blockout to draw an outline, a path, or cross-sections. The existing Blockout panes and Poly Draw / Poly Build tools remain available.

Close an outline to preview its volume. Drag the outline points, change depth and roundness, or adjust detail. Done saves both the mesh and its editable drawing. Reopen with Edit outline & volume or by double-clicking the shape. Make Editable Mesh removes the drawing source and keeps the resulting mesh; this is undoable.

## Surface layout

- **Auto · quad flow** tries a structured quad grid across the front and back, joined with quad sides. It preserves outline corners and has no central triangle fan. If the outline cannot support a grid without folded cells, it falls back to a mixed surface.
- **Quad grid** requires that grid and reports an error if the outline is unsuitable. Split complex silhouettes into smaller shapes or use paths and cross-sections.
- **Even triangles** uses bounded interior refinement and triangle-quality improvement.

The displayed triangle count is the rendering cost; the quad count describes editable faces. Quads can be nonplanar and are triangulated for rendering. Detail adds rows across the grid.

This is generic shape construction for props, creatures, vehicles, and other forms. It does not infer anatomical joints or automatically retopologize an arbitrary finished character. Paths and cross-sections provide more direct control over longitudinal edge flow. Through-holes and complex outlines may use triangles; path and loft caps may also contain triangles. Separate shapes are not automatically fused into a branched mesh.

## Editing and persistence

Point insertion, removal, smoothing, simplification, symmetry, front/back balance, holes, and a side profile are available in the panel. A side profile must cover the outline's full height and describe one depth interval at each height.

Preview edits leave the saved mesh untouched until confirmation. Cancel discards the edit. The drawing source survives project save/load and undo/redo. Later component, UV, material, or skin-weight edits invalidate source reopening to avoid overwriting that work; object placement does not.
