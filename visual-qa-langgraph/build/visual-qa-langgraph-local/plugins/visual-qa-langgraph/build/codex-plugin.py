#!/usr/bin/env python3
"""Install, update, inspect, or remove the adjacent Visual QA Codex plugin."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys

NAME = "visual-qa-langgraph"
MARKETPLACE = f"{NAME}-local"
SELECTOR = f"{NAME}@{MARKETPLACE}"


def validate_bundle(root: Path) -> dict:
    root = root.resolve()
    metadata = json.loads((root / "bundle.json").read_text(encoding="utf-8"))
    if metadata.get("name") != NAME or metadata.get("marketplace") != MARKETPLACE:
        raise ValueError("Unexpected bundle identity")
    files = metadata.get("files")
    required = {".agents/plugins/marketplace.json", f"plugins/{NAME}/.codex-plugin/plugin.json",
                f"plugins/{NAME}/skills/{NAME}/SKILL.md", f"plugins/{NAME}/pyproject.toml",
                f"plugins/{NAME}/uv.lock", f"plugins/{NAME}/src/visual_qa_graph/cli.py"}
    if not isinstance(files, dict) or not required.issubset(files):
        raise ValueError("Incomplete bundle; extract the entire ZIP first")
    for relative, expected in files.items():
        path = root / relative
        if Path(relative).is_absolute() or ".." in Path(relative).parts or not path.resolve().is_relative_to(root):
            raise ValueError(f"Invalid bundle path: {relative}")
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError(f"Bundle checksum mismatch: {relative}; rebuild or re-extract the package")
    catalog = json.loads((root / ".agents/plugins/marketplace.json").read_text(encoding="utf-8"))
    entries = catalog.get("plugins", [])
    if (catalog.get("name") != MARKETPLACE or len(entries) != 1
            or entries[0].get("name") != NAME
            or entries[0].get("source") != {"source": "local", "path": f"./plugins/{NAME}"}):
        raise ValueError("Unexpected marketplace source")
    manifest = json.loads((root / f"plugins/{NAME}/.codex-plugin/plugin.json").read_text(encoding="utf-8"))
    if manifest.get("name") != NAME or manifest.get("version") != metadata.get("version"):
        raise ValueError("Bundle version does not match the plugin manifest")
    return metadata


def find_codex(requested: str | None) -> str:
    binary = shutil.which(str(Path(requested).expanduser()) if requested else "codex")
    if binary:
        return binary
    if not requested and sys.platform == "darwin":
        for applications in (Path("/Applications"), Path.home() / "Applications"):
            for app in ("Codex", "ChatGPT"):
                resources = applications / f"{app}.app/Contents/Resources"
                for candidate in (resources / "codex", resources / "codex-cli/CodexCLI.app/Contents/MacOS/codex"):
                    if candidate.is_file() and os.access(candidate, os.X_OK):
                        return str(candidate)
    raise FileNotFoundError("Codex CLI not found; add codex to PATH or use --codex /path/to/codex")


def commands(action: str, binary: str, root: Path, purge: bool = False) -> list[list[str]]:
    prefix = [binary, "plugin"]
    if action in {"install", "inject", "update"}:
        return [prefix + ["marketplace", "add", str(root)], prefix + ["add", SELECTOR]]
    if action in {"remove", "uninstall"}:
        return [prefix + ["remove", SELECTOR]] + (
            [prefix + ["marketplace", "remove", MARKETPLACE]] if purge else [])
    return [prefix + ["list", "--marketplace", MARKETPLACE, "--available", "--json"]]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("install", "inject", "update", "status", "remove", "uninstall"))
    here = Path(__file__).resolve().parent
    parser.add_argument("--bundle", type=Path, default=here if (here / "bundle.json").is_file() else here / MARKETPLACE,
                        help="Extracted marketplace root; defaults to the adjacent build")
    parser.add_argument("--codex", help="Codex executable name or path")
    parser.add_argument("--dry-run", action="store_true", help="Validate and print commands without changing Codex")
    parser.add_argument("--purge-marketplace", action="store_true", help="Also unregister this marketplace when removing")
    args = parser.parse_args(argv)
    if args.purge_marketplace and args.action not in {"remove", "uninstall"}:
        parser.error("--purge-marketplace requires remove or uninstall")
    try:
        root = args.bundle.resolve()
        if args.action in {"install", "inject", "update"}:
            metadata = validate_bundle(root)
            print(f"Bundle: {metadata['version']} ({root})", flush=True)
        binary = find_codex(args.codex)
        for command in commands(args.action, binary, root, args.purge_marketplace):
            print(f"$ {shlex.join(command)}", flush=True)
            if not args.dry_run:
                subprocess.run(command, check=True)
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as exc:
        print(f"Plugin operation failed: {exc}", file=sys.stderr)
        return 1
    if args.dry_run:
        print("Dry run completed; Codex was not changed.")
    elif args.action in {"install", "inject", "update"}:
        print("Installed. Restart/refresh Codex and open a new chat to load the plugin.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
