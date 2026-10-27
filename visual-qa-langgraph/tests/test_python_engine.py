from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from visual_qa_graph.comparison import _ssim, compare_images
from visual_qa_graph.design import generation_context, read_design_tree
from visual_qa_graph.intent import create_intent_plan
from visual_qa_graph.workflow import run_workflow


class PythonEngineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def compare(self, a, b, **kwargs):
        a.save(self.root / "a.png")
        b.save(self.root / "b.png")
        return compare_images(self.root / "a.png", self.root / "b.png", self.root / "diff.png", **kwargs)

    def test_identical_and_changed_region_and_crop_bounds(self):
        a = Image.new("RGB", (100, 100), "white")
        self.assertEqual(self.compare(a, a)["ssim"], 1)
        b = a.copy()
        ImageDraw.Draw(b).rectangle((10, 20, 29, 39), fill="black")
        result = self.compare(a, b)
        self.assertFalse(result["passed"])
        self.assertEqual(result["mismatchPixels"], 400)
        self.assertEqual(result["differenceRegions"][0], {
            "x": 10, "y": 20, "width": 20, "height": 20, "mismatchPixels": 400, "mismatchPercent": 100})
        self.assertLess(result["ssim"], 1)

    def test_ssim_uses_fast_integer_grayscale_and_valid_gaussian_window(self):
        expected = Image.new("RGBA", (100, 100), (23, 151, 210, 255))
        actual = expected.copy()
        ImageDraw.Draw(actual).rectangle((30, 30, 69, 69), fill=(230, 42, 92, 255))
        self.assertAlmostEqual(_ssim(expected, actual), 0.9604945196, places=8)

    def test_ssim_large_image_downsample_matches_fast_ssim_semantics(self):
        width, height = 600, 400
        y, x = np.indices((height, width))

        def image(base):
            value = (x * 7 + y * 3 + base) % 256
            return Image.fromarray(np.stack(
                (value, (value + 53) % 256, (value + 101) % 256), axis=2).astype(np.uint8))

        self.assertAlmostEqual(_ssim(image(0), image(13)), 0.6514868802, places=8)

    def test_critical_region_fails_even_if_full_image_threshold_allows_change(self):
        a = Image.new("RGB", (100, 100), "white")
        b = a.copy()
        ImageDraw.Draw(b).rectangle((5, 5, 14, 14), fill="black")
        result = self.compare(a, b, config={"minSsim": 0, "maxMismatchPercent": 2}, critical_regions=[{
            "name": "icon", "bounds": {"x": 5, "y": 5, "width": 10, "height": 10},
            "thresholds": {"maxMismatchPercent": 0}}])
        self.assertFalse(result["passed"])
        self.assertFalse(result["criticalRegions"][0]["passed"])
        with self.assertRaises(ValueError):
            self.compare(a, b, critical_regions=[{"name": "outside", "bounds": {"x": 99, "y": 0, "width": 10, "height": 10}}])

    def test_dimensions_invalid_thresholds_small_and_transparent_images(self):
        with self.assertRaisesRegex(ValueError, "dimensions"):
            self.compare(Image.new("RGB", (5, 5)), Image.new("RGB", (6, 5)))
        for value in (float("nan"), -1, True):
            with self.assertRaises(ValueError):
                self.compare(Image.new("RGB", (5, 5)), Image.new("RGB", (5, 5)), config={"minSsim": value})
        self.assertTrue(self.compare(Image.new("RGBA", (1, 1)), Image.new("RGBA", (1, 1)))["passed"])
        result = self.compare(Image.new("RGBA", (20, 20), (0, 0, 0, 0)), Image.new("RGBA", (20, 20), (255, 255, 255, 255)))
        self.assertEqual(result["mismatchPixels"], 0)
        self.assertLess(result["ssim"], 0.001)

    def test_offline_graph_uses_case_thresholds_without_any_legacy_project(self):
        a = Image.new("RGB", (20, 20), "white")
        a.save(self.root / "design.png")
        b = a.copy()
        b.putpixel((10, 10), (0, 0, 0))
        b.save(self.root / "actual.png")
        (self.root / "index.html").write_text("<main>test</main>")
        case = self.root / "case.json"
        case.write_text(json.dumps({"designImage": "design.png", "thresholds": {"maxMismatchPercent": 0}}))
        result = run_workflow(case_path=case, repo_root=self.root, run_dir=self.root / "run",
                              cache_dir=self.root / "cache", offline_actual=self.root / "actual.png")
        self.assertEqual(result["status"], "offline_review")
        self.assertFalse(result["complete"])
        self.assertGreater(result["rounds"][0]["mismatchPercent"], 0)

    def test_red_frames_are_ordered_and_solid_red_objects_are_not_frames(self):
        image = Image.new("RGB", (120, 120), "white")
        draw = ImageDraw.Draw(image)
        draw.rectangle((60, 70, 100, 105), outline="red", width=3)
        draw.rectangle((10, 10, 50, 40), outline="red", width=3)
        draw.rectangle((70, 10, 110, 40), fill="red")
        image.save(self.root / "marked.png")
        plan = create_intent_plan(annotated=self.root / "marked.png", node_id="1:1", viewport={"width": 120, "height": 120})
        self.assertEqual(len(plan["regions"]), 2)
        self.assertEqual(plan["regions"][0]["bounds"]["x"], 13)
        self.assertEqual(plan["regions"][1]["selector"], '[data-visual="region-2"]')
        self.assertEqual(plan["regions"][0]["imageBoundary"]["descendantAccess"], "forbidden")
        with self.assertRaisesRegex(ValueError, "ambiguous"):
            create_intent_plan(annotated=self.root / "marked.png", node_id="1:1", viewport={"width": 120, "height": 240})

    def test_separate_nested_red_frames_keep_parent_and_child_images(self):
        image = Image.new("RGB", (140, 120), "white")
        draw = ImageDraw.Draw(image)
        draw.rectangle((10, 10, 90, 100), outline="red", width=3)
        draw.rectangle((22, 25, 75, 55), outline="red", width=3)
        draw.rectangle((105, 15, 130, 45), outline="red", width=3)
        image.save(self.root / "nested.png")

        plan = create_intent_plan(annotated=self.root / "nested.png", node_id="1:1",
                                  viewport={"width": 140, "height": 120})
        self.assertEqual(len(plan["regions"]), 3)
        self.assertNotIn("parentRegionId", plan["regions"][1])
        self.assertEqual(plan["regions"][2]["parentRegionId"], "region-1")

    def test_shared_edge_nested_red_frames_require_explicit_layer_map(self):
        image = Image.new("RGB", (120, 120), "white")
        draw = ImageDraw.Draw(image)
        draw.rectangle((10, 10, 90, 100), outline="red", width=3)
        draw.rectangle((10, 30, 90, 70), outline="red", width=3)
        image.save(self.root / "shared.png")

        with self.assertRaisesRegex(ValueError, "Connected nested red frames"):
            create_intent_plan(annotated=self.root / "shared.png", node_id="1:1",
                               viewport={"width": 120, "height": 120})

        mapping = self.root / "image-map.json"
        mapping.write_text(json.dumps({"regions": [
            {"name": "white-base", "nodeId": "1:2", "selector": "#base",
             "annotationBounds": {"x": 10, "y": 10, "width": 81, "height": 91}},
            {"name": "card-overlay", "nodeId": "1:3", "selector": "#overlay",
             "annotationBounds": {"x": 10, "y": 30, "width": 81, "height": 41}},
        ]}), encoding="utf-8")
        plan = create_intent_plan(annotated=self.root / "shared.png", node_id="1:1",
                                  viewport={"width": 120, "height": 120}, image_map=mapping)
        self.assertEqual([region["nodeId"] for region in plan["regions"]], ["1:2", "1:3"])
        self.assertEqual(plan["regions"][1]["parentRegionId"], "region-1")
        self.assertEqual(plan["regions"][0]["imageBoundary"]["descendantAccess"], "forbidden")

    def test_shallow_design_preserves_hierarchy_and_never_queries_images(self):
        calls = []
        plan = {"source": {"nodeId": "1:1"}, "regions": [{"id": "image", "mode": "single-image", "nodeId": "1:3", "selector": "#image"}]}

        class Client:
            def query_nodes(self, ids, fields):
                calls.append(ids)
                if ids == ["1:1"]:
                    return [{"guid": "1:1", "childNode": [{"guid": "1:2", "x": 12, "childNode": [{"guid": "secret"}]}]}]
                if ids == ["1:2"]:
                    return [{"guid": "1:2", "childNode": [{"guid": "1:3", "nodeText": "FORBIDDEN", "childNode": [{"guid": "secret"}]}]}]
                raise AssertionError(ids)

        tree, queried, responses = read_design_tree(Client(), plan)
        self.assertEqual(calls, [["1:1"], ["1:2"]])
        context = generation_context(plan, tree)
        self.assertEqual(context["tree"]["children"][0]["properties"]["x"], 12)
        self.assertEqual(context["images"][0]["hierarchy"]["ancestorNodeIds"], ["1:1", "1:2"])
        self.assertNotIn("FORBIDDEN", json.dumps([tree, responses, context]))
        self.assertNotIn("secret", json.dumps([tree, responses, context]))
        self.assertEqual(set(context["codeGeneration"]["blockedNodeIds"]), {"1:1", "1:2", "1:3"})
