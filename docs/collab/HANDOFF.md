# Handoff

- **Turn:** cursor
- **Topic:** quick-wins + animation-fixes + rig-anim-audit — next: unwrap
- **Updated:** 2026-09-20
- **By:** deepseek

## Status

Completed three batches: (1) systematic improvements, (2) animation auto-key fixes, (3) rig+anim workspace audit. Typecheck + lint both clean. Back to **unwrap** slice.

## Latest from DeepSeek

### Batch 1 — Quick Wins
1. `index.html`: Body theme tokens + CSP meta tag
2. `vite.config.ts`: `rollup-plugin-visualizer` + test timeouts 20s→10s
3. `eslint.config.js`: Flat config, `npm run lint` / `lint:fix`, 0 errors
4. `.husky/pre-commit`: lint-staged runs eslint --fix
5. `KnifeKernel.ts`: Fixed prefer-const
6. `.gitignore`: Added dist/stats.html

### Batch 2 — Animation Auto-Key Fixes
1. `Viewport3D.vue:3428`: `commitProxyTransform` → `recordCurrentKeyframe({ record: false })` — avoids double undo (onGizmoDragStart already recorded Transform)
2. `Viewport3D.vue:2865`: `onGizmoDragStart` pauses playback in animate mode

### Batch 3 — Rig + Anim Workspace Audit (4 fixes)

**Bugs Fixed:**
1. `RiggingPanel.vue:45`: `setBoneLength` had no `recordState` — bone length changes from the inspector number input were not undoable. Added `projectStore.recordState('Change Bone Length')` before mutation.
2. `RiggingPanel.vue:85-86`: `onRotationInput` had no `recordState` — bone rotation changes from the inspector input were not undoable. Added `projectStore.recordState('Edit Bone Rotation')` + no-op guard.
3. `RiggingPanel.vue:62`: Removed redundant `recordState` from `adjustBoneLength` — `setBoneLength` now handles it internally.
4. `animationStore.ts:1264`: `resetAllBonesToRest` had no `recordState` — Alt+R in rig mode was not undoable. Added `projectStore.recordState('Reset to Rest Pose')`.

**Verified Correct (No Issues Found):**
- All store functions properly record history internally: `bindSelectedGeometry`, `unbindGeometry`, `floodFillBoneWeight`, `smoothMeshBoneWeights`, `normalizeAllMeshWeights`, `invertBoneWeights`, `clearBoneWeights`, `addSocket`, `removeSocket`, `reparentBone`, `deleteBone`, `addRootBone`, `addChildBone`, `extrudeBone`
- `SkeletonPanel.handleAddRoot` → `recordState` before `addBoneFromPoints`
- `AnimationInspector` pose edits → `setBonePoseValue` records history internally
- `AnimationInspector` scrub drag → records history at start, auto-keys with `{ record: false }`
- `Timeline` keyframe toggle → `recordCurrentKeyframe`/`deleteKeyframeAt` handle history
- `PosePopout` copy/paste → store functions handle history

## Open questions

None. Back to **unwrap** slice.
