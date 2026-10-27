from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from visual_qa_graph.repair import source_context
from visual_qa_graph.workflow import _diagnose, make_repair_packet


class DiagnosticTests(unittest.TestCase):
    def test_zero_pixel_difference_preserves_all_other_failure_reasons(self):
        packet = make_repair_packet({"status": "failed", "mode": "final",
            "comparison": {"mismatchPercent": 0, "ssim": 1, "differenceRegions": []},
            "capture": {"readiness": {"fontsReady": False, "layoutStable": False, "imagesFailed": ["/broken.png"]},
                        "consoleErrors": ["ReferenceError: submitOrder is not defined"],
                        "cssRules": {"passed": False, "failOnMismatch": True, "violations": [
                            {"rule": "prefer-rem", "severity": "error", "selector": ".card", "property": "width",
                             "value": "30px", "message": "Use rem"}]},
                        "structure": {"passed": False, "failOnMismatch": True, "regions": [
                            {"name": "hero", "checks": [{"check": "single-image", "passed": False, "message": "Unexpected children"}]}]},
                        "measurement": {"passed": False, "issues": [{"selector": "#card", "property": "width", "expected": 30, "actual": 40}]}}}, {})
        self.assertEqual(packet["regions"], [])
        self.assertEqual({issue["kind"] for issue in packet["failures"]},
                         {"fonts", "layout", "image", "console", "css", "structure", "measurement"})
        self.assertEqual(packet["omittedFailures"], 0)
        self.assertEqual(next(issue for issue in packet["failures"] if issue["kind"] == "css")["selector"], ".card")

    def test_failures_are_bounded_and_warnings_keep_nonblocking_status(self):
        packet = make_repair_packet({"capture": {
            "consoleErrors": ["x" * 10000 for _ in range(100)],
            "cssRules": {"passed": False, "failOnMismatch": False, "violations": [
                {"severity": "error", "message": "opt-in warning", "selector": "#card"}]}}}, {})
        self.assertLess(len(json.dumps(packet)), 5000)
        self.assertEqual(packet["omittedFailures"], 94)
        self.assertFalse(packet["failures"][-1]["blocking"])
        self.assertEqual(packet["failureCounts"]["console"], 100)

    def test_rem_build_policy_reaches_model_without_full_skill_or_design_tree(self):
        with tempfile.TemporaryDirectory() as root:
            source = Path(root) / "styles.css"
            source.write_text(".card { width: 30px; }")
            policy = {"css": {"unit": "rem", "conversion": "build", "rootFontSizePx": 10},
                      "layout": {"preferFlex": True}, "rawSkill": "DO_NOT_SEND"}
            response = SimpleNamespace(content='{"diagnosis":"check units","edits":[]}', usage_metadata={}, response_metadata={})
            with patch("langchain_openai.ChatOpenAI") as model:
                model.return_value.invoke.return_value = response
                _diagnose({"run_dir": root, "model_name": "mock", "auto_fix": True,
                           "source": {"files": {str(source): "hash"}},
                           "packet": {"regions": [], "failures": [{"kind": "css", "selector": ".card", "message": "Use rem"}]},
                           "project_policy": policy, "case": {"cssRules": {"preferRem": True}},
                           "design": {"tree": "DO_NOT_SEND"}})
            messages = model.return_value.invoke.call_args.args[0]
            payload = json.loads(messages[1].content[0]["text"])
            self.assertEqual(payload["projectPolicy"]["css"], policy["css"])
            self.assertTrue(payload["cssRules"]["preferRem"])
            self.assertIn(".card", payload["sourceExcerpts"][0]["excerpt"])
            self.assertIn("build conversion", messages[0].content)
            self.assertNotIn("DO_NOT_SEND", str(messages))

    def test_css_errors_are_not_hidden_by_many_earlier_warnings(self):
        packet = make_repair_packet({"capture": {"cssRules": {
            "failOnMismatch": True, "failOnSeverity": "error", "violations": [
                *[{"severity": "warning", "message": "warning"} for _ in range(20)],
                {"severity": "error", "selector": "#broken", "message": "blocking failure"}]}}}, {})
        self.assertEqual(packet["failures"][0]["selector"], "#broken")
        self.assertTrue(packet["failures"][0]["blocking"])


class SourceContextTests(unittest.TestCase):
    def test_id_class_and_data_visual_find_targets_after_line_eighty(self):
        cases = [('#target', '<div\n id="target">TARGET</div>'),
                 ('.target', '<section class="card target active">TARGET</section>'),
                 ('.target', '<section className={"card target"}>TARGET</section>'),
                 ('.target', '.target:hover { color: red; /* TARGET */ }'),
                 ('[data-visual="target"]', '<div data-visual = \'target\'>TARGET</div>')]
        for selector, body in cases:
            with self.subTest(selector=selector, body=body), tempfile.TemporaryDirectory() as root:
                source = Path(root) / "page.txt"
                source.write_text("\n".join(["filler"] * 150 + [body]))
                packet = {"regions": [{"domCandidates": [{"selector": selector}]}]}
                context = source_context(packet, [source])
                self.assertIn("TARGET", context[0]["excerpt"])

    def test_css_failure_selector_locates_source_without_pixel_regions(self):
        with tempfile.TemporaryDirectory() as root:
            source = Path(root) / "style.css"
            source.write_text("\n".join(["/* filler */"] * 120 + ['.card { width: 1rem; }']))
            context = source_context({"failures": [{"selector": ".card"}]}, [source])
            self.assertIn(".card", context[0]["excerpt"])

    def test_matching_files_get_budget_before_large_unrelated_file(self):
        with tempfile.TemporaryDirectory() as root:
            folder = Path(root)
            unrelated = folder / "unrelated.js"
            unrelated.write_text("x" * 20000)
            css, page = folder / "style.css", folder / "page.html"
            css.write_text("\n".join(["/* filler */"] * 120 + [".target { color: blue; }"]))
            page.write_text("\n".join(["<!-- filler -->"] * 120 + ['<div class="target">FOUND</div>']))
            context = source_context({"regions": [{"domCandidates": [{"selector": ".target"}]}]},
                                     [unrelated, css, page], max_chars=500)
            excerpts = {item["path"]: item["excerpt"] for item in context}
            self.assertIn("color: blue", excerpts[str(css)])
            self.assertIn("FOUND", excerpts[str(page)])
            self.assertLessEqual(sum(len(value) for value in excerpts.values()), 500)

    def test_class_name_does_not_match_a_longer_class(self):
        with tempfile.TemporaryDirectory() as root:
            source = Path(root) / "style.css"
            source.write_text("\n".join(["/* filler */"] * 120 + [".target-other { color: red; }"]))
            context = source_context({"failures": [{"selector": ".target"}]}, [source])
            self.assertNotIn("target-other", context[0]["excerpt"])
