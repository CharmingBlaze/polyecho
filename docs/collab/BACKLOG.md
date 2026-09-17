# Architecture backlog

Living list. Only the agent named in `HANDOFF.md` **Turn** edits this file.

Statuses: `proposed` → `accepted` | `blocked` | `rejected` | `done`

Kernel unification remaining work is the seed. New items must not duplicate it under a new name.

Say the **name** in chat (`topology`, `seams`, `lease`). IDs stay for the plan.

## Names

| Name | ID | Status |
| :--- | :--- | :--- |
| **bridge** | T1.1 | done |
| **topology** | T1.2 | done |
| **seams** | T1.8 | done |
| **lease** | T0 | done |
| **revisions** | T3.1 | done |
| **join** | T1.3 | done |
| **unwrap** | T1.4 | accepted |
| **stack** | T1.7b | accepted |
| **gizmo** | T1.5 | accepted |
| **weights** | T1.6 | accepted |
| **apply** | T1.7 | accepted |
| **color** | T1.9 | accepted |
| **symmetry** | T1.10 | accepted |
| **draw** | T2 | accepted |
| **watchers** | T3.3 | accepted |
| **undo** | T4 | accepted |
| **fills** | T6 | accepted |

## Seed (already decided — do not re-propose)

These are from `docs/KERNEL_UNIFICATION.md`. DeepSeek may refine slices, not replace the goal.

| ID | Slice | Size |
| :--- | :--- | :--- |
| K1 | Route remaining mutation paths (gizmo, UV, rigging writes, modifiers, leftover one-shots) through resident `MeshTransaction` | L |
| K2 | Shared render / pick / snap adapter (stop projecting a full `MeshObject` just to draw) | L |
| K3 | Per-object topology / position / attribute revisions instead of global `geometryRevision` | M |
| K4 | History snapshots resident kernel topology (edge/corner identity survives undo) | L |
| K5 | Attribute propagation through bevel, merge, subdivision, face-interior knife, modifier eval | M |

Format version stays `1.0` / `PSXModeller` until an explicit migration. No persistent sharp/crease or loose edges before that.

Sequencing, write contract, and the verified mutation inventory: `docs/ARCHITECTURE_IMPROVEMENT_PLAN.md`.

## Accepted (from the plan)

Statuses: `accepted` — ready when the human (or Cursor) says the name.

| Name | ID | Slice | Size | Depends | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| bridge | T1.1 | `Operations.ts` accepts an injected resident bridge on every entry point | S | none | **done** |
| lease | T0 | Lease rule: held kernel cannot be clobbered by `acquire` | S | none | **done** |
| revisions | T3.1 | Additive per-object topology/position/attribute counters | M | none | **done** |
| topology | T1.2 | Route remaining topology `perform*` through `runKernelOperation` (incl. delete/dissolve/connect/cleanup/autoMerge). Do **not** add `recordState` to AutoMerge | M | bridge | **done** |
| unwrap | T1.4 | Route UV family as attribute-only commits | M | bridge, revisions | accepted |
| draw | T2 | `MeshRenderView` + per-object cache | L | revisions | accepted |
| watchers | T3.3 | Switch viewport watchers to per-object keys | M | revisions, draw | accepted |
| join | T1.3 | Join/separate preserve `boneWeights` and `seamEdgeIds` | M | bridge | **done** |
| undo | T4 | Kernel snapshot in history | L | topology | accepted |
| gizmo | T1.5 | Gizmo component drag on the leased kernel | L | topology, lease | accepted |
| weights | T1.6 | Weight editing on the resident kernel | M | topology, lease | accepted |
| apply | T1.7 | Modifier Apply as resident commit | M | topology | accepted |
| stack | T1.7b | Modifier add/remove as attribute-only (apply stays **apply**) | S | topology | accepted |
| seams | T1.8 | Seam mark/clear via resident attribute commit | S | bridge | **done** |
| color | T1.9 | Vertex color writes (`MaterialProps`) via resident attribute commit | M | unwrap | accepted |
| symmetry | T1.10 | Symmetry split: flip verts through kernel; object rotate stays TRS; mirror-copy is object creation | M | topology | accepted |
| fills | T6 | Attribute matrix + fills | M | topology | accepted |

## Proposed

_(none — the four Track 1 leftover rows have folded into the **Accepted** table above:
stack, seams, color, symmetry. Do not re-add them here. Their write contract and verified
call sites are in the plan, Track 1 slices 8–11.)_

## Folded in from the plan (for traceability)

These are not slices — they are the writers those slices close, kept here only so a reader
does not have to diff the plan to find out what "remaining attribute-only writers" means.

| Writer | Name |
| :--- | :--- |
| `markSelectedEdgesAsSeam` / `clearSelectedEdgesSeam` / `clearAllSeams` (`projectStore.ts:2181-2210`) | seams |
| Nine `v.color` sites in `src/components/inspector/MaterialProps.vue` | color |
| `flipMeshGeometry` / `addObjectRotation` / `cloneMeshObject` (`ObjectSymmetry.ts`) | symmetry |
