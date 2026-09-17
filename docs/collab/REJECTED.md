# Rejected / stale

Do not put these on `BACKLOG.md` again unless you can show the code changed.

| Claim | Why rejected |
| :--- | :--- |
| **`performAutoMerge` is missing a `recordState` and should get one** | Verified wrong 2026-09-17. Its only caller is `commitProxyTransform` (`Viewport3D.vue:3283`), at the **end** of a gizmo drag; `recordState('Transform')` already ran at drag start (`Viewport3D.vue:2821`). Adding one would split a single Ctrl+Z into two. Its real defect is the throwaway bridge (`Operations.ts:366`) + `replaceMesh` (`projectStore.ts:1090`). No other `autoMerge` reference exists outside `projectStore` / `Viewport3D` / `types/tools.ts`. |
| The UV unwrap helpers are `Operations.ts` entry points needing a `bridge` parameter | They live in `geometry/UVUnwrap.ts` (`smartUvProject` `:534`, `boxUnwrap` `:254`, …) and are `MeshObject` → `MeshObject` with no kernel to inject. Attribute-only writers; T1.4, not T1.1. |
| Split `projectStore` / `animationStore` as the first architecture move | Hubs on purpose. `CONTRIBUTING.md` / `docs/PRODUCTION.md`: no drive-by rewrite. Extract only while moving a mutation path. |
| Rewrite `Viewport3D.vue` into Renderer/Picker/Painter services as a cleanliness pass | ~7680-line hub. Extract as a side effect of K2, not a rewrite. |
| Delete `MeshBridge`; make `EditableMesh` the JSON document now | Remaining writers still edit `MeshObject`. Dual-ownership bugs. |
| `xstate` / Storybook / vue-i18n / TypeDoc / new CSS system | No new framework. |
| Store isolation via `EDITOR_EVENTS` | That bus is UI commands (`requestModalTool`, camera, pie). Pinia store-to-store calls are allowed. |
| `EDITOR_EVENTS.GEOMETRY_CHANGED` | Does not exist. Viewport watches `geometryRevision`. |
| `Viewport3D.vue` is ~700 lines | It is 7680. |
| `Viewport3D.vue` is 7079 lines / `projectStore.ts` is 2441 lines | Measured 2026-09-17: **7680** (317,577 bytes, LF) and **2676** (96,462 bytes, CRLF). The 7079/2441 pair came from an early analyst pass and is wrong. |
| poke / triangulate / bridge / gridFill / flatten still mutate `MeshObject` by hand | They already go through `MeshTopologyService`. |
| Multi-object transforms missing | Gizmo + `ModalOperator` already iterate `selectedMeshIds`. |
| GLB skeletal animation import missing / untested | `GltfImport.ts` + `GltfRoundtrip.test.ts`. |
| No autosave | Debounced `triggerAutosave` (~1.2s) + recovery banner. |
| `deleteMesh` does not select another mesh | Assigns `meshes[0]` or `''`. Empty-scene UX only. |
| Every undo clones all `PixelBuffer`s | `projectStore.recordState` defaults `includeTextures` to false. |
| `LoopCutOperator` has no tests | `src/core/operators/loopCut/LoopCutOperator.test.ts`. |
| Reorder modifier stack | Fixed by design: Cage → Mirror → Subdiv → Solidify (`docs/MODIFIERS.md`). |
| `PrimitiveTransform` is dead | Used by `projectStore` placement. |
| Gitignore `.tmp_bb/` | Already ignored. |
| `console.log` litter in `src/` | None found (2026-09-17). |
| Electron sandbox / CSP / crash path / write traversal unverified | Implemented in `electron/main.mjs`. |
| Add `'unsafe-eval'` CSP to `index.html` | Packaged CSP is stricter. Do not weaken it. |
| Vue mount tests of `Viewport3D` / `HeaderMenu` as the testing gap | Tests belong next to kernels / operators / I/O. |
