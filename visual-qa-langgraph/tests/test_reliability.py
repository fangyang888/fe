from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from visual_qa_graph.repair import apply_edits, recover_pending_edits, rollback_edits
from visual_qa_graph.workflow import _apply, run_workflow


def verification(passed: bool = True) -> dict:
    return {"verification": {"status": "passed" if passed else "failed",
            "mode": "final" if passed else "quick", "artifacts": {},
            "comparison": {"mismatchPercent": 0 if passed else 4, "ssim": 1 if passed else .8}}}


class ReliabilityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.source = self.root / "styles.css"
        self.source.write_text("#box { color: red; }\n")
        (self.root / "design.png").write_bytes(b"local design fixture")
        self.case = self.root / "case.json"
        self.case.write_text(json.dumps({"platform": "web", "designImage": "design.png"}))
        self.kwargs = dict(case_path=self.case, run_dir=self.root / "run", cache_dir=self.root / "cache",
                           repo_root=Path(__file__).resolve().parents[2], source_paths=[self.source])
        self.edit = {"path": str(self.source), "find": "color: red", "replace": "color: blue"}

    def response(self):
        return SimpleNamespace(content=json.dumps({"diagnosis": "fix color", "edits": [self.edit]}),
                               usage_metadata={"input_tokens": 10, "output_tokens": 10, "total_tokens": 20},
                               response_metadata={})

    def assert_fresh_source(self, state):
        self.assertEqual(state["source"]["files"][str(self.source)],
                         hashlib.sha256(self.source.read_bytes()).hexdigest())

    def test_second_file_failure_restores_first_before_reporting_rejected(self):
        second = self.root / "second.css"
        second.write_text("old")
        replace = os.replace

        def fail_second(src, dst):
            if Path(dst) == second:
                raise OSError("disk write failed")
            return replace(src, dst)

        with patch("visual_qa_graph.repair.os.replace", side_effect=fail_second):
            result = _apply({"edits": [self.edit, {"path": str(second), "find": "old", "replace": "new"}],
                             "source": {"files": {str(p): hashlib.sha256(p.read_bytes()).hexdigest()
                                                   for p in [self.source, second]}},
                             "run_dir": str(self.root / "run")})
        self.assertEqual(result["apply_result"]["status"], "rejected")
        self.assertIn("color: red", self.source.read_text())
        self.assertEqual(second.read_text(), "old")
        self.assertEqual(recover_pending_edits(self.root / "run"), [])

    def test_crash_between_file_writes_is_recoverable_from_durable_journal(self):
        second = self.root / "second.css"
        second.write_text("old")
        child = subprocess.run([sys.executable, "-c", """
import os, sys
from pathlib import Path
from unittest.mock import patch
from visual_qa_graph.repair import apply_edits
first, second, backup = map(Path, sys.argv[1:])
real = os.replace
def crash(src, dst):
    real(src, dst)
    if Path(dst) == first:
        os._exit(17)
with patch('visual_qa_graph.repair.os.replace', side_effect=crash):
    apply_edits([{'path':str(first),'find':'red','replace':'blue'},
                 {'path':str(second),'find':'old','replace':'new'}], [first,second], backup)
""", str(self.source), str(second), str(self.root / "run/backups/fix-1")],
            capture_output=True, text=True, timeout=15)
        self.assertEqual(child.returncode, 17, child.stderr)
        self.assertIn("blue", self.source.read_text())
        recovered = recover_pending_edits(self.root / "run")
        self.assertEqual(len(recovered), 1)
        self.assertIn("red", self.source.read_text())
        self.assertEqual(second.read_text(), "old")
        self.assertEqual(recover_pending_edits(self.root / "run"), [])

    def test_failed_restoration_is_not_reported_as_clean_rejection(self):
        second = self.root / "second.css"
        second.write_text("old")
        replace = os.replace

        def fail_write_and_restore(src, dst):
            if Path(dst) == second or (Path(dst) == self.source and b"red" in Path(src).read_bytes()):
                raise OSError("disk unavailable")
            return replace(src, dst)

        with patch("visual_qa_graph.repair.os.replace", side_effect=fail_write_and_restore):
            with self.assertRaisesRegex(RuntimeError, "rollback incomplete"):
                _apply({"edits": [self.edit, {"path": str(second), "find": "old", "replace": "new"}],
                        "source": {"files": {str(p): hashlib.sha256(p.read_bytes()).hexdigest()
                                              for p in [self.source, second]}},
                        "run_dir": str(self.root / "run")})
        self.assertEqual(len(recover_pending_edits(self.root / "run")), 1)
        self.assertIn("red", self.source.read_text())

    def test_new_run_recovers_pending_edits_before_archiving_backups(self):
        apply_edits([self.edit], [self.source], self.root / "run/backups/fix-1")

        def fresh(state):
            self.assertIn("red", self.source.read_text())
            self.assert_fresh_source(state)
            return verification()

        with patch("visual_qa_graph.workflow._verify", side_effect=fresh):
            self.assertTrue(run_workflow(**self.kwargs)["complete"])

    def test_rollback_refuses_to_overwrite_external_changes(self):
        second = self.root / "second.css"
        second.write_text("old")
        result = apply_edits([self.edit, {"path": str(second), "find": "old", "replace": "new"}],
                             [self.source, second], self.root / "backup")
        second.write_text("human edit")
        with self.assertRaisesRegex(RuntimeError, "Source changed"):
            rollback_edits(result)
        self.assertEqual(second.read_text(), "human edit")
        self.assertIn("blue", self.source.read_text())  # Validate all files before any restore.

    def test_rollback_is_idempotent_and_checks_backup_integrity(self):
        result = apply_edits([self.edit], [self.source], self.root / "backup")
        rollback_edits(result)
        rollback_edits(result)
        self.assertIn("red", self.source.read_text())
        Path(result["files"][0]["backup"]).write_text("corrupted")
        with self.assertRaisesRegex(RuntimeError, "Backup changed"):
            rollback_edits(result)

    def test_edit_refuses_stale_source_even_if_find_still_matches(self):
        old_hash = hashlib.sha256(self.source.read_bytes()).hexdigest()
        self.source.write_text(self.source.read_text() + "/* human change */")
        with self.assertRaisesRegex(ValueError, "Source changed after diagnosis"):
            apply_edits([self.edit], [self.source], self.root / "backup",
                        expected_hashes={str(self.source): old_hash})
        self.assertIn("human change", self.source.read_text())
        self.assertIn("red", self.source.read_text())

    def test_reverify_exception_restores_code_and_writes_failure_summary(self):
        with patch("visual_qa_graph.workflow._verify", side_effect=[verification(False), RuntimeError("browser timeout")]), \
             patch("langchain_openai.ChatOpenAI") as model:
            model.return_value.invoke.return_value = self.response()
            with self.assertRaisesRegex(RuntimeError, "browser timeout"):
                run_workflow(**self.kwargs, model_name="mock", auto_fix=True, max_fixes=1)
        self.assertIn("red", self.source.read_text())
        summary = json.loads((self.root / "run/summary.json").read_text())
        self.assertEqual(summary["status"], "error")
        self.assertFalse(summary["complete"])
        self.assertEqual(len(summary["recovery"]), 1)
        self.assertEqual(summary["modelUsage"]["totalTokens"], 20)

        def verify_restored(state):
            self.assert_fresh_source(state)
            self.assertEqual(state["fix_count"], 1)
            self.assertEqual(state["model_name"], "mock")
            self.assertTrue(state["auto_fix"])
            self.assertEqual(state["max_fixes"], 1)
            return verification()

        with patch("visual_qa_graph.workflow._verify", side_effect=verify_restored):
            self.assertTrue(run_workflow(**self.kwargs, resume=True)["complete"])

    def test_resume_updates_endpoint_and_reloads_case_source_and_policy(self):
        skill = self.root / "SKILL.md"
        skill.write_text('```visual-qa-policy\n{"schemaVersion":1,"css":{"unit":"px"}}\n```')
        with patch("visual_qa_graph.workflow._verify", side_effect=RuntimeError("disconnected")):
            with self.assertRaises(RuntimeError):
                run_workflow(**self.kwargs, browser_endpoint="ws://old", project_skill=skill)
        self.source.write_text("#box { width: 2rem; }\n")
        self.case.write_text(json.dumps({"platform": "web", "designImage": "design.png", "name": "updated"}))
        skill.write_text('```visual-qa-policy\n{"schemaVersion":1,"css":{"unit":"rem","rootFontSizePx":10}}\n```')

        def fresh(state):
            self.assertEqual(state["browser_endpoint"], "ws://new")
            self.assertEqual(state["case"]["name"], "updated")
            self.assertEqual(state["project_policy"]["css"]["unit"], "rem")
            self.assert_fresh_source(state)
            return verification()

        with patch("visual_qa_graph.workflow._verify", side_effect=fresh):
            summary = run_workflow(**self.kwargs, browser_endpoint="ws://new", resume=True)
        self.assertTrue(summary["complete"])
        self.assertEqual(len(summary["timings"]["attempts"]), 2)

    def test_resume_discards_pending_edit_and_preserves_omitted_options(self):
        with patch("visual_qa_graph.workflow._verify", return_value=verification(False)), \
             patch("visual_qa_graph.workflow._apply", side_effect=RuntimeError("interrupt before write")), \
             patch("langchain_openai.ChatOpenAI") as model:
            model.return_value.invoke.return_value = self.response()
            with self.assertRaises(RuntimeError):
                run_workflow(**self.kwargs, model_name="mock", auto_fix=True, max_fixes=4)
        self.source.write_text("#box { color: green; }\n")

        def fresh(state):
            self.assertEqual(state["edits"], [])
            self.assertEqual(state["model_name"], "mock")
            self.assertEqual(state["max_fixes"], 4)
            self.assertEqual(state["cache_dir"], str(self.root / "cache"))
            self.assert_fresh_source(state)
            return verification()

        without_cache = {key: value for key, value in self.kwargs.items() if key != "cache_dir"}
        with patch("visual_qa_graph.workflow._verify", side_effect=fresh), patch("langchain_openai.ChatOpenAI") as model:
            run_workflow(**without_cache, resume=True)
            model.assert_not_called()
        self.assertIn("green", self.source.read_text())

    def test_completed_resume_takes_fresh_evidence_instead_of_returning_old_success(self):
        with patch("visual_qa_graph.workflow._verify", return_value=verification()):
            run_workflow(**self.kwargs)
        self.source.write_text("changed")
        with patch("visual_qa_graph.workflow._verify", return_value=verification(False)) as verify:
            summary = run_workflow(**self.kwargs, resume=True)
        verify.assert_called_once()
        self.assertFalse(summary["complete"])
        self.assertEqual(len(summary["rounds"]), 2)

    def test_resume_rejects_different_case(self):
        with patch("visual_qa_graph.workflow._verify", return_value=verification()):
            run_workflow(**self.kwargs)
        with self.assertRaisesRegex(ValueError, "original case path"):
            run_workflow(**{**self.kwargs, "case_path": self.root / "other.json"}, resume=True)

    def test_new_run_archives_previous_backups(self):
        for _ in range(2):
            self.source.write_text("#box { color: red; }\n")
            with patch("visual_qa_graph.workflow._verify", side_effect=[verification(False), verification()]), \
                 patch("langchain_openai.ChatOpenAI") as model:
                model.return_value.invoke.return_value = self.response()
                self.assertTrue(run_workflow(**self.kwargs, model_name="mock", auto_fix=True)["complete"])
        self.assertEqual(len(list((self.root / "run/history").glob("*/backups/fix-1/transaction.json"))), 1)


