from __future__ import annotations

import base64
from io import BytesIO
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import httpx
from PIL import Image

from visual_qa_graph.design import design_node_id
from visual_qa_graph.workflow import run_workflow


FIGMA_URL = "https://www.figma.com/design/TestFile/Design?node-id=23-2"
PIXSO_URL = "https://pixso.cn/app/design/TestFile?item-id=2%3A3"


class DesignSourceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        (self.root / "index.html").write_text("<main>Example</main>", encoding="utf-8")
        self.actual = self.root / "actual.png"
        Image.new("RGB", (16, 16), "white").save(self.actual)
        self.case = self.root / "case.json"

    def run_case(self, **options) -> dict:
        return run_workflow(case_path=self.case, run_dir=self.root / "run",
                            repo_root=self.root, cache_dir=self.root / "cache",
                            offline_actual=self.actual, **options)

    def test_figma_uses_sse_and_fetches_a_fresh_reference_on_resume(self) -> None:
        self.case.write_text(json.dumps({"designType": "figma", "designUrl": FIGMA_URL}))
        expected = self.actual.read_bytes()
        changed = BytesIO()
        Image.new("RGB", (16, 16), "black").save(changed, "PNG")
        screenshots = iter((expected, changed.getvalue()))
        calls = []

        def handle(request: httpx.Request) -> httpx.Response:
            self.assertEqual(str(request.url), "http://127.0.0.1:3845/mcp")
            body = json.loads(request.content)
            method = body["method"]
            calls.append(method)
            if method == "initialize":
                return httpx.Response(200, headers={"Mcp-Session-Id": "desktop-session"},
                                      json={"id": body["id"], "result": {"protocolVersion": "2025-03-26"}})
            self.assertEqual(request.headers["Mcp-Session-Id"], "desktop-session")
            self.assertEqual(request.headers["MCP-Protocol-Version"], "2025-03-26")
            if method == "notifications/initialized":
                self.assertNotIn("id", body)
                return httpx.Response(202)
            self.assertEqual(method, "tools/call")
            self.assertEqual(body["params"], {"name": "get_screenshot", "arguments": {"nodeId": "23:2"}})
            screenshot = {"type": "image", "mimeType": "image/png",
                          "data": base64.b64encode(next(screenshots)).decode()}
            message = {"id": body["id"], "result": {"content": [screenshot]}}
            return httpx.Response(200, headers={"Content-Type": "text/event-stream"},
                                  text=f"data: {json.dumps(message)}\n\n")

        client = httpx.Client
        with patch("visual_qa_graph.mcp_http.httpx.Client",
                   side_effect=lambda **options: client(transport=httpx.MockTransport(handle), **options)):
            first = self.run_case()
            second = self.run_case(resume=True)

        self.assertEqual(calls, ["initialize", "notifications/initialized", "tools/call"] * 2)
        self.assertEqual(first["status"], "offline_review")
        self.assertEqual(first["mismatchPercent"], 0)
        self.assertGreater(second["mismatchPercent"], 0)
        self.assertNotEqual(first["fingerprint"], second["fingerprint"])
        path = Path(first["designSource"]["designPath"])
        self.assertEqual(path.read_bytes(), expected)
        self.assertEqual(first["designSource"]["type"], "figma")
        effective = json.loads(Path(second["effectiveCasePath"]).read_text())
        self.assertEqual(effective["designImage"], second["designSource"]["designPath"])

    def test_pixso_url_auto_exports_the_reference_without_a_local_image(self) -> None:
        self.case.write_text("{}")
        expected = self.actual.read_bytes()
        calls = []

        def handle(request: httpx.Request) -> httpx.Response:
            self.assertEqual(str(request.url), "http://127.0.0.1:3667/mcp")
            body = json.loads(request.content)
            if body["method"] == "initialize":
                result = {"protocolVersion": "2025-03-26"}
            else:
                tool = body["params"]["name"]
                args = body["params"]["arguments"]
                calls.append(tool)
                if tool == "get_export_image":
                    self.assertEqual(args["guid"], "2:3")
                    self.assertEqual(args["exportSettings"]["constraint"]["value"], 1)
                    content = [{"type": "image", "data": base64.b64encode(expected).decode()}]
                else:
                    self.assertEqual(tool, "query_nodes")
                    self.assertEqual(args["nodeIds"], ["2:3"])
                    content = [{"type": "text", "text": json.dumps([{"guid": "2:3"}])}]
                result = {"content": content}
            return httpx.Response(200, json={"id": body["id"], "result": result})

        client = httpx.Client
        with patch("visual_qa_graph.mcp_http.httpx.Client",
                   side_effect=lambda **options: client(transport=httpx.MockTransport(handle), **options)):
            summary = self.run_case(design_type="pixso", design_url=PIXSO_URL, pixso_revision="v1")
            resumed = self.run_case(resume=True)
        self.assertEqual(calls, ["get_export_image", "query_nodes"])
        self.assertEqual(summary["mismatchPercent"], 0)
        self.assertEqual(summary["designSource"]["nodeId"], "2:3")
        self.assertEqual(resumed["fingerprint"], summary["fingerprint"])
        self.assertTrue(resumed["pixso"]["cached"])

    def test_url_must_match_provider_and_identify_a_node(self) -> None:
        for provider, url in (("figma", PIXSO_URL), ("pixso", FIGMA_URL),
                              ("figma", FIGMA_URL.split("?")[0]),
                              ("figma", FIGMA_URL + "&node-id=7-8")):
            with self.subTest(provider=provider, url=url), self.assertRaisesRegex(ValueError, "design URL"):
                design_node_id(provider, url)
