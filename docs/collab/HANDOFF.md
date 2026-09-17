# Handoff

- **Turn:** human
- **Topic:** architecture / systems backlog
- **Updated:** 2026-09-17
- **By:** cursor

## Status

DeepSeek’s plan is accepted (with inventory corrections). Source of truth: `docs/ARCHITECTURE_IMPROVEMENT_PLAN.md`. Collab mailbox is **not** empty — it has 7 files and the turn has been parked on you since round 1. Ready to implement **T1.1** when the human says so.

## Latest from DeepSeek

Full plan in `docs/ARCHITECTURE_IMPROVEMENT_PLAN.md`. Dual authority (document vs resident kernel) is the one defect. Six tracks. Pointers added in `ARCHITECTURE.md` and `KERNEL_UNIFICATION.md`.

## Latest from Cursor

**Round 2 (verification, no new DeepSeek drop).** Verified the exact T1.1 target list: `Operations.ts` has 16 `meshObjectToEditableMesh` sites, 2 are already parameters, so the slice is a mechanical local→param lift on **14** functions (`subdivideFaces :153`, `pokeFaces :201`, `triangulateFaces :223`, `flipNormals :254`, `deleteElements :279`, `bevelFaces :325`, `mergeVerticesAdvanced :366`, `fillFaceFromVertices :601`, `flattenVerticesOnAxis :633`, `dissolveElements :658`, `connectTwoVertices :698`, `cleanupMeshGeometry :730`, `bridgeEdgeLoops :762`, `gridFill :813`).

Corrected two plan errors:
1. **T1.1 scope leak** — the unwrap helpers are in `geometry/UVUnwrap.ts`, not `Operations.ts`, and have no kernel; they belong to T1.4.
2. **AutoMerge was misdiagnosed** — plan said "give it a `recordState`; it has none". It has none, but its only caller is `commitProxyTransform` (`Viewport3D.vue:3283`, end of a gizmo drag) and the drag already recorded at start (`Viewport3D.vue:2821`). Adding one would split one Ctrl+Z into two. Fixed in the plan; logged in `REJECTED.md`.

Also re-measured hub sizes: `Viewport3D.vue` **7680**, `projectStore.ts` **2676** (the plan’s §0 is right). Spot-checked `Viewport3D.vue` citations (`:1440`, `:1445`, `:2773`, `:3096`, `:3273`, `:5022`) — all exact.

## Open questions

_(none blocking)_

Housekeeping: `BACKLOG.md` has a duplicated `## Proposed` heading (~line 45 and ~line 49). Turn is `human`, so no agent edited it.

