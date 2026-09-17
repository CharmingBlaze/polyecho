# Pointer input

Idle **right mouse button pans** (or scrolls the view) in every editor canvas. Do not leave RMB as “browser context menu” or as a silent no-op on a 2D/3D view.

## Default (no modal operator)

| Button | View |
| :--- | :--- |
| **LMB click** | Select / paint / place |
| **LMB drag** | 3D perspective: orbit the camera. Does not start if a tool already owns the click (gizmo, paint, box select, modal operator). |
| **RMB drag** | Pan the view (3D LightWave pan, UV/paint canvas pan, timeline scroll, graph editor pan) |
| **MMB** | 3D: Specials pie at cursor. 2D: also pan |
| **Space+LMB** / **Alt+LMB** | Pan (2D editors) |
| **Wheel** | Zoom |

Prevent the OS context menu on those canvases (`contextmenu` → `preventDefault`). Color swatches may still use RMB to set the **secondary** color (not a view).

Paint secondary stroke is **Ctrl+LMB** (or a swatch RMB), not canvas RMB.

## Modal operators (exception)

While `operatorManager` is active, RMB is Blender-style **back / cancel / undo last click** (grab cancel, knife restart, placement step back, Poly Draw undo point). Do not also pan. Document that in the operator status line.

The floating Move / Rotate / Scale (and Loop Cut) panel is **Stylus mode notifications**: File → Properties → Input. **Off by default.** Status stays in the status bar. Poly Draw / Shape Draw / Add Primitive keep their own panels.

## Adding a new view

1. LMB does the tool. In a 3D perspective pane, LMB drag orbits unless the tool owns the click.
2. RMB pans or scrolls that view and suppresses `contextmenu`.
3. Do not add a Windows-style right-click menu on a canvas.
4. Update the status-bar hint if the workspace is new.
