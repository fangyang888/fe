"""Bounded source context and guarded text edits for the repair loop."""

from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
from pathlib import Path
from typing import Any


def _matching_lines(text: str, selectors: list[str]) -> list[int]:
    """Find static HTML/JSX attributes and CSS rules, including multiline tags."""
    ids, classes, visual_ids = set(), set(), set()
    for selector in selectors:
        ids.update(re.findall(r"#([A-Za-z_][\w-]*)", selector))
        classes.update(re.findall(r"\.([A-Za-z_][\w-]*)", selector))
        visual_ids.update(re.findall(r'''\[data-visual\s*=\s*["']([^"']+)["']\s*\]''', selector))
    offsets = set()
    for prefix, names in (("#", ids), (".", classes)):
        for name in names:
            offsets.update(match.start() for match in re.finditer(
                re.escape(prefix + name) + r"(?![\w-])", text))
    for match in re.finditer(r'''\b(id|class|className|data-visual)\s*=\s*\{?\s*(["'])(.*?)\2''', text, re.S):
        attr, _, value = match.groups()
        if ((attr == "id" and value in ids)
            or (attr in {"class", "className"} and classes.intersection(value.split()))
            or (attr == "data-visual" and value in visual_ids)):
            offsets.add(match.start())
    return sorted({text.count("\n", 0, offset) for offset in offsets})


def source_context(packet: dict[str, Any], allowed_paths: list[Path], max_chars: int = 14000) -> list[dict[str, str]]:
    selectors = [candidate.get("selector", "") for region in packet.get("regions", [])
                 for candidate in region.get("domCandidates", [])]
    selectors += [issue.get("selector", "") for issue in packet.get("failures", [])]
    selectors = [value for value in selectors if isinstance(value, str)]
    sources = []
    for path in allowed_paths:
        source = path.read_text(encoding="utf-8", errors="replace")
        sources.append((path, source.splitlines(), _matching_lines(source, selectors)))
    # Relevant files receive the budget before unrelated file headers.
    sources.sort(key=lambda item: not bool(item[2]))
    context = []
    remaining = max_chars
    for order, (path, lines, matched) in enumerate(sources):
        if remaining <= 0:
            break
        peers = sum(bool(item[2]) == bool(matched) for item in sources[order:])
        budget = remaining // max(1, peers)
        selected: set[int] = set()
        used = 0
        # Include target lines first, then expand outwards within this file's budget.
        candidates = ([i for distance in range(13) for index in matched[:8]
                       for i in ([index] if distance == 0 else [index - distance, index + distance])]
                      if matched else list(range(min(len(lines), 80))))
        for index in candidates:
            if index in selected or not 0 <= index < len(lines):
                continue
            cost = len(f"{index + 1}: {lines[index]}") + 1
            if used + cost <= budget:
                selected.add(index)
                used += cost
        excerpt = "\n".join(f"{i + 1}: {lines[i]}" for i in sorted(selected))
        if not excerpt and matched and budget:
            index = matched[0]
            excerpt = f"{index + 1}: {lines[index]}"[:budget]
        context.append({"path": str(path), "excerpt": excerpt})
        remaining -= len(excerpt)
    return context


def parse_repair_response(content: str, allowed_paths: list[Path]) -> tuple[str, list[dict[str, str]]]:
    raw = content.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.I)
    payload = json.loads(raw)
    if not isinstance(payload, dict) or not isinstance(payload.get("edits"), list):
        raise ValueError("Repair model must return a JSON object with edits array")
    allowed = {str(path.resolve()) for path in allowed_paths}
    edits = payload["edits"]
    if len(edits) > 4:
        raise ValueError("At most four edits per iteration")
    checked = []
    for edit in edits:
        if not isinstance(edit, dict):
            raise ValueError("Each edit must be an object")
        if not isinstance(edit.get("path"), str):
            raise ValueError("Edit path must be a string")
        path = str(Path(edit["path"]).resolve())
        find, replace = edit.get("find"), edit.get("replace")
        if path not in allowed or not isinstance(find, str) or not isinstance(replace, str):
            raise ValueError("Edit path or text is outside the allowed source files")
        if not find or find == replace or len(find) > 6000 or len(replace) > 12000:
            raise ValueError("Edit must contain a bounded, nonempty change")
        checked.append({"path": path, "find": find, "replace": replace})
    return str(payload.get("diagnosis", ""))[:2000], checked


