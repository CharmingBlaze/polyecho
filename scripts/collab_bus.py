#!/usr/bin/env python3
"""Real-time Cursor ↔ DeepSeek pairing bus. Stdlib only. Does not replace HANDOFF.md."""
from __future__ import annotations

import argparse
import json
import os
import queue
import re
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
from collab_board import Board, ClaimConflict, WRITERS

AGENTS = ("cursor", "deepseek", "human", "*")
KINDS = ("handoff", "review", "question", "done", "idle", "claim", "release", "heartbeat", "progress", "ack", "nack")
DEFAULT_URL = os.environ.get("COLLAB_BUS_URL", "http://127.0.0.1:8765")

ROOT = Path(__file__).resolve().parents[1]
HANDOFF = ROOT / "docs" / "collab" / "HANDOFF.md"
STORE_DIR = ROOT / ".collab"
LOG_PATH = STORE_DIR / "bus.jsonl"
PID_PATH = STORE_DIR / "bus.pid"
LIVE_PATH = Path(__file__).with_name("collab_live.html")

_board: Board | None = None


def board() -> Board:
    global _board
    path = STORE_DIR / "board.json"
    if _board is None or _board.path != path:
        _board = Board(path)
    return _board


class Hub:
    def __init__(self) -> None:
        self.cond = threading.Condition()
        self.streams: list[queue.Queue] = []
        self.clients: dict[str, dict[str, str]] = {}

    def register_client(self, name: str, agent: str) -> None:
        self.clients[name or agent] = {"agent": agent, "name": name or agent, "seen": now_iso()}

    def publish(self, msg: dict[str, Any]) -> None:
        with self.cond:
            self.cond.notify_all()
        for q in list(self.streams):
            try:
                q.put_nowait(msg)
            except Exception:
                pass
        try:
            write_dashboard()
        except Exception:
            pass

    def subscribe(self) -> queue.Queue:
        q: queue.Queue = queue.Queue(maxsize=64)
        self.streams.append(q)
        return q

    def unsubscribe(self, q: queue.Queue) -> None:
        if q in self.streams:
            self.streams.remove(q)


HUB = Hub()


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_messages() -> list[dict[str, Any]]:
    if not LOG_PATH.exists():
        return []
    out: list[dict[str, Any]] = []
    for line in LOG_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            out.append(json.loads(line))
    return out


def write_messages(msgs: list[dict[str, Any]]) -> None:
    STORE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = LOG_PATH.with_suffix(".tmp")
    tmp.write_text("".join(json.dumps(m, ensure_ascii=False) + "\n" for m in msgs), encoding="utf-8")
    os.replace(tmp, LOG_PATH)


def handoff_turn() -> str | None:
    if not HANDOFF.exists():
        return None
    match = re.search(r"^\s*-\s*\*\*Turn:\*\*\s*(\S+)", HANDOFF.read_text(encoding="utf-8"), re.M)
    return match.group(1).strip() if match else None


def addressed_to(msg: dict[str, Any], agent: str) -> bool:
    dest = msg.get("to", "*")
    return dest in (agent, "*")


