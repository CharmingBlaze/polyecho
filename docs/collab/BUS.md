# Collab bus

Real-time pairing server for Cursor and Cline/DeepSeek on the **same working copy**. It does not replace `HANDOFF.md`. There is no official Cursor↔Cline protocol. GitHub issues are the wrong live channel.

Keep one process running:

```text
py -3 scripts/collab_bus.py serve
```

Or `npm run collab:bus`. Then open **http://127.0.0.1:8765/live** — presence, file claims, and posts update immediately (Server-Sent Events). Agents `post` / `claim` / `wait` / `status` talk to that server when it is up; otherwise they fall back to `.collab/bus.jsonl`.

## Pairing protocol

Two agents may run at the same time. They must not write the same file.

1. **Claim** every file you will edit this turn, before the first write.
2. **Heartbeat** while working (`status` + `topic`). Presence is silent — it does not flood the log.
3. **Progress** (optional) is a short visible note: what you just finished, what is next.
4. **Question** to `human` when you need a decision. That lights the human inbox on the live board.
5. **Ack / nack** a specific message with `--reply ID`.
6. **Done** or **idle** releases your claims automatically.

`CLAIM DENIED` (HTTP 409) means the other agent already holds that path. Do not edit it. Pick other files or wait for their `done`.

Hot files (never dual-write): `projectStore.ts`, `Viewport3D.vue`, `Operations.ts`, `MeshRepository.ts`.

`HANDOFF.md` **Turn** still decides who may edit the named slice. Claims are the real-time lock; Turn is the human-visible token.

## Commands

From the repo root (`py -3` on Windows if `python` is missing):

```text
py -3 scripts/collab_bus.py serve
py -3 scripts/collab_bus.py status
py -3 scripts/collab_bus.py heartbeat --from cursor --topic lease --status working
py -3 scripts/collab_bus.py claim --from cursor --topic lease src/core/mesh/MeshRepository.ts
py -3 scripts/collab_bus.py post --from cursor --to deepseek --topic lease --kind done --body "..."
py -3 scripts/collab_bus.py post --from cursor --to deepseek --kind ack --reply abc123 --body "accepted"
py -3 scripts/collab_bus.py log -n 10 --for deepseek
py -3 scripts/collab_bus.py wait --for cursor --timeout 60 --mark-read
py -3 scripts/collab_bus.py release --from cursor
```

HTTP (127.0.0.1 only):

- `GET /live` — pairing board (presence, claims, compose, live feed)
- `GET /status` — turn, unread, presence, claims
- `GET /board` — same payload
- `GET /log?n=20`
- `GET /wait?for=deepseek&timeout=30&topic=join` — wakes as soon as a matching post arrives
- `GET /stream?for=deepseek` — SSE (`Last-Event-ID` replays missed seq)
- `POST /post` `{from,to,topic,kind,body,files,in_reply_to}`
- `POST /heartbeat` `{from,status,topic}` — presence only, not logged

Override bind with `COLLAB_BUS_URL` (default `http://127.0.0.1:8765`).

Kinds: `handoff` `review` `question` `done` `idle` `claim` `release` `heartbeat` `progress` `ack` `nack`.

## Keep Cursor and Cline on it (real-time)

The agents should not wait for the human to say “check the mailbox.” Three layers do that:

1. **MCP tools** named `polyecho-collab` — `collab_status`, `collab_inbox`, `collab_claim`, `collab_post`, `collab_heartbeat`, `collab_release`, `collab_log`. Cursor loads `.cursor/mcp.json`. VS Code / Copilot loads `.vscode/mcp.json`. Cline: copy `.cline/mcp.json` into Cline → MCP Servers → Configure (or the CLI `.cline/mcp.json` is already in the repo).
2. **Always-on rules** — Cursor `.cursor/rules/agent-collab.mdc` (`alwaysApply`). Cline `.clinerules`. Both say: status → inbox → claim before write.
3. **Cursor hooks** — opening the workspace starts the bus if it is down; every new Cursor chat injects the live board; writes to a file the other agent claimed are denied.

Human surfaces:

- http://127.0.0.1:8765/live — pairing board
- `.collab/BOARD.md` — auto-updated markdown you can pin in the editor
- VS Code / Cursor task **collab: bus** runs on folder open (`task.allowAutomaticTasks` is on). Command Palette → **Tasks: Run Task** → **collab: pairing board**

HTTP MCP is also on the live server: `POST http://127.0.0.1:8765/mcp?agent=deepseek` if a client prefers Streamable HTTP instead of stdio.

## Rules

- Short notices only. Not architecture dumps.
- Claim before write. Release on done (or post `kind=done` / `idle`).
- Do not start `serve` from an agent chat unless the human asks. The human keeps the server up.
- Do not `wait` with a long timeout inside a chat — you will hang. Use timeout 1 + `--mark-read` to drain, and rely on SSE / the human saying “check the mailbox.”
