"""Bind exported Pixso nodes to explicit placeholders in a static HTML page."""

from __future__ import annotations

import hashlib
import html
import json
import os
import re
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

from .project_policy import inline_length


_VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
_SELECTOR = re.compile(r'^#([A-Za-z][\w:-]*)$|^\[data-visual=["\']([^"\']+)["\']\]$')


class _Elements(HTMLParser):
    def __init__(self, source: str):
        super().__init__(convert_charrefs=False)
        self.source = source
        self.offsets = [0]
        for line in source.splitlines(keepends=True):
            self.offsets.append(self.offsets[-1] + len(line))
        self.elements: list[dict[str, Any]] = []
        self.stack: list[dict[str, Any]] = []
        self.feed(source)
        self.close()

    def _position(self) -> int:
        line, column = self.getpos()
        return self.offsets[line - 1] + column

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        start = self._position()
        end = start + len(self.get_starttag_text())
        entry = {"tag": tag, "attrs": attrs, "start": start, "open_end": end,
                 "close_start": end if tag in _VOID else None, "end": end if tag in _VOID else None}
        self.elements.append(entry)
        if tag not in _VOID:
            self.stack.append(entry)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        if self.stack and self.stack[-1]["tag"] == tag:
            self.stack.pop()

    def handle_endtag(self, tag: str) -> None:
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index]["tag"] == tag:
                entry = self.stack[index]
                entry["close_start"] = self._position()
                entry["end"] = self.source.find(">", entry["close_start"]) + 1
                del self.stack[index:]
                break


def _attribute(attrs: list[tuple[str, str | None]], key: str) -> str | None:
    return next((value for name, value in attrs if name == key), None)


def _tag(tag: str, attrs: list[tuple[str, str | None]]) -> str:
    rendered = [tag]
    for name, value in attrs:
        if value is None:
            rendered.append(name)
        else:
            rendered.append(f'{name}="{html.escape(value, quote=True)}"')
    return "<" + " ".join(rendered) + ">"


def _set(attrs: list[tuple[str, str | None]], key: str, value: str) -> list[tuple[str, str | None]]:
    return [(name, old) for name, old in attrs if name != key] + [(key, value)]


