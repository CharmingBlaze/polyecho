# Architecture improvement plan: system ownership

This is not a general audit. It is the sequencing and ownership plan for the migration
already declared in `docs/KERNEL_UNIFICATION.md`. It answers one question:

> How do we make PolyEcho's *systems* (ownership, mutation paths, history, viewport sync,
> operators) get cleaner over time without a rewrite?

Everything here is scoped to that. Read `docs/ARCHITECTURE.md` for layers and
`docs/INVARIANTS.md` for what must not break. This document adds the *order* and the
*guardrails*, and names the exact holes that remain.

## 0. How to read this

- **Layer model is fixed.** UI → Pinia (serializable editor state) → `src/core/` →
  `src/types/`. No new layer, no new framework, no second store library.
- **Two mesh representations stay** during migration: `MeshObject` (string ids, JSON, the
  `.psxproj` document) and `EditableMesh` (numeric ids, half-edges, the interactive kernel).
  `MeshBridge` is the only conversion.
- **`Viewport3D.vue` (7,680 lines) and `projectStore.ts` (2,676 lines) are integration hubs
  on purpose.** Size is not a defect. No drive-by split is proposed anywhere below. This
  plan changes *who may write what*, not how many files exist.
- **No event bus for store-to-store data.** Pinia stores calling stores is allowed and
  stays. `EDITOR_EVENTS` (`src/core/commands/editorCommands.ts:5`) is a UI command bus
  (`modalTool`, `cameraView`, `openPie`, `fillFace`, `openExport`, `smartUvProject`, …).
  There is no `GEOMETRY_CHANGED` and there must not be one; the viewport watches revisions.

## 1. The actual defect, stated once

PolyEcho does not have a "kernel migration that is half done". It has **one defect with
many symptoms**:

> The document (`projectStore.meshes`) is simultaneously the persisted truth, the render
> input, and a writable scratchpad. The resident kernel is simultaneously a cache and an
> authority. Nothing in the type system says which one wins.

Concretely, today **two** places claim authority over the same geometry:

| Authority claim | Mechanism | Evidence |
| :--- | :--- | :--- |
| Resident kernel is authoritative | `runKernelOperation` stages a clone, validates, records history, then `restoreSnapshot`s into the resident instance and `publish`es | `projectStore.ts:468-491` |
| Document is authoritative | ~20 verbs mutate `MeshObject` and call `replaceMesh`, which never touches `MeshRepository` | `projectStore.ts:901-907` |

The reconciliation is a **correctness guard**, not a design: `MeshRepository.acquire`
compares a full JSON signature and re-imports the document when it differs
(`MeshRepository.ts:6-30`). That guard is why nothing is visibly broken today. It is also
linear in mesh size on every acquire, and it silently clobbers the resident instance
in place (`MeshRepository.ts:25-26`) to keep outside references live.

**The win condition is not "delete MeshBridge".** It is: at any instant, exactly one of
{document, resident kernel, history snapshot} is the authority for a given object, and the
other two are demonstrably derived. Today all three are writable.


## 2. Verified mutation-path inventory

This is the map the plan is built on. "Kernel?" means: does the commit go through the
resident kernel, `editMesh` validation, and `publishEditableMesh`?

### 2.1 Kernel-authoritative today (2 verbs)

| Verb | Path | Evidence |
| :--- | :--- | :--- |
| Extrude | `performExtrude` → `runKernelOperation` → `extrudeSelection` → `ExtrudeKernel` | `projectStore.ts:493-501` |
| Inset | `performInset` → `runKernelOperation` → `insetFaces` → `InsetKernel` | `projectStore.ts:503-506` |

Modal tools that acquire the resident kernel via `projectStore.acquireEditableMesh`
(`Viewport3D.vue:4581`, `4852`) and commit through `publishEditableMesh`
(`Viewport3D.vue:4736`, `4773`, `4829`) are also kernel-authoritative for their session.

### 2.2 Document-write verbs that call `Operations.ts` (kernel math, no residency)

Every one of these runs real kernel algorithms — but through a *throwaway* bridge, then
hands the result back as a new document and never updates the repository.

| Verb | Store line | Core entry |
| :--- | :--- | :--- |
| Bevel | `performBevel` `:508` | `bevelFaces` `Operations.ts:320` |
| Subdivide | `performSubdivide` `:519` | `subdivideFaces` `Operations.ts:143` |
| Poke | `performPokeFaces` `:581` | `pokeFaces` `Operations.ts:197` |
| Triangulate | `performTriangulate` `:597` | `triangulateFaces` `Operations.ts:219` |
| Merge | `performMerge` `:606` | `mergeVerticesAdvanced` `Operations.ts:360` |
| Fill / connect | `performFillFace` `:623` | `fillFaceFromVertices`, `connectTwoVertices` |
| Flatten | `performFlatten` `:644` | `flattenVerticesOnAxis` `Operations.ts:629` |
| Flip normals | `performFlipNormals` `:754` | `flipNormals` `Operations.ts:250` |
| Bridge | `performBridgeEdges` `:762` | `bridgeEdgeLoops` `Operations.ts:747` |
| Grid fill | `performGridFill` `:769` | `gridFill` `Operations.ts:808` |
| Delete components | `performDelete` `:807` | `deleteElements` (object mode is `deleteSelectedMeshes`) |
| Dissolve | `performDissolve` `:820` | `dissolveElements` |
| Connect | `performConnectVertices` `:829` | `connectTwoVertices` |
| Cleanup | `performCleanupMesh` `:836` | `cleanupMeshGeometry` |
| Auto-merge | `performAutoMerge` `:1086` | `mergeVerticesAdvanced`. **Not** missing history: its only caller is `commitProxyTransform` (`Viewport3D.vue:3283`), which runs after `recordState('Transform')` at drag start (`:2821`). See §2.2 note below. |
| UV unwrap family | `:2220-2345` | `smartUvProject`, `boxUnwrap`, `planarUnwrap`, `cylinderUnwrap`, `sphereUnwrap`, `coneUnwrap`, `cubemapCrossUnwrap`, `gridifyQuadIslands`, `packUVIslands`, `SeamUnwrapper` — all in `geometry/UVUnwrap.ts`, `MeshObject` in / `MeshObject` out, no kernel |

**Note on `performAutoMerge`.** It is the one verb in this table that does **not** need a new
history entry. Its only caller in the codebase is `commitProxyTransform`
(`Viewport3D.vue:3283`), which runs at the end of a gizmo drag — not from the menu, `App.vue`,
or `editorCommands`. The drag itself recorded history at its start (`recordState('Transform')`,
`Viewport3D.vue:2821`). Treating AutoMerge as its own verb with its own `recordState` would
produce two undo steps for one drag, so it is routed as the tail of the transform commit
instead. Verified 2026-09-17 by search: no other reference to `autoMerge` exists outside
`projectStore` / `Viewport3D` / `types/tools.ts`.

The important detail is `Operations.ts:39`:

```ts
bridge: MeshBridgeData = MeshBridge.meshObjectToEditableMesh(mesh)
```

No `previous` maps are passed, so **numeric ids are re-allocated fresh on every one-shot
call**. Document ids survive only because `editableMeshToMeshObject` maps back. Numeric
edge/corner identity does not survive, which is exactly the gap `KERNEL_UNIFICATION.md:21`
calls out for history.

### 2.3 Document-write verbs outside `Operations.ts` (no kernel at all)

