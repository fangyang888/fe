#!/usr/bin/env python3
"""Install, update, inspect, or remove the adjacent Visual QA Antigravity plugin.

Uses Antigravity's documented local plugin directories; no CLI is required.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys
import tempfile

NAME = "visual-qa-langgraph"
BUNDLE = f"{NAME}-antigravity"
MANIFEST = ".antigravity-plugin/plugin.json"


def metadata(root: Path) -> dict:
    info = json.loads((root / "bundle.json").read_text(encoding="utf-8"))
    if info.get("name") != NAME or info.get("target") != "antigravity":
        raise ValueError(f"Not a managed Visual QA Antigravity plugin: {root}")
    return info


def validate_bundle(root: Path) -> dict:
    root = root.resolve()
    info = metadata(root)
    files = info.get("files")
    required = {MANIFEST, f"skills/{NAME}/SKILL.md", "pyproject.toml", "uv.lock",
                "src/visual_qa_graph/cli.py", "antigravity-plugin.py"}
    if not isinstance(files, dict) or not required.issubset(files):
        raise ValueError("Incomplete bundle; extract the entire ZIP first")
    for relative, expected in files.items():
        path = root / relative
        if (Path(relative).is_absolute() or ".." in Path(relative).parts
                or not path.resolve().is_relative_to(root)
                or any(part.is_symlink() for part in (path, *path.parents))):
            raise ValueError(f"Invalid bundle path: {relative}")
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError(f"Bundle checksum mismatch: {relative}; rebuild or re-extract the package")
    manifest = json.loads((root / MANIFEST).read_text(encoding="utf-8"))
    if manifest.get("name") != NAME or manifest.get("version") != info.get("version"):
        raise ValueError("Bundle version does not match the plugin manifest")
    return info


def managed_destination(destination: Path) -> bool:
    if destination.is_symlink():
        raise ValueError(f"Refusing to replace a symlink: {destination}")
    if not destination.exists():
        return False
    if not (destination / "bundle.json").is_file():
        raise ValueError(f"Refusing to replace unmanaged directory: {destination}")
    metadata(destination)
    return True


def install(root: Path, destination: Path) -> None:
    # Stage and validate on the same filesystem before replacing the old version.
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=f".{NAME}-", dir=destination.parent) as folder:
        staging = Path(folder) / "new"
        previous = Path(folder) / "previous"
        info = validate_bundle(root)
        staging.mkdir()
        for relative in (*info["files"], "bundle.json"):
            target = staging / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(root / relative, target)
        validate_bundle(staging)
        if managed_destination(destination):
            destination.rename(previous)
        try:
            staging.rename(destination)
        except BaseException:
            if previous.exists() and not destination.exists():
                previous.rename(destination)
            raise


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("install", "inject", "update", "status", "remove", "uninstall"))
    here = Path(__file__).resolve().parent
    parser.add_argument("--bundle", type=Path, default=here if (here / "bundle.json").is_file() else here / BUNDLE,
                        help="Extracted Antigravity plugin root; defaults to the adjacent build")
    scope = parser.add_mutually_exclusive_group()
    scope.add_argument("--project", type=Path, help="Install only for this workspace instead of globally")
    scope.add_argument("--config-dir", type=Path, help="Override ~/.gemini/config (also useful for isolated checks)")
    parser.add_argument("--dry-run", action="store_true", help="Validate and print actions without writing files")
    args = parser.parse_args(argv)
    try:
        base = (args.project.expanduser().resolve() / ".agents" if args.project else
                (args.config_dir or Path.home() / ".gemini/config").expanduser().resolve())
        if args.project and not args.project.expanduser().is_dir():
            raise ValueError(f"Workspace does not exist: {args.project}")
        destination = base / "plugins" / NAME
        if destination.parent.is_symlink():
            raise ValueError(f"Refusing to use a symlinked plugins directory: {destination.parent}")
        root = args.bundle.expanduser().resolve()
        if args.action in {"install", "inject", "update"} and (
                root.is_relative_to(destination.resolve()) or destination.resolve().is_relative_to(root)):
            raise ValueError("Bundle and installation paths must not overlap; use the build/ manager")
        exists = managed_destination(destination)
        if args.action == "status":
            if not exists:
                print(f"Not installed: {destination}")
            else:
                info = validate_bundle(destination)
                print(f"Installed: {info['version']}\nPath: {destination}\nIntegrity: OK")
            return 0
        if args.action in {"remove", "uninstall"}:
            print(f"{'Would remove' if args.dry_run else 'Removing'}: {destination}")
            if exists and not args.dry_run:
                shutil.rmtree(destination)
        else:
            info = validate_bundle(root)
            print(f"Bundle: {info['version']}\n{'Would install' if args.dry_run else 'Installing'}: {destination}")
            if not args.dry_run:
                install(root, destination)
        if args.dry_run:
            print("Dry run completed; Antigravity was not changed.")
        elif args.action in {"remove", "uninstall"}:
            print("Done. Reload Antigravity to unload the removed plugin.")
        else:
            print("Done. Reload Antigravity and open a new conversation; invoke /visual-qa-langgraph.")
    except (OSError, ValueError, KeyError, TypeError, shutil.Error) as exc:
        print(f"Plugin operation failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
