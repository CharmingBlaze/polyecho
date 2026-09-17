# Review

Cursor writes this after each DeepSeek drop. DeepSeek reads it before the next turn.

## Latest (round 2 — pre-implementation verification of T1.1)

No new DeepSeek drop. This round is Cursor verifying the slice the human is about to
authorize, plus two corrections to the accepted plan.

Accepted `docs/ARCHITECTURE_IMPROVEMENT_PLAN.md` as the architecture source of truth. Thesis
matches the code: two authorities, reconciled by `MeshRepository` signature,
`runKernelOperation` used only by Extrude/Inset.

## T1.1 is verified and ready — with a precise target list

The backlog row said "every entry point". The code is more specific and the slice is smaller
and safer than that wording implies.

- `Operations.ts` is 831 lines with 18 exported functions.
- Exactly **16** `MeshBridge.meshObjectToEditableMesh` sites exist.
- **2** are already optional trailing parameters: `extrudeSelection` `:39`, `insetFaces` `:102`.
- **14** are locals inside the function body: `subdivideFaces` `:153`, `pokeFaces` `:201`,
  `triangulateFaces` `:223`, `flipNormals` `:254`, `deleteElements` `:279`, `bevelFaces`
  `:325`, `mergeVerticesAdvanced` `:366`, `fillFaceFromVertices` `:601`,
  `flattenVerticesOnAxis` `:633`, `dissolveElements` `:658`, `connectTwoVertices` `:698`,
  `cleanupMeshGeometry` `:730`, `bridgeEdgeLoops` `:762`, `gridFill` `:813`.
- `extrudeFaces` `:26` and `mergeVertices` `:243` need nothing (they delegate).

So T1.1 is a mechanical local→parameter lift on 14 signatures, default unchanged. The list is
provably complete (16 − 2 = 14). Plan slice 1 rewritten with this list.

## Corrections to the plan this round

1. **T1.1 scope leak.** Plan slice 1 included "the unwrap helpers". They are not in
   `Operations.ts`; they are in `geometry/UVUnwrap.ts` (`smartUvProject` `:534`,
   `boxUnwrap` `:254`, `planarUnwrap` `:297`, `cylinderUnwrap` `:333`, `sphereUnwrap` `:381`,
   `coneUnwrap` `:415`, `cubemapCrossUnwrap` `:462`, `gridifyQuadIslands` `:757`,
   `packUVIslands` `:660`), all `MeshObject` → `MeshObject` via
   `JSON.parse(JSON.stringify(mesh))` with **no kernel to inject**. They are attribute-only
   writers and belong to T1.4.
2. **AutoMerge was misdiagnosed — this was a real would-be bug.** Plan §2.2 and slice 2 both
   said to give `performAutoMerge` a `recordState` "because it has none".
   - `performAutoMerge` (`projectStore.ts:1086`) indeed has none.
   - But its **only** caller is `commitProxyTransform` (`Viewport3D.vue:3283`), which runs at
     the **end** of a gizmo drag.
   - That drag recorded history at its **start**: `recordState('Transform')`
     (`Viewport3D.vue:2821`).
   - Adding a `recordState` would therefore split one Ctrl+Z into two.
   - Its real defect is the one Track 1 exists for: throwaway bridge
     (`mergeVerticesAdvanced`, `Operations.ts:366`) + `replaceMesh` (`projectStore.ts:1090`).
   - Routing it as the **tail of the transform commit** is the fix.
   - Verified by search: `autoMerge` appears only in `projectStore`, `Viewport3D`,
     `types/tools.ts`. No menu/`App.vue`/`editorCommands` path.

   Both spots in the plan corrected; logged in `REJECTED.md`.

## Accepted this round

- T1.1 target list (14 functions) and its completeness argument
- Line counts re-measured: `Viewport3D.vue` **7680** / `projectStore.ts` **2676** — plan's
  §0 numbers are correct; the 7079/2441 pair was the early analyst error
- Plan's `Viewport3D.vue` citations spot-checked and exact: `rebuildMeshes` `:1440`,
  `clearModels` `:1445`, `hoverVertexLookup` `:5022`,
  `applyObjectMeshesFromProxyDelta` `:2773`, gizmo branch `:3096`, `commitProxyTransform`
  `:3273`

## Rejected this round

- "Give `performAutoMerge` a `recordState`" (see above) — now in `REJECTED.md`
- "The unwrap helpers are `Operations.ts` entry points" — now in `REJECTED.md`

## Questions for DeepSeek

None required to start T1.1. Optional: add `performFlipAxis` / vertex-paint (`MaterialProps`)
/ Shape Draw bake to the Track 1 writer list as named slices, not only §2 mentions.

Note: `docs/collab/BACKLOG.md` has a duplicated `## Proposed` heading (one near line 45, one
near line 49). Turn is `human`, so neither agent edited it. Worth collapsing.

## First slice to implement

**T1.1** — lift the local `bridge` into an optional trailing parameter on the 14 functions
listed above, defaulting as `extrudeSelection` already does. No behavior change. Tests green.