def unread_for(agent: str, messages: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    return [m for m in (messages or load_messages()) if addressed_to(m, agent) and not m.get("read")]


def mark_read(ids: set[str]) -> None:
    if not ids:
        return
    msgs = load_messages()
    for msg in msgs:
        if msg.get("id") in ids:
            msg["read"] = True
    write_messages(msgs)


def post(
    frm: str,
    to: str,
    body: str,
    topic: str = "",
    kind: str = "handoff",
    files: list[str] | None = None,
    reply: str = "",
    status: str = "",
) -> dict[str, Any]:
    if frm not in AGENTS or to not in AGENTS:
        raise SystemExit(f"from/to must be one of {', '.join(AGENTS)}")
    if kind not in KINDS:
        raise SystemExit(f"kind must be one of {', '.join(KINDS)}")
    prior = load_messages()
    last_seq = prior[-1].get("seq") if prior else 0
    seq = last_seq + 1 if isinstance(last_seq, int) else len(prior) + 1
    msg = {
        "id": str(uuid.uuid4())[:8],
        "seq": seq,
        "ts": now_iso(),
        "from": frm,
        "to": to,
        "topic": topic,
        "kind": kind,
        "body": body.strip(),
        "files": files or [],
        "in_reply_to": reply,
        "status": status,
        "read": False,
    }
    try:
        board().apply_message(msg)
    except ClaimConflict as exc:
        raise SystemExit("CLAIM DENIED: " + ", ".join(f"{c['file']} held by {c['by']}" for c in exc.conflicts)) from exc
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    write_messages(prior + [msg])
    HUB.publish(msg)
    return msg


def silent_heartbeat(frm: str, status: str = "working", topic: str = "") -> dict[str, Any]:
    if frm not in WRITERS:
        raise SystemExit("heartbeat is for cursor or deepseek")
    board().touch(frm, status, topic)
    if status == "connected" or topic in ("mcp", "ide"):
        HUB.register_client(f"{frm}:{topic or 'mcp'}", frm)
    evt = {
        "id": "presence",
        "seq": 0,
        "ts": now_iso(),
        "from": frm,
        "to": "*",
        "kind": "presence",
        "topic": topic,
        "status": status,
        "body": "",
        "board": board().snapshot(),
    }
    HUB.publish(evt)
    return evt


def _wanted(msg: dict[str, Any], agent: str, topic: str = "") -> bool:
    if not addressed_to(msg, agent):
        return False
    if topic and msg.get("topic") != topic:
        return False
    return True


def wait_for(agent: str, timeout: float, poll: float = 0.25, topic: str = "") -> list[dict[str, Any]]:
    pending = [m for m in unread_for(agent) if _wanted(m, agent, topic)]
    if pending:
        return pending
    deadline = time.monotonic() + timeout
    seen = {m["id"] for m in load_messages()}
    while time.monotonic() < deadline:
        remaining = max(0.0, deadline - time.monotonic())
        with HUB.cond:
            HUB.cond.wait(timeout=min(poll, remaining) if remaining else 0)
        msgs = [m for m in load_messages() if m["id"] not in seen and _wanted(m, agent, topic)]
        if msgs:
            return msgs
    return []


def status_payload() -> dict[str, Any]:
    msgs = load_messages()
    snap = board().snapshot()
    return {
        "turn": handoff_turn(),
        "live": True,
        "subscribers": len(HUB.streams),
        "handoff": str(HANDOFF.relative_to(ROOT)).replace("\\", "/"),
        "log": str(LOG_PATH.relative_to(ROOT)).replace("\\", "/") if LOG_PATH.exists() else None,
        "count": len(msgs),
        "unread": {agent: len(unread_for(agent, msgs)) for agent in ("cursor", "deepseek", "human")},
        "last": msgs[-1] if msgs else None,
        "board": snap,
        "mcp": list(HUB.clients.values()),
    }


def print_msg(msg: dict[str, Any]) -> None:
    if msg.get("kind") == "presence":
        return
    topic = f" [{msg.get('topic')}]" if msg.get("topic") else ""
    reply = f"  reply:{msg.get('in_reply_to')}" if msg.get("in_reply_to") else ""
    print(f"{msg.get('ts')}  {msg.get('from')} -> {msg.get('to')}  {msg.get('kind')}{topic}  #{msg.get('id')}{reply}")
    if msg.get("files"):
        print("  files: " + ", ".join(msg["files"]))
    body = (msg.get("body") or "").strip()
    if body:
        for line in body.splitlines():
            print(f"  {line}")


def write_dashboard() -> None:
    STORE_DIR.mkdir(parents=True, exist_ok=True)
    snap = board().snapshot()
    unread = {agent: len(unread_for(agent)) for agent in ("cursor", "deepseek", "human")}
    lines = [
        "# Pairing board",
        "",
        f"- Turn: **{handoff_turn() or '?'}**",
        f"- Unread: cursor {unread['cursor']} | deepseek {unread['deepseek']} | human {unread['human']}",
        f"- Live page: http://127.0.0.1:8765/live",
        "",
        "## Presence",
        "",
    ]
    for agent, row in (snap.get("presence") or {}).items():
        flag = "LIVE" if row.get("live") else "away"
        lines.append(f"- **{agent}** {flag} -- {row.get('status') or 'offline'} {row.get('topic') or ''}".rstrip())
    mcp = list(HUB.clients.values())
    if mcp:
        lines += ["", "## IDE clients", ""]
        for row in mcp:
            lines.append(f"- {row.get('name')} as {row.get('agent')} (seen {row.get('seen')})")
    lines += ["", "## Claims", ""]
    claims = snap.get("claims") or {}
    if claims:
        for path, row in claims.items():
            lines.append(f"- `{path}` -- **{row.get('agent')}** ({row.get('topic')})")
    else:
        lines.append("- (none)")
    last = load_messages()[-8:]
    lines += ["", "## Recent", ""]
    if last:
        for msg in reversed(last):
            if msg.get("kind") == "presence":
                continue
            body = (msg.get("body") or "").replace("\n", " ").strip()
            lines.append(f"- `{msg.get('id')}` {msg.get('from')} -> {msg.get('to')} **{msg.get('kind')}** {body}")
    else:
        lines.append("- (empty)")
    lines.append("")
    (STORE_DIR / "BOARD.md").write_text("\n".join(lines), encoding="utf-8")


def print_board(snap: dict[str, Any]) -> None:
    print("presence:")
    for agent, row in (snap.get("presence") or {}).items():
        flag = "live" if row.get("live") else "away"
        print(f"  {agent:8} {flag:5}  {row.get('status','')}  {row.get('topic','')}")
    claims = snap.get("claims") or {}
    print("claims:" if claims else "claims: (none)")
    for path, row in claims.items():
        print(f"  {row.get('agent'):8} {path}  ({row.get('topic','')})")


def http_json(method: str, path: str, payload: dict[str, Any] | None = None, timeout: float = 3) -> Any:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        DEFAULT_URL.rstrip("/") + path,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if data else {},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"HTTP {exc.code}: {detail}") from exc


