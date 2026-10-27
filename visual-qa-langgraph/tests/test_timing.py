from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from visual_qa_graph.timing import append_timing, close_interrupted_attempts, read_timing, summarize_timing
from visual_qa_graph.workflow import run_workflow


class TimingTests(unittest.TestCase):
    def test_parallel_spans_use_union_and_keep_every_round(self) -> None:
        records = [
            {"kind": "run-start", "attemptId": "a", "atMs": 0},
            {"kind": "node", "node": "prepare_design", "startMs": 10, "endMs": 110,
             "durationMs": 100, "roundIndex": 1, "phase": "parallel", "cached": False},
            {"kind": "node", "node": "prepare_source", "startMs": 30, "endMs": 80,
             "durationMs": 50, "roundIndex": 1, "phase": "parallel", "cached": True},
            {"kind": "node", "node": "join_preparation", "startMs": 110, "endMs": 120,
             "durationMs": 10, "roundIndex": 1, "phase": "parallel", "cached": False},
            {"kind": "node", "node": "verify", "startMs": 120, "endMs": 180,
             "durationMs": 60, "roundIndex": 1, "cached": False},
            {"kind": "node", "node": "prepare_design", "startMs": 210, "endMs": 220,
             "durationMs": 10, "roundIndex": 2, "phase": "parallel", "cached": True},
            {"kind": "node", "node": "prepare_source", "startMs": 210, "endMs": 230,
             "durationMs": 20, "roundIndex": 2, "phase": "parallel", "cached": False},
            {"kind": "run-end", "attemptId": "a", "atMs": 300, "status": "completed"},
        ]
        summary = summarize_timing(records)
        self.assertEqual(summary["activeWallMs"], 300)
        self.assertEqual(summary["rounds"][0]["parallelPreparation"], {
            "designMs": 100, "sourceMs": 50, "wallMs": 100, "overlapMs": 50,
        })
        self.assertEqual(summary["rounds"][1]["parallelPreparation"]["overlapMs"], 10)
        self.assertEqual(next(stage for stage in summary["stages"] if stage["name"] == "prepare_design")["calls"], 2)

    def test_resume_closes_interrupted_attempt_without_counting_idle_gap(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            run_dir = Path(root)
            append_timing(run_dir, {"kind": "run-start", "attemptId": "a", "atMs": 0})
            append_timing(run_dir, {"kind": "node", "node": "verify", "startMs": 10,
                                    "endMs": 60, "durationMs": 50, "roundIndex": 1})
            close_interrupted_attempts(run_dir)
            append_timing(run_dir, {"kind": "run-start", "attemptId": "b", "atMs": 100})
            append_timing(run_dir, {"kind": "run-end", "attemptId": "b", "atMs": 150,
                                    "status": "completed"})
            summary = summarize_timing(read_timing(run_dir))
            self.assertEqual(summary["activeWallMs"], 110)
            self.assertEqual(summary["elapsedWallMs"], 150)
            self.assertEqual(summary["attempts"][0]["status"], "interrupted")
            self.assertEqual(summary["openAttempts"], [])

    def test_partial_last_record_is_repaired_before_next_append(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            run_dir = Path(root)
            append_timing(run_dir, {"kind": "run-start", "attemptId": "a", "atMs": 1})
            with (run_dir / "timing.jsonl").open("a", encoding="utf-8") as stream:
                stream.write('{"kind":"node"')
            self.assertEqual(len(read_timing(run_dir)), 1)
            append_timing(run_dir, {"kind": "run-end", "attemptId": "a", "atMs": 2,
                                    "status": "completed"})
            self.assertEqual(len(read_timing(run_dir)), 2)

    def test_failed_graph_still_writes_timing_report(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            folder = Path(root)
            (folder / "design.png").write_bytes(b"design")
            (folder / "index.html").write_text("<div>page</div>", encoding="utf-8")
            case = folder / "case.json"
            case.write_text(json.dumps({"name": "page", "platform": "web", "designImage": "design.png"}),
                            encoding="utf-8")
            with patch("visual_qa_graph.workflow._prepare_design", side_effect=RuntimeError("design failed")):
                with self.assertRaisesRegex(RuntimeError, "design failed"):
                    run_workflow(case_path=case, run_dir=folder / "run",
                                 repo_root=Path(__file__).resolve().parents[2])
            timing = json.loads((folder / "run" / "timing-summary.json").read_text())
            self.assertEqual(timing["attempts"][0]["status"], "failed")
            self.assertEqual(next(stage for stage in timing["stages"]
                                  if stage["name"] == "prepare_design")["failedCalls"], 1)


if __name__ == "__main__":
    unittest.main()