| Verb | Store line | What it does |
| :--- | :--- | :--- |
| Modifier add / remove | `:845`, `:869` | writes `mesh.mirror` / `subdivision` / `solidify` then `markGeometryUpdated`. Attribute-only: those fields are **not** in `signature()`, so they cannot push the document ahead of the kernel. Only Apply (`:862`) rebuilds the kernel |
| Modifier apply | `:862` | `applyModifier` + `markGeometryUpdated`; slice 7 |
| Seam mark / clear | `:2181-2210` | writes `activeMesh.seamEdgeIds` **directly** (`:2189`, `:2201`, `:2208`) — no `replaceMesh`. Seams *are* kernel state: `MeshBridge.ts:74-77` sets `edge.seam` from them, `:188` exports them, `MeshSnapshot.edges[].seam` carries them (`MeshKernel.ts:48`), and `signature()` (`MeshRepository.ts:10`) hashes them. Attribute-only, **not** TRS-only |
| Separate | `:660-706` | in-place splices `faces` / `vertices`, `meshes.value.push(newMesh)` |
| Join | `:708-752` | in-place splices + filter; hand-rolled ids |
| Delete mesh | `:782-794` | filter + select fix-up |
| Flip object axis | `:1246` | `flipMeshGeometry` (`ObjectSymmetry.ts:6-14`) negates `position[axis]` **and** reverses `f.vertexIds` + `f.uvs` — positions + winding + corner-UV order. Not TRS-only; slice 10 |
| Rotate object | `:1255` | `addObjectRotation` (`ObjectSymmetry.ts:24-26`) writes only `mesh.rotation[axis]`. `signature()` excludes object transforms by design (`MeshRepository.ts:7`) — **TRS-only, verified, stays group (b)** |
| Mirror copy object | `:1263` | `cloneMeshObject` (`:1228`, machine-renames all ids) + `flipMeshGeometry` + `meshes.value.push` (`:1272`). Object creation; whole-object replacement with a stated reason |

### 2.4 Writers outside `projectStore`

- **Gizmo component drag** writes `activeMesh.vertices[].position` directly
  (`Viewport3D.vue:3097-3140`), one history snapshot at drag start, commit via
  `commitProxyTransform` (`:3273`). Resident kernel untouched.
- **Rigging / weight editing** writes `mesh.vertices[].boneWeights` on the document from
  `animationStore.ts` at `:905, 929, 942, 1039, 1050, 1123, 1150, 1199, 1225, 1299`.
  Resident kernel untouched.
- **Vertex paint fill** writes `v.color` on the document (`src/components/inspector/MaterialProps.vue`: nine assignments at `:767`, `:773`, `:779`, `:798`, `:808`, `:817`, `:852`, `:870`, `:880`; each owner does `recordState` → mutate → `markGeometryUpdated()`, `:790-800`, `:805-810`, `:815-819`, `:859`, `:872`, `:882`). `v.color` **is** in `signature()` (`MeshRepository.ts:9`), so these writes put the document ahead of the resident kernel. Slice 9.
- **Shape Draw bake** writes through `replaceMesh` (`src/components/viewport/ShapeDrawPanel.vue:34-39`). **Stated reason, verified:** it only deletes `shapeSource` and replaces the whole object — it never touches `vertices` or `faces`, so it is a whole-object replacement (same class as import / primitive / separate output), not a topology edit. Keep it on `replaceMesh` and add the §6.3 comment. Note the spread is shallow (`{ ...activeMesh }`), so the new object shares the old `vertices` / `faces` array references; the clone inside `replaceMesh`/history is what makes that safe — do not deepen it into a hand-rolled copy.
- **Live symmetry** — split, and already confirmed. The G/R/S path writes **kernel** verts: `ModalOperator.applyLiveSymmetry` (`ModalOperator.ts:215-226`) passes `[...this.ctx.mesh.vertices.values()]`, and `ctx.mesh` is the kernel `EditableMesh` (numeric ids: `vertices.get(vId)` `:210`, `edges.get(eId)` `:200`), called from `MoveOperator.ts:134`, `RotateOperator.ts:66`, `ScaleOperator.ts:84`. **No document writes; no work needed.** The only document-side call is the gizmo component branch (`Viewport3D.vue:3208` → `applyLiveSymmetry(activeMesh.vertices, …)`), which is slice 5's range. It must keep using the leased kernel there, not the document.

### 2.5 Consumers that read the document to draw

`meshToThreeGeometry(mesh: MeshObject, …)` (`Converters.ts:378`) is the single render
projection. It is also the selection-overlay source (`:595`) and the GPU-attribute
updater (`:661`), and it internally calls `evaluateModifiers(mesh)` (`:388`). Picking and
snap read document vertices (`Viewport3D.vue:5022` `hoverVertexLookup`, keyed by
`geometryRevision`). So the renderer is a second, O(n) consumer of the document with its
own rebuild loop (`rebuildMeshes` `Viewport3D.vue:1440` → `layers.clearModels()`
`:1445` → loop over all meshes `:1474`).

### 2.6 Views on the same mesh must agree — and only sometimes do

`performSeparateMesh` (`projectStore.ts:660`) is a concrete inconsistency that a routed
kernel would eliminate:

- it drops `seamEdgeIds` from the new mesh, and leaves the source mesh's `seamEdgeIds`
  pointing at edges that no longer exist;
- `performJoinMeshes` (`:708-746`) copies `color` but **not** `boneWeights` when pushing
  joined vertices, so skin weights are lost on Ctrl+J.

Both verbs bypass `editMesh` validation entirely. These are the payoff cases: routing
writers through the kernel is not purity, it is how attribute loss stops happening.


## 3. The write contract

Everything below assumes one small, additive piece of design. It is the only new
abstraction this plan asks for, and it is deliberately thin so it does not become a fourth
mesh representation.

### 3.1 One commit function

`runKernelOperation` (`projectStore.ts:468-491`) already *is* that function. It stages a
clone, validates via `editMesh`, records history, restores into the resident kernel, and
publishes. The plan is to **generalize it, not replace it**:

- Rename the concept in docs to **"resident commit"**. Its contract:
  1. acquire the resident kernel (never a fresh bridge);
  2. run the operation inside `editMesh` against a staged clone;
  3. no-op (no history, no revision bump) when `describeMeshChange` reports nothing;
  4. `recordState` **before** mutating the resident kernel or the document;
  5. `restoreSnapshot` the result into the resident instance and `publishEditableMesh`.

- `Operations.ts` keeps its public `MeshObject`-in / `MeshObject`-out signatures so
  exporters, tests, and any remaining callers still work. But its **bridge parameter
  becomes mandatory for commit paths** — callers pass the resident bridge instead of
  letting the default at `Operations.ts:39` allocate fresh ids.

That single change is what makes numeric identity survive one-shot verbs, which is what
track 4 (history) needs.

### 3.2 The lease rule (fixes the in-place clobber hazard)

`MeshRepository.acquire` currently does this when the signature differs
(`MeshRepository.ts:23-27`):

```ts
existing.bridge.mesh.restoreSnapshot(bridge.mesh.createSnapshot())
bridge.mesh = existing.bridge.mesh
```

It mutates the instance that an in-flight session may be holding. Today this is safe only
because modal sessions keep the document clean until commit. It stops being safe the
moment gizmo drags and weight painting write the document mid-session.

Rule to enforce: **an acquired kernel has exactly one owner until released.** While a modal
session or gizmo drag holds a lease, `acquire` must not re-sync that object; it must either
return the held instance or defer. A `held` flag on the repository entry is enough. This is
a ~15-line change with a test, and it removes a whole class of "the mesh snapped back
mid-drag" bugs before they are introduced.

**Implementation note (lease, landed 2026-09-17).** `MeshRepository` entries carry `held`.
`hold(document)` acquires then sets the flag; `acquire` returns the held bridge without
`restoreSnapshot` even if `signature()` differs; `publish` keeps the flag; `retain` will
not drop a held entry. Store wrappers: `holdEditableMesh` / `releaseEditableMesh`. Gizmo
and operators do not take a lease yet — that is **gizmo**.

### 3.3 The one-writer rule

> For a given object, at a given moment, there is exactly one writer.

Corollaries the plan enforces:

- The gizmo and weight editors do not write `MeshObject` arrays directly; they either
  (a) write the resident kernel inside a drag session and publish on end, or
  (b) are explicitly documented as TRS-only writers that cannot invalidate topology.
  (Object-mode TRS and bones are already in group (b) and stay there.)
