# Contributing

Work in small, complete slices. This repo is a full DCC in one Vite app; a “simple” modeling change often touches types, a kernel or `Operations.ts`, a store method, the viewport, and a shortcut.

## Setup

Free toolchain already in the repo: Node.js 18+, npm, TypeScript, Vue, Vite.

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

- Dev server: [http://localhost:5173](http://localhost:5173)
- `typecheck` runs `vue-tsc` (same checker as production build)
- `build` is the full production compile

Editor: any editor that understands Vue SFCs and TypeScript. Official Vue language support (Volar) is recommended. See `.editorconfig` for indent (2 spaces, LF).

## Before a large change

1. Read `docs/ARCHITECTURE.md`, then `docs/CODEMAP.md` for the files you will touch.
2. Read `docs/INVARIANTS.md`. If the change is modeling (gizmo, G/R/S, fill, snap, operators), also read `docs/MODELING_OPERATORS.md`.
3. Name the **document** you are changing (`MeshObject` vs `EditableMesh`, which store, which exporter).
4. List the surfaces that share that state (viewport, outliner, inspector, undo, export). You will verify all of them.
5. Prefer extending an existing operator, kernel, or `perform*` method over adding a parallel path. If a tool exists as both a menu action and a modal operator, change **both** (or bridge the store path through the kernel).

## How to take a large feature

Split by layer, not by “half the UI”:

1. **Types** in `src/types/` if the document model changes.
2. **Pure core** (`geometry/`, `mesh/`, `export/`, `animation/`) with no Vue imports.
3. **Store API** that records history and bumps revisions.
4. **Input** — `App.vue` key handler and/or `editorCommands` (`requestModalTool`). Update `keymapStore` for the Hotkeys list only. Do not add new calls through unused `InputRouter` / `ActionRegistry` unless you are wiring those modules for real.
5. **UI** last (menu, inspector, palette).
6. **Verify** in the running app: the new path, undo/redo, a neighboring mode (Model / UV / Rig / Animate), and export if data leaves the session.

Do not rewrite `Viewport3D.vue` or `projectStore.ts` unless the feature cannot land without it. Those files are the integration hubs.

## Conventions

- Vue: `<script setup lang="ts">`, Composition API.
- Stores: Pinia setup syntax, same style as existing stores.
- New mesh math: return a new `MeshObject` (or mutate `EditableMesh` only inside an operator session).
- Import with `@/` or relative paths; stay consistent with the nearest file.
- Do not add a second state library, router, or CSS framework. Tailwind + existing `src/components/ui/` is the UI kit.

## Verification

There is no automated test suite yet. For modeling, rigging, paint, and export work, run the app and exercise the flow by hand:

- Create or select geometry, run the tool, confirm, undo, redo.
- Switch select modes (`1`–`4`) and app modes if the change is not local to one panel.
- If you changed I/O, round-trip a `.glb` or `.psxproj` once.

`npm run typecheck` must stay clean.

## Docs

If you add a primitive, operator, exporter, or store, update `docs/CODEMAP.md` and the extensibility table in `docs/ARCHITECTURE.md` in the same change.

Texture / material / paint-target work: read `docs/TEXTURES.md` first. Use `selectTexture`, `createTexture`, and `applyTextureToMesh` / `applyTextureToMaterial` only.

UV editor: `docs/UV_EDITOR.md`. Do not run transforms on the whole mesh when nothing is selected.
