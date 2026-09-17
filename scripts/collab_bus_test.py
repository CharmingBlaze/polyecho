#!/usr/bin/env python3
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import collab_board
import collab_bus as bus


class CollabBusTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.log = self.dir / "bus.jsonl"
        self.addCleanup(self.tmp.cleanup)
        bus._board = None
        self.patches = [
            mock.patch.object(bus, "STORE_DIR", self.dir),
            mock.patch.object(bus, "LOG_PATH", self.log),
        ]
        for p in self.patches:
            p.start()
            self.addCleanup(p.stop)
        self.addCleanup(setattr, bus, "_board", None)

    def test_post_and_unread(self) -> None:
        msg = bus.post("cursor", "deepseek", "lease is mine", topic="lease", kind="handoff")
        self.assertEqual(msg["from"], "cursor")
        self.assertEqual(msg["to"], "deepseek")
        unread = bus.unread_for("deepseek")
        self.assertEqual(len(unread), 1)
        self.assertEqual(unread[0]["body"], "lease is mine")
        self.assertEqual(bus.unread_for("cursor"), [])

    def test_star_is_for_everyone(self) -> None:
        bus.post("human", "*", "keep going", kind="handoff")
        self.assertEqual(len(bus.unread_for("cursor")), 1)
        self.assertEqual(len(bus.unread_for("deepseek")), 1)

    def test_mark_read(self) -> None:
        msg = bus.post("deepseek", "cursor", "mailbox updated", kind="done")
        bus.mark_read({msg["id"]})
        self.assertEqual(bus.unread_for("cursor"), [])
        stored = json.loads(self.log.read_text(encoding="utf-8").strip())
        self.assertTrue(stored["read"])

    def test_wait_wakes_on_post_from_another_thread(self) -> None:
        import threading
        import time

        def later() -> None:
            time.sleep(0.08)
            bus.post("deepseek", "cursor", "live ping", kind="handoff")

        worker = threading.Thread(target=later)
        worker.start()
        arrived = bus.wait_for("cursor", timeout=2)
        worker.join()
        self.assertEqual(len(arrived), 1)
        self.assertEqual(arrived[0]["body"], "live ping")

    def test_claim_conflict_rejects_other_agent(self) -> None:
        bus.post("cursor", "*", "taking store", topic="lease", kind="claim", files=["src/stores/projectStore.ts"])
        with self.assertRaises(SystemExit) as ctx:
            bus.post("deepseek", "*", "also store", topic="revisions", kind="claim", files=["src/stores/projectStore.ts"])
        self.assertIn("CLAIM DENIED", str(ctx.exception))
        snap = bus.board().snapshot()
        self.assertEqual(snap["claims"]["src/stores/projectStore.ts"]["agent"], "cursor")

    def test_same_agent_can_extend_claim(self) -> None:
        bus.post("cursor", "*", "store", kind="claim", files=["src/stores/projectStore.ts"], topic="lease")
        bus.post("cursor", "*", "ops", kind="claim", files=["src/core/geometry/Operations.ts"], topic="lease")
        claims = bus.board().snapshot()["claims"]
        self.assertEqual(claims["src/stores/projectStore.ts"]["agent"], "cursor")
        self.assertEqual(claims["src/core/geometry/Operations.ts"]["agent"], "cursor")

    def test_done_releases_claims_and_presence(self) -> None:
        bus.post("deepseek", "*", "taking join", kind="claim", files=["src/core/geometry/MeshJoin.ts"], topic="join")
        bus.post("deepseek", "cursor", "join landed", kind="done", topic="join")
        snap = bus.board().snapshot()
        self.assertEqual(snap["claims"], {})
        self.assertEqual(snap["presence"]["deepseek"]["status"], "review")

    def test_wait_can_filter_topic(self) -> None:
        bus.post("deepseek", "cursor", "noise", topic="seams", kind="handoff")
        bus.post("deepseek", "cursor", "lease ping", topic="lease", kind="handoff")
        hit = bus.wait_for("cursor", timeout=0.2, topic="lease")
        self.assertEqual(len(hit), 1)
        self.assertEqual(hit[0]["body"], "lease ping")

    def test_seq_increments(self) -> None:
        a = bus.post("cursor", "deepseek", "one", kind="handoff")
        b = bus.post("cursor", "deepseek", "two", kind="handoff")
        self.assertEqual(a["seq"] + 1, b["seq"])

    def test_dashboard_written(self) -> None:
        bus.post("cursor", "deepseek", "hi", kind="handoff")
        board_md = self.dir / "BOARD.md"
        self.assertTrue(board_md.exists())
        self.assertIn("Pairing board", board_md.read_text(encoding="utf-8"))


class CollabMcpTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)
        bus._board = None
        self.patches = [
            mock.patch.object(bus, "STORE_DIR", self.dir),
            mock.patch.object(bus, "LOG_PATH", self.dir / "bus.jsonl"),
            mock.patch.object(bus, "server_up", return_value=False),
        ]
        for p in self.patches:
            p.start()
            self.addCleanup(p.stop)
        self.addCleanup(setattr, bus, "_board", None)
        import collab_mcp
        self.mcp = collab_mcp

    def test_initialize_lists_tools(self) -> None:
        init = self.mcp.handle_rpc({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}, "cursor", inline=True)
        self.assertEqual(init["result"]["serverInfo"]["name"], "polyecho-collab")
        listed = self.mcp.handle_rpc({"jsonrpc": "2.0", "id": 2, "method": "tools/list"}, "cursor", inline=True)
        names = [t["name"] for t in listed["result"]["tools"]]
        self.assertIn("collab_claim", names)
        self.assertIn("collab_status", names)

    def test_claim_conflict_is_tool_error(self) -> None:
        self.mcp.call_tool("collab_claim", {"files": ["src/stores/projectStore.ts"], "topic": "x"}, "cursor", inline=True)
        denied = self.mcp.call_tool("collab_claim", {"files": ["src/stores/projectStore.ts"]}, "deepseek", inline=True)
        self.assertTrue(denied["isError"])
        self.assertIn("CLAIM DENIED", denied["content"][0]["text"])


class CollabBoardTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.board = collab_board.Board(Path(self.tmp.name) / "board.json")

    def test_hot_files_listed(self) -> None:
        snap = self.board.snapshot()
        self.assertIn("src/stores/projectStore.ts", snap["hot"])

    def test_refuses_parent_paths(self) -> None:
        with self.assertRaises(ValueError):
            self.board.claim("cursor", ["../secret"], "x")


if __name__ == "__main__":
    unittest.main()