- `replaceMesh` stops being the general escape hatch. It survives for verbs that
  legitimately replace the whole object (import, primitive creation, separator output),
  and those call sites get an explicit reason so a reviewer can see them.
- Nothing outside `projectStore` + `MeshRepository` assigns to `mesh.vertices`,
  `mesh.faces`, or `mesh.seamEdgeIds`.

### 3.4 Revisions become derived, not hand-bumped

Today one global counter is hand-bumped by `markGeometryUpdated` (`projectStore.ts:1440`) and by
the preview branch of `publishEditableMesh` (`:861`), and every writer is trusted to remember.
Instead: keep `geometryRevision` as the *sum* of per-object revisions so nothing breaks,
but make it a view of `topology` / `position` / `attribute` counters that
`publishEditableMesh` and `replaceMesh` set from `MeshChange` (`MeshTransaction.ts:11-21`).
`describeMeshChange` already computes exactly these three booleans; the store is currently
throwing that information away — `runKernelOperation` (`:485`) receives `result.change`, and
`publishEditableMesh` (`:498`) is never told about it.

#### 3.4.1 The write contract (slice **revisions** — docs-only spec)

Three numbers per object, not one global number. All of it is **derived state**: never
serialized, never in `.psxproj`, never in history, never a tool's input.

```ts
// Store-internal, non-serialized. Key = MeshObject.id (same id space as MeshRepository entries).
type MeshRevisions = { topology: number; position: number; attribute: number }
const meshRevisions = new Map<string, MeshRevisions>()
const geometryRevision = ref<number>(0) // umbrella: total of every counter above
```

Rules, in priority order:

1. **The umbrella never regresses.** Every counter bump also increments `geometryRevision`, so
   all existing consumers (3.4.3) keep working untouched while the migration lands.
2. **One writer, one report.** A counter moves in exactly two places: the commit path
   (`runKernelOperation` → `publishEditableMesh(document, bridge, change)`) and `replaceMesh`.
   Both take the `MeshChange` that `editMesh` (`MeshTransaction.ts:52-63`) already returns.
3. **Topology implies the rest.** A snapshot that changes vertex / edge / face / half-edge
   identity necessarily re-lists positions and attributes, so `topologyChanged` bumps **all
   three** counters. Monotone implication is what lets a consumer key on `topology` alone.
4. **A no-op reports nothing.** `runKernelOperation:487` already returns early when all three
   booleans are false; that path must not bump any counter.
5. **Preview stays bounded.** `preview = true` bumps counters but skips `triggerAutosave`
   (`:861` vs `:862`) — unchanged behavior, only now per object.
6. **Restore invalidates everything.** Undo/redo (`historyStore.ts:184`), session load
   (`projectIo.ts:74`) and new project (`NewProjectModal.vue:47`) bump all three counters for
   every object, or clear the map. A restored document has no claim on kernel identity.
7. **Removal drops the entry.** `meshRepository.retain` already prunes dead kernels
   (`projectStore.ts:709`, `:834`, `:839`); the revision map drops the same ids there.

Bump table (writer → counters), verified 2026-09-17:

| Writer | Counters | Signal |
| :--- | :--- | :--- |
| `runKernelOperation` (`:471-500`) | exactly what `result.change` reports | `editMesh` → `describeMeshChange` |
| `performJoinMeshes` (`:690`) / `performSeparateMesh` (`:651`) | primary/source: all three; separated id: new entry | synthesized — object-level verbs, one command each |
| `replaceMesh` (`:865`) | all three for that id (create entry if new) | whole-object replacement |
| import / primitive / session load | all three, new entries | new object |
| `markGeometryUpdated` (`:1440`, exported `:2559`) | **legacy**: `attribute` only | see 3.4.2 |

`MeshChange` is richer than the three booleans (`createdVertices` / `deletedEdges` / …,
`MeshTransaction.ts:15-20`). Keep it in the result: a later slice can publish those lists to the
outliner and to Track 2's cache instead of stat-comparing.

#### 3.4.2 The legacy call sites are the real work

`markGeometryUpdated` is called **98 times**: 38 inside `projectStore.ts` and **60 outside it**.
Verified 2026-09-17 with:

```text
git grep -n markGeometryUpdated -- src ':(exclude)src/stores/projectStore.ts'
```

Totals by file: `animationStore.ts` 15, `MaterialProps.vue` 30, `UVEditor.vue` 7, `HeaderMenu.vue`
3, `Viewport3D.vue` 2, `TransformProps.vue` 2, `ModifiersProps.vue` 1, `TilesetEditor.vue` 1,
`NewProjectModal.vue` 1, `projectIo.ts` 1, `historyStore.ts` 1 (+ `historyStore.test.ts` 7).

Per §6.6 these must become `MeshChange`-driven, but they cannot all become topology commits. The
slice is to **classify** them, not to eyeball them:

1. Tag every site with its concern: **topology** / **position** (TRS-only writers stay TRS —
   `TransformProps.vue:67`, object-mode gizmo) / **attribute** (colors, UVs, seams, weights) /
   **material** / **not a mesh change at all**.
2. Sites that are not mesh changes must stop bumping mesh revisions. `MaterialProps.vue`'s
   `@change="projectStore.markGeometryUpdated()"` rows (~20 of them, `:1064`–`:1338`) edit
   `activeMaterial` fields (`saturnMeshAlpha`, `psxAffine`, `dreamcastVQ`, …) — material concern,
   not `vertices` / `faces`.
3. **Marked unverified — do not guess from a line number.** (a) whether each of the nine `v.color`
   writes (`MaterialProps.vue:767`–`880`) is reached from a mesh path or only a material path;
   (b) the call-site ↔ field mapping for `animationStore.ts`'s 15 calls (rig / weight writes per
   §2.4, but not per-site). Verify with
   `git grep -n 'boneWeights\|\.color' -- src/stores/animationStore.ts src/components/inspector/MaterialProps.vue`
   in the implementing turn.

Until a site is classified it keeps its umbrella bump: safe, just not yet precise. A fourth
concern (material) is **out of scope** — **revisions** counts mesh data only, and the umbrella
covers everything else.

#### 3.4.3 Consumers, verified today

| Consumer | Today | After the counters exist |
| :--- | :--- | :--- |
| `Viewport3D.vue:6196-6208` rebuild watcher, incl. the per-mesh fingerprint at `:6201-6203` | global revision + hand-rolled `vertices.length` / `faces.length` / modifier string | `:6201-6203` deletes cleanly once `topology` covers it — that is **T3.3**, not this slice |
| `Viewport3D.vue:5023` hover-vertex cache key | `${id}:${geometryRevision}:${vertices.length}` | `${id}:${topology}:${position}` (Track 3 slice 3) |
| `Viewport3D.vue:1051` live-deform signature; `:1349-1359` onion skin | global revision | unchanged — the umbrella bump already fires |
| `PixelEditor.vue:1203`; `UVEditor.vue:2023` | global revision | unchanged (attribute consumers) |
| `TransformProps.vue:55` mesh-health computed | `void geometryRevision` to force re-eval | key on that object's `topology`; TRS writes must not invalidate it |

#### 3.4.4 Acceptance (tests for the implementing turn)

- A UV-only commit (`performBoxUnwrap`) bumps `attribute`; `topology` and `position` unchanged.
- A position-only commit (vertex move through `runKernelOperation`) bumps `position`; `topology` unchanged.
- A topology commit (extrude, delete face) bumps all three.
- A no-op operation bumps nothing (the `runKernelOperation:487` early-return path).
- Object TRS (`performRotateObject`) bumps no mesh counter.
- Preview bumps counters and skips autosave — `meshResidency.test.ts:101-103` (previously cited as
  `:67-69`) still passes unchanged.
- Undo/redo bumps all counters for every object.
- `geometryRevision` strictly increases in every case above (the umbrella contract).

