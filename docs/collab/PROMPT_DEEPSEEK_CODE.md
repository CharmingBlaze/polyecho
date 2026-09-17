# DeepSeek code turn — unwrap

You are DeepSeek pairing with Cursor on PolyEcho. This turn you **write TypeScript**.

Use MCP `polyecho-collab` (`collab_status`, `collab_claim`, `collab_post`) if it is connected. Otherwise `py -3 scripts/collab_bus.py`. Spec: `docs/collab/BUS.md`.

Copy this whole file into DeepSeek. Then send:

```text
Implement unwrap. Do not start color, gizmo, watchers, or draw.
```

Use the **name** (`unwrap`). Do not use slice ids in chat except as a parenthetical.

**Write:** route the UV unwrap family as resident attribute-only commits (seams idiom), identity + attribute tests, `docs/collab/HANDOFF.md`.
**Read first:** this file, `docs/ARCHITECTURE_IMPROVEMENT_PLAN.md` Track 1 slice 4, `docs/collab/REJECTED.md`, `src/stores/projectStore.ts` UV `perform*` / `runKernelOperation` / `replaceMesh`, `src/core/geometry/Operations.ts` `setSeamEdges` / `projectSeamResult`, `src/core/geometry/UVUnwrap.ts` (call, do not rewrite), `src/core/mesh/MeshTransaction.ts` `attributes()` (face `uvs` are already in the diff).
**Do not write:** `Viewport3D.vue` (Cursor has **gizmo**), `MeshRepository.ts`, `UVUnwrap.ts`, `UVEditor.vue`, `src/stores/meshResidency.test.ts`, `REVIEW.md`.
**Do not** split stores, add frameworks, bump `.psxproj`, delete `MeshBridge`, inject a `bridge` argument into `UVUnwrap.ts` (rejected: those helpers stay `MeshObject` → `MeshObject`), or start **color**.

============================================================
ALREADY DONE (do not redo)
============================================================
- **bridge**, **topology**, **seams**, **join**, **lease**, **revisions**.
- UV `perform*` already pass a synthesized `ATTRIBUTE_ONLY_CHANGE` into `replaceMesh`. That was **revisions** (counters). It is **not** a resident commit. `replaceMesh` does not `meshRepository.publish`, so the next `acquire` re-imports and drops kernel identity.

Cursor is in parallel on **gizmo** (`Viewport3D.vue`, `src/core/transform/GizmoComponentDrag.ts`, `src/stores/meshResidency.test.ts`). Stay off those files. Claim `src/stores/projectStore.ts` and `src/core/geometry/Operations.ts` before you write them.

============================================================
SLICE (unwrap only)
============================================================

Same defect **seams** already closed: document UVs move, the resident kernel does not, `signature()` includes `f.uvs`, next `acquire` rebuilds.

Keep `geometry/UVUnwrap.ts` as pure `MeshObject` → `MeshObject` (and `SeamUnwrapper.unwrapMesh` as in-place document). Add a small Operations helper, modeled on `setSeamEdges` / `projectSeamResult`:

1. Run the existing unwrap helper on the document (or a JSON clone for in-place writers).
2. Copy the resulting face-corner UVs onto `bridge.mesh` faces (`strToNumFaceId` → `face.uvs` as `THREE.Vector2` from `{ u, v }`). Do **not** only assign `document.faces[].uvs`.
3. Return an `OperationResult` whose `mesh` is `MeshBridge.editableMeshToMeshObject(...)` so `runKernelOperation` publishes the projection.

Wire every UV `perform*` through `runKernelOperation` with `{ applySelection: false }`. Drop the writer-local `recordState` — `runKernelOperation` records after validation. Real `MeshChange` from `editMesh` will set `attributesChanged` (face `uvs` are in `describeMeshChange`); you can delete the synthesized `ATTRIBUTE_ONLY_CHANGE` uses on these sites.

Family (all of these, not a subset):

- `performSmartUvProject`
- `performSeamUnwrap`
- `performPackUVIslands`
- `performApplyTexelDensity`
- `performEqualizeTexelDensity`
- `performBoxUnwrap` / `generateBoxUVs`
- `performPlanarUnwrap`
- `performCylinderUnwrap`
- `performSphereUnwrap`
- `performConeUnwrap`
- `performCubemapCrossUnwrap`
- `performGridifyUvQuads`

**Leave alone**

- `bakeSceneAtlas` — still `markGeometryUpdated` (plan: atlas bake remaps projection UVs).
- `UVEditor.vue` island drag / stitch / pin — not this family.
- Import-time `boxUnwrap` in GLB/OBJ loaders.
- Cursor’s gizmo files.

============================================================
ACCEPTANCE (must have tests)
============================================================
Put tests in a **new** file (`src/stores/meshUnwrap.test.ts`). Do not edit `src/stores/meshResidency.test.ts`.

- After `performBoxUnwrap`, `acquireEditableMesh` returns the **same kernel instance** as before.
- Box / pack (pick one more) bump `meshRevision(id).attribute` and leave `topology` / `position` unchanged (the existing `meshRevisions.test.ts` UV case must still pass).
- One undo entry per command (no doubled `recordState`).
- No-op or unchanged UVs: `runKernelOperation` early-return still bumps nothing.

============================================================
RULES
============================================================
- Names: `unwrap`, not `T1.4`.
- `npm run typecheck` and the slice tests must pass.
- When finished: claim-release via `kind=done`, update HANDOFF Turn to `cursor`, post the bus, reply `Mailbox updated. Tell Cursor: Check the collab mailbox.`
