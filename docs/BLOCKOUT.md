# Blockout workspace

Blockout is a dedicated `appMode` for low-poly volume sketching. It is not a second Modeling tab.

## Layout

Three vertical panes on the same WebGL canvas: **Front** (ortho) | **Side / Right** (ortho) | **Perspective**. Drag the vertical bars between them to resize. Double-click a bar to reset equal thirds. Modeling still uses single or 2×2 quad view.

Front and Side show **XY / ZY grids** (the floor grid is edge-on in those cameras). Persp keeps the ground grid. Toggle with Viewport Nav **Show Grid**.

## How to block out

1. Drop a tracing photo on Front or Side (inspector **Refs**), or skip refs and sketch freehand.
2. **F** or the amber outline button: Poly Draw. Click verts on the grid, close on the first point (or Enter), then drag to pull thickness.
3. **V** or the cyan vertex button: Poly Build. Click empty space to draw a new vert, or click an existing mesh vert (cyan) to reuse it. Click the first vert of the loop (green) or press Enter / F to fill a face. A fourth unique vert fills a quad. The last edge stays so you can keep stripping. Esc cancels; Done keeps new verts (even before a face) and selects them so you can gizmo them. Preview rubber-bands are dashed.
4. **Shift+A** for a box/cylinder when you need a stock volume.
5. **G / R / S** to place the block. Repeat for the next volume.

| Pane | Poly Draw plane |
| :--- | :--- |
| Front | XY (silhouette from the front) |
| Side | ZY (silhouette from the right) |
| Persp | Ground (Y=0). If the cursor hits an existing mesh, draw on that face. |

Until the first vertex is placed, moving into another column switches the plane. After the first click the plane stays locked so you can orbit in Persp while finishing the outline. With no verts yet, **1 / 3 / 7** force Front / Side / Ground.

Vertices snap to the viewport grid size (Ctrl = half step). RMB or Ctrl+Z pops the last point. Esc cancels.

The 3D gizmo is rebuilt per column (that pane’s camera and zoom) so a selected vertex keeps a handle on the vert in Front, Side, and Persp. Hover a pane, then drag. Selecting a reference photo does not hide the mesh gizmo (use **Alt-drag** for the photo). **Shift-drag** or **Alt-wheel** scales a ref. Lock a ref in the inspector to keep it still.

Poly Draw commits a new mesh (`Block_N`) through `MeshBridge`. Cancel restores the empty kernel snapshot (no undo step). Drop on Persp still applies a **mesh texture**, not a lightbox.

## Files

- `src/core/operators/PolyDrawOperator.ts`
- `src/core/mesh/operations/PolyDrawKernel.ts`
- `src/types/reference.ts`
- `src/components/inspector/ReferenceProps.vue`