**Non-goals.** Do not remove `geometryRevision`; it stays the umbrella counter and the public
store field. Do not make the revision map reactive document state — it is derived, never
serialized, and never read by exporters. Do not add per-element (vertex / edge / face)
revisions. Do not rewire `Viewport3D.vue` watchers here (T3.3). Do not split material revision out
of the umbrella.

## 4. The six tracks

Ordered by dependency, not by size. Each track is independently landable and each one
leaves the app green.

### Track 1 — Route the remaining mutation paths through resident commits

**Goal.** Every verb in §2.2 and §2.3 that changes topology or positions goes through the
resident commit contract. After this track, `MeshRepository`'s JSON signature guard is a
*debug assertion*, not a load-bearing mechanism.

**Slices** (each its own PR, each with tests):

1. **`Operations.ts` accepts an injected bridge on every entry point.** Mechanical, and
   smaller than it sounds: 14 functions already build a throwaway kernel locally via
   `const bridge = MeshBridge.meshObjectToEditableMesh(mesh)`. The slice lifts that local
   into an optional trailing parameter with the identical default, exactly as
   `extrudeSelection` (`Operations.ts:39`) and `insetFaces` (`:102`) already do.

   Verified target list (line = the existing local construction): `subdivideFaces` `:153`,
   `pokeFaces` `:201`, `triangulateFaces` `:223`, `flipNormals` `:254`, `deleteElements`
   `:279`, `bevelFaces` `:325`, `mergeVerticesAdvanced` `:366`, `fillFaceFromVertices`
   `:601`, `flattenVerticesOnAxis` `:633`, `dissolveElements` `:658`, `connectTwoVertices`
   `:698`, `cleanupMeshGeometry` `:730`, `bridgeEdgeLoops` `:762`, `gridFill` `:813`.

   Exactly 16 `meshObjectToEditableMesh` call sites exist in the file and 2 are already
   parameters, so the list above is complete. `extrudeFaces` (`:26`) delegates and needs
   nothing. `mergeVertices` (`:243`) also delegates to `mergeVerticesAdvanced`, but review
   found that a caller injecting a bridge through the `mergeVertices` name would have had it
   silently dropped, so it forwards its `bridge` into the callee. No behavior change for
   existing callers; tests stay green.

    **Implementation note (T1.1, landed 2026-09-17).** The 14 call sites use
    `bridge = bridge ?? MeshBridge.meshObjectToEditableMesh(mesh)` placed **after** the
    function's early-return guards — not a default parameter. 12 of the 14 return before
    they ever touch the bridge (`pokeFaces` `:199-201`, `subdivideFaces` `:150-152`, …), so
    an eager default would allocate a kernel on paths that never did. That is an allocation
    -timing change, which is the one thing T1.1 is not allowed to make; the explicit
    assignment is semantically identical on every path that uses the bridge. Verified after
    the edit: 16 `meshObjectToEditableMesh` sites remain (2 defaults `:39`/`:102` + 14
    injected) and `vue-tsc -b` is clean. Do not "fix" the style mismatch with `:39` — the
    difference is the early returns, not an oversight. Post-review correction: `mergeVertices`
   (`:243-245`) forwards `bridge` into `mergeVerticesAdvanced`, so injecting through either
   name reuses one kernel instead of silently dropping the argument.

   **Not in this slice:** the unwrap helpers (`smartUvProject`, `boxUnwrap`, `planarUnwrap`,
   `cylinderUnwrap`, `sphereUnwrap`, `coneUnwrap`, `cubemapCrossUnwrap`, `gridifyQuadIslands`,
   `packUVIslands`) live in `geometry/UVUnwrap.ts`, not `Operations.ts`, and are pure
   `MeshObject` → `MeshObject` transforms (`JSON.parse(JSON.stringify(mesh))`) with no kernel
   to inject. They are attribute-only document writers and belong to slice 4 / T1.4.

2. **Move the remaining `perform*` topology verbs onto `runKernelOperation`.** Convert
   `performBevel`, `performSubdivide`, `performPokeFaces`, `performTriangulate`,
   `performMerge`, `performFillFace`, `performFlatten`, `performFlipNormals`,
   `performBridgeEdges`, `performGridFill`, **plus** `performDelete` (component modes),
   `performDissolve`, `performConnectVertices`, `performCleanupMesh`, and `performAutoMerge`.
   These own their `recordState` and call `replaceMesh` today, so each one keeps its existing
   history entry — do not add a second.

   **`performAutoMerge` is the exception and must not get its own `recordState`.** Its only
   caller is `commitProxyTransform` (`Viewport3D.vue:3283`), which runs at the **end** of a
   gizmo drag, after `recordState('Transform')` at drag start (`:2821`). It is a tail step of
   the Transform transaction, so giving it a history entry would split one Ctrl+Z into two.
   Its real defect is the one this whole track exists for: it goes through
   `mergeVerticesAdvanced` (`Operations.ts:366`) on a throwaway bridge and then
   `replaceMesh`, discarding resident kernel identity. Route it as a *continuation* of the
   transform commit.

   Payoff: uniform validation, uniform `meshEditError` reporting, uniform no-op detection,
   and numeric identity preserved across these verbs.

   **Implementation note (T1.2, landed 2026-09-17).** `runKernelOperation` now takes
   `{ record?, mesh?, applySelection? }`. Object-mode Subdivide still records once, then
   loops `{ record: false, mesh, applySelection: false }`. AutoMerge is
   `{ record: false, mesh, applySelection: false }` — it does not grow the undo stack.
   Component Delete/Dissolve keep `applySelection: false` and `clearSubSelections` only
   after a successful commit. Join/separate, UV, seams, vertex color, and symmetry stay
   out. Identity tests: poke reuses the resident kernel; AutoMerge reuses it without a
   history entry.
3. **Route join / separate through kernels and fix the documented loss.**
   `performJoinMeshes` must preserve `boneWeights` and `seamEdgeIds`; `performSeparateMesh`
   must prune the source `seamEdgeIds` and carry seams to the new object. On kernels this
   becomes a property of the operation instead of a hand-maintained field list.

   **Implementation note (join, landed 2026-09-17).** Core helper `src/core/geometry/MeshJoin.ts`.
   Join appends on a clone of the resident primary (translation bake only), copies
   `boneWeights`/`color`, remaps other-mesh seams onto kernel `edge.seam`, restores into
   the same kernel instance, `publish` + `retain` after the splice. Separate deletes moved
   faces on a source-kernel clone (`MeshTopologyService.deleteFaces`); JSON clone carries
   weights; shared-border seams stay on the source; both-verts-moved seams go with the
   new object. One `recordState` each. Not `runKernelOperation`.
4. **Route the UV family.** Unwrap writes face-corner UVs, i.e. attributes, not topology.
   These should be attribute-only commits: no topology change, `attributesChanged: true`,
   so the viewport does not rebuild buffers it does not need (feeds Track 3). Atlas bake
   still bumps geometry because it remaps UVs used by the render projection.

   **Implementation note (revisions, 2026-09-18).** Store `perform*` currently pass a
   synthesized attribute-only `MeshChange` into `replaceMesh`. That is counter wiring only.
   Resident identity is **unwrap**.
5. **Route the gizmo component drag.** `onGizmoObjectChange`'s vertex/edge/face branch
   (`Viewport3D.vue:3097-3140`) becomes: hold a kernel lease on drag start, write kernel
   positions per move, publish a preview per move, publish the committed result on end.
   History shape does not change (one snapshot per drag). Highest-risk slice; lands only
   after slice 2 so the kernels are already resident.
    **Live symmetry is a tail of this slice, not a slice of its own.** `ModalOperator`
    `.applyLiveSymmetry` (`ModalOperator.ts:215-226`) already passes
    `[...this.ctx.mesh.vertices.values()]`, and `ctx.mesh` is the kernel `EditableMesh`
    (numeric ids: `vertices.get(vId)` `:210`, `edges.get(eId)` `:200`), called from
    `MoveOperator.ts:134`, `RotateOperator.ts:66`, `ScaleOperator.ts:84` — so **G/R/S
    writes no document vertices. Confirmed on 2026-09-17; no work needed.** The one
    document-side call is the gizmo branch itself (`Viewport3D.vue:3208` →
    `applyLiveSymmetry(activeMesh.vertices, …)`), i.e. inside the `:3097-3140` range this
    slice already owns. It moves with this branch or not at all.


