import base64
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from langgraph_py.pixso_component_match.catalog import digest, discover
from langgraph_py.pixso_component_match.match import verify_regions
from langgraph_py.pixso_component_match.visual import compare_figures


PACKAGE = "langgraph_py.pixso_component_match"


class FigureCatalogTests(unittest.TestCase):
    def test_component_and_external_images_are_collected_and_deduplicated(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "library"
            button = source / "src" / "button"
            variants = button / "images" / "variants"
            variants.mkdir(parents=True)
            (button / "README.md").write_text("# Button\n![默认](images/a.png)\n")
            (variants.parent / "a.png").write_bytes(b"first")
            (variants / "duplicated.png").write_bytes(b"first")
            (variants / "uuid.webp").write_bytes(b"second")
            badge = source / "src" / "badge" / "images"
            badge.mkdir(parents=True)
            (badge.parent / "README.md").write_text("# Badge\nBadge example\n")
            (badge / "random.jpg").write_bytes(b"badge")
            external = root / "samples"
            (external / "Button" / "variants").mkdir(parents=True)
            (external / "Button" / "variants" / "c.png").write_bytes(b"third")

            catalog = discover(source, None, external, root / "index")
            figures = {c["name"]: c["figures"] for c in catalog["components"].values()}
            self.assertEqual([Path(f["path"]).name for f in figures["Button"]], ["a.png", "uuid.webp", "c.png"])
            self.assertEqual(figures["Button"][0]["caption"], "默认")
            self.assertEqual([Path(f["path"]).name for f in figures["Badge"]], ["random.jpg"])


class VisualComparisonTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.index = Path(self.temp.name)
        self.screenshot = self.index / "design.png"
        self.screenshot.write_bytes(b"design")
        self.figures, self.sources = [], {}
        for i in range(1, 7):
            name, data = f"{i}.png", bytes([i])
            (self.index / name).write_bytes(data)
            self.figures.append({"path": name})
            self.sources[name] = {"sha256": digest(data), "snapshot": name}

    def decide(self, statuses, *, allows_inline_content=False, inline_reference=None):
        def completion(**call):
            user_content = call["messages"][-1]["content"]
            self.assertEqual(len(user_content) % 2, 0)
            ids = [item["text"].split()[-1] for item in user_content[2::2]]
            self.assertLessEqual(len(ids), 4)
            comparisons = [{"reference": i, "status": statuses[i], "reason": "可见结构",
                            "only_inline_content_differs": i == inline_reference}
                           for i in ids if i in statuses]
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(
                content=json.dumps({"comparisons": comparisons})))])

        with (patch(f"{PACKAGE}.visual.component_vision_model", return_value="test"),
              patch(f"{PACKAGE}.visual.vision_client") as client):
            request = client.return_value.__enter__.return_value.chat.completions.create
            request.side_effect = completion
            result = compare_figures(self.figures, self.sources, self.index, self.screenshot,
                                     allows_inline_content=allows_inline_content)
            return result, request.call_count

    def test_a_later_reference_can_confirm_the_component(self):
        result, calls = self.decide({str(i): "match" if i == 6 else "mismatch" for i in range(1, 7)})
        self.assertEqual(calls, 2)
        self.assertEqual((result["status"], result["matched_reference"]), ("match", "6.png"))

    def test_reject_requires_every_reference_to_mismatch(self):
        statuses = {str(i): "mismatch" for i in range(1, 7)}
        self.assertEqual(self.decide(statuses)[0]["status"], "mismatch")
        del statuses["6"]
        self.assertEqual(self.decide(statuses)[0]["status"], "insufficient")
        statuses["6"] = "mismatch"
        (self.index / "6.png").write_bytes(b"changed")
        self.assertEqual(self.decide(statuses)[0]["status"], "insufficient")

    def test_placeholder_screenshot_is_insufficient_without_calling_model(self):
        self.screenshot.write_bytes(base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII="))
        result, calls = self.decide({})
        self.assertEqual((result["status"], calls), ("insufficient", 0))

    def test_only_inline_difference_passes_when_source_allows_custom_children(self):
        statuses = {str(i): "mismatch" for i in range(1, 7)}
        self.assertEqual(self.decide(statuses, inline_reference="1")[0]["status"], "mismatch")
        result, _ = self.decide(statuses, allows_inline_content=True, inline_reference="1")
        self.assertEqual((result["status"], result["matched_reference"]), ("match", "1.png"))


class VisualWorkflowTests(unittest.TestCase):
    def test_visual_rejection_applies_to_non_button_and_falls_back_to_candidate_without_images(self):
        with tempfile.TemporaryDirectory() as directory:
            index = Path(directory).resolve()
            manifest = index / "manifest.json"
            figure = {"path": "badge.png"}
            manifest.write_text(json.dumps({"build_id": "build", "sources": {}, "components": {
                "ui#Badge": {"figures": [figure]}, "ui#Chip": {"figures": []},
            }}))
            choices = [{"build_id": "build", "component_id": cid} for cid in ("ui#Badge", "ui#Chip")]
            region = {"name": "标记", "region_id": "r1", "candidates": choices, "anchors": ["0"],
                      "observations": [{"path": "0", "node_id": "23:37"}]}
            state = {"request": {"index": str(index)}, "manifest_paths": [str(manifest)],
                     "run_key": "run", "regions": [region], "extra": {"r1": []}}

            def propose(area, *_args, **_kwargs):
                return dict(area["candidates"][0], node_id="23:37", design_url="design",
                            sources=[{"kind": "code", "quote": "{children}"}])

            def capture(_request, targets, _directory):
                self.assertEqual([target["node_id"] for target in targets], ["23:37"])
                targets[0]["screenshot"] = "node.png"
                return []

            with (patch(f"{PACKAGE}.match.confirmed_match", side_effect=propose),
                  patch(f"{PACKAGE}.match.capture_screenshots", side_effect=capture),
                  patch(f"{PACKAGE}.match.compare_figures", return_value={"status": "mismatch"}) as compare):
                result = verify_regions(state)
            compare.assert_called_once_with([figure], {}, index, "node.png", allows_inline_content=True)
            self.assertEqual([m["component_id"] for m in result["matches"]], ["ui#Chip"])
            self.assertEqual([c["component_id"] for c in result["visual_checks"]], ["ui#Badge"])