def server_up() -> bool:
    try:
        http_json("GET", "/status", timeout=0.4)
        return True
    except Exception:
        return False


class BusHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write("collab-bus: " + (fmt % args) + "\n")

    def _json(self, code: int, payload: Any) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _html(self) -> None:
        body = LIVE_PATH.read_text(encoding="utf-8") if LIVE_PATH.exists() else "<p>missing collab_live.html</p>"
        data = body.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        if parsed.path in ("/", "/live"):
            self._html()
            return
        if parsed.path in ("/status", "/board"):
            self._json(200, status_payload())
            return
        if parsed.path == "/log":
            self._json(200, load_messages()[-int(qs.get("n", ["40"])[0]):])
            return
        if parsed.path == "/wait":
            agent = qs.get("for", ["cursor"])[0]
            timeout = float(qs.get("timeout", ["30"])[0])
            topic = qs.get("topic", [""])[0]
            self._json(200, {"messages": wait_for(agent, timeout, topic=topic)})
            return
        if parsed.path == "/stream":
            self._stream(qs.get("for", ["*"])[0])
            return
        if parsed.path == "/mcp":
            agent = qs.get("agent", ["cursor"])[0]
            self._mcp_sse(agent)
            return
        self._json(404, {"error": "not found"})

    def _sse_write(self, msg: dict[str, Any]) -> None:
        seq = msg.get("seq") or 0
        if seq:
            self.wfile.write(f"id: {seq}\n".encode("utf-8"))
        self.wfile.write(f"data: {json.dumps(msg, ensure_ascii=False)}\n\n".encode("utf-8"))
        self.wfile.flush()

    def _stream(self, agent: str) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        q = HUB.subscribe()
        try:
            self.wfile.write(b": connected\n\n")
            self.wfile.flush()
            last_raw = self.headers.get("Last-Event-ID", "")
            last = int(last_raw) if str(last_raw).isdigit() else 0
            if last:
                for msg in load_messages():
                    if (msg.get("seq") or 0) > last and (agent == "*" or addressed_to(msg, agent)):
                        self._sse_write(msg)
            while True:
                try:
                    msg = q.get(timeout=15)
                except queue.Empty:
                    self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
                    continue
                if agent != "*" and not addressed_to(msg, agent):
                    continue
                self._sse_write(msg)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass
        finally:
            HUB.unsubscribe(q)

    def _mcp_sse(self, agent: str) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        q = HUB.subscribe()
        try:
            self.wfile.write(b": connected\n\n")
            self.wfile.flush()
            while True:
                try:
                    msg = q.get(timeout=15)
                except queue.Empty:
                    self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
                    continue
                if msg.get("kind") == "presence":
                    continue
                if agent not in ("*", "") and not addressed_to(msg, agent) and msg.get("from") != agent:
                    continue
                note = {
                    "jsonrpc": "2.0",
                    "method": "notifications/message",
                    "params": {
                        "level": "info",
                        "logger": "polyecho-collab",
                        "data": f"{msg.get('from')} -> {msg.get('to')} {msg.get('kind')} [{msg.get('topic','')}] #{msg.get('id')}: {msg.get('body','')}",
                    },
                }
                self.wfile.write(f"event: message\ndata: {json.dumps(note, ensure_ascii=False)}\n\n".encode("utf-8"))
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass
        finally:
            HUB.unsubscribe(q)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, MCP-Protocol-Version, Mcp-Session-Id, Accept")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        data = json.loads(raw or "{}")
        if parsed.path == "/post":
            try:
                msg = post(
                    data.get("from", "human"),
                    data.get("to", "*"),
                    data.get("body", ""),
                    data.get("topic", ""),
                    data.get("kind", "handoff"),
                    data.get("files") or [],
                    data.get("in_reply_to") or data.get("reply") or "",
                    data.get("status") or "",
                )
            except SystemExit as exc:
                self._json(409 if "CLAIM DENIED" in str(exc) else 400, {"error": str(exc)})
                return
            self._json(200, msg)
            return
        if parsed.path == "/heartbeat":
            try:
                evt = silent_heartbeat(
                    data.get("from", "cursor"),
                    data.get("status") or "working",
                    data.get("topic") or "",
                )
            except SystemExit as exc:
                self._json(400, {"error": str(exc)})
                return
            self._json(200, evt)
            return
        if parsed.path == "/mcp":
            from collab_mcp import handle_http_body

            qs = parse_qs(parsed.query)
            agent = qs.get("agent", [None])[0] or data.get("agent") or "cursor"
            client = (data.get("params") or {}).get("clientInfo", {}).get("name") if isinstance(data, dict) else ""
            try:
                result = handle_http_body(raw, agent, client or agent)
            except Exception as exc:
                self._json(400, {"jsonrpc": "2.0", "error": {"code": -32700, "message": str(exc)}})
                return
            if result is None:
                self.send_response(202)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                return
            self.send_response(200)
            payload = json.dumps(result, ensure_ascii=False).encode("utf-8")
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Mcp-Session-Id", agent)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        self._json(404, {"error": "not found"})