6. **Route weight editing.** The `animationStore.ts` weight writers move from
   `mesh.vertices[].boneWeights` to the resident kernel's vertex attributes. Weight paint
   is a per-move preview + commit-on-pointer-up shape, same as the gizmo.
7. **Modifiers.** `evaluateModifiers` stays a pure `MeshObject → {vertices, faces}`
   function in `src/core/geometry/Modifiers.ts` (it is the realtime cage evaluator and
   exporters use it). What changes: **Apply** (`applyMeshModifier` `:862`) runs its result
   through a resident commit instead of a bare `markGeometryUpdated`, so the resident
   kernel is rebuilt once, deliberately, at Apply time — not silently re-imported later.

8. **Seam writes become attribute-only resident commits (T1.8).** Writer:
    `markSelectedEdgesAsSeam` (`projectStore.ts:2181`), `clearSelectedEdgesSeam` (`:2193`),
    `clearAllSeams` (`:2205`). Classification: **attributes**. They assign
    `activeMesh.value.seamEdgeIds` in place — three sites, `:2189`, `:2201`, `:2208` — and
    never call `replaceMesh`, so nothing tells the repository. Seam is kernel state, not a
    document-only extra: `MeshBridge` imports `seamEdgeIds` onto `edge.seam`
    (`MeshBridge.ts:74-77`), exports `e.seam` back (`:188`), `MeshSnapshot` stores it
    (`MeshKernel.ts:48`), and `signature()` hashes it (`MeshRepository.ts:10`). So the
    direct write makes the document disagree with the resident kernel and the next
    `acquire` re-imports (`MeshRepository.ts:22-27`), discarding resident seam flags
    mid-session. Path: resident commit, `attributesChanged: true`, no topology change —
    **verified**: `attributes()` (`MeshTransaction.ts:37-40`) includes `e.seam`/`e.sharp`, so
    a pure seam edit does raise the flag and is not swallowed by `runKernelOperation`'s
    no-change early return (`projectStore.ts:480`). Two corrections for the implementer:
    (1) the writer-local `recordState` (`:2188`, `:2200`, `:2207`) must be **removed** when
    wrapping — `runKernelOperation` records itself at `:483` *after* validation, so keeping
    both pushes a second, empty entry per toggle; the existing no-op guard survives as the
    `:480` early return. (2) The lambda must return an `OperationResult` whose `mesh` is the
    projection (`Operations.ts:15-16`, helper as used at `MeshResidency.test.ts:66`), because
    `:489` publishes that projection back onto `activeMesh.value.seamEdgeIds`.
    **Do not only assign `document.seamEdgeIds`.** `editMesh` diffs `staged.mesh`
    (`:478-480`). A document-only write leaves `edge.seam` unchanged, so the commit no-ops
    or, if you still project, `editableMeshToMeshObject` exports the *old* kernel flags and
    wipes the write. Set `edge.seam` on `bridge.mesh` (document edge id →
    `undirectedEdgeId` / numeric verts). Same rule for T1.9: write kernel vertex `color`,
    not only `v.color` on the Pinia mesh. Row 14.

   **Implementation note (T1.8, landed 2026-09-17).** Mark/clear/clear-all drop their
   local `recordState` and call `runKernelOperation` with `{ applySelection: false }`.
   Kernel write is `setSeamEdges` / `clearAllSeamEdges` in `Operations.ts` (`edge.seam`
   on `bridge.mesh`, then project). One undo entry per command. Identity test in
   `meshResidency.test.ts`.

9. **Vertex color writes become attribute-only resident commits (T1.9).** Writer:
    `src/components/inspector/MaterialProps.vue` — nine `v.color` assignments (`:767`,
    `:773`, `:779`, `:798`, `:808`, `:817`, `:852`, `:870`, `:880`) across the gradient bake
    (`:649-762`), Fill Selected (`:788`), Fill Entire Mesh (`:803`), Reset (`:813`), Smooth
    (`:822`), Quantize (`:863`), Invert (`:876`). Classification: **attributes**. Each
    owning function already does `recordState` → mutate → `markGeometryUpdated()`
    (`:790-800`, `:805-810`, `:815-819`, `:859`, `:872`, `:882`). `v.color` **is** in
    `signature()` (`MeshRepository.ts:9`), so this is the same defect shape as T1.4:
    attribute-only writers that put the document ahead of the kernel for no reason. Path:
    resident commit, `attributesChanged: true`, no topology change — the viewport stops
    rebuilding buffers to change a color. Land directly after T1.4; treat the two as one
    idiom. Row 14.
    **T1.9 needs a store entry point; the component cannot commit.** Every `v.color` write is
    inline in `MaterialProps.vue` against `activeMesh.value.vertices` — the *document*
    (`:797-799`, `:807-809`, `:816-818`, `:845-857`, `:865-871`, `:878-881`, plus
    `applyColorWithBlendMode`'s three sites `:767`/`:773`/`:779`, reached per vertex from
    `:688`). Verified: no store-level vertex-color API exists today, so this slice adds one,
    with the same shape as slice 8 — mutate `bridge.mesh` vertex `color`, project, publish. The
    kernel plumbing already exists in both directions (`MeshBridge.ts:40` imports
    `vertex.color`, `:149` exports it, `attributes()` hashes it at `MeshTransaction.ts:38`), so
    a document-only loop leaves kernel colors stale and the commit either no-ops at `:480` or
    exports the *old* colors and wipes the write. Two consequences: drop the component-local
    `projectStore.recordState` (`:649`, `:790`, `:805`, `:815`, `:824`, `:864`, `:877`) on the
    same single-record rule as slice 8, and commit **once per command** — `applyColorWithBlendMode`
    runs inside a per-vertex loop (`:688`), so a per-vertex commit would be the gizmo-drag shape,
    not a menu verb's.

10. **Object symmetry verbs split by what they actually write (T1.10).**
     - `performFlipAxis` (`projectStore.ts:1246`) → `flipMeshGeometry`
       (`ObjectSymmetry.ts:6-14`): negates `position[axis]` **and** reverses `f.vertexIds`
       and `f.uvs`. That is positions plus winding plus corner-UV order — **not** TRS-only
       and not attribute-only. Path: resident commit, and it must be described as a
       position change with a topology consequence (winding), never smuggled in as
       `attributesChanged`.
     - `performRotateObject` (`:1255`) → `addObjectRotation` (`ObjectSymmetry.ts:24-26`)
       writes only `mesh.rotation[axis]`, and `signature()` deliberately excludes object
       transforms — see its own comment at `MeshRepository.ts:7`, "Selection and object
       transforms are editor state, not kernel mutations". **Verified: it cannot invalidate
       the kernel. Stays group (b), TRS-only, no routing.** It keeps `markGeometryUpdated`
       because the viewport still has to redraw.
     - `performDuplicateMirror` (`:1263`) → `cloneMeshObject` (`:1228`) +
       `flipMeshGeometry` + `meshes.value.push` (`:1272`). **Object creation**, same class
       as separator output and primitive creation. Path: whole-object replacement; keep the
       `replaceMesh` behaviour and attach the §6.3 reason comment. Note `cloneMeshObject`
       machine-renames every vertex and face id (`:1234-1242`), so the copy's numeric kernel
       identity is new by construction — do not try to inherit it.
     Row 14.

