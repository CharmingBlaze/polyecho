"""Pairing board: file claims and agent presence. Stdlib only."""
from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WRITERS = ("cursor", "deepseek")
STALE_S = 90.0

# Files two agents must never edit at the same time.
HOT_FILES = (
    "src/stores/projectStore.ts",
    "src/components/viewport/Viewport3D.vue",
    "src/core/geometry/Operations.ts",
    "src/core/mesh/MeshRepository.ts",
)


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_ts(value: str | None) -> float:
    if not value:
        return 0.0
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0


def norm_path(path: str) -> str:
    text = path.strip().replace("\\", "/")
    while text.startswith("./"):
        text = text[2:]
    if ".." in text.split("/"):
        raise ValueError(f"refusing path {path!r}")
    return text


class ClaimConflict(Exception):
    def __init__(self, conflicts: list[dict[str, str]]):
        super().__init__("file already claimed")
        self.conflicts = conflicts


class Board:
    def __init__(self, path: Path):
        self.path = path
        self.lock = threading.Lock()
        self.claims: dict[str, dict[str, str]] = {}
        self.presence: dict[str, dict[str, str]] = {
            agent: {"status": "offline", "topic": "", "seen": ""} for agent in WRITERS
        }
        self.load()

    def load(self) -> None:
        if not self.path.exists():
            return
        data = json.loads(self.path.read_text(encoding="utf-8"))
        self.claims = data.get("claims") or {}
        for agent in WRITERS:
            self.presence[agent] = {**self.presence[agent], **(data.get("presence") or {}).get(agent, {})}

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps({
            "claims": self.claims,
            "presence": self.presence,
        }, indent=2), encoding="utf-8")
        tmp.replace(self.path)

    def touch(self, agent: str, status: str | None = None, topic: str | None = None) -> None:
        if agent not in WRITERS:
            return
        row = self.presence.setdefault(agent, {"status": "idle", "topic": "", "seen": ""})
        row["seen"] = now_iso()
        if status:
            row["status"] = status
        if topic is not None:
            row["topic"] = topic
        self.save()

    def claim(self, agent: str, files: list[str], topic: str = "") -> None:
        if agent not in WRITERS:
            raise ValueError("only cursor/deepseek can claim files")
        wanted = [norm_path(f) for f in files if f.strip()]
        conflicts = []
        for path in wanted:
            owner = self.claims.get(path)
            if owner and owner.get("agent") != agent:
                conflicts.append({"file": path, "by": owner["agent"], "topic": owner.get("topic", "")})
        if conflicts:
            raise ClaimConflict(conflicts)
        ts = now_iso()
        for path in wanted:
            self.claims[path] = {"agent": agent, "topic": topic, "since": ts}
        self.touch(agent, "working", topic)
        self.save()

    def release(self, agent: str, files: list[str] | None = None) -> None:
        if files:
            drop = {norm_path(f) for f in files}
            self.claims = {p: c for p, c in self.claims.items() if not (p in drop and c.get("agent") == agent)}
        else:
            self.claims = {p: c for p, c in self.claims.items() if c.get("agent") != agent}
        self.touch(agent, "idle", "")
        self.save()

    def apply_message(self, msg: dict[str, Any]) -> None:
        agent = msg.get("from", "")
        kind = msg.get("kind", "")
        topic = msg.get("topic") or ""
        files = msg.get("files") or []
        if kind == "claim":
            self.claim(agent, files, topic)
            return
        if kind == "release":
            self.release(agent, files or None)
            return
        if kind in ("done", "idle", "nack"):
            self.release(agent)
            self.touch(agent, "idle" if kind != "done" else "review", topic)
            return
        if kind == "heartbeat":
            self.touch(agent, msg.get("status") or "working", topic)
            return
        if kind == "progress":
            self.touch(agent, "working", topic)
            return
        if kind in ("question",):
            self.touch(agent, "blocked", topic)
            return
        if agent in WRITERS:
            self.touch(agent, None, topic or None)

    def snapshot(self) -> dict[str, Any]:
        now = datetime.now(timezone.utc).timestamp()
        presence = {}
        for agent, row in self.presence.items():
            age = now - parse_ts(row.get("seen"))
            live = bool(row.get("seen")) and age <= STALE_S
            presence[agent] = {
                **row,
                "live": live,
                "age_s": int(age) if row.get("seen") else None,
                "status": row.get("status") if live else "offline",
            }
        return {
            "claims": self.claims,
            "presence": presence,
            "hot": list(HOT_FILES),
        }