def bind_images(plan: dict[str, Any], pixso: dict[str, Any], html_path: Path,
                policy: dict[str, Any] | None = None) -> dict[str, Any]:
    """Use the export's true 3x dimensions; red-frame bounds never crop or size an asset."""
    regions = [region for region in plan.get("regions", [])
               if region.get("mode") == "single-image" and region.get("export") is not False]
    if not regions:
        return {"bound": 0, "assets": []}
    source = html_path.read_text(encoding="utf-8")
    elements = _Elements(source).elements
    assets = {asset["nodeId"]: asset for asset in pixso.get("assets", [])}
    by_id = {region["id"]: region for region in regions}
    prepared: list[tuple[dict[str, Any], dict[str, Any], dict[str, Any], Path, str]] = []
    selections: list[tuple[int, int, str]] = []

    def ancestors(region: dict[str, Any]) -> set[str]:
        found: set[str] = set()
        parent_id = region.get("parentRegionId")
        while parent_id:
            if parent_id in found or parent_id not in by_id:
                raise ValueError(f"Invalid image parentRegionId for {region['id']}")
            found.add(parent_id)
            parent_id = by_id[parent_id].get("parentRegionId")
        return found

    for region in regions:
        selector = region.get("selector")
        match = _SELECTOR.fullmatch(selector or "")
        if not match:
            raise ValueError(f"Image {region.get('id')} needs a simple #id or [data-visual=\"...\"] selector")
        matches = [entry for entry in elements if _attribute(entry["attrs"], "id" if match.group(1) else "data-visual") == (match.group(1) or match.group(2))]
        if len(matches) != 1 or matches[0]["end"] is None:
            raise ValueError(f"Image {region.get('id')} selector {selector} must match exactly one complete HTML element")
        entry = matches[0]
        span = (entry["start"], entry["end"])
        for prior_start, prior_end, prior_id in selections:
            if span[0] < prior_end and prior_start < span[1]:
                declared = (prior_start <= span[0] and span[1] <= prior_end and prior_id in ancestors(region)
                            or span[0] <= prior_start and prior_end <= span[1] and region["id"] in ancestors(by_id[prior_id]))
                if not declared:
                    raise ValueError("Nested image placeholders need matching parentRegionId")
        selections.append((*span, region["id"]))
        asset = assets.get(region.get("nodeId"))
        if not asset or asset.get("scale") != 3:
            raise ValueError(f"Image {region.get('id')} must have a 3x Pixso node export")
        data = Path(asset["path"]).read_bytes()
        if hashlib.sha256(data).hexdigest() != asset["sha256"]:
            raise ValueError(f"Image asset changed after export: {asset['path']}")
        safe = re.sub(r"[^a-zA-Z0-9_-]+", "-", region["id"]).strip("-") or "image"
        destination = html_path.parent / "assets" / "images" / f"{safe}-{asset['sha256'][:12]}.png"
        relative = os.path.relpath(destination, html_path.parent).replace(os.sep, "/")
        prepared.append((region, entry, asset, destination, relative))

    replacements: list[tuple[int, int, str]] = []
    policy_key = hashlib.sha256(json.dumps((policy or {}).get("css", {"unit": "px"}),
                                         sort_keys=True).encode()).hexdigest()[:12]
    for region, entry, asset, destination, relative in prepared:
        nested = any(entry["start"] < other["start"] and other["end"] <= entry["end"]
                     for other_region, other, *_ in prepared if region["id"] in ancestors(other_region))
        if nested and entry["tag"] in _VOID:
            raise ValueError(f"Image {region['id']} needs a non-void container for nested overlays")
        old_attrs = entry["attrs"]
        if (not nested and _attribute(old_attrs, "data-visual-image-sha") == asset["sha256"]
            and _attribute(old_attrs, "data-visual-policy") == policy_key
            and (entry["tag"] == "img" and _attribute(old_attrs, "src") == relative
                 or entry["tag"] != "img" and entry["open_end"] == entry["close_start"]
                 and relative in (_attribute(old_attrs, "style") or ""))):
            continue
        width, height = asset["cssWidth"], asset["cssHeight"]
        attrs = entry["attrs"]
        original_style = _attribute(attrs, "data-visual-original-style")
        style = (original_style if original_style is not None else (_attribute(attrs, "style") or "")).rstrip("; ")
        attrs = _set(attrs, "data-visual-original-style", style)
        attrs = _set(attrs, "data-visual-image-sha", asset["sha256"])
        attrs = _set(attrs, "data-visual-policy", policy_key)
        common = f"width:{inline_length(width, policy)};height:{inline_length(height, policy)};"
        if entry["tag"] == "img":
            attrs = _set(attrs, "src", relative)
            attrs = _set(attrs, "style", f"{style};{common}" if style else common)
            replacement = _tag("img", attrs)
        else:
            background = (f"background-image:url('{relative}');background-size:100% 100%;"
                          "background-repeat:no-repeat;background-color:transparent;border:0;padding:0;")
            attrs = _set(attrs, "style", f"{style};{common}{background}" if style else common + background)
            if not nested and entry["tag"] not in {"button", "a"}:
                attrs = _set(attrs, "role", "img")
            if not nested and not _attribute(attrs, "aria-label"):
                old_text = re.sub(r"<[^>]*>", " ", source[entry["open_end"]:entry["close_start"]]).strip()
                if old_text:
                    attrs = _set(attrs, "aria-label", html.unescape(old_text))
            replacement = (_tag(entry["tag"], attrs) if nested else
                           _tag(entry["tag"], attrs) + source[entry["close_start"]:entry["end"]])
        replacements.append((entry["start"], entry["open_end"] if nested else entry["end"], replacement))
    result = source
    for start, end, replacement in sorted(replacements, reverse=True):
        result = result[:start] + replacement + result[end:]
    for _, _, asset, destination, _ in prepared:
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not destination.is_file():
            temporary = destination.with_suffix(".tmp")
            temporary.write_bytes(Path(asset["path"]).read_bytes())
            temporary.replace(destination)
    if result != source:
        temporary = html_path.with_suffix(html_path.suffix + ".tmp")
        temporary.write_text(result, encoding="utf-8")
        temporary.replace(html_path)
    return {"bound": len(prepared), "assets": [str(item[3]) for item in prepared]}
