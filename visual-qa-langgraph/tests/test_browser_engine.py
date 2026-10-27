"""Opt-in real Chrome integration: VISUAL_QA_BROWSER_TESTS=1 python -m unittest ..."""

from __future__ import annotations

import json
import os
import tempfile
import threading
import unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from PIL import Image

from visual_qa_graph.commands import capture_page
from visual_qa_graph.engine import verify_case
from visual_qa_graph.workflow import run_workflow


@unittest.skipUnless(os.environ.get("VISUAL_QA_BROWSER_TESTS") == "1", "Set VISUAL_QA_BROWSER_TESTS=1 for real Chrome")
class BrowserEngineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

        class QuietHandler(SimpleHTTPRequestHandler):
            def log_message(self, *_args):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(self.root)))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.case = {"name": "native-browser", "url": f"http://127.0.0.1:{self.server.server_port}/",
                     "designImage": "design.png", "viewport": {"width": 100, "height": 100}, "outputDir": "output",
                     "wait": {"networkIdle": False, "timeoutMs": 1500}, "browserChannel": "chrome",
                     "cssRules": {"preferResponsivePage": False}}
        Image.new("RGB", (100, 100), "white").save(self.root / "design.png")
        self.page("<main id='page'></main>", "#page{width:100px;height:100px}")

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def page(self, content, css=""):
        (self.root / "index.html").write_text(f"<!doctype html><html><head><link rel='icon' href='data:,'><style>body{{margin:0}}{css}</style></head><body>{content}</body></html>")

    def case_path(self):
        path = self.root / "case.json"
        path.write_text(json.dumps(self.case))
        return path

    def verify(self):
        return verify_case(self.case_path())

    def test_clean_page_then_visual_failure_has_dom_candidates_and_crops(self):
        self.assertEqual(self.verify()["status"], "passed")
        self.page("<main id='box'></main>", "#box{width:20px;height:20px;background:black}")
        result = self.verify()
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["comparison"]["differenceRegions"][0]["domCandidates"][0]["selector"], "#box")
        self.assertTrue(Path(result["artifacts"]["diagnosticCrops"][0]).is_file())
        self.assertEqual(result["capture"]["readiness"]["imagesFailed"], [])

    def test_css_structure_measurement_and_console_fail_even_on_identical_pixels(self):
        self.page("<main id='box'></main><script>console.error('broken')</script>", "#box{display:grid;width:20px;height:20px}")
        self.case["structure"] = {"regions": [{"type": "single-image", "name": "box", "selector": "#box"}]}
        self.case["contract"] = {"elements": [{"name": "box", "selector": "#box", "bounds": {"width": 30}}]}
        self.case["cssRules"]["preferRem"] = True
        result = self.verify()
        self.assertEqual(result["comparison"]["mismatchPercent"], 0)
        self.assertEqual(result["status"], "failed")
        for key in ("cssRules", "structure", "measurement"):
            self.assertFalse(result["capture"][key]["passed"])
        self.assertIn("broken", result["capture"]["consoleErrors"])

    def test_missing_background_image_blocks_readiness(self):
        self.page("<main id='box'></main>", "#box{width:20px;height:20px;background-image:url(missing.png)}")
        result = self.verify()
        self.assertEqual(result["status"], "failed")
        self.assertTrue(any("missing.png" in url for url in result["capture"]["readiness"]["imagesFailed"]))

    def test_nested_background_and_child_images_pass_composite_structure(self):
        Image.new("RGBA", (100, 100), "white").save(self.root / "base.png")
        Image.new("RGBA", (40, 40), (255, 255, 255, 0)).save(self.root / "overlay.png")
        Image.new("RGBA", (20, 20), (255, 255, 255, 0)).save(self.root / "hand.png")
        self.page('<main id="base"><div id="overlay"><span id="hand"></span></div></main>',
                  '#base{position:relative;width:100px;height:100px;background-image:url(base.png)}'
                  '#overlay{position:absolute;left:20px;top:20px;width:40px;height:40px;background-image:url(overlay.png)}'
                  '#hand{position:absolute;left:10px;top:10px;width:20px;height:20px;background-image:url(hand.png)}')
        plan = {"schemaVersion": 1, "kind": "visual-qa-langgraph-intent-plan", "status": "ready",
                "regions": [
                    {"id": "base", "mode": "single-image", "selector": "#base"},
                    {"id": "overlay", "mode": "single-image", "selector": "#overlay", "parentRegionId": "base"},
                    {"id": "hand", "mode": "single-image", "selector": "#hand", "parentRegionId": "overlay"},
                ]}
        (self.root / "intent.json").write_text(json.dumps(plan))
        self.case["intentPlan"] = "intent.json"
        result = self.verify()
        self.assertEqual(result["status"], "passed")
        self.assertTrue(result["capture"]["structure"]["passed"])

    def test_standalone_python_capture_uses_readiness_checks(self):
        output = self.root / "captures" / "page.png"
        result = capture_page(self.case["url"], output, width=100, height=100, dpr=1,
            browser_channel="chrome", browser_endpoint=None, full_page=False,
            ready_expression=None, selector="#page", timeout_ms=1500, stable_frames=3)
        self.assertEqual(result["status"], "captured")
        with Image.open(output) as image:
            self.assertEqual(image.size, (100, 100))
        self.assertEqual(result["consoleErrors"], [])

    def test_full_page_measurement_relations_and_device_scale(self):
        self.page("<main id='box'></main><div id='tail'></div>", "#box{height:150px}#tail{height:50px}")
        self.case["fullPage"] = True
        self.case["viewport"]["deviceScaleFactor"] = 2
        Image.new("RGB", (200, 400), "white").save(self.root / "design.png")
        self.case["contract"] = {"elements": [{"name": "box", "selector": "#box", "bounds": {"height": 150}},
            {"name": "tail", "selector": "#tail", "relations": [{"target": "box", "metric": "gapY", "expected": 0}]}]}
        result = self.verify()
        self.assertEqual(result["status"], "passed")
        self.assertEqual((result["comparison"]["width"], result["comparison"]["height"]), (200, 400))

    def test_real_graph_repair_reloads_and_archives_both_rounds(self):
        self.page("<main id='box'></main>", "#box{width:20px;height:20px;background:black}")
        source = self.root / "index.html"
        response = SimpleNamespace(content=json.dumps({"diagnosis": "remove black block", "edits": [
            {"path": str(source), "find": "background:black", "replace": "background:white"}]}),
            usage_metadata={"input_tokens": 1, "output_tokens": 1, "total_tokens": 2}, response_metadata={})
        with patch("langchain_openai.ChatOpenAI") as model:
            model.return_value.invoke.return_value = response
            result = run_workflow(case_path=self.case_path(), run_dir=self.root / "run", repo_root=self.root,
                cache_dir=self.root / "cache", model_name="mock", auto_fix=True, max_fixes=1)
        self.assertTrue(result["complete"])
        self.assertEqual(len(result["rounds"]), 2)
        for number in (1, 2):
            report_path = self.root / "run" / "evidence" / f"round-{number}" / "report.json"
            report = json.loads(report_path.read_text())
            self.assertEqual(Path(report["comparison"]["actualPath"]).parent, report_path.parent.resolve())
        self.assertNotEqual((self.root / "run/evidence/round-1/actual.png").read_bytes(),
                            (self.root / "run/evidence/round-2/actual.png").read_bytes())