11. **Modifier stack writes are attribute-only; only Apply rebuilds the kernel (T1.7b,
     sub-bullet of slice 7).** Writer: `addModifier` (`:845`), `removeMeshModifier`
     (`:869`) — they set `mesh.mirror` / `subdivision` / `solidify` and call
     `markGeometryUpdated()`. Classification: **attributes**. Those three fields are *not*
     in `signature()`, so they cannot push the document ahead of the kernel — which is
     exactly why they need no lease and no re-import. They do still change drawn geometry,
     because `evaluateModifiers` runs inside `meshToThreeGeometry` (`Converters.ts:388`), so
     they belong with Track 3's *attribute* counter, not the topology one. Slice 7 (Apply,
     `:862`) stays the only modifier writer that rebuilds the kernel. Row 12.


**Acceptance.**
- A test asserting `project.acquireEditableMesh(project.activeMesh!).mesh` **is the same
  object reference** before and after each routed one-shot verb (identity preserved,
  no re-import). `stores/meshResidency.test.ts:24-25` already does exactly this for Extrude.
- A test that each verb produces exactly one history entry and reports `meshEditError` on
  failure rather than throwing.
- Join preserves `boneWeights`; separate leaves no orphaned `seamEdgeIds`.

**Non-goals.** Do not delete `Operations.ts`. Do not delete `MeshBridge`. Do not change
`.psxproj`. Do not touch `Viewport3D.vue` beyond the gizmo slice.


### Track 2 — Shared geometry adapter for render / pick / snap

**Goal.** Stop projecting a full `MeshObject` just to draw, and stop having three code
paths answer "what are this object's triangles and vertices" three different ways.

**Current state.** `meshToThreeGeometry` (`Converters.ts:378`) builds every buffer from
`MeshObject` and calls `evaluateModifiers` internally (`:388`).
`buildSelectionOverlayGeometries` (`:595`) and `updateThreeGeometryAttributes` (`:661`)
re-derive the same vertices again. Picking uses `hoverVertexLookup` over document vertices
(`Viewport3D.vue:5022`); snap reads document edges.

**Slices.**

1. **Introduce a read-only projection type in `src/core/geometry/`** — e.g.
   `MeshRenderView` holding `positions`, `triangles`, `faceIndexMap`, `vertexIndexMap`, and
   the shade/skin context it was built with. It is produced by **one** function from either
   a document projection or a kernel snapshot, so render, overlay, pick, and snap all read
   the same view. It is not a new mesh representation: typed arrays and index maps only,
   never persisted, never mutated by a tool.
2. **Make the view cacheable per object + revision.** `rebuildMeshes` currently clears
   every model and loops all meshes on any change (`Viewport3D.vue:1445-1474`). With a
   per-object view plus Track 3's counters, the loop becomes "rebuild only objects whose
   view key changed".
3. **Move picking/snap onto the view.** `hoverVertexLookup`'s cache key
   (`Viewport3D.vue:5023`) currently mixes a global revision with `vertices.length`; with
   the view it keys on that object's own view key. Pick results still return **document**
   ids — the id space at the UI boundary does not change.

**Acceptance.**
- One geometry build per object per commit (assert via a `MeshRenderView` cache test).
- Picking a vertex while a modal operator previews still returns the document id the
  outliner and the selection arrays expect.
- Still no `Object3D` in any store.

**Non-goals.** Do not split `Viewport3D.vue` into Renderer/Picker/Painter components. Do
not move the Three.js scene out of the component. Do not remove `meshToThreeGeometry`;
exporters keep using it.


### Track 3 — Per-object topology / position / attribute revisions

**Goal.** Replace the one global `geometryRevision` counter with per-object, typed
revisions, so a commit only invalidates what it actually changed.

**Current state.** `geometryRevision` is a single `ref<number>` (`projectStore.ts:113`).
It is bumped wholesale by `markGeometryUpdated` (`:1440`) and by the preview branch of
`publishEditableMesh` (`:861`), and it is exported (`:2559`) so UI code bumps it directly — 38
call sites inside `projectStore.ts` and 60 outside (§3.4.2). Viewport consumers depend on it in
four places: the live deform signature (`Viewport3D.vue:1051`), onion skin (`:1349-1351`,
`:1359`), the hover vertex cache key (`:5023`), and the main rebuild watcher (`:6198`). That same
watcher also fingerprints *all* meshes as one string (`:6201-6203`) — a hand-rolled workaround for
the missing per-object data. UV/attribute consumers: `PixelEditor.vue:1203`,
`UVEditor.vue:2023`; inspector: `TransformProps.vue:55`.

**Write contract (docs-only, landed 2026-09-17).** The counter shape, bump table, legacy
call-site classification, consumer mapping and acceptance list live in **§3.4.1–§3.4.4**. The
slices below implement that contract; they do not redefine it.

**Why this is not just performance.** One global counter cannot distinguish "something
changed" from "this object's topology changed", so:
- Track 2 cannot cache per object;
- a UV-only commit forces full buffer rebuilds even though positions and topology are
  untouched;
- the viewport has to stat-compare every mesh to guess what moved.

**Slices.**

1. **Add the counters next to the existing one.** A plain `Map<objectId, { topology,
   position, attribute }>` of numbers on the project store, plus the existing
   `geometryRevision` still bumped on every commit. Every current watcher keeps working;
   nothing else changes. Entry lifecycle (restore, removal, new object) follows §3.4.1 rules
   6–7.
2. **Populate them from `MeshChange`.** `publishEditableMesh` and `replaceMesh` receive the
   change summary from `editMesh` (`MeshTransaction.ts:23-25`, `:62`) and increment only the
   matching counters, with `topologyChanged` implying all three (§3.4.1 rule 3).
   `describeMeshChange` (`:27`) already computes `topologyChanged` / `positionsChanged` /
   `attributesChanged` from real snapshots — the store just has to stop discarding them.

   **Implementation note (revisions, landed 2026-09-18).** Non-serialized
   `Map<objectId, { topology, position, attribute }>` on `projectStore`. `runKernelOperation`
   passes `result.change` into `publishEditableMesh`. A missing change still means all three
   (join/separate). UV family currently synthesizes attribute-only on `replaceMesh` (counters
   only; resident commit is **unwrap**). `performRotateObject` is umbrella-only. Undo/redo
   calls `invalidateAllGeometryRevisions`. `markGeometryUpdated` remains the legacy
   attribute+umbrella path; `MaterialProps.vue` material `@change` rows are still on that path.

   2b. **Classify the legacy `markGeometryUpdated` call sites** per §3.4.2 before the counters
   are trusted: non-mesh sites (material edits) must stop bumping mesh revisions, and the
   `v.color` / `boneWeights` sites are **unverified** until checked by grep.
3. **Switch the viewport watchers to per-object keys** one at a time, starting with the
   hover vertex cache (`:5022`) and onion skin (`:1349`), then the main rebuild loop.
   Remove the `vertices.length` / `faces.length` fingerprint in `:6201-6203` once topology
   counters cover it.
4. **Keep the preview/commit split.** `publishEditableMesh(document, bridge, preview = true)`
   must keep skipping autosave; previews still move counters. Commits call `triggerAutosave`
   (they no longer go through `markGeometryUpdated`).

**Acceptance.** Full list in §3.4.4. The four plan-level claims:
- A UV-only commit (e.g. `performBoxUnwrap`) increments `attribute` and leaves `topology`
  and `position` unchanged — asserted in a test.
- Rotating an object (TRS) bumps no mesh revision.
- Existing `watch(geometryRevision)` consumers (`PixelEditor.vue:1203`,
  `UVEditor.vue:2023`) behave identically.
- `stores/meshResidency.test.ts:101-103` (preview moves the revision) still passes.

**Non-goals.** Do not remove `geometryRevision`; it stays the umbrella counter and the
public store field. Do not make the revision map reactive document state — it is derived,
never serialized. Do not invent counters for material state (§3.4.2).

### Track 4 — Capture resident topology in history

**Goal.** Undo/redo restores the same kernel identity it had before, not a re-derived
approximation, so numeric edge/corner identity survives.

