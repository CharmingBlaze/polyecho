# DeepSeek code turn — T1.1

You are DeepSeek pairing with Cursor on PolyEcho. This turn you **write TypeScript**, not architecture essays.

Copy this whole file into DeepSeek (same repo). Then send:

```text
Implement T1.1. Do not start T1.2.
```

**Write:** `src/core/geometry/Operations.ts` (and a small test if one is needed). Then `docs/collab/HANDOFF.md`.
**Read first:** this file, `docs/ARCHITECTURE_IMPROVEMENT_PLAN.md` Track 1 slice 1, `src/core/geometry/Operations.ts`, `extrudeSelection` / `insetFaces` signatures, `docs/collab/REJECTED.md`.
**Do not write:** `Viewport3D.vue`, `projectStore.ts` `perform*` methods, `UVUnwrap.ts`, `REVIEW.md`.
**Do not** split stores, add frameworks, bump `.psxproj`, or delete `MeshBridge`.

============================================================
SLICE (T1.1 only)
============================================================
Make every topology entry in `Operations.ts` accept an injected resident bridge, **identical default** to Extrude/Inset, so later T1.2 can pass the resident kernel without reallocating numeric ids.

Already done (do not restyle):

```ts
// extrudeSelection — last param
bridge: MeshBridgeData = MeshBridge.meshObjectToEditableMesh(mesh)

// insetFaces — last param after options
bridge: MeshBridgeData = MeshBridge.meshObjectToEditableMesh(mesh)
```

**Lift these 14** — replace the inner `const bridge = MeshBridge.meshObjectToEditableMesh(mesh)` with a **last parameter** using that same default:

| Function | Current inner `const bridge` |
| :--- | :--- |
| `subdivideFaces` | `:153` |
| `pokeFaces` | `:201` |
| `triangulateFaces` | `:223` |
| `flipNormals` | `:254` |
| `deleteElements` | `:279` |
| `bevelFaces` | `:325` |
| `mergeVerticesAdvanced` | `:366` |
| `fillFaceFromVertices` | `:601` |
| `flattenVerticesOnAxis` | `:633` |
| `dissolveElements` | `:658` |
| `connectTwoVertices` | `:698` |
| `cleanupMeshGeometry` | `:730` |
| `bridgeEdgeLoops` | `:762` |
| `gridFill` | `:813` |

Also: `mergeVertices` (`:243`) currently calls `mergeVerticesAdvanced(mesh, vertexIds, 'center')`. Forward an optional last `bridge` into that call.

============================================================
RULES
============================================================
- **Behavior unchanged** when the caller omits `bridge`. Existing `Operations.test.ts` must stay green without passing a bridge.
- Parameter is always last. Keep existing optional args (`options`, `viewDirection`, `threshold`, `edgeIds`) where they are; do not reorder them.
- Do not pass `previous` maps yourself. The default `meshObjectToEditableMesh(mesh)` is the no-resident path. The resident path is T1.2 (`runKernelOperation` will pass the staged bridge).
- Do not route `perform*` onto `runKernelOperation` in this PR. That is T1.2.
- Do not add a `bridge` to UV unwrap helpers. They are not in this file (`REJECTED.md`).
- Do not add `recordState` to `performAutoMerge` (`REJECTED.md`).
- Touch only `Operations.ts` plus tests. If a test needs an explicit “injected bridge reuses numeric vertex ids” case, add **one** it in `Operations.test.ts`: create a cube, convert with `MeshBridge.meshObjectToEditableMesh`, pass that bridge into e.g. `flipNormals` or `pokeFaces`, assert `bridge.mesh` is the same object reference after the call (or that `strToNumVertId` keys are unchanged for surviving verts). Keep it short.
- Match existing style. No drive-by format of the whole file.

============================================================
DONE CHECK
============================================================
1. `rg "const bridge = MeshBridge.meshObjectToEditableMesh" src/core/geometry/Operations.ts` → no matches (params only).
2. `npm run typecheck` and `npm test` (at least `src/core/geometry/Operations.test.ts`).
3. Update `docs/collab/HANDOFF.md`:
   - Turn: `cursor`
   - Latest from DeepSeek: which 14 functions got the param, test command + result
4. Chat reply to the human, exactly:

```
Mailbox updated. Tell Cursor: Check the collab mailbox.
```

If typecheck or tests fail, fix them in this turn. Do not start T1.2 to “make it complete.”
