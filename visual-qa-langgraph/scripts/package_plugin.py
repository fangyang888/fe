#!/usr/bin/env python3
"""Build a standalone Codex local marketplace using only the standard library."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys
import tempfile
import tomllib
import zipfile

NAME = "visual-qa-langgraph"
MARKETPLACE = f"{NAME}-local"
DIRECTORIES = (".codex-plugin", "skills", "src", "docs", "examples")
FILES = ("pyproject.toml", "uv.lock", "README.md", "流程README.md", "dev.py",
         "langgraph.json", ".env.example", "Makefile", "scripts/package_plugin.py",
         "build/README.md", "build/codex-plugin.py")
EXCLUDED = {"__pycache__", ".venv", ".git", ".langgraph_api", "runs", "cache",
            "output", "artifacts", ".DS_Store"}


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build(source: Path, output: Path) -> Path:
    source, output = source.resolve(), output.resolve()
    manifest = json.loads((source / ".codex-plugin/plugin.json").read_text(encoding="utf-8"))
    project = tomllib.loads((source / "pyproject.toml").read_text(encoding="utf-8"))["project"]
    version = project["version"]
    if project.get("name") != NAME or manifest.get("name") != NAME or manifest.get("version") != version:
        raise ValueError("plugin.json and pyproject.toml must use the same plugin name/version")
    if not re.fullmatch(r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?", version):
        raise ValueError("Plugin version must use semantic versioning")
    paths = [Path(name) for name in FILES]
    for directory in DIRECTORIES:
        if not (source / directory).is_dir():
            raise FileNotFoundError(source / directory)
        paths.extend(path.relative_to(source) for path in (source / directory).rglob("*")
                     if path.is_file() and not (set(path.relative_to(source).parts) & EXCLUDED)
                     and not path.name.startswith(".env") and path.suffix not in {".pyc", ".pyo"})
    for path in paths:
        if not (source / path).is_file():
            raise FileNotFoundError(source / path)
        if any((source / part).is_symlink() for part in (path, *path.parents)):
            raise ValueError(f"Symlinks are not packaged: {path}")
    fingerprint = hashlib.sha256()
    for path in sorted(set(paths)):
        fingerprint.update(path.as_posix().encode() + b"\0" + (source / path).read_bytes() + b"\0")
    content_id = fingerprint.hexdigest()[:16]
    plugin_version = f"{version}{'.' if '+' in version else '+build.'}{content_id}"
    output.mkdir(parents=True, exist_ok=True)
    destination = output / MARKETPLACE
    if destination.exists() or destination.is_symlink():
        if destination.is_symlink() or not (destination / "bundle.json").is_file():
            raise ValueError(f"Refusing to replace unmanaged directory: {destination}")
        if json.loads((destination / "bundle.json").read_text(encoding="utf-8")).get("name") != NAME:
            raise ValueError(f"Unexpected bundle: {destination}")
    archive_path = output / f"{NAME}-{plugin_version}.zip"
    with tempfile.TemporaryDirectory(prefix=".package-", dir=output) as folder:
        staging = Path(folder) / MARKETPLACE
        plugin = staging / "plugins" / NAME
        for path in sorted(set(paths)):
            target = plugin / path
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source / path, target)
        manifest["version"] = plugin_version
        write_json(plugin / ".codex-plugin/plugin.json", manifest)
        shutil.copyfile(source / "build/codex-plugin.py", staging / "codex-plugin.py")
        shutil.copyfile(source / "build/README.md", staging / "README.md")
        write_json(staging / ".agents/plugins/marketplace.json", {
            "name": MARKETPLACE, "interface": {"displayName": "Visual QA LangGraph Local"},
            "plugins": [{"name": NAME, "source": {"source": "local", "path": f"./plugins/{NAME}"},
                         "policy": {"installation": "AVAILABLE", "authentication": "ON_INSTALL"},
                         "category": "Productivity"}],
        })
        write_json(staging / "bundle.json", {
            "name": NAME, "marketplace": MARKETPLACE, "sourceVersion": version,
            "version": plugin_version, "contentId": content_id,
            "files": {path.relative_to(staging).as_posix(): digest(path)
                      for path in sorted(staging.rglob("*")) if path.is_file()},
        })
        temporary_zip = Path(folder) / "bundle.zip"
        with zipfile.ZipFile(temporary_zip, "w", zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(staging.rglob("*")):
                if path.is_file():
                    info = zipfile.ZipInfo(f"{MARKETPLACE}/{path.relative_to(staging).as_posix()}")
                    info.compress_type = zipfile.ZIP_DEFLATED
                    info.external_attr = 0o100644 << 16
                    archive.writestr(info, path.read_bytes())
        temporary_zip.replace(archive_path)
        previous = Path(folder) / "previous"
        if destination.exists():
            destination.rename(previous)
        try:
            staging.rename(destination)
        except BaseException:
            if not destination.exists() and previous.exists():
                previous.rename(destination)
            raise
    checksum = digest(archive_path)
    archive_path.with_suffix(".zip.sha256").write_text(f"{checksum}  {archive_path.name}\n", encoding="utf-8")
    write_json(output / "latest.json", {"archive": archive_path.name, "directory": MARKETPLACE,
                                       "version": plugin_version, "sha256": checksum})
    return archive_path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    source = Path(__file__).resolve().parents[1]
    parser.add_argument("--output-dir", type=Path, default=source / "build")
    args = parser.parse_args()
    try:
        archive = build(source, args.output_dir)
    except (OSError, ValueError, KeyError) as exc:
        print(f"Build failed: {exc}", file=sys.stderr)
        return 1
    print(f"Created: {archive}\nSHA-256: {digest(archive)}")
    print("Install: python3 build/codex-plugin.py install")
    return 0


if __name__ == "__main__":
    sys.exit(main())