**Current state.** `captureSnapshot` deep-clones the document with
`JSON.parse(JSON.stringify(projectStore.meshes))` (`historyStore.ts:100`) and
`applyMeshDocumentSlice` assigns a fresh clone (`applyMeshDocument.ts:24-32`). Document ids
survive; numeric kernel ids do not. Recovery today is the signature re-import in
`MeshRepository.acquire` plus edge-id reuse by `undirectedEdgeId`
(`MeshBridge.ts:44-52`) — which is why undo works, and also why it cannot be trusted to
preserve *deleted-then-recreated* edge and corner identity.

**Slices.**

1. **Store a kernel snapshot per object alongside the existing payload.** `MeshSnapshot`
   already exists (`MeshKernel.ts`), is cheap relative to the JSON clone, and is exactly what
   `editMesh` uses for rollback (`MeshTransaction.ts:53`). Add it **beside** the `meshes`
   payload — never instead of it, because `.psxproj` and the exporters still read the
   document.
2. **Restore both, in the right order.** Restore the `MeshSnapshot` into the resident kernel
   and mark the repository entry authoritative **before** the document clone is published;
   otherwise the signature guard overwrites the restored kernel on the next acquire.
3. **Scope the cost.** History entries carry the Track 3 change summary, so only entries that
   actually touched topology/attributes need the kernel snapshot. Entries that only touch
   materials, palette, or armature keep today's cheap payload.

**Acceptance.**
- New test: extrude, record a new edge's numeric id, undo, redo, assert the restored kernel
  contains the **same numeric edge id and corner ordering** — not merely an edge between the
  same two document vertices.
- `MeshResidency.test.ts` (map-free identity, deep attribute isolation) and
  `stores/meshResidency.test.ts` (undo/redo, rejected edits without history, 1.0 parsing)
  keep passing unchanged.
- The history stack policy stays single: if kernel snapshots need a cap, it is the same cap
  and the same trim path as `meshes`, not a second policy.

**Non-goals.** Do not persist kernel snapshots to disk. Do not change `.psxproj`. Do not
make history a second authority for the *document*.


### Track 5 — Format gate: no sharp/crease or loose edges until an explicit version bump

**Goal.** Stop attribute work from silently creating an unserializable state.

**Current state.** `KERNEL_UNIFICATION.md:11` is explicit: edge sharp flags survive kernel
snapshots but are **not serialized** and are not exposed as a document action. `.psxproj`
is `1.0` with `appName: 'PSXModeller'`, and `ProjectSerializer.migrateRaw` only fills
missing 1.x fields (`INVARIANTS.md:82`). `MeshObject` deliberately has no `edges[]` list
(`INVARIANTS.md:10`); edge ids are derived at runtime by `getMeshEdges()`. So a kernel
sharp flag has nowhere to live in the document and would be lost on save/reload — with no
error to tell the user.

**The gate (a decision, not a task list).**

1. **Do not add** persistent sharp/crease attributes, loose-edge creation, or any new
   per-edge or per-corner document state while the format is `1.0`.
2. **When it is time**, the change is one PR in this order: bump `.psxproj` version → add
   the field to `MeshObject` → extend `ProjectSerializer.migrateRaw` → extend `MeshBridge`
   both directions → extend the round-trip test. `INVARIANTS.md` and `docs/CODEMAP.md:139`
   are updated in the same PR.
3. **In the meantime** sharp lives in the kernel layer only (snapshots, undo) and is never
   exposed in UI or export.

**Acceptance.** A guard asserting every `.psxproj` fixture still reports version `1.0` and
that no document field exists which `ProjectSerializer` does not write. The existing
serializer round-trip test is the place.

**Non-goals.** This track is a hold, not a feature. It produces no new attributes.

### Track 6 — Finish attribute propagation

**Goal.** "Attributes always survive" becomes a checkable claim with a named coverage
matrix, instead of a hope.

**Current state.** `AttributeInterpolator` (`src/core/mesh/attributes/AttributeInterpolator.ts`)
provides `copyVertex`, `interpolateVertex`, `interpolateEdgeUV`, and the 4-influence
normalized weight merge. It is imported by exactly **four** kernel modules:
`ExtrudeKernel.ts:4`, `InsetKernel.ts:5`, `KnifeKernel.ts:6`, `TopologyOps.ts:4`. It is
**not** used by `MergeKernel`, `DissolveKernel`, `EdgeBevelKernel`, `MeshTopologyService`
(the merge/dissolve/subdivide paths it hosts), or `src/core/geometry/Modifiers.ts`. Those
are precisely the operations `KERNEL_UNIFICATION.md:23` names as incomplete.

**Slices.**

1. **Write the matrix down.** A table of operation × attribute (`color`, `boneWeights`,
   corner `uvs`, `materialIndex`, `seam`, `sharp`), each cell marked *preserved /
   interpolated / intentionally dropped / missing*. This converts the claim into a test list.
2. **Fill the missing cells in dependency order:** merge → dissolve → bevel → subdivision →
   face-interior knife → modifier evaluation. Each is a kernel change plus a
   `MeshResidency.test.ts`-style test: set color/weight/seam on the input, run the
   operation, assert the expected value on the output.
3. **Enforce the four-influence cap.** `AttributeInterpolator` already caps and normalizes
   (`INVARIANTS.md:75`). Any new interpolation path goes through it rather than
   reimplementing a weight merge, so the cap cannot drift.
4. **Modifier evaluation is the odd one out.** `evaluateModifiers`
   (`src/core/geometry/Modifiers.ts:42`) runs on `MeshObject` and cannot see kernel
   attributes at all. Until Track 1.7 routes Apply through a resident commit, any attribute
   behaviour there is best-effort. Do not claim otherwise in docs until it is routed.

**Acceptance.** A per-operation test asserting preservation/interpolation of color, weights,
corner UVs, and seam flags. The matrix is the index of those tests; a cell with no test is
marked, not assumed.

**Starting worksheet.** Only the `Interpolator` column is verified here (from the import
graph). `?` means "read the kernel and decide before you claim it" — do not fill a `?` in
from expectation.

| Operation | Module | Interpolator imported | color | boneWeights | corner uvs | materialIndex | seam | sharp |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Extrude | `ExtrudeKernel.ts` | yes (`:4`) | preserved | preserved | ? | ? | ? | ? |
| Inset | `InsetKernel.ts` | yes (`:5`) | preserved | preserved | ? | ? | ? | ? |
| Knife split | `KnifeKernel.ts` | yes (`:6`) | interpolated | interpolated | interpolated | ? | ? | ? |
| Split edge / loop cut | `TopologyOps.ts` | yes (`:4`) | interpolated | interpolated | interpolated | ? | ? | ? |
| Merge | `MergeKernel.ts` | no | ? | ? | ? | ? | ? | ? |
| Dissolve edge / vertex | `DissolveKernel.ts` | no | ? | ? | ? | ? | ? | ? |
| Bevel | `EdgeBevelKernel.ts` | no | ? | ? | ? | ? | ? | ? |
| Subdivide | `MeshTopologyService.ts` | no (direct) | ? | ? | ? | ? | ? | ? |
| Faces / fill / bridge / grid fill / poke / triangulate | `MeshTopologyService.ts`, `Operations.ts` | no (direct) | ? | ? | ? | ? | ? | ? |
| Modifier evaluation | `geometry/Modifiers.ts` | no | — | — | — | — | — | — |
| Modifier Apply | `projectStore.ts:862` | no | — | — | — | — | — | — |

`KERNEL_UNIFICATION.md:12` already claims split-edge seam/sharp propagation and the
4-influence weight cap, and `MeshResidency.test.ts` covers split seam propagation. Treat the
`seam` / `sharp` cells for the four Interpolator modules as the *known-good* column and
verify rather than re-implement.


**Non-goals.** Do not build a generic attribute framework. Do not add custom corner
attributes. Do not pursue accelerated topology queries — that is later work.


## 5. Sequencing and what each step proves

Land in this order. Each row must finish green on `npm run typecheck`, `npm test`, and
`npm run build` before the next begins (`CONTRIBUTING.md:58`, `docs/PRODUCTION.md:33`).

