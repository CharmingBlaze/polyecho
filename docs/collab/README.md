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
| `PROMPT_DEEPSEEK_CODE.md` | human → DeepSeek | **Implement the named slice** (starts at T1.1). |
| `PROMPT_CURSOR.md` | Cursor follows | Review docs or code; run tests. |

`docs/SUGGESTIONS_AND_IMPROVEMENTS.md` is untrusted. The accepted plan is `docs/ARCHITECTURE_IMPROVEMENT_PLAN.md`.

## Human loop (code)

1. Paste **`PROMPT_DEEPSEEK_CODE.md`** into DeepSeek on this repo.
2. Send: `Implement T1.1. Do not start T1.2.`
3. When DeepSeek finishes, come here and say: **Check the collab mailbox.**
4. Cursor reviews the diff, runs `typecheck` / tests, marks the slice done or sends DeepSeek back.
5. Repeat with the next slice id from `HANDOFF.md`.

Do not run Cursor and DeepSeek in write mode on `Operations.ts` at the same time.

## Turn token

- Docs turns: only the **Turn** agent edits `BACKLOG.md`.
- Code turns: the **Turn** agent edits the slice files named in `PROMPT_DEEPSEEK_CODE.md` / `HANDOFF.md`. Cursor owns `REVIEW.md` after the drop.
