# Production readiness

PolyEcho ships as a **desktop app** (Electron). The editor is still the same Vite SPA. “Production ready” here means: a stranger can install the windowed app, finish Model → UV/Paint → Rig → Animate → export to disk, undo does not corrupt the document, and CI catches kernel/I/O regressions. `npm run dist` builds an installer. CI typechecks, tests, `vite build`, and on Windows packs an unpacked Electron app.

**In-repo gate: complete.** Godot / Unity / Blender are not installed or booted in CI. The character GLB is Khronos-validated (`gltf-validator`, 0 errors). Opening it in a DCC is a studio visual check, not a missing file or missing exporter.

## Done in-repo

- `npm test` — Vitest + happy-dom on core invariants (edge ids, mesh bridge, `.psxproj` parse, OBJ/GLB round-trip, UV islands, auto-skin, G/R/S numeric evaluate, keymap copy/paste, PixelBuffer clone, history mesh/paint undo). Canvas 2D is stubbed in `src/test/canvas2dStub.ts`.
- GitHub Actions CI: typecheck, tests, production renderer build, Windows unpacked Electron pack.
- `.psxproj` load rejects invalid JSON, unknown versions, and faces whose `uvs` length ≠ `vertexIds`.
- Vue `errorHandler` + `unhandledrejection` log to the console and show the last error in the status bar (click to dismiss).
- Vertex merge keeps face `uvs` aligned with `vertexIds` (`MergeKernel` via `mergeVertices` / `mergeVerticesAdvanced` and `MeshTopologyService.merge*`). Edge dissolve uses `DissolveKernel`. Vertex dissolve uses `MeshTopologyService.dissolveVertex` (valence-2, UV-aligned). Connect / subdivide (shared edge verts, Number of Cuts + Smoothness; object mode = whole mesh) / poke / triangulate / fill / bridge / grid-fill / cleanup / delete / flatten / flip-normals / extrude / inset / bevel one-shots use kernels or `MeshTopologyService`. Edge delete parses undirected edge ids. GLB import reads quaternion tracks back into Euler keys and binds imported materials (textures when the loader exposes a canvas/`toDataURL` image). `.psxproj` serialize↔deserialize is tested, including the textures library. OBJ export asserts `vt` lines. Autosave `ProjectStorage.loadProject` rejects UV-mismatched meshes.
- `.psxproj` 1.0 is frozen; `migrateRaw` accepts omitted version/`appName` and fills empty armature/clips. Unknown versions still reject.
- Uncaught errors (Vue, `window.error`, unhandledrejection) show a dismissible **Crash** chip in the status bar. On desktop they also append to `%APPDATA%/polyecho/crash.log` (File → Open Crash Log).
- Desktop close asks Save / Don't Save / Cancel when the document is dirty. Cancel or a failed Save keeps the window (renderer `cancelClose`). A hung renderer is force-closed after 8s. The window title shows `*` until File → Save. Window size is restored on last launch. File → Open Recent lists the last eight `.psxproj` files. Double-click / argv launch opens a project. Save/Open/Export dialogs remember the last folder. File → Show Project in Folder. Electron's File/Edit/View bar is hidden. The installer can associate `.psxproj` and choose an install directory.
- Unused `InputRouter` / leftover `Keymap.ts` removed. Copy/paste is on `keymapStore`. History paint undo + `textureRevision` covered with a 2D canvas stub (not a browser GPU canvas). Unused Dockview layout and `canvas-confetti` are not in the renderer bundle.
- Electron window on Windows: `npm run dev` keeps Vite on :5180 and four Electron processes after launch. `npm run dev:web` is the same SPA in a browser tab. Firefox is not the product target. Crash log on disk is not a remote crash reporter.
- Windows NSIS installer: `npm run dist` runs `icon` then `build` then electron-builder. App icon is `build/icon.ico`. Close the running app before packaging if `release/win-unpacked` rename hits `EPERM`.
- MIT `LICENSE`. Packaged app is offline (no Google Fonts CDN). Packaged Chromium gets a restrictive CSP. `desktop:writeFile` only overwrites paths from Save/Open/Recent/argv. CI typechecks, tests, builds, and on Windows packs `electron-builder --win dir`.
- Engine hand-off GLB (`samples/engine-handoff.glb` via `npm run handoff:glb`): unique names, skin joints + weights, UVs, Walk + Idle channels, marker `extras` (`name` / `frame` / `time`), embedded 8×8 PNG, **Khronos `gltf-validator` reports 0 errors**.

## Outside this repo

- Visual import of that GLB in Godot 4 / Unity / Blender (`docs/ENGINE_HANDOFF.md`). Humanoid retarget, Godot `.tres`, and Unity prefabs are not claimed.
- Do not treat `Viewport3D.vue` / `projectStore.ts` drive-by refactors as “hardening.”

## Verify before you call a build shippable

```bash
npm run typecheck
npm test
npm run build
```

In the running app: new cube → edit → undo/redo → UV unwrap → paint a pixel → undo texture → add a bone → one clip → export GLB and OBJ → reload `.psxproj`.
