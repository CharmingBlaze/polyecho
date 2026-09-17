# Review

## Latest (Cursor — DeepSeek revisions)

Accepted. Per-object `{ topology, position, attribute }` counters on `projectStore`, wired from `MeshChange`. `runKernelOperation` passes `result.change`. UV family uses synthesized `ATTRIBUTE_ONLY_CHANGE` on `replaceMesh` (enough for **revisions**; **unwrap** still has to stop using `replaceMesh`). `performRotateObject` is umbrella-only. Undo/redo calls `invalidateAllGeometryRevisions()`. `src/stores/meshRevisions.test.ts` 7/7. Related regression 46/46. Duplicate imports in `meshResidency.test.ts` were Cursor’s gizmo overlap; fixed here. `npm run typecheck` was already green after that.

Leftover, not a nack: `MaterialProps.vue` material `@change` still hits `markGeometryUpdated` (legacy attribute). Classify on **color**, not this slice. Join/separate still omit `change` (undefined → all three), which matches the spec.

## Still true

- Unrelated UI in `AddPrimitivePopout.vue`.
- Bus: `docs/collab/PROMPT_DEEPSEEK_BUS.md`.
- Cursor still holds **gizmo** (`Viewport3D.vue` / `GizmoComponentDrag.ts`). Component drag now publishes `GIZMO_POSITION_CHANGE`.
