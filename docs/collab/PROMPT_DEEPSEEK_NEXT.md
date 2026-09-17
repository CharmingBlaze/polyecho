# DeepSeek next turn

The architecture plan is **accepted**. This is not a new audit.

Copy this whole file into DeepSeek. Then say: `Take this turn. Do not rewrite the plan from scratch.`

You are DeepSeek, architecture analyst for PolyEcho. You pair with Cursor (verifier / implementer). Talk through files.

**Write:** small surgical edits to `docs/ARCHITECTURE_IMPROVEMENT_PLAN.md` (Track 1 named slices only) and `docs/collab/HANDOFF.md`.
**Read first:** `docs/collab/REVIEW.md`, `docs/collab/HANDOFF.md`, `docs/collab/REJECTED.md`, `docs/ARCHITECTURE_IMPROVEMENT_PLAN.md` §2 and Track 1, `docs/collab/BACKLOG.md`.
**Do not write:** app source, `REVIEW.md`, `docs/SUGGESTIONS_AND_IMPROVEMENTS.md`.
**Do not implement T1.1.** Cursor builds that when the human asks.

============================================================
WHAT IS ALREADY TRUE — DO NOT RE-ARGUE
============================================================
- Source of truth: `docs/ARCHITECTURE_IMPROVEMENT_PLAN.md`.
- One defect: document and resident kernel both claim authority; `MeshRepository` JSON signature is a guard, not a design.
- Win condition: one of {document, resident kernel, history} is authoritative at a time; the others are derived. **Do not delete `MeshBridge`.**
- `runKernelOperation` (`projectStore.ts:468`) is the resident-commit. Used only by Extrude (`:495`) and Inset (`:505`).
- Only `extrudeSelection` / `insetFaces` take an injected `bridge`. Every other `Operations.ts` entry allocates a throwaway bridge.
- `replaceMesh` (`:901-907`) never touches `MeshRepository`.
- Hub sizes (do not “correct” these again): `Viewport3D.vue` **7680**, `projectStore.ts` **2676**.
- Cursor already added to §2.2: `performDelete`, `performDissolve`, `performConnectVertices`, `performCleanupMesh`, `performAutoMerge` (no `recordState`). §2.3 already has flip/rotate/mirror-copy. §2.4 already has vertex paint, Shape Draw bake, LiveSymmetry.

============================================================
THIS TURN’S JOB (narrow)
============================================================
Cursor’s only question: fold the leftover writers into **Track 1 as named slices**, not just §2 mentions.

1. In Track 1, give each of these its own numbered slice (or a clearly named sub-bullet under an existing slice), with: writer, file:symbol, whether it is topology / attributes / TRS-only, which `runKernelOperation` / lease / `replaceMesh`-with-reason path it should use, and which sequencing-table row it is.

   Leftovers to name:
   - `performDelete` (component modes) + `performDissolve` + `performConnectVertices` + `performCleanupMesh` + `performAutoMerge` (must `recordState`)
   - `performFlipAxis` / `performDuplicateMirror` (document geometry; `performRotateObject` is TRS-only and may stay group (b) if you can show it does not move verts)
   - Vertex color writes in `MaterialProps.vue` (`v.color` ~`:767-880`)
   - Shape Draw bake `replaceMesh` (`src/components/viewport/ShapeDrawPanel.vue:38`) — whole-object replacement with a stated reason, or a resident commit if bake changes topology
   - Seam mark/clear (`projectStore.ts:2185-2210`) — attributes, not topology
   - Confirm LiveSymmetry stays on the leased kernel (no document writes)

2. Update §5 sequencing **only if** a new slice is load-bearing. Do not reorder T1.1 → T0 → T3.1 → T1.2.

3. Grep before you add a writer. If you cannot find the write, mark **unverified** — do not invent a line.

============================================================
HARD NO
============================================================
- Do not rewrite §§0–1, 3.1, 5–9.
- Do not split `projectStore` / `Viewport3D`.
- Do not add frameworks, xstate, Storybook, i18n, `EDITOR_EVENTS.GEOMETRY_CHANGED`, or store event buses.
- Do not bump `.psxproj` or add sharp/crease.
- Do not re-propose anything in `docs/collab/REJECTED.md`.
- Do not expand this into another 600-line document. Track 1 edits + a short HANDOFF note.

============================================================
OUTPUT
============================================================
1. Patch `docs/ARCHITECTURE_IMPROVEMENT_PLAN.md` Track 1 (and §5 only if needed).
2. Update `docs/collab/HANDOFF.md`:
   - Turn: `cursor`
   - Latest from DeepSeek: what slices you named (5–10 lines)
3. Chat reply to the human, exactly:

```
Mailbox updated. Tell Cursor: Check the collab mailbox.
```
