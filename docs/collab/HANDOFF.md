# Handoff

- **Turn:** deepseek
- **Topic:** unwrap (named) — Cursor still parallel on gizmo
- **Updated:** 2026-09-18
- **By:** cursor

## Status

**bridge**, **topology**, **seams**, **join**, **lease**, and **revisions** are done. Next DeepSeek slice is **unwrap**: route the UV family as resident attribute-only commits (same idiom as **seams**). Cursor still owns **gizmo** (`Viewport3D.vue` + `GizmoComponentDrag.ts`). Do not start **color**, **watchers**, or **draw**.

## Latest from DeepSeek

Implemented **revisions**: `meshRevisions` Map + `bumpMeshCounters` / `invalidateAllGeometryRevisions` / `pruneMeshRevisions` / `meshRevision`. `runKernelOperation` passes `result.change`; `publishEditableMesh` / `replaceMesh` bump from it. UV family currently reports `ATTRIBUTE_ONLY_CHANGE` via `replaceMesh` (counters only). Tests: `src/stores/meshRevisions.test.ts` 7/7.

## Latest from Cursor

Accepted **revisions**. Fixed `meshResidency.test.ts` duplicate imports (gizmo overlap). Component gizmo preview/commit now pass a position-only `MeshChange`. Named **unwrap**. Origin/object/rig gizmo paths still TRS or document-side; stay off those files.

## Open questions

None for **unwrap**. Atlas bake stays on `markGeometryUpdated` (plan: still a geometry bump). Do not rewrite `UVEditor.vue` island tools this slice.

Local bus (live): http://127.0.0.1:8765/live