def remote_or_local_post(**kwargs: Any) -> dict[str, Any]:
    if server_up():
        return http_json("POST", "/post", kwargs)
    return post(
        kwargs.get("from", "human"),
        kwargs.get("to", "*"),
        kwargs.get("body", ""),
        kwargs.get("topic", ""),
        kwargs.get("kind", "handoff"),
        kwargs.get("files") or [],
        kwargs.get("in_reply_to") or "",
        kwargs.get("status") or "",
    )


def cmd_status(_: argparse.Namespace) -> None:
    if server_up():
        payload = http_json("GET", "/status")
        print(f"server: {DEFAULT_URL}  subscribers={payload.get('subscribers', 0)}")
    else:
        payload = status_payload()
        payload["live"] = False
        print("server: offline (file log only)")
    print(f"HANDOFF turn: {payload.get('turn') or '(missing)'}")
    print(f"messages: {payload.get('count')}")
    unread = payload.get("unread") or {}
    print(f"unread: cursor={unread.get('cursor', 0)} deepseek={unread.get('deepseek', 0)} human={unread.get('human', 0)}")
    mcp = payload.get("mcp") or []
    if mcp:
        print("ide: " + ", ".join(f"{c.get('name')}={c.get('agent')}" for c in mcp))
    print_board(payload.get("board") or {})
    if payload.get("last"):
        print("last:")
        print_msg(payload["last"])


def remote_heartbeat(frm: str, status: str = "working", topic: str = "") -> dict[str, Any]:
    if server_up():
        return http_json("POST", "/heartbeat", {"from": frm, "status": status, "topic": topic})
    return silent_heartbeat(frm, status, topic)


def cmd_post(args: argparse.Namespace) -> None:
    body = Path(args.body_file).read_text(encoding="utf-8") if args.body_file else args.body
    msg = remote_or_local_post(
        **{
            "from": args.src, "to": args.dst, "body": body or "",
            "topic": args.topic, "kind": args.kind, "files": args.files or [],
            "in_reply_to": args.reply or "",
        }
    )
    print_msg(msg)


def cmd_log(args: argparse.Namespace) -> None:
    msgs = http_json("GET", f"/log?n={args.n}") if server_up() else load_messages()[-args.n:]
    if args.for_agent:
        msgs = [m for m in msgs if addressed_to(m, args.for_agent)]
    for msg in msgs:
        print_msg(msg)
        print()


