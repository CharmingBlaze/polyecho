#!/usr/bin/env python3
"""MCP front-end for the pairing bus. Cursor and Cline both speak this.

Stdio:  py -3 scripts/collab_mcp.py
HTTP:   POST http://127.0.0.1:8765/mcp  (served by collab_bus.py)
"""
from __future__ import annotations

import json
import os
import sys
import threading
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
import collab_bus as bus

PROTOCOL = "2024-11-05"
AGENT = os.environ.get("COLLAB_AGENT", "cursor")
WRITERS = ("cursor", "deepseek")

TOOLS = [
    {
        "name": "collab_status",
        "description": "Pairing board: HANDOFF turn, presence, file claims, unread counts. Call this first every turn.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "collab_inbox",
        "description": "Unread bus messages for an agent. Short drain only.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "agent": {"type": "string", "enum": ["cursor", "deepseek", "human"]},
                "mark_read": {"type": "boolean"},
            },
        },
    },
    {
        "name": "collab_post",
        "description": "Post a short pairing notice. Kinds: handoff, review, question, done, idle, progress, ack, nack.",
        "inputSchema": {
            "type": "object",
            "required": ["to", "body"],
            "properties": {
                "to": {"type": "string", "enum": ["cursor", "deepseek", "human", "*"]},
                "body": {"type": "string"},
                "topic": {"type": "string"},
                "kind": {"type": "string"},
                "files": {"type": "array", "items": {"type": "string"}},
                "reply": {"type": "string"},
            },
        },
    },
    {
        "name": "collab_claim",
        "description": "Exclusive write lock. Call before editing files. Returns CLAIM DENIED if the other agent holds a path.",
        "inputSchema": {
            "type": "object",
            "required": ["files"],
            "properties": {
                "files": {"type": "array", "items": {"type": "string"}},
                "topic": {"type": "string"},
                "body": {"type": "string"},
            },
        },
    },
    {
        "name": "collab_release",
        "description": "Drop file claims. Empty files list releases all of yours.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "files": {"type": "array", "items": {"type": "string"}},
                "topic": {"type": "string"},
            },
        },
    },
    {
        "name": "collab_heartbeat",
        "description": "Silent presence ping. Does not flood the log. Call while working.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "status": {"type": "string"},
                "topic": {"type": "string"},
            },
        },
    },
    {
        "name": "collab_log",
        "description": "Recent bus messages.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "n": {"type": "integer"},
                "agent": {"type": "string"},
            },
        },
    },
]


def _text(payload: Any, is_error: bool = False) -> dict[str, Any]:
    text = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False, indent=2)
    return {"content": [{"type": "text", "text": text}], "isError": is_error}


def _agent(arguments: dict[str, Any] | None, fallback: str) -> str:
    raw = (arguments or {}).get("agent") or fallback or AGENT
    return raw if raw in ("cursor", "deepseek", "human") else AGENT


def call_tool(name: str, arguments: dict[str, Any] | None, agent: str, inline: bool = False) -> dict[str, Any]:
    args = arguments or {}
    me = agent if agent in WRITERS else AGENT
    try:
        if name == "collab_status":
            if not inline and bus.server_up():
                return _text(bus.http_json("GET", "/status"))
            return _text(bus.status_payload())
        if name == "collab_inbox":
            who = _agent(args, me)
            msgs = bus.unread_for(who)
            if args.get("mark_read") and msgs:
                bus.mark_read({m["id"] for m in msgs})
            return _text({"agent": who, "messages": msgs})
        if name == "collab_post":
            payload = {
                "from": me,
                "to": args.get("to", "*"),
                "body": args.get("body", ""),
                "topic": args.get("topic", ""),
                "kind": args.get("kind", "handoff"),
                "files": args.get("files") or [],
                "in_reply_to": args.get("reply") or args.get("in_reply_to") or "",
            }
            msg = bus.post(
                payload["from"], payload["to"], payload["body"], payload["topic"],
                payload["kind"], payload["files"], payload["in_reply_to"],
            ) if inline else bus.remote_or_local_post(**payload)
            return _text(msg)
        if name == "collab_claim":
            files = args.get("files") or []
            if not files:
                return _text("files required", True)
            payload = {
                "from": me, "to": "*", "kind": "claim", "topic": args.get("topic", ""),
                "files": files, "body": args.get("body") or f"{me} claims {', '.join(files)}",
            }
            msg = bus.post(
                payload["from"], payload["to"], payload["body"], payload["topic"],
                payload["kind"], payload["files"],
            ) if inline else bus.remote_or_local_post(**payload)
            return _text(msg)
        if name == "collab_release":
            files = args.get("files") or []
            payload = {
                "from": me, "to": "*", "kind": "release", "topic": args.get("topic", ""),
                "files": files, "body": f"{me} released",
            }
            msg = bus.post(
                payload["from"], payload["to"], payload["body"], payload["topic"],
                payload["kind"], payload["files"],
            ) if inline else bus.remote_or_local_post(**payload)
            return _text(msg)
        if name == "collab_heartbeat":
            status = args.get("status") or "working"
            topic = args.get("topic") or ""
            evt = bus.silent_heartbeat(me, status, topic) if inline else bus.remote_heartbeat(me, status, topic)
            return _text(evt)
        if name == "collab_log":
            n = int(args.get("n") or 20)
            if not inline and bus.server_up():
                msgs = bus.http_json("GET", f"/log?n={n}")
            else:
                msgs = bus.load_messages()[-n:]
            who = args.get("agent")
            if who:
                msgs = [m for m in msgs if bus.addressed_to(m, who)]
            return _text(msgs)
        return _text(f"unknown tool {name}", True)
    except SystemExit as exc:
        return _text(str(exc), True)
    except Exception as exc:
        return _text(str(exc), True)


