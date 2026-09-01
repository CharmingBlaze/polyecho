# Modifiers

Non-destructive generate stack on `MeshObject`. Viewport and export evaluate through `evaluateModifiers`. The cage (edit mesh) does not change until **Apply**.

```
Cage  →  Mirror  →  Subdivision Surface  →  Solidify  →  draw / export
```

Do not invent a fourth generate modifier without a type, evaluator, `addModifier` / `applyMeshModifier` / `removeMeshModifier`, and a Mod inspector card.

## Verbs (`projectStore`)

| Verb | Effect |
| :--- | :--- |
| `addModifier('mirror' \| 'subdivision' \| 'solidify')` | Undo + defaults + `markGeometryUpdated` |
| `applyMeshModifier(type \| 'all')` | Bake that step into the cage, disable it |
| `removeMeshModifier(type)` | Delete the slot |

UI and the command palette call these. Do not assign `mesh.mirror = …` in Vue.

## Mirror

`src/core/geometry/MirrorModifier.ts`

- Axes X/Y/Z, sequential (X then Y then Z).
- **Bisect** (default on for new adds): keep the + side of each axis, split faces that cross the plane.
- **Merge** + merge distance: verts on the plane weld so the seam is one vertex.
- **Clipping**: viewport gizmo clamp while transforming (not the evaluator).
- Flip U on the mirrored copy.

## Subdivision Surface

`src/core/geometry/SubdivisionModifier.ts`

- **Catmull–Clark** (default): face points, edge points, vertex points, boundary 3/8 rule. Levels 1–3.
- **Simple**: same topology (every n-gon → n quads), no smoothing.
- UVs interpolate per face-corner so seams stay.

## Solidify

`src/core/geometry/SolidifyModifier.ts`

- Thickness along angle-weighted vertex normals.
- Offset like Blender: `-1` original stays / shell inward, `0` centered, `+1` original stays / shell outward.
- **Fill Rim** (default on): quads on boundary edges so a plane becomes a closed shell.

## Apply vs realtime

Realtime uses `evaluateModifiers` inside `meshToThreeGeometry`. Apply writes vertices/faces and turns that slot off. Other slots stay.
