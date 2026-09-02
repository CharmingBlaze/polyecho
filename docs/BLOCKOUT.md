# Blockout workspace

Blockout is a dedicated `appMode` for low-poly volume sketching. It is not a second Modeling tab.

## Layout

Three vertical panes on the same WebGL canvas: **Front** (ortho) | **Side / Right** (ortho) | **Perspective**. Drag the vertical bars between them to resize. Double-click a bar to reset equal thirds. Modeling still uses single or 2×2 quad view.

Front and Side show **XY / ZY grids** (the floor grid is edge-on in those cameras). Persp keeps the ground grid. Toggle with Viewport Nav **Show Grid**.

## How to block out

1. Drop a tracing photo on Front or Side (inspector **Refs**), or skip refs and sketch freehand.
2. **F** or the amber outline button: **Poly Draw** — a new volume from a silhouette. Click on Front/Side (or Persp ground/face) to drop verts. **Shift** locks 45° from the last point. Close by clicking the dashed first-vert ring, double-click, **C / F / Enter**, or **Close loop**. Thickness starts **toward the camera** whether you wound the outline clockwise or the other way; drag toward or away, **F / C** or **Flip** if you meant the other direction. **N** before the first vert flips the draw plane. RMB / Backspace undoes a point. Confirm keeps a new `Block_N` mesh.
3. **V** or the cyan vertex button: **Poly Build** — faces on the **active mesh**. Empty click = new vert, cyan snap = reuse. One or two selected verts seed the strip. Click the first vert (green) / **C / F / Enter** to fill; a fourth unique vert fills a quad and keeps the last edge so you can keep stripping. Click empty space on **either side** of that edge to grow a tri the other way. After a fill, **Tab / R / Reverse** walks around the last face onto the next boundary edge; clicking the other endpoint of the kept edge grows from that end. Esc cancels; **Done** keeps new verts (even before a face). Preview rubber-bands are dashed.
4. **Shift+A** for a box/cylinder when you need a stock volume.
5. **G / R / S** to place the block. Repeat for the next volume.

| Pane | Poly Draw plane |
| :--- | :--- |
| Front | XY (silhouette from the front) |
| Side | ZY (silhouette from the right) |
| Persp | **View plane** through the orbit pivot (draw in front of you). **N** toggles view / ground. **7** locks world ground. Hold **Alt** only if you want to draw on a mesh face. |

Clicks behind the camera and horizon-grazing ground hits are ignored. After the first vert the plane stays locked in world so you can **MMB-orbit** (wheel zooms) and keep drawing on the same plane. Thickness still starts toward the camera.

Poly Build in Persp: snap to verts in front of the camera (nearest depth wins). Empty click on a mesh face places on that surface so you can wrap a 3D form; empty space uses the view/ground work plane. After a fill the work plane becomes the last face.

Until the first vertex is placed, moving into another column switches the plane. After the first click the plane stays locked so you can orbit in Persp while finishing the outline. With no verts yet, **1 / 3 / 7** force Front / Side / Ground. **MMB** orbits in Persp while the tool is running (LMB still draws).

Vertices snap to the viewport grid size (Ctrl = half step). **Shift** constrains the next point to 45° steps on the plane. RMB or Ctrl+Z pops the last point. Esc cancels.

The 3D gizmo is rebuilt per column (that pane’s camera and zoom) so a selected vertex keeps a handle on the vert in Front, Side, and Persp. Hover a pane, then drag. **Right-drag** pans that pane (orbit pan in Persp). Selecting a reference photo does not hide the mesh gizmo (use **Alt-drag** for the photo). **Shift-drag** or **Alt-wheel** scales a ref. Lock a ref in the inspector to keep it still.

Poly Draw commits a new mesh (`Block_N`) through `MeshBridge`. Cancel restores the empty kernel snapshot (no undo step). Drop on Persp still applies a **mesh texture**, not a lightbox.

## Files

- `src/core/operators/PolyDrawOperator.ts`
- `src/core/mesh/operations/PolyDrawKernel.ts`
- `src/types/reference.ts`
- `src/components/inspector/ReferenceProps.vue`