def handle_rpc(req: dict[str, Any], agent: str = AGENT, client: str = "", inline: bool = False) -> dict[str, Any] | None:
    method = req.get("method") or ""
    rpc_id = req.get("id")
    params = req.get("params") or {}
    if rpc_id is None and method.startswith("notifications/"):
        return None
    if method == "initialize":
        if agent in WRITERS:
            try:
                if inline:
                    bus.silent_heartbeat(agent, "connected", "mcp")
                    bus.HUB.register_client(client or agent, agent)
                else:
                    bus.remote_heartbeat(agent, "connected", "mcp")
            except Exception:
                pass
        return {
            "jsonrpc": "2.0",
            "id": rpc_id,
            "result": {
                "protocolVersion": params.get("protocolVersion") or PROTOCOL,
                "capabilities": {
                    "tools": {"listChanged": False},
                    "resources": {"listChanged": False},
                    "logging": {},
                },
                "serverInfo": {"name": "polyecho-collab", "version": "1.0.0"},
                "instructions": (
                    "You are pairing on PolyEcho. Every turn: collab_status, then collab_inbox. "
                    "Claim files before write. Heartbeat while working. Post done/idle when finished. "
                    "Never edit a path listed under the other agent's claims."
                ),
            },
        }
    if method in ("notifications/initialized", "initialized"):
        return None
    if method == "ping":
        return {"jsonrpc": "2.0", "id": rpc_id, "result": {}}
    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": rpc_id, "result": {"tools": TOOLS}}
    if method == "tools/call":
        result = call_tool(params.get("name", ""), params.get("arguments") or {}, agent, inline=inline)
        return {"jsonrpc": "2.0", "id": rpc_id, "result": result}
    if method == "resources/list":
        return {
            "jsonrpc": "2.0",
            "id": rpc_id,
            "result": {
                "resources": [
                    {"uri": "collab://status", "name": "Pairing status", "mimeType": "application/json"},
                    {"uri": "collab://handoff", "name": "HANDOFF.md", "mimeType": "text/markdown"},
                ]
            },
        }
    if method == "resources/read":
        uri = (params.get("uri") or "")
        if uri.endswith("handoff"):
            text = bus.HANDOFF.read_text(encoding="utf-8") if bus.HANDOFF.exists() else ""
            mime = "text/markdown"
        else:
            payload = bus.http_json("GET", "/status") if (not inline and bus.server_up()) else bus.status_payload()
            text = json.dumps(payload, indent=2)
            mime = "application/json"
        return {
            "jsonrpc": "2.0",
            "id": rpc_id,
            "result": {"contents": [{"uri": uri or "collab://status", "mimeType": mime, "text": text}]},
        }
    if rpc_id is None:
        return None
    return {
        "jsonrpc": "2.0",
        "id": rpc_id,
        "error": {"code": -32601, "message": f"method not found: {method}"},
    }


def handle_http_body(raw: str, agent: str, client: str) -> Any:
    data = json.loads(raw or "{}")
    if isinstance(data, list):
        out = []
        for item in data:
            resp = handle_rpc(item, agent, client, inline=True)
            if resp is not None:
                out.append(resp)
        return out
    return handle_rpc(data, agent, client, inline=True)
    args = arguments or {}
def _write_stdio(msg: dict[str, Any]) -> None:
    blob = json.dumps(msg, ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(f"Content-Length: {len(blob)}\r\n\r\n".encode("ascii") + blob)
    sys.stdout.buffer.flush()


def _read_stdio() -> dict[str, Any] | None:
    header = b""
    while True:
        line = sys.stdin.buffer.readline()
        if not line:
            return None
        if line.startswith(b"{") or line.startswith(b"["):
            return json.loads(line)
        header += line
        if line in (b"\r\n", b"\n"):
            break
    length = 0
    for raw in header.decode("ascii", errors="replace").splitlines():
        if raw.lower().startswith("content-length:"):
            length = int(raw.split(":", 1)[1].strip())
    body = sys.stdin.buffer.read(length) if length else b"{}"
    return json.loads(body.decode("utf-8"))


def _watch_sse(agent: str) -> None:
    try:
        import urllib.request

        req = urllib.request.Request(bus.DEFAULT_URL.rstrip("/") + "/stream?for=" + agent)
        with urllib.request.urlopen(req, timeout=None) as resp:
            data = b""
            for chunk in resp:
                data += chunk
                while b"\n\n" in data:
                    event, data = data.split(b"\n\n", 1)
                    for line in event.splitlines():
                        if not line.startswith(b"data:"):
                            continue
                        msg = json.loads(line[5:].decode("utf-8"))
                        if msg.get("kind") in ("presence",):
                            continue
                        note = f"{msg.get('from')} -> {msg.get('to')} {msg.get('kind')} [{msg.get('topic','')}] #{msg.get('id')}: {msg.get('body','')}"
                        _write_stdio({
                            "jsonrpc": "2.0",
                            "method": "notifications/message",
                            "params": {"level": "info", "logger": "polyecho-collab", "data": note.strip()},
                        })
    except Exception:
        pass


def main() -> None:
    if AGENT in WRITERS:
        try:
            bus.silent_heartbeat(AGENT, "connected", "mcp")
        except Exception:
            pass
    watcher = threading.Thread(target=_watch_sse, args=(AGENT,), daemon=True)
    watcher.start()
    while True:
        req = _read_stdio()
        if req is None:
            break
        items = req if isinstance(req, list) else [req]
        for item in items:
            if not isinstance(item, dict):
                continue
            resp = handle_rpc(item, AGENT, "stdio")
            if resp is not None:
                _write_stdio(resp)


if __name__ == "__main__":
    main()
