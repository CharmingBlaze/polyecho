# Architecture backlog

Living list. Only the agent named in `HANDOFF.md` **Turn** edits this file.

Statuses: `proposed` → `accepted` | `blocked` | `rejected` | `done`

Kernel unification remaining work is the seed. New items must not duplicate it under a new name.

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

Statuses: `accepted` — ready to implement when the human names a slice.

| ID | Slice | Size | Depends | Status |
| :--- | :--- | :--- | :--- | :--- |
| T1.1 | `Operations.ts` accepts an injected resident bridge on every entry point | S | none | in progress (DeepSeek) |
| T0 | Lease rule: held kernel cannot be clobbered by `acquire` | S | none | accepted |
| T3.1 | Additive per-object topology/position/attribute counters | M | none | accepted |
| T1.2 | Route remaining topology `perform*` through `runKernelOperation` (incl. delete/dissolve/connect/cleanup/autoMerge). Do **not** add `recordState` to AutoMerge | M | T1.1 | accepted |
| T1.4 | Route UV family as attribute-only commits | M | T1.1, T3.1 | accepted |
| T2 | `MeshRenderView` + per-object cache | L | T3.1 | accepted |
| T3.3 | Switch viewport watchers to per-object keys | M | T3.1, T2 | accepted |
| T1.3 | Join/separate preserve `boneWeights` and `seamEdgeIds` | M | T1.1 | accepted |
| T4 | Kernel snapshot in history | L | T1.2 | accepted |
| T1.5 | Gizmo component drag on the leased kernel | L | T1.2, T0 | accepted |
| T1.6 | Weight editing on the resident kernel | M | T1.2, T0 | accepted |
| T1.7 | Modifier Apply as resident commit | M | T1.2 | accepted |
| T6 | Attribute matrix + fills | M | T1.2 | accepted |

## Proposed

_(none — next DeepSeek docs turn should only add slices missing from the plan, not a second list)_
