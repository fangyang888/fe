from __future__ import annotations

import base64
import hashlib
import html
from io import BytesIO
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import tempfile
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from PIL import Image

from visual_qa_graph.pixso import fetch_design, resolve_red_image_nodes
from visual_qa_graph.materialize import bind_images
from visual_qa_graph.inspection import structure_config
from visual_qa_graph.workflow import _diagnose, _prepare_source, _verify, build_graph, make_repair_packet, run_workflow


class WorkflowTests(unittest.TestCase):
    def test_red_node_matching_reads_only_root_boundary(self) -> None:
        plan = {"source": {"nodeId": "1:1", "viewport": {"width": 100, "height": 100}},
                "regions": [{"id": "region-1", "source": "red-frame", "mode": "single-image",
                             "bounds": {"x": 12, "y": 18, "width": 39, "height": 27}}]}

        class MockPixso:
            def __init__(self, _endpoint: str):
                self.queries: list[str] = []

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                pass

            def query_nodes(self, ids, _fields):
                self.queries.extend(ids)
                if ids != ["1:1"]:
                    raise AssertionError("Image node must not be queried")
                return [{"guid": "1:1", "x": 100, "y": 100, "width": 100, "height": 100,
                         "childNode": [{"guid": "1:2", "x": 110, "y": 117, "width": 40,
                                        "height": 28, "childNode": [{"guid": "secret"}]},
                                       {"guid": "1:3", "x": 175, "y": 170, "width": 10, "height": 10}]}]

        with patch("visual_qa_graph.pixso.PixsoMcpClient", MockPixso):
            resolved = resolve_red_image_nodes("mock", plan)
        self.assertEqual(resolved["regions"][0]["nodeId"], "1:2")

    def test_annotated_image_graph_binds_export_before_verify(self) -> None:
        repo_root = Path(__file__).resolve().parents[2]
        with tempfile.TemporaryDirectory() as root:
            folder = Path(root)
            design = folder / "design.png"
            Image.new("RGB", (100, 100), "white").save(design)
            annotated = folder / "marked.png"
            marked = Image.new("RGB", (100, 100), "white")
            from PIL import ImageDraw
            ImageDraw.Draw(marked).rectangle((15, 20, 57, 53), outline="red", width=3)
            marked.save(annotated)
            export = folder / "export.png"
            Image.new("RGB", (90, 60), "blue").save(export)
            data = export.read_bytes()
            page = folder / "index.html"
            page.write_text('<div id="image"><span>old</span></div>', encoding="utf-8")
            case = folder / "case.json"
            case.write_text(json.dumps({"platform": "web", "designImage": "design.png",
                                        "pixsoNodeId": "1:1", "viewport": {"width": 100, "height": 100}}), encoding="utf-8")
            mapping = folder / "map.json"
            mapping.write_text(json.dumps({"hints": [{"order": 1, "nodeId": "1:2", "selector": "#image"}]}), encoding="utf-8")

            def fake_design(state: dict) -> dict:
                return {"design": {"intentPlanPath": state["intent_plan_path"], "hash": "design"},
                        "pixso": {"key": "mock", "assets": [{"nodeId": "1:2", "path": str(export),
                           "scale": 3, "pixelWidth": 90, "pixelHeight": 60,
                           "cssWidth": 30, "cssHeight": 20,
                           "sha256": hashlib.sha256(data).hexdigest()}]},
                        "design_event": {"node": "prepare_design", "durationMs": 0}}

            def fake_verify(_state: dict) -> dict:
                return {"verification": {"status": "passed", "mode": "final",
                        "comparison": {"mismatchPercent": 0, "ssim": 1}},
                        "verify_event": {"node": "verify", "durationMs": 0}}

            with patch("visual_qa_graph.workflow._prepare_design", side_effect=fake_design), \
                 patch("visual_qa_graph.workflow._verify", side_effect=fake_verify):
                summary = run_workflow(case_path=case, run_dir=folder / "run", repo_root=repo_root,
                                       pixso_endpoint="http://127.0.0.1:1/mcp", pixso_revision="mock",
                                       annotated_image=annotated, image_map=mapping, image_html=page,
                                       annotated_frame="0,0,100,100")
            self.assertEqual(summary["status"], "passed")
            effective = json.loads(Path(summary["effectiveCasePath"]).read_text(encoding="utf-8"))
            self.assertTrue(Path(effective["intentPlan"]).is_file())
            self.assertEqual(Path(effective["intentPlan"]), (folder / "run" / "red-image-intent.json").resolve())
            self.assertIn("width:30px;height:20px", page.read_text(encoding="utf-8"))
            self.assertNotIn("<span>", page.read_text(encoding="utf-8"))

    def test_red_frame_binds_whole_three_x_export_using_actual_asset_size(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            folder = Path(root)
            asset_path = folder / "export.png"
            image = Image.new("RGBA", (30, 18), (12, 90, 200, 255))
            buffer = BytesIO()
            image.save(buffer, format="PNG")
            data = buffer.getvalue()
            asset_path.write_bytes(data)
            page = folder / "index.html"
            page.write_text('<main><div data-visual="region-1"><span>旧内容</span></div></main>', encoding="utf-8")
            plan = {"regions": [{"id": "region-1", "mode": "single-image", "nodeId": "1:2",
                                  "selector": '[data-visual="region-1"]',
                                  "bounds": {"x": 2, "y": 2, "width": 18, "height": 12}}]}
            pixso = {"assets": [{"nodeId": "1:2", "path": str(asset_path), "scale": 3,
                                  "pixelWidth": 30, "pixelHeight": 18, "cssWidth": 10,
                                  "cssHeight": 6, "sha256": hashlib.sha256(data).hexdigest()}]}
            result = bind_images(plan, pixso, page)
            output = page.read_text(encoding="utf-8")
            self.assertEqual(result["bound"], 1)
            self.assertIn("width:10px;height:6px", output)
            self.assertIn("background-image:url('assets/images/region-1-", html.unescape(output))
            self.assertNotIn("<span>", output)
            self.assertEqual(Path(result["assets"][0]).read_bytes(), data)
            self.assertEqual(bind_images(plan, pixso, page)["bound"], 1)
            self.assertEqual(page.read_text(encoding="utf-8"), output)
            scanned = _prepare_source({"case_path": str(folder / "case.json"),
                                       "cache_dir": str(folder / "cache"),
                                       "source_paths": [str(page)]})
            self.assertEqual(scanned["source"]["missingLocalReferences"], [])
            bind_images(plan, pixso, page, {"css": {"unit": "rem", "rootFontSizePx": 10}})
            rem_output = page.read_text(encoding="utf-8")
            self.assertIn("width:1rem;height:0.6rem", rem_output)
            self.assertNotIn("width:10px", rem_output)

    def test_nested_image_placeholders_keep_overlays_and_derive_composite_checks(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            folder = Path(root)
            page = folder / "index.html"
            page.write_text('<div id="base"><div id="title">old title</div>'
                            '<div id="button"><span id="hand">old hand</span></div></div>',
                            encoding="utf-8")
            regions = [
                {"id": "base", "mode": "single-image", "nodeId": "1:2", "selector": "#base"},
                {"id": "title", "mode": "single-image", "nodeId": "1:3", "selector": "#title",
                 "parentRegionId": "base"},
                {"id": "button", "mode": "single-image", "nodeId": "1:4", "selector": "#button",
                 "parentRegionId": "base"},
                {"id": "hand", "mode": "single-image", "nodeId": "1:5", "selector": "#hand",
                 "parentRegionId": "button"},
            ]
            assets = []
            for region in regions:
                path = folder / f"{region['id']}.png"
                Image.new("RGBA", (30, 30), (12, 90, 200, 255)).save(path)
                assets.append({"nodeId": region["nodeId"], "path": str(path), "scale": 3,
                               "cssWidth": 10, "cssHeight": 10,
                               "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})

            plan = {"regions": regions}
            self.assertEqual(bind_images(plan, {"assets": assets}, page)["bound"], 4)
            output = page.read_text(encoding="utf-8")
            self.assertIn('id="title"', output)
            self.assertIn('id="button"', output)
            self.assertIn('id="hand"', output)
            self.assertNotIn(">old title<", output)
            self.assertNotIn(">old hand<", output)
            self.assertEqual(bind_images(plan, {"assets": assets}, page)["bound"], 4)
            self.assertEqual(page.read_text(encoding="utf-8"), output)

            structure = structure_config({}, plan)
            self.assertEqual([region["type"] for region in structure["regions"]],
                             ["composite-image", "single-image", "composite-image", "single-image"])
            self.assertFalse(structure["regions"][0]["base"]["requireNoVisibleChildren"])

    def test_graph_compiles_with_parallel_preparation(self) -> None:
        graph = build_graph()
        self.assertIn("preparation", graph.nodes)
        self.assertIn("qa", graph.nodes)

    def test_repair_packet_excludes_full_report_and_bounds_regions(self) -> None:
        regions = [{
            "x": index, "y": 0, "width": 10, "height": 10,
            "mismatchPixels": 10 - index, "mismatchPercent": 5,
            "fullDom": "DO_NOT_SEND",
            "domCandidates": [{"selector": f"#node-{candidate}", "styles": {"width": "10px", "background-image": "huge"}}
                              for candidate in range(5)],
        } for index in range(8)]
        packet = make_repair_packet({
            "status": "failed", "mode": "quick",
            "comparison": {"differenceRegions": regions, "mismatchPercent": 5, "ssim": 0.9},
        }, {"missingLocalReferences": []})
        encoded = json.dumps(packet)
        self.assertEqual(len(packet["regions"]), 4)
        self.assertEqual(len(packet["regions"][0]["domCandidates"]), 2)
        self.assertNotIn("DO_NOT_SEND", encoded)
        self.assertNotIn("background-image", encoded)

    def test_source_cache_invalidates_when_missing_asset_appears(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            root_path = Path(root)
            source = root_path / "index.html"
            source.write_text('<img src="missing.png">', encoding="utf-8")
            state = {"case_path": str(root_path / "case.json"), "run_dir": str(root_path / "run"),
                     "cache_dir": str(root_path / "cache"),
                     "source_paths": [str(source)]}
            first = _prepare_source(state)
            self.assertEqual(len(first["source"]["missingLocalReferences"]), 1)
            second = _prepare_source(state)
            self.assertTrue(second["source_event"]["cached"])
            (root_path / "missing.png").write_bytes(b"new asset")
            third = _prepare_source(state)
            self.assertFalse(third["source_event"]["cached"])
            self.assertEqual(third["source"]["missingLocalReferences"], [])

    def test_model_sees_only_packet_and_records_cached_tokens(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            response = SimpleNamespace(
                content="检查卡片位置",
                usage_metadata={"input_tokens": 120, "output_tokens": 30, "total_tokens": 150,
                                "input_token_details": {"cache_read": 80}},
                response_metadata={},
            )
            with patch("langchain_openai.ChatOpenAI") as model_class:
                model_class.return_value.invoke.return_value = response
                result = _diagnose({
                    "run_dir": root, "model_name": "test-model",
                    "packet": {"regions": [{"box": {"x": 1}}]},
                    "design": {"fullTree": "NEVER_SEND_FULL_DESIGN_TREE"},
                })
                messages = model_class.return_value.invoke.call_args.args[0]
                self.assertNotIn("NEVER_SEND_FULL_DESIGN_TREE", str(messages))
                self.assertEqual(result["model_usage"]["cachedInputTokens"], 80)
                self.assertEqual(result["model_usage"]["totalTokens"], 150)

    def test_verify_forwards_browser_endpoint(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            root_path = Path(root)
            report_path = root_path / "output" / "report.json"

            def fake_verify(path: Path, *, browser_endpoint=None) -> dict:
                self.assertEqual(path, root_path / "case.json")
                self.assertEqual(browser_endpoint, "http://127.0.0.1:3333")
                return {"status": "passed", "mode": "final",
                        "comparison": {"mismatchPercent": 0.5, "ssim": 0.99}}

            with patch("visual_qa_graph.workflow.verify_case", side_effect=fake_verify):
                result = _verify({
                    "case_path": str(root_path / "case.json"), "run_dir": str(root_path / "run"),
                    "repo_root": str(root_path), "case": {"outputDir": "output"},
                    "browser_endpoint": "http://127.0.0.1:3333", "offline_actual": None,
                })
            self.assertEqual(result["verification"]["status"], "passed")

    def test_model_edit_reverifies_and_records_usage(self) -> None:
        repo_root = Path(__file__).resolve().parents[2]
        with tempfile.TemporaryDirectory() as root:
            root_path = Path(root)
            source = root_path / "styles.css"
            source.write_text("#box { color: red; }\n", encoding="utf-8")
            case = root_path / "case.json"
            case.write_text(json.dumps({
                "platform": "web",
                "designImage": str(repo_root / "visual-qa-benchmark" / "design.png"),
            }), encoding="utf-8")

            def fake_verify(state: dict) -> dict:
                passed = "color: blue" in source.read_text(encoding="utf-8")
                return {"verification": {
                    "status": "passed" if passed else "failed",
                    "mode": "final" if passed else "quick",
                    "comparison": {
                        "mismatchPercent": 0.2 if passed else 4.0, "ssim": 0.99 if passed else 0.8,
                        "differenceRegions": [] if passed else [{
                            "x": 0, "y": 0, "width": 10, "height": 10,
                            "mismatchPixels": 30, "mismatchPercent": 4.0,
                            "domCandidates": [{"selector": "#box", "styles": {"color": "red"}}],
                        }],
                    }, "artifacts": {},
                }}

            response = SimpleNamespace(
                content=json.dumps({"diagnosis": "颜色不符", "edits": [{
                    "path": str(source), "find": "color: red", "replace": "color: blue",
                }]}),
                usage_metadata={"input_tokens": 100, "output_tokens": 20, "total_tokens": 120},
                response_metadata={},
            )
            with patch("visual_qa_graph.workflow._verify", side_effect=fake_verify), \
                 patch("langchain_openai.ChatOpenAI") as model_class:
                model_class.return_value.invoke.return_value = response
                summary = run_workflow(
                    case_path=case, run_dir=root_path / "run", cache_dir=root_path / "cache",
                    repo_root=repo_root, model_name="mock-model", auto_fix=True,
                    source_paths=[source],
                )
            self.assertTrue(summary["complete"])
            self.assertEqual(summary["fixCount"], 1)
            self.assertEqual(len(summary["rounds"]), 2)
            self.assertEqual([item["index"] for item in summary["timings"]["rounds"]], [1, 2])
            self.assertEqual(next(item for item in summary["timings"]["stages"]
                                  if item["name"] == "prepare_design")["calls"], 2)
            self.assertEqual(summary["modelUsage"]["totalTokens"], 120)
            self.assertIn("color: blue", source.read_text(encoding="utf-8"))

    def test_pixso_mcp_cache_prunes_image_descendants(self) -> None:
        repo_root = Path(__file__).resolve().parents[2]
        calls = {"query": 0, "export": 0}
        png = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9M"
            "B0sAAAAASUVORK5CYII="
        )

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args: object) -> None:
                pass

            def do_POST(self) -> None:
                request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                method = request["method"]
                if method == "initialize":
                    result = {"protocolVersion": "2025-03-26", "capabilities": {}, "serverInfo": {"name": "fake", "version": "1"}}
                else:
                    tool = request["params"]["name"]
                    if tool == "query_nodes":
                        calls["query"] += 1
                        root = {"guid": "1:1", "name": "frame", "type": "FRAME", "x": 0,
                                "y": 0, "width": 100, "height": 100,
                                "childNode": [{"guid": "1:2", "x": 10, "y": 10,
                                               "width": 40, "height": 40,
                                               "childNode": [{"guid": "secret", "nodeText": "FORBIDDEN"}]}]}
                        content = [{"type": "text", "text": json.dumps([root])}]
                    elif tool == "get_export_image":
                        calls["export"] += 1
                        content = [{"type": "image", "data": base64.b64encode(png).decode()}]
                    else:
                        raise AssertionError(tool)
                    result = {"content": content}
                payload = json.dumps({"jsonrpc": "2.0", "id": request["id"], "result": result}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Mcp-Session-Id", "mock-session")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory() as root:
                root_path = Path(root)
                plan_path = root_path / "plan.json"
                plan_path.write_text(json.dumps({
                    "kind": "visual-qa-intent-plan", "schemaVersion": 1,
                    "status": "ready", "source": {"nodeId": "1:1"}, "ambiguities": [],
                    "regions": [{"id": "image", "mode": "single-image", "nodeId": "1:2",
                                 "selector": "#image"}],
                }), encoding="utf-8")

                kwargs = {"endpoint": f"http://127.0.0.1:{server.server_port}/mcp",
                          "revision": "mock-rev-1", "plan_path": plan_path,
                          "design_hash": "local-design", "cache_dir": root_path / "cache",
                          "scale": 1, "refresh": False}
                first = fetch_design(**kwargs)
                self.assertFalse(first["cached"])
                self.assertEqual(len(first["assets"]), 1)
                self.assertEqual((first["assets"][0]["pixelWidth"], first["assets"][0]["cssWidth"]), (1, 1))
                state = (Path(first["contextPath"]).parent / "read-state.json").read_text()
                responses = (Path(first["contextPath"]).parent / "responses.json").read_text()
                self.assertNotIn("FORBIDDEN", state + responses)
                self.assertEqual(calls, {"query": 1, "export": 1})
                second = fetch_design(**kwargs)
                self.assertTrue(second["cached"])
                self.assertEqual(calls, {"query": 1, "export": 1})
        finally:
            server.shutdown()
            server.server_close()

    def test_worse_visual_result_rolls_back_model_edit(self) -> None:
        repo_root = Path(__file__).resolve().parents[2]
        with tempfile.TemporaryDirectory() as root:
            root_path = Path(root)
            source = root_path / "styles.css"
            source.write_text("#box { color: red; }\n", encoding="utf-8")
            case = root_path / "case.json"
            case.write_text(json.dumps({
                "platform": "web", "designImage": str(repo_root / "visual-qa-benchmark" / "design.png"),
            }), encoding="utf-8")

            def fake_verify(_state: dict) -> dict:
                worse = "color: green" in source.read_text(encoding="utf-8")
                return {"verification": {"status": "failed", "mode": "quick", "artifacts": {},
                    "comparison": {"mismatchPercent": 5.0 if worse else 4.0, "ssim": None,
                                   "differenceRegions": []}}}

            response = SimpleNamespace(
                content=json.dumps({"diagnosis": "try", "edits": [{
                    "path": str(source), "find": "color: red", "replace": "color: green",
                }]}),
                usage_metadata={"input_tokens": 10, "output_tokens": 10, "total_tokens": 20},
                response_metadata={},
            )
            with patch("visual_qa_graph.workflow._verify", side_effect=fake_verify), \
                 patch("langchain_openai.ChatOpenAI") as model_class:
                model_class.return_value.invoke.return_value = response
                summary = run_workflow(
                    case_path=case, run_dir=root_path / "run", cache_dir=root_path / "cache",
                    repo_root=repo_root, model_name="mock-model", auto_fix=True,
                    max_fixes=1, source_paths=[source],
                )
            self.assertFalse(summary["complete"])
            self.assertEqual(len(summary["rounds"]), 3)
            self.assertEqual(summary["lastApply"]["status"], "rolled_back")
            self.assertEqual(source.read_text(encoding="utf-8"), "#box { color: red; }\n")


if __name__ == "__main__":
    unittest.main()
