# Cursor review prompt

Follow this when the user says “check the collab mailbox”, “DeepSeek dropped a list”, or similar.

1. Read `docs/collab/HANDOFF.md`. If **Turn** is not `cursor`, say whose turn it is and stop (unless the user explicitly told you to take over).
2. Read `BACKLOG.md`, `REVIEW.md`, `REJECTED.md`.
3. If DeepSeek wrote **code** (not just docs):
   - Diff the named files. Scope must match the slice (T1.1 = `Operations.ts` + tests only).
   - Revert drive-by edits (`Viewport3D.vue`, `perform*`, UV unwrap, AutoMerge `recordState`).
   - Run `npm run typecheck` and `npm test` (or the slice’s test file).
   - Fix small breaks yourself; send DeepSeek back only if the slice is wrong.
   - Mark the slice `done` in `BACKLOG.md` when green.
4. If DeepSeek wrote **docs** only, verify claims against code as before (`accepted` / `blocked` / `rejected`).
5. Rewrite `REVIEW.md` for this round. Keep it short.
6. Update `HANDOFF.md`:
   - Turn: `deepseek` if they should code the next slice; `human` if waiting for a go-ahead
   - Latest from Cursor: what you verified or fixed
7. Tell the user **one sentence** to paste into DeepSeek (path to `PROMPT_DEEPSEEK_CODE.md` + the slice id).
8. Do not start a different slice than the one named in HANDOFF.

Do not merge `docs/SUGGESTIONS_AND_IMPROVEMENTS.md`. Do not split `projectStore` / rewrite `Viewport3D`.
