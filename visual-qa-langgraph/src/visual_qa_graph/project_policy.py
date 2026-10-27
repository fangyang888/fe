"""Deterministic CSS policy extracted from a project's own SKILL.md."""

from __future__ import annotations

import hashlib
import json
import math
import re
from pathlib import Path
from typing import Any


_BLOCK = re.compile(r"```visual-qa(?:-langgraph)?-policy\s*\n(.*?)\n```", re.S | re.I)


def read_project_policy(skill_path: Path) -> dict[str, Any]:
    source = skill_path.read_text(encoding="utf-8")
    blocks = _BLOCK.findall(source)
    if len(blocks) != 1:
        raise ValueError(f"{skill_path} needs exactly one ```visual-qa-langgraph-policy JSON block")
    try:
        config = json.loads(blocks[0])
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid visual-qa-langgraph-policy JSON in {skill_path}: {exc}") from exc
    if not isinstance(config, dict) or config.get("schemaVersion") != 1:
        raise ValueError("visual-qa-langgraph-policy requires schemaVersion 1")
    if set(config) - {"schemaVersion", "css", "layout"}:
        raise ValueError("Unknown visual-qa-langgraph-policy top-level key")
    css = config.get("css")
    if not isinstance(css, dict) or set(css) - {"unit", "rootFontSizePx", "conversion"}:
        raise ValueError("visual-qa-langgraph-policy.css has unknown keys or is missing")
    unit = css.get("unit")
    if unit not in {"px", "rem"}:
        raise ValueError("visual-qa-langgraph-policy.css.unit must be px or rem")
    conversion = css.get("conversion", "authoring" if unit == "rem" else "none")
    if unit == "px" and conversion != "none":
        raise ValueError("px policy must use conversion none")
    if unit == "rem" and conversion not in {"authoring", "build"}:
        raise ValueError("rem policy conversion must be authoring or build")
    root = css.get("rootFontSizePx")
    if unit == "rem" and (isinstance(root, bool) or not isinstance(root, (int, float))
                          or not math.isfinite(root) or root <= 0):
        raise ValueError("rem policy needs the root font size in px at the design viewport")
    if unit == "px" and root is not None:
        raise ValueError("px policy must not specify rootFontSizePx")
    layout = config.get("layout", {})
    if not isinstance(layout, dict) or set(layout) - {"preferFlex"}:
        raise ValueError("visual-qa-langgraph-policy.layout has unknown keys or is invalid")
    prefer_flex = layout.get("preferFlex", True)
    if not isinstance(prefer_flex, bool):
        raise ValueError("layout.preferFlex must be boolean")
    return {
        "source": str(skill_path.resolve()),
        "sha256": hashlib.sha256(source.encode()).hexdigest(),
        "css": {"unit": unit, "conversion": conversion,
                **({"rootFontSizePx": root} if unit == "rem" else {})},
        "layout": {"preferFlex": prefer_flex},
        "scaffoldOptions": {"unit": "px" if conversion == "build" else unit,
                            **({"rootFontSize": root} if unit == "rem" and conversion == "authoring" else {}),
                            "assets": {}},
    }


def apply_case_policy(case: dict[str, Any], policy: dict[str, Any]) -> dict[str, Any]:
    expected = {"preferRem": policy["css"]["unit"] == "rem",
                "preferFlex": policy["layout"]["preferFlex"]}
    current = case.get("cssRules") or {}
    if not isinstance(current, dict):
        raise ValueError("case.cssRules must be an object")
    for key, value in expected.items():
        if key in current and current[key] != value:
            raise ValueError(f"case.cssRules.{key} conflicts with project skill policy")
    return {**case, "cssRules": {**current, **expected}}


def inline_length(value_px: float, policy: dict[str, Any] | None) -> str:
    if not policy or policy["css"]["unit"] == "px":
        return f"{value_px:g}px"
    root = policy["css"]["rootFontSizePx"]
    return f"{value_px / root:.6f}".rstrip("0").rstrip(".") + "rem"
