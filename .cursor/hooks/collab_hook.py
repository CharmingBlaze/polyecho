#!/usr/bin/env python3
"""Cursor hooks: inject the pairing bus into every session and guard claimed files."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(os.environ.get("CURSOR_PROJECT_DIR") or Path(__file__).resolve().parents[2])
URL = os.environ.get("COLLAB_BUS_URL", "http://127.0.0.1:8765")
HOT = (
    "src/stores/projectStore.ts",
    "src/components/viewport/Viewport3D.vue",
    "src/core/geometry/Operations.ts",
    "src/core/mesh/MeshRepository.ts",
)


def out(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload))
    sys.stdout.flush()


def fetch_status() -> dict:
    try:
        with urllib.request.urlopen(URL.rstrip("/") + "/status", timeout=0.6) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return {}


def server_up() -> bool:
    return bool(fetch_status())


def ensure_server() -> None:
    if server_up():
        return
    script = ROOT / "scripts" / "collab_bus.py"
    if not script.exists():
        return
    flags = 0x08000000 if os.name == "nt" else 0
    subprocess.Popen(
        ["py", "-3", str(script), "serve", "--host", "127.0.0.1", "--port", "8765"],
        cwd=str(ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=flags,
    )


def rel_path(path: str) -> str:
    try:
        return Path(path).resolve().relative_to(ROOT.resolve()).as_posix()
    except Exception:
        return path.replace("\\", "/")


def claims_map(status: dict) -> dict:
    return ((status.get("board") or {}).get("claims")) or {}


def summarize(status: dict) -> str:
    if not status:
        return (
            "Collab bus is offline. Start it with `py -3 scripts/collab_bus.py serve` "
            "or the 'collab: bus' VS Code task. Live board: http://127.0.0.1:8765/live"
        )
    unread = status.get("unread") or {}
    board = status.get("board") or {}
    presence = board.get("presence") or {}
    claims = claims_map(status)
    lines = [
        "PolyEcho pairing bus is live. Use MCP tools collab_status / collab_claim / collab_post (or py -3 scripts/collab_bus.py).",
        f"HANDOFF turn: {status.get('turn') or '?'}. Unread: cursor={unread.get('cursor', 0)} deepseek={unread.get('deepseek', 0)} human={unread.get('human', 0)}.",
        "Live board: http://127.0.0.1:8765/live  Editor dashboard: .collab/BOARD.md",
    ]
    for agent in ("cursor", "deepseek"):
        row = presence.get(agent) or {}
        flag = "LIVE" if row.get("live") else "away"
        lines.append(f"{agent}: {flag} {row.get('status') or ''} {row.get('topic') or ''}".rstrip())
    if claims:
        held = ", ".join(f"{p} ({c.get('agent')})" for p, c in claims.items())
        lines.append("Claims: " + held)
    else:
        lines.append("Claims: none. Claim files before you write.")
    last = status.get("last") or {}
    if last.get("body"):
        lines.append(f"Last bus: {last.get('from')} -> {last.get('to')} {last.get('kind')} {last.get('body')}")
    return "\n".join(lines)


def tool_paths(tool_input: dict) -> list[str]:
    if not isinstance(tool_input, dict):
        return []
    found = []
    for key in ("path", "file_path", "target_notebook"):
        val = tool_input.get(key)
        if val:
            found.append(rel_path(str(val)))
    return found


def session_start() -> dict:
    ensure_server()
    try:
        urllib.request.urlopen(
            urllib.request.Request(
                URL.rstrip("/") + "/heartbeat",
                data=json.dumps({"from": "cursor", "status": "connected", "topic": "ide"}).encode(),
                method="POST",
                headers={"Content-Type": "application/json"},
            ),
            timeout=0.6,
        )
    except Exception:
        pass
    return {"additional_context": summarize(fetch_status())}


def pre_tool(event: dict) -> dict:
    name = event.get("tool_name") or ""
    if name not in ("Write", "StrReplace", "EditNotebook", "Delete"):
        return {"permission": "allow"}
    status = fetch_status()
    claims = claims_map(status)
    if not claims:
        return {"permission": "allow"}
    for path in tool_paths(event.get("tool_input") or {}):
        owner = (claims.get(path) or {}).get("agent")
        if owner and owner != "cursor":
            return {
                "permission": "deny",
                "user_message": f"{path} is claimed by {owner} on the pairing bus.",
                "agent_message": (
                    f"CLAIM DENIED: {path} is held by {owner}. "
                    "Do not edit it. collab_status, then pick other files or wait for their done."
                ),
            }
    return {"permission": "allow"}


def post_tool(event: dict) -> dict:
    name = event.get("tool_name") or ""
    if name not in ("Write", "StrReplace", "EditNotebook"):
        return {}
    status = fetch_status()
    claims = claims_map(status)
    notes = []
    for path in tool_paths(event.get("tool_input") or {}):
        if path in HOT and path not in claims:
            notes.append(f"{path} is a hot file and is unclaimed. Call collab_claim before more writes.")
    if not notes:
        return {}
    return {"additional_context": " ".join(notes)}


def workspace_open() -> dict:
    ensure_server()
    return {}


def main() -> None:
    raw = sys.stdin.read()
    try:
        event = json.loads(raw or "{}")
    except json.JSONDecodeError:
        event = {}
    kind = event.get("hook_event_name") or event.get("hookName") or ""
    if kind == "workspaceOpen":
        out(workspace_open())
    elif kind == "sessionStart":
        out(session_start())
    elif kind == "preToolUse":
        out(pre_tool(event))
    elif kind == "postToolUse":
        out(post_tool(event))
    else:
        out({})


if __name__ == "__main__":
    main()