class CliExitTests(unittest.TestCase):
    def test_process_exit_codes(self):
        for status, mode, complete, expected in [("passed", "final", True, 0), ("failed", "final", False, 1),
                                                 ("offline_review", "offline", False, 1), ("passed", "quick", False, 1)]:
            with self.subTest(status=status, mode=mode):
                child = subprocess.run([sys.executable, "-c", """
import json, sys
from unittest.mock import patch
from visual_qa_graph.cli import main
result = json.loads(sys.argv[1])
sys.argv = ['visual-qa-graph', '--case', 'unused.json']
with patch('visual_qa_graph.cli.run_workflow', return_value=result):
    sys.exit(main())
""", json.dumps({"status": status, "mode": mode, "complete": complete})], capture_output=True, text=True, timeout=15)
                self.assertEqual(child.returncode, expected, child.stderr)
                self.assertEqual(json.loads(child.stdout)["status"], status)

    def test_execution_error_returns_two(self):
        with tempfile.TemporaryDirectory() as root:
            child = subprocess.run([sys.executable, "-m", "visual_qa_graph.cli", "--case", "/nonexistent/case.json",
                                    "--run-dir", str(Path(root) / "run"), "--cache-dir", str(Path(root) / "cache")],
                                   capture_output=True, text=True, timeout=15)
        self.assertEqual(child.returncode, 2)
        self.assertEqual(json.loads(child.stderr)["status"], "error")
