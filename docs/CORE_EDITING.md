# Core mesh editing

## Selection

Click to replace the current selection; Shift-click toggles individual components. Alt-click selects an edge loop or linked faces/vertices. Ctrl+Alt-click selects an edge ring. Edge and vertex hit areas use pixels consistently in full and split views. Solid selection checks visibility; X-Ray allows picking and box-selecting hidden components.

Switching between vertex, edge, and face modes converts the current component selection. A face becomes its boundary edges; a complete edge boundary becomes its face. The status bar reports the selected component type. Locked objects cannot be picked or edited through the updated tools.

## Tools

- **Extrude (E):** region extrusion or individual faces (I). **M** switches to manifold: after the move, side walls that lie on neighboring faces are dissolved and coinciding verts are welded. Individual faces follow their own normals. A face-on view supports vertical dragging along the normal. Type a distance for precision. Zero-distance confirmation cancels instead of leaving overlapping geometry.
- **Bevel (Ctrl+B):** chamfers manifold edges. Scroll adjusts segments; P cycles the profile. Face selection bevels those faces' edges; two selected verts bevel the edge between them; a single vertex bevels its incident edges (Ctrl+Shift+B). Boundary (open) edges inset on their face. Width is limited near short edges. Invalid results restore the original mesh and show an explanation.
- **Rotate Edge (Ctrl+Shift+F):** flips the shared diagonal of two triangles.
- **Recalculate Outside (Ctrl+Shift+N):** reverses faces that point toward the mesh centroid.
- **Dissolve Faces (Ctrl+X in Face mode):** merges selected faces by dissolving internal edges.
- **Edge Slide (Shift+G) / Vertex Slide (Shift+V):** slide existing components along their rails. Offset Edge Loop (Ctrl+Shift+R) inserts a pair of loops using the same ring walk as Loop Cut.
- **Rip / Rip Fill / Split:** open a cut along selected edges without wire edges, or disconnect selected faces inside the same object.
- **Boolean:** Union / Difference / Intersect on two selected objects (active is kept).
- **Bisect, Spin, Shrink/Fatten, Shear, To Sphere:** modal deform / cut tools. Fill Holes, Tris to Quads, Make Planar, Limited Dissolve (angle in Tools), Solidify Faces, Symmetrize, Unsubdivide, and Decimate are one-shots on the Tools panel. Bridge Edge Loops takes segment count and twist from Tools. Origin can snap to selection or the 3D cursor.
- **Inset (I):** region or individual faces, outset (O), boundary handling (B), and depth (Ctrl-drag). Hole boundaries offset in the correct direction. Invalid collapsed results restore the source. Width is conservatively limited near short edges.
- **Subdivide (W):** whole objects or selected faces create finer surfaces. Edge-only selection adds shared points along the chosen edges, keeping neighboring face boundaries connected without adding center fans. New edge segments remain selected.
- **Merge (M):** center, first, last, or distance. First and last follow selection order. Distance welding uses connected proximity clusters; an empty component selection does not silently weld the whole object through the UI. Pinched polygon loops are split rather than stored with repeated vertices.

Enter and the confirmation button both finish the operation. Escape restores the source. After topology edits, the resulting components remain selected for the next operation; undo/redo restores the mesh and selection.

Partial bevels and edge splits can leave polygons with more than four sides on neighboring faces. These remain editable and are triangulated for rendering; they are not automatic all-quad retopology. Topology validation checks connectivity, finite positions, and collapsed faces; it does not prove absence of all geometric self-intersections.