def cmd_wait(args: argparse.Namespace) -> None:
    print(f"waiting for {args.for_agent} (timeout {args.timeout}s)...", file=sys.stderr)
    if args.for_agent in WRITERS:
        try:
            remote_heartbeat(args.for_agent, "waiting", args.topic)
        except SystemExit:
            pass
    topic = args.topic or ""
    if server_up():
        q = f"/wait?for={args.for_agent}&timeout={args.timeout}"
        if topic:
            q += f"&topic={topic}"
        payload = http_json("GET", q, timeout=args.timeout + 2)
        msgs = payload.get("messages") or []
    else:
        msgs = wait_for(args.for_agent, args.timeout, topic=topic)
    if not msgs:
        raise SystemExit(1)
    ids = set()
    for msg in msgs:
        print_msg(msg)
        ids.add(msg["id"])
    if args.mark_read:
        mark_read(ids)


def cmd_claim(args: argparse.Namespace) -> None:
    msg = remote_or_local_post(**{
        "from": args.src, "to": "*", "kind": "claim", "topic": args.topic,
        "files": args.files, "body": args.body or f"{args.src} claims {', '.join(args.files)}",
    })
    print_msg(msg)


def cmd_release(args: argparse.Namespace) -> None:
    msg = remote_or_local_post(**{
        "from": args.src, "to": "*", "kind": "release", "topic": args.topic,
        "files": args.files or [], "body": args.body or f"{args.src} released",
    })
    print_msg(msg)


def cmd_heartbeat(args: argparse.Namespace) -> None:
    evt = remote_heartbeat(args.src, args.status, args.topic)
    print(f"{evt.get('ts')}  {args.src} presence {args.status} {args.topic}".strip())


def cmd_serve(args: argparse.Namespace) -> None:
    STORE_DIR.mkdir(parents=True, exist_ok=True)
    import collab_mcp
    collab_mcp.bus = sys.modules[__name__]
    server = ThreadingHTTPServer((args.host, args.port), BusHandler)
    PID_PATH.write_text(str(os.getpid()), encoding="utf-8")
    url = f"http://{args.host}:{args.port}"
    print(f"pairing board  {url}/live", flush=True)
    print(f"SSE {url}/stream?for=*   POST {url}/post", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
        server.shutdown()
    finally:
        if PID_PATH.exists():
            PID_PATH.unlink()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Cursor <-> DeepSeek real-time pairing bus")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status", help="turn, presence, claims, unread").set_defaults(func=cmd_status)

    def add_agent(p: argparse.ArgumentParser) -> None:
        p.add_argument("--from", dest="src", required=True, choices=WRITERS)

    p_post = sub.add_parser("post")
    p_post.add_argument("--from", dest="src", required=True, choices=AGENTS)
    p_post.add_argument("--to", dest="dst", required=True, choices=AGENTS)
    p_post.add_argument("--topic", default="")
    p_post.add_argument("--kind", default="handoff", choices=KINDS)
    p_post.add_argument("--body", default="")
    p_post.add_argument("--body-file")
    p_post.add_argument("--files", nargs="*", default=[])
    p_post.add_argument("--reply", default="")
    p_post.set_defaults(func=cmd_post)

    p_log = sub.add_parser("log")
    p_log.add_argument("-n", type=int, default=20)
    p_log.add_argument("--for", dest="for_agent", choices=AGENTS)
    p_log.set_defaults(func=cmd_log)

    p_wait = sub.add_parser("wait")
    p_wait.add_argument("--for", dest="for_agent", required=True, choices=("cursor", "deepseek", "human"))
    p_wait.add_argument("--timeout", type=float, default=30)
    p_wait.add_argument("--topic", default="")
    p_wait.add_argument("--mark-read", action="store_true")
    p_wait.set_defaults(func=cmd_wait)

    p_claim = sub.add_parser("claim", help="exclusive write lock on files")
    add_agent(p_claim)
    p_claim.add_argument("--topic", default="")
    p_claim.add_argument("--body", default="")
    p_claim.add_argument("files", nargs="+")
    p_claim.set_defaults(func=cmd_claim)

    p_rel = sub.add_parser("release")
    add_agent(p_rel)
    p_rel.add_argument("--topic", default="")
    p_rel.add_argument("--body", default="")
    p_rel.add_argument("files", nargs="*")
    p_rel.set_defaults(func=cmd_release)

    p_hb = sub.add_parser("heartbeat")
    add_agent(p_hb)
    p_hb.add_argument("--topic", default="")
    p_hb.add_argument("--status", default="working")
    p_hb.add_argument("--body", default="")
    p_hb.set_defaults(func=cmd_heartbeat)

    p_serve = sub.add_parser("serve")
    p_serve.add_argument("--host", default="127.0.0.1")
    p_serve.add_argument("--port", type=int, default=8765)
    p_serve.set_defaults(func=cmd_serve)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
