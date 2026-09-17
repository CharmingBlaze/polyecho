# Agent collab (Cursor ↔ DeepSeek)

Two agents share architecture work through files in this folder. Chat is only for “your turn.” Do not paste long lists into chat.

| File | Who writes | Role |
| :--- | :--- | :--- |
| `HANDOFF.md` | both | Mailbox. Whose turn, one-paragraph status, questions. |
| `BACKLOG.md` | DeepSeek proposes, Cursor accepts/rejects | Living architecture slices. |
| `REVIEW.md` | Cursor | Code-checked reply to the latest DeepSeek drop. |
| `REJECTED.md` | Cursor | Claims that must not be re-proposed. |
| `PROMPT_DEEPSEEK.md` | human copies into DeepSeek | DeepSeek first-turn boot prompt. |
| `PROMPT_DEEPSEEK_NEXT.md` | human copies into DeepSeek | After Cursor accepts the plan: name leftover Track 1 writers. |
| `PROMPT_CURSOR.md` | Cursor follows | How Cursor reviews a drop. |

`docs/SUGGESTIONS_AND_IMPROVEMENTS.md` is untrusted prior notes. Do not merge it into `BACKLOG.md`. The accepted architecture plan is `docs/ARCHITECTURE_IMPROVEMENT_PLAN.md`.

## Human loop

1. **Start DeepSeek** on this same repo (or paste `PROMPT_DEEPSEEK.md` into a DeepSeek chat that can read the workspace).
2. Tell DeepSeek: `Read docs/collab/PROMPT_DEEPSEEK.md and take the turn in HANDOFF.md.` (Later turns: paste `PROMPT_DEEPSEEK_NEXT.md` instead.)
3. When DeepSeek finishes, come here and say: `Check the collab mailbox.`
4. Cursor verifies against code, updates `REVIEW.md` / `BACKLOG.md` / `HANDOFF.md`.
5. If `HANDOFF.md` says turn is DeepSeek, send DeepSeek back with: `Read docs/collab/HANDOFF.md and REVIEW.md. Continue.`
6. When a slice is `accepted` and you want it built, tell Cursor: `Implement A# from docs/collab/BACKLOG.md.`

Do not run both agents in write mode on `BACKLOG.md` at the same time.

## Turn token

Only the agent named in `HANDOFF.md` → **Turn** may edit `BACKLOG.md`. The other agent may only read and write `REVIEW.md` / `HANDOFF.md` / `REJECTED.md`.
