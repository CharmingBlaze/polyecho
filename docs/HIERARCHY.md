# Objects & Scene Hierarchy

Three objects, three verbs. Do not invent a fourth path.

```
Scene Hierarchy (Outliner)  →  Active Object (activeMeshId)  →  Mesh Library (Cube, Sphere, Torso, Sword)
                                       ↑
                           parentId = Node Transform Hierarchy
```

| Thing | What it is | What it is not |
| :--- | :--- | :--- |
| **Mesh Object** (`MeshObject`) | A 3D object in the scene hierarchy (`position`, `rotation`, `scale`, `vertices`, `faces`, `materialId`, `parentId`). | Not the whole scene. Not a bone. |
| **Active Target** (`activeMeshId`) | Which 3D object is currently targeted by 3D Viewport tools, Edit Mode, and the Transform Inspector. | Not a permanent group. |
| **Hierarchy Link** (`parentId`) | Pointer to a parent `MeshObject.id` or `Bone.id` for transform inheritance. | Not a boolean flag. |

`projectStore.activeMesh` is a computed helper for the currently selected active mesh.

---

## The three verbs

All of these live on `projectStore`. UI must call them instead of mutating `meshes` / `parentId` by hand.

### 1. `selectMesh(id, options?)` / `selectMeshes(ids[])`

Sets the active object target (`activeMeshId` and `selectedMeshIds`).

- Automatically syncs the active material and paint texture targets.
- Does **not** alter geometry or hierarchy. No undo step.

- **Use**: Viewport raycast picking, Outliner row click, box marquee selection.

### 2. `createMesh(type, params?, transform?, options?)`

Builds 3D geometry via `PrimitiveBuilder` and adds it to `projectStore.meshes`.

- `options.record` default `true` (one undo item).
- `options.select` default `true` (becomes the active object).
- `options.materialId` optional material assignment.
- `addPrimitive(...)` is the same function (compatibility alias).

- **Use**: Header **Add** menu, Primitive popout bar, duplicating objects (`duplicateSelectedMeshes`).

### 3. `parentMesh(childMeshId, parentId)`

Binds `child.parentId = parentId` to establish transform inheritance.

- Validates against self-parenting and circular ancestor chains (`isDescendantOf`).
- Records an undo step (`Parent Child to Parent`).
- Calls `markGeometryUpdated()` so Three.js rebuilds scene node graph matrices.

- **Use**: Outliner drag-and-drop, Object Inspector Parent dropdown.

Related:
- `unparentMesh(childMeshId)` — detaches child object to scene root.
- `getMeshChildren(meshId)` — retrieves all direct children.
- `isDescendantOf(childId, potentialAncestorId)` — circular dependency prevention guard.

---

## Transform inheritance in Viewport & Export

- Moving, rotating, or scaling a parent object automatically transforms all descendant children.
- In `GltfExport.ts`, parent-child node relationships are exported as nested `THREE.Group` / `THREE.Mesh` nodes, creating ready-to-use prefabs for **Godot Engine**, **Unity**, and **Unreal Engine**.

---

## Which UI does what

| UI | New | Select | Parent / Unparent |
| :--- | :--- | :--- | :--- |
| **Outliner (List tab)** | `createMesh` | `selectMesh` / `selectMeshes` | Drag-and-drop / `×` unparent |
| **Object Inspector (Transform)** | — | `selectMesh` | Collapsed Parent dropdown (`parentMesh` / `unparentMesh`) |
| **3D Viewport** | Shift+A Add Menu | Click / Shift+Click pick | `Ctrl+P` Parent modal / `Alt+P` Clear |

---

## Do not

- Mutate `mesh.parentId` directly without calling `projectStore.parentMesh()`.
- Create circular parenting loops (`A` parent of `B`, `B` parent of `A`).
- Bake transform inheritance into raw vertex coordinates destructively when parenting.
