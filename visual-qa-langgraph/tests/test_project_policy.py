from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from visual_qa_graph.project_policy import apply_case_policy, inline_length, read_project_policy
from visual_qa_graph.workflow import _bind_images, _load_case, _verify, run_workflow


class ProjectPolicyTests(unittest.TestCase):
    def _skill(self, folder: Path, config: dict) -> Path:
        path = folder / "SKILL.md"
        path.write_text("# Project frontend\n\n```visual-qa-policy\n" +
                        json.dumps(config) + "\n```\n", encoding="utf-8")
        return path

    def test_rem_skill_sets_authoring_and_verification_policy(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            policy = read_project_policy(self._skill(Path(root), {
                "schemaVersion": 1, "css": {"unit": "rem", "rootFontSizePx": 10,
                                            "conversion": "authoring"},
                "layout": {"preferFlex": True},
            }))
            self.assertEqual(policy["scaffoldOptions"], {"unit": "rem", "rootFontSize": 10, "assets": {}})
            self.assertEqual(apply_case_policy({"name": "page"}, policy)["cssRules"],
                             {"preferRem": True, "preferFlex": True})
            self.assertEqual(inline_length(37.5, policy), "3.75rem")

    def test_build_conversion_keeps_scaffold_px_but_inline_image_uses_rem(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            policy = read_project_policy(self._skill(Path(root), {
                "schemaVersion": 1, "css": {"unit": "rem", "rootFontSizePx": 37.5,
                                            "conversion": "build"},
            }))
            self.assertEqual(policy["scaffoldOptions"]["unit"], "px")
            self.assertEqual(inline_length(75, policy), "2rem")

    def test_missing_root_and_case_conflict_fail_explicitly(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            skill = self._skill(Path(root), {"schemaVersion": 1, "css": {"unit": "rem"}})
            with self.assertRaisesRegex(ValueError, "root font size"):
                read_project_policy(skill)
            skill = self._skill(Path(root), {"schemaVersion": 1,
                                             "css": {"unit": "rem", "rootFontSizePx": 10}})
            policy = read_project_policy(skill)
            with self.assertRaisesRegex(ValueError, "conflicts"):
                apply_case_policy({"cssRules": {"preferRem": False}}, policy)

    def test_graph_verification_receives_effective_case_from_skill(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            folder = Path(root)
            skill = self._skill(folder, {"schemaVersion": 1,
                                         "css": {"unit": "rem", "rootFontSizePx": 10}})
            case_path = folder / "case.json"
            case_path.write_text(json.dumps({"name": "page", "platform": "web", "designImage": "design.png",
                                             "outputDir": "output", "url": "http://127.0.0.1:1/",
                                             "viewport": {"width": 100, "height": 100}}), encoding="utf-8")
            state = {"case_path": str(case_path), "run_dir": str(folder / "run"),
                     "repo_root": str(folder), "project_skill": str(skill),
                     "design": {"intentPlanPath": None}}
            loaded = _load_case(state)
            state.update(loaded)
            state.update(_bind_images(state))
            effective_path = Path(state["effective_case_path"])
            effective = json.loads(effective_path.read_text(encoding="utf-8"))
            self.assertEqual(effective["cssRules"]["preferRem"], True)
            self.assertEqual(Path(effective["designImage"]), (folder / "design.png").resolve())
            self.assertEqual(json.loads((folder / "run" / "scaffold-options.json").read_text())["unit"], "rem")

            def fake_verify(path: Path, *, browser_endpoint=None) -> dict:
                self.assertEqual(path, effective_path)
                return {"status": "passed", "mode": "final", "comparison": {"mismatchPercent": 0, "ssim": 1}}

            with patch("visual_qa_graph.workflow.verify_case", side_effect=fake_verify):
                result = _verify(state)
            self.assertEqual(result["verification"]["status"], "passed")

    def test_full_graph_carries_skill_policy_to_verification(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            folder = Path(root)
            skill = self._skill(folder, {"schemaVersion": 1,
                                         "css": {"unit": "rem", "rootFontSizePx": 10}})
            (folder / "design.png").write_bytes(b"test image bytes")
            (folder / "index.html").write_text("<div>page</div>", encoding="utf-8")
            case = folder / "case.json"
            case.write_text(json.dumps({"name": "page", "platform": "web", "designImage": "design.png",
                                        "url": "http://127.0.0.1:1/", "viewport": {"width": 100, "height": 100}}),
                            encoding="utf-8")

            def fake_verify(state: dict) -> dict:
                self.assertEqual(state["project_policy"]["css"]["unit"], "rem")
                effective = json.loads(Path(state["effective_case_path"]).read_text())
                self.assertTrue(effective["cssRules"]["preferRem"])
                return {"verification": {"status": "passed", "mode": "final",
                        "comparison": {"mismatchPercent": 0, "ssim": 1}},
                        "verify_event": {"node": "verify", "durationMs": 0}}

            with patch("visual_qa_graph.workflow._verify", side_effect=fake_verify):
                summary = run_workflow(case_path=case, run_dir=folder / "run",
                                       repo_root=Path(__file__).resolve().parents[2],
                                       project_skill=skill)
            self.assertTrue(summary["complete"])
            self.assertEqual(summary["projectPolicy"]["css"]["unit"], "rem")


if __name__ == "__main__":
    unittest.main()
