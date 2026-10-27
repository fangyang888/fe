from __future__ import annotations

from contextlib import redirect_stdout, redirect_stderr
import importlib.util
from io import StringIO
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile


ROOT = Path(__file__).resolve().parents[1]


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


packager = load_module("plugin_packager", ROOT / "scripts/package_plugin.py")
manager = load_module("plugin_manager", ROOT / "build/codex-plugin.py")


class CodexDiscoveryTests(unittest.TestCase):
    def test_path_executable_is_preferred(self):
        with patch.object(manager.shutil, "which", return_value="/custom/bin/codex"):
            self.assertEqual(manager.find_codex(None), "/custom/bin/codex")

    def test_nested_chatgpt_cli_is_found_without_path(self):
        expected = Path("/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex")
        with patch.object(manager.shutil, "which", return_value=None), \
             patch.object(manager.sys, "platform", "darwin"), \
             patch.object(Path, "is_file", autospec=True, side_effect=lambda path: path == expected), \
             patch.object(manager.os, "access", return_value=True):
            self.assertEqual(manager.find_codex(None), str(expected))

    def test_legacy_cli_in_user_applications_is_found(self):
        expected = Path("/test-user/Applications/Codex.app/Contents/Resources/codex")
        with patch.object(manager.shutil, "which", return_value=None), \
             patch.object(manager.sys, "platform", "darwin"), \
             patch.object(Path, "home", return_value=Path("/test-user")), \
             patch.object(Path, "is_file", autospec=True, side_effect=lambda path: path == expected), \
             patch.object(manager.os, "access", return_value=True):
            self.assertEqual(manager.find_codex(None), str(expected))

    def test_non_executable_candidate_is_not_selected(self):
        with patch.object(manager.shutil, "which", return_value=None), \
             patch.object(manager.sys, "platform", "darwin"), \
             patch.object(Path, "is_file", return_value=True), \
             patch.object(manager.os, "access", return_value=False):
            with self.assertRaises(FileNotFoundError):
                manager.find_codex(None)

    def test_invalid_explicit_path_does_not_fall_back_to_other_install(self):
        with patch.object(manager.shutil, "which", return_value=None), \
             patch.object(Path, "is_file") as is_file:
            with self.assertRaises(FileNotFoundError):
                manager.find_codex("/missing/codex")
        is_file.assert_not_called()


class DistributionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.source = Path(self.temp.name) / "source with spaces"
        self.output = Path(self.temp.name) / "build with spaces"
        for name in packager.FILES:
            path = self.source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("fixture\n", encoding="utf-8")
        for directory in packager.DIRECTORIES:
            (self.source / directory).mkdir(parents=True, exist_ok=True)
        self.write(".codex-plugin/plugin.json", json.dumps({"name": packager.NAME, "version": "0.1.0"}))
        self.write("pyproject.toml", '[project]\nname = "visual-qa-langgraph"\nversion = "0.1.0"\n')
        self.write("skills/visual-qa-langgraph/SKILL.md", "# Skill\n")
        self.write("src/visual_qa_graph/cli.py", "# CLI\n")

    def write(self, name: str, text: str):
        path = self.source / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def build(self):
        archive = packager.build(self.source, self.output)
        root = (self.output / packager.MARKETPLACE).resolve()
        return archive, root

    def test_bundle_contains_runtime_and_excludes_secrets_and_generated_files(self):
        for name in (".env", "src/.env.local", "src/__pycache__/secret.pyc",
                     "examples/demo/output/private.json", "examples/demo/.DS_Store"):
            self.write(name, "private data")
        archive, root = self.build()
        info = manager.validate_bundle(root)
        self.assertEqual(info["sourceVersion"], "0.1.0")
        self.assertTrue(info["version"].startswith("0.1.0+build."))
        with zipfile.ZipFile(archive) as bundle:
            names = bundle.namelist()
            self.assertTrue(any(name.endswith("/src/visual_qa_graph/cli.py") for name in names))
            self.assertTrue(any(name.endswith("/.env.example") for name in names))
            self.assertFalse(any("private data" in bundle.read(name).decode(errors="replace") for name in names))

    def test_repeated_build_is_reproducible_and_source_manifest_is_unchanged(self):
        original = (self.source / ".codex-plugin/plugin.json").read_bytes()
        first, _ = self.build()
        contents = first.read_bytes()
        second, _ = self.build()
        self.assertEqual(first, second)
        self.assertEqual(contents, second.read_bytes())
        self.assertEqual(original, (self.source / ".codex-plugin/plugin.json").read_bytes())

    def test_changed_source_updates_version_and_removes_stale_bundle_files(self):
        first, root = self.build()
        old_version = manager.validate_bundle(root)["version"]
        (root / "stale-file").write_text("old")
        self.write("src/visual_qa_graph/cli.py", "# updated CLI\n")
        second, root = self.build()
        self.assertNotEqual(old_version, manager.validate_bundle(root)["version"])
        self.assertNotEqual(first, second)
        self.assertFalse((root / "stale-file").exists())
        self.assertTrue(first.exists())

    def test_invalid_version_refuses_build(self):
        self.write(".codex-plugin/plugin.json", json.dumps({"name": packager.NAME, "version": "0.2.0"}))
        with self.assertRaisesRegex(ValueError, "same plugin name/version"):
            self.build()

    def test_unmanaged_directory_is_not_overwritten(self):
        root = self.output / packager.MARKETPLACE
        root.mkdir(parents=True)
        marker = root / "my-file"
        marker.write_text("keep")
        with self.assertRaisesRegex(ValueError, "unmanaged"):
            self.build()
        self.assertEqual(marker.read_text(), "keep")

    def test_tampering_prevents_any_codex_command(self):
        _, root = self.build()
        (root / f"plugins/{packager.NAME}/src/visual_qa_graph/cli.py").write_text("tampered")
        with patch.object(manager.subprocess, "run") as run, redirect_stderr(StringIO()):
            self.assertEqual(manager.main(["install", "--bundle", str(root)]), 1)
        run.assert_not_called()

    def test_zip_can_be_validated_after_relocation(self):
        archive, _ = self.build()
        relocated = Path(self.temp.name) / "recipient"
        with zipfile.ZipFile(archive) as bundle:
            bundle.extractall(relocated)
        manager.validate_bundle((relocated / packager.MARKETPLACE).resolve())

    def test_dry_run_validates_but_does_not_change_codex(self):
        _, root = self.build()
        with patch.object(manager, "find_codex", return_value="/codex"), \
             patch.object(manager.subprocess, "run") as run, redirect_stdout(StringIO()):
            self.assertEqual(manager.main(["update", "--bundle", str(root), "--dry-run"]), 0)
        run.assert_not_called()

    def test_install_and_update_register_then_add_exact_plugin(self):
        _, root = self.build()
        for action in ("install", "inject", "update"):
            with self.subTest(action=action), patch.object(manager, "find_codex", return_value="/codex"), \
                 patch.object(manager.subprocess, "run") as run, redirect_stdout(StringIO()):
                self.assertEqual(manager.main([action, "--bundle", str(root)]), 0)
                self.assertEqual(run.call_args_list[0].args[0], ["/codex", "plugin", "marketplace", "add", str(root)])
                self.assertEqual(run.call_args_list[1].args[0], ["/codex", "plugin", "add", manager.SELECTOR])

    def test_registration_failure_stops_before_install(self):
        _, root = self.build()
        with patch.object(manager, "find_codex", return_value="/codex"), \
             patch.object(manager.subprocess, "run", side_effect=subprocess.CalledProcessError(1, "codex")) as run, \
             redirect_stdout(StringIO()), redirect_stderr(StringIO()):
            self.assertEqual(manager.main(["install", "--bundle", str(root)]), 1)
        self.assertEqual(run.call_count, 1)

    def test_remove_does_not_require_bundle_and_targets_only_this_plugin(self):
        missing = Path(self.temp.name) / "missing"
        with patch.object(manager, "find_codex", return_value="/codex"), \
             patch.object(manager.subprocess, "run") as run, redirect_stdout(StringIO()):
            self.assertEqual(manager.main(["remove", "--bundle", str(missing), "--purge-marketplace"]), 0)
        self.assertEqual([call.args[0] for call in run.call_args_list], [
            ["/codex", "plugin", "remove", manager.SELECTOR],
            ["/codex", "plugin", "marketplace", "remove", manager.MARKETPLACE],
        ])

    def test_invalid_checksum_path_is_rejected(self):
        _, root = self.build()
        file = root / "bundle.json"
        info = json.loads(file.read_text())
        info["files"]["../outside"] = "invalid"
        file.write_text(json.dumps(info))
        with self.assertRaisesRegex(ValueError, "Invalid bundle path"):
            manager.validate_bundle(root)

    def test_symlink_cannot_include_outside_file_in_package(self):
        outside = Path(self.temp.name) / "secret.txt"
        outside.write_text("outside secret")
        (self.source / "src/external.txt").symlink_to(outside)
        with self.assertRaisesRegex(ValueError, "Symlinks"):
            self.build()


if __name__ == "__main__":
    unittest.main()