| # | Slice | What it proves |
| :--- | :--- | :--- |
| 1 | Operations.ts bridge injection (T1.1) | the commit boundary accepts a resident bridge with no behavior change |
| 2 | Lease rule (§3.2) | a held kernel cannot be silently clobbered mid-session |
| 3 | Per-object revisions, additive (T3.1–T3.2; contract in §3.4, incl. legacy call-site classification §3.4.2) | change summaries reach the store; nothing reads them yet |
| 4 | Route remaining topology verbs (T1.2) | kernel identity survives one-shot verbs |
| 5 | Route UV family as attribute-only (T1.4) | attribute commits stop forcing topology rebuilds |
| 6 | `MeshRenderView` + per-object cache (T2) | one geometry build per object per commit |
| 7 | Switch viewport watchers to per-object keys (T3.3) | the fingerprint hack at `Viewport3D.vue:6201` deletes cleanly |
| 8 | Join/separate fixes (T1.3) | weights and seams survive both verbs |
| 9 | Kernel snapshot in history (T4) | numeric identity survives undo/redo |
| 10 | Gizmo drag on the kernel (T1.5) | the last interactive writer stops touching the document |
| 11 | Weight editing on the kernel (T1.6) | rig writers stop invalidating the kernel |
| 12 | Modifier Apply as resident commit (T1.7) | modifier output is validated once, deliberately |
| 13 | Attribute matrix + fills (T6) | "attributes survive" is a testable claim |
| 14 | Remaining attribute-only writers on resident commits (T1.8, T1.9) + symmetry split (T1.10) | no writer leaves the document ahead of the kernel; §6.2 can demote the signature |

Two ordering constraints are load-bearing:

- **4 before 9.** History can only capture kernel topology that actually exists; until the
  one-shot verbs keep numeric identity, a kernel snapshot restores something the next verb
  will discard.
- **3 before 6 and 7.** A per-object render cache needs a per-object invalidation signal.
  Without Track 3 the cache key degrades to the global revision and caches nothing.

Everything else can be reordered or paused without stranding the codebase.

One more, weaker than the two above: **14 is the precondition of §6.2.** "Demote the JSON
signature" is only true when no writer leaves the document ahead of the kernel, and rows
4, 5, 10, 11 and 14 are the complete list of writers that still do. Rows 10 and 11 are
already last for other reasons; row 14 is the cheap tail, and it is what makes §7's third
bullet checkable rather than aspirational.


## 6. Guards that keep this from regressing

Put these in place as the tracks land, not all at once.

1. **A dev-only assertion that the resident kernel was not re-imported.** After a commit,
   `MeshRepository` compares its entry identity with the bridge it was handed. Outside dev
   builds it is a no-op. This is the highest-value guard: it fails loudly the moment a new
   verb is written the old way.
2. **Demote the JSON signature.** Once Track 1 lands, `MeshRepository.signature()`
   (`MeshRepository.ts:6-12`) is a debug check, not the correctness mechanism. Keep the
   function, gate the call, and update the line in `KERNEL_UNIFICATION.md:25` that currently
   describes it as a linear-time interim strategy.
3. **`replaceMesh` call-site audit.** Every remaining call gets a one-line comment naming why
   whole-object replacement is correct there (import, primitive, separate output). A
   `replaceMesh` call with no reason is a review smell, not a build error.
4. **No new direct document writes.** `mesh.vertices`, `mesh.faces`, `mesh.seamEdgeIds` are
   written only by `projectStore` + `MeshRepository` + the bridge. `animationStore` stops
   writing them once Track 1.6 lands.
5. **`recordState` before mutate, previews excluded.** Modal tools and drag sessions snapshot
   once on start and restore on cancel; they must not `recordState` per pointer move
   (`INVARIANTS.md:23`). Tracks 1.5 and 1.6 are where this is easiest to get wrong.
6. **Revisions only from `MeshChange`.** No hand-bumped counters in new code. If a writer
   cannot describe its change, that is the missing piece — not a reason to bump globally.
   The 98 existing `markGeometryUpdated` call sites are grandfathered until §3.4.2 classifies
   them: until then they keep the umbrella bump and must not be copied as a pattern.


## 7. Definition of done

The program is complete when all of these are true and testable:

- [ ] Every verb in §2.2 and §2.3 commits through the resident kernel, or is explicitly
      documented as a whole-object replacement with a stated reason.
- [ ] No UI or editor path outside `projectStore` + `MeshRepository` writes `vertices`,
      `faces`, or `seamEdgeIds`.
- [ ] `MeshRepository.acquire` no longer needs to reconcile by content, because no writer
      leaves the document ahead of the kernel — the signature becomes a dev assertion.
- [ ] Render, overlay, pick, and snap read one shared view; a commit rebuilds only the
      objects whose revisions changed.
- [ ] Revisions are per object and per concern; `geometryRevision` is their umbrella, not
      the only signal.
- [ ] Undo/redo restores numeric edge/corner identity, verified by an id-equality test.
- [ ] The attribute matrix has a test per non-empty cell; every "missing" cell is named in
      the docs rather than assumed away.
- [ ] `.psxproj` still reports version `1.0` and `appName: 'PSXModeller'`, and no document
      field exists that the serializer does not write.
- [ ] `npm run typecheck`, `npm test`, `npm run build` stay clean throughout — no track
      lands as a broken intermediate.

When that holds, `MeshBridge` is still in the codebase and still the only conversion — but
it converts a **projection**, not a competing authority. That is the point. Deleting it is a
separate, later decision that only becomes safe once nothing can write the document behind
the kernel's back.

## 8. What this plan deliberately does not do

- It does not split `projectStore.ts` or `Viewport3D.vue`. They are integration hubs; the
  fix is a write contract, not smaller files.
- It does not propose a new store, a state machine library, an event bus, an i18n layer, or
  a component library.
- It does not add `EDITOR_EVENTS.GEOMETRY_CHANGED` or any store-to-store data event. The
  viewport keeps watching revisions.
- It does not treat `Viewport3D.vue`'s line count as a defect, and it does not propose a
  big-bang Renderer/Picker/Painter extraction as a first step.
- It does not replace `MeshObject` with `EditableMesh` as "the only source of truth". Dual
  ownership is removed by routing writers, not by deleting the bridge.
- It does not add persistent sharp/crease or loose edges before a `.psxproj` version bump
  and `migrateRaw` (Track 5).
- It does not claim multi-object transforms are missing. The gizmo already uses
  `selectedMeshIds` with a combined centroid (`applyObjectMeshesFromProxyDelta`,
  `Viewport3D.vue:2773`) and `ModalOperator.targetMeshIds` exists. The remaining gap is
  specific: writers that bypass the kernel, enumerated in §2.
- It does not touch Electron IPC or mesh math placement (`desktopApi.ts` stays the only
  file I/O path; `electron/` does no mesh math).

## 9. Relationship to the other docs

| Doc | Relationship |
| :--- | :--- |
| `docs/KERNEL_UNIFICATION.md` | This plan is the *sequencing and enforcement* for its "Remaining migration" section. Its "Implemented boundary" list is the ground truth for what already ships. |
| `docs/ARCHITECTURE.md` | Layers and store ownership are unchanged. Its "Modeling kernel and document projection" section stays accurate; §3.1 only adds the commit contract. |
| `docs/INVARIANTS.md` | Every track preserves these. Track 1 routes writers *to* the validation these invariants already require. |
| `docs/MODELING_OPERATORS.md` | Gains the "resident commit" contract wording and the Track 6 attribute matrix. Its operator rules (one modal operator, snapshot on cancel, no per-move history) do not change. |
| `docs/PRODUCTION.md` | Tracks 4 and 6 add the tests that make its attribute-survival statements literal. |
| `CONTRIBUTING.md` | The layer order (types → core → store → input → UI) is the required PR shape for every slice here. |
| `docs/SUGGESTIONS_AND_IMPROVEMENTS.md` | Earlier document, different scope. Where it conflicts with this one on kernel facts, this one is verified against code and it is not. |

