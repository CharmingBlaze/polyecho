# Agent collab (Cursor ↔ DeepSeek)

Two agents share work through files in this folder. Chat is only for “your turn.” Do not paste long lists into chat.

| File | Who writes | Role |
| :--- | :--- | :--- |
| `HANDOFF.md` | both | Mailbox. Whose turn, slice id, status. |
| `BACKLOG.md` | DeepSeek proposes, Cursor accepts/rejects/marks done | Living slices. |
| `REVIEW.md` | Cursor | Code-checked reply to the latest drop. |
| `REJECTED.md` | Cursor | Claims / mistaken fixes not to repeat. |
| `PROMPT_DEEPSEEK.md` | human → DeepSeek | First architecture turn. |
| `PROMPT_DEEPSEEK_NEXT.md` | human → DeepSeek | Docs-only follow-up on the accepted plan. |
| `PROMPT_DEEPSEEK_BUS.md` | human → DeepSeek | **Standing Cline prompt** — bus every turn |
| `PROMPT_DEEPSEEK_CODE.md` | human → DeepSeek | **Implement the named slice** |
| `PROMPT_CURSOR.md` | Cursor follows | Review docs or code; run tests. |
| `BUS.md` | both | Local JSONL/HTTP bus so Cursor and Cline need not paste through the human |

`docs/SUGGESTIONS_AND_IMPROVEMENTS.md` is untrusted. The accepted plan is `docs/ARCHITECTURE_IMPROVEMENT_PLAN.md`.

## How the two agents talk

There is no official Cursor↔Cline/GitHub bus. Use:

1. **`HANDOFF.md`** — whose turn, slice name (human-visible).
2. **`py -3 scripts/collab_bus.py serve`** then http://127.0.0.1:8765/live — pairing board. Cursor/Cline keep using it via MCP (`.cursor/mcp.json`, `.cline/mcp.json`) plus `.clinerules` / Cursor hooks. Pin `.collab/BOARD.md` in the editor for a live markdown dashboard.

Do not run Cursor and DeepSeek in write mode on the same file. Parallel is fine when the files differ (`MeshRepository.ts` vs a docs-only revisions pass).

## Human loop (Cline / DeepSeek)

1. Paste **`PROMPT_DEEPSEEK_BUS.md`** into DeepSeek once per session.
2. Send: `Read the bus. Follow docs/collab/PROMPT_DEEPSEEK_BUS.md every turn.`
3. For a code slice, also paste **`PROMPT_DEEPSEEK_CODE.md`** and name the slice. For docs-only, paste **`PROMPT_DEEPSEEK_NEXT.md`**.
4. When DeepSeek finishes, come here and say: **Check the collab mailbox.**

## Human loop (code)

1. Paste **`PROMPT_DEEPSEEK_CODE.md`** into DeepSeek on this repo.
2. Send: `Implement unwrap. Do not start color, gizmo, watchers, or draw.`
3. When DeepSeek finishes, come here and say: **Check the collab mailbox.**
4. Cursor reviews the diff, runs `typecheck` / tests, marks the slice done or sends DeepSeek back.
5. Repeat with the next **name** from `HANDOFF.md` / `BACKLOG.md` (e.g. `lease`, not `T0`).

Do not run Cursor and DeepSeek in write mode on `Operations.ts` at the same time.

## Turn token

- Docs turns: only the **Turn** agent edits `BACKLOG.md`.
- Code turns: the **Turn** agent edits the slice files named in `PROMPT_DEEPSEEK_CODE.md` / `HANDOFF.md`. Cursor owns `REVIEW.md` after the drop.