def _atomic_write(path: Path, data: bytes) -> None:
    descriptor, name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        if path.exists():
            temporary.chmod(path.stat().st_mode & 0o777)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def set_transaction_status(result: dict[str, Any], status: str) -> None:
    if result.get("transactionPath"):
        path = Path(result["transactionPath"])
        record = json.loads(path.read_text(encoding="utf-8"))
        _atomic_write(path, (json.dumps({**record, "status": status}, indent=2) + "\n").encode())


def recover_pending_edits(run_dir: Path) -> list[dict[str, Any]]:
    recovered = []
    for path in sorted((run_dir / "backups").glob("fix-*/transaction.json"), reverse=True):
        record = json.loads(path.read_text(encoding="utf-8"))
        if record["status"] in {"prepared", "applied"}:
            result = {**record, "transactionPath": str(path)}
            rollback_edits(result)
            recovered.append({"status": "rolled_back", "transactionPath": str(path), "files": record["files"]})
    return recovered


def apply_edits(edits: list[dict[str, str]], allowed_paths: list[Path], backup_dir: Path,
                expected_hashes: dict[str, str] | None = None) -> dict[str, Any]:
    allowed = {str(path.resolve()) for path in allowed_paths}
    staged: dict[str, str] = {}
    original: dict[str, str] = {}
    for edit in edits:
        path = str(Path(edit["path"]).resolve())
        if path not in allowed:
            raise ValueError(f"Edit path is not allowed: {path}")
        if path not in staged:
            original[path] = Path(path).read_bytes().decode("utf-8")
            if expected_hashes is not None and hashlib.sha256(original[path].encode()).hexdigest() != expected_hashes.get(path):
                raise ValueError(f"Source changed after diagnosis; refusing edit: {path}")
            staged[path] = original[path]
        if staged[path].count(edit["find"]) != 1:
            raise ValueError(f"Edit search text must occur exactly once: {path}")
        staged[path] = staged[path].replace(edit["find"], edit["replace"], 1)
    if not staged:
        return {"status": "no_edits", "files": []}

    # Never overwrite the only backup of a prior, possibly interrupted attempt.
    backup_dir.mkdir(parents=True, exist_ok=False)
    manifest = []
    for index, (path, before) in enumerate(original.items()):
        backup = backup_dir / f"{index}.before"
        backup.write_bytes(before.encode("utf-8"))
        manifest.append({
            "path": path, "backup": str(backup),
            "beforeSha256": hashlib.sha256(before.encode()).hexdigest(),
            "afterSha256": hashlib.sha256(staged[path].encode()).hexdigest(),
        })
    (backup_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    transaction_path = backup_dir / "transaction.json"
    result = {"status": "applied", "files": manifest, "transactionPath": str(transaction_path)}
    _atomic_write(transaction_path, (json.dumps({**result, "status": "prepared"}, indent=2) + "\n").encode())
    try:
        for path, after in staged.items():
            if Path(path).read_bytes() != original[path].encode("utf-8"):
                raise RuntimeError(f"Source changed during edit: {path}")
            _atomic_write(Path(path), after.encode("utf-8"))
        set_transaction_status(result, "applied")
    except BaseException as exc:
        try:
            rollback_edits(result)
        except Exception as rollback_exc:
            # Do not let the caller report a clean rejection when restoration failed.
            raise RuntimeError(f"Edit failed ({exc}); rollback incomplete: {rollback_exc}") from exc
        raise
    return result


def rollback_edits(result: dict[str, Any]) -> None:
    pending = []
    for item in result.get("files", []):
        destination = Path(item["path"])
        current = destination.read_bytes()
        digest = hashlib.sha256(current).hexdigest()
        backup = Path(item["backup"]).read_bytes()
        if hashlib.sha256(backup).hexdigest() != item["beforeSha256"]:
            raise RuntimeError(f"Backup changed; refusing rollback: {item['backup']}")
        if digest == item["beforeSha256"]:
            continue
        if digest != item["afterSha256"]:
            raise RuntimeError(f"Source changed after model edit; refusing rollback: {destination}")
        pending.append((destination, backup))
    for destination, backup in pending:
        _atomic_write(destination, backup)
    set_transaction_status(result, "rolled_back")
