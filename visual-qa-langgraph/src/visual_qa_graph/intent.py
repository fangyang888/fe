"""Detect red image annotations with Pillow/NumPy; never crop them into assets."""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage


def _bounds(values, size):
    if len(values) != 4 or any(not math.isfinite(v) for v in values):
        raise ValueError("annotated-frame requires x,y,width,height")
    x, y, width, height = values
    if min(x, y) < 0 or min(width, height) <= 0 or x + width > size[0] or y + height > size[1]:
        raise ValueError("Annotated frame must be inside the screenshot")
    return dict(zip(("x", "y", "width", "height"), values))


def _inside(outer: dict, inner: dict) -> bool:
    return (outer != inner and outer["x"] <= inner["x"] and outer["y"] <= inner["y"]
            and outer["x"] + outer["width"] >= inner["x"] + inner["width"]
            and outer["y"] + outer["height"] >= inner["y"] + inner["height"])


def _border_coverage(mask: np.ndarray, rectangle: dict, border: int) -> float:
    x, y, width, height = (int(rectangle[key]) for key in ("x", "y", "width", "height"))
    local = mask[y:y + height, x:x + width]
    return float(min(local[:border].any(axis=0).mean(), local[-border:].any(axis=0).mean(),
                     local[:, :border].any(axis=1).mean(), local[:, -border:].any(axis=1).mean()))


def _has_connected_inner_borders(component: np.ndarray, border: int) -> bool:
    """Conservatively flag shared-edge child boxes that component labeling merges."""
    inset = max(2, border * 2)
    inside = component[inset:-inset, inset:-inset]
    if inside.size == 0:
        return False
    horizontal = np.count_nonzero(inside, axis=1) >= inside.shape[1] * 0.7
    bands = np.flatnonzero(np.diff(np.r_[False, horizontal, False]))
    return sum(0 < end - start <= 8 for start, end in zip(bands[::2], bands[1::2])) >= 2


def create_intent_plan(*, annotated: Path, node_id: str, viewport: dict,
                       design_url: str | None = None, image_map: Path | None = None,
                       frame: str | None = None) -> dict:
    for key in ("width", "height"):
        value = viewport.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
            raise ValueError(f"viewport.{key} must be positive")
    with Image.open(annotated) as image:
        rgb = np.asarray(image.convert("RGB"), dtype=np.int16)
        size = image.size
    mapping = json.loads(image_map.read_text()) if image_map else {}
    hints = mapping.get("hints", [])
    explicit = mapping.get("regions")
    if explicit is not None and (not isinstance(explicit, list) or not explicit or hints):
        raise ValueError("Image map regions must be a nonempty list and cannot be combined with hints")
    orders = [h.get("order") for h in hints]
    if any(type(n) is not int for n in orders) or len(set(orders)) != len(orders):
        raise ValueError("Image map needs unique integer hint orders")
    red, green, blue = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    mask = (red >= 220) & (green <= 150) & (blue <= 150) & (red - green >= 70) & (red - blue >= 70)
    rectangles = []
    if explicit is not None:
        for item in explicit:
            if not isinstance(item, dict) or not item.get("nodeId") or not item.get("selector"):
                raise ValueError("Each explicit image region needs a Pixso nodeId and DOM selector")
            raw = item.get("annotationBounds")
            if not isinstance(raw, dict):
                raise ValueError("Each explicit image region needs annotationBounds")
            box = _bounds([raw[key] for key in ("x", "y", "width", "height")], size)
            if any(value != int(value) for value in box.values()):
                raise ValueError("annotationBounds must use integer screenshot pixels")
            border = item.get("borderWidth", 3)
            if type(border) is not int or border < 1 or border > 8 or min(box["width"], box["height"]) <= border * 2:
                raise ValueError("Invalid explicit image borderWidth")
            coverage = _border_coverage(mask, box, border)
            rectangles.append({**box, "borderWidth": border, "confidence": coverage, "hint": item})
    else:
        labels, _ = ndimage.label(mask, structure=np.ones((3, 3)))
        for index, box in enumerate(ndimage.find_objects(labels), 1):
            if box is None:
                continue
            y, x = box[0].start, box[1].start
            height, width = box[0].stop - y, box[1].stop - x
            if width < 16 or height < 12:
                continue
            local = labels[box] == index
            border = max(1, min(8, min(width, height) // 4))
            coverage = min(local[:border].any(axis=0).mean(), local[-border:].any(axis=0).mean(),
                           local[:, :border].any(axis=1).mean(), local[:, -border:].any(axis=1).mean())
            # Filled red objects are not reliable annotations.
            if coverage < 0.55 or local[border:-border, border:-border].mean() > 0.2:
                continue
            center = local[:, width // 4:width * 3 // 4]
            thickness = max(1, next((n for n in range(1, border + 1) if not center[n].any()), border))
            if _has_connected_inner_borders(local, thickness):
                raise ValueError("Connected nested red frames are ambiguous; provide image-map regions with each image nodeId and annotationBounds")
            rectangles.append({"x": x, "y": y, "width": width, "height": height,
                               "borderWidth": thickness, "confidence": float(coverage)})
    rectangles.sort(key=lambda r: (r["y"], r["x"]))
    if not rectangles:
        raise ValueError("No unambiguous red rectangles detected; separate touching frames")
    if frame:
        frame_bounds = _bounds([float(v) for v in frame.split(",")], size)
    elif abs((size[0] / size[1]) / (viewport["width"] / viewport["height"]) - 1) <= 0.02:
        frame_bounds = _bounds([0, 0, *size], size)
    else:
        raise ValueError("Design frame is ambiguous; provide --annotated-frame x,y,width,height")
    if any(n < 1 or n > len(rectangles) for n in orders):
        raise ValueError("Image map order does not match a detected red frame")
    if len({item.get("nodeId") for item in explicit or []}) != len(explicit or []):
        raise ValueError("Explicit image regions need unique Pixso nodeIds")
    regions = []
    for order, rectangle in enumerate(rectangles, 1):
        hint = rectangle.get("hint") or next((h for h in hints if h["order"] == order), {})
        if hint.get("mode", "single-image") != "single-image" or hint.get("layers"):
            raise ValueError("Red image frames cannot declare child layers or a different mode")
        border = rectangle["borderWidth"]
        content = {"x": rectangle["x"] + border, "y": rectangle["y"] + border,
                   "width": rectangle["width"] - 2 * border, "height": rectangle["height"] - 2 * border}
        if content["x"] < frame_bounds["x"] or content["y"] < frame_bounds["y"] or (
            content["x"] + content["width"] > frame_bounds["x"] + frame_bounds["width"] or
            content["y"] + content["height"] > frame_bounds["y"] + frame_bounds["height"]
        ):
            raise ValueError("Red image frame lies outside --annotated-frame")
        bounds = {k: round((content[k] - (frame_bounds[k] if k in {"x", "y"} else 0)) *
                   viewport["width" if k in {"x", "width"} else "height"] /
                   frame_bounds["width" if k in {"x", "width"} else "height"], 3) for k in content}
        if hint.get("bounds"):
            bounds = _bounds([hint["bounds"][k] for k in ("x", "y", "width", "height")], (viewport["width"], viewport["height"]))
        regions.append({"id": f"region-{order}", "order": order, "name": hint.get("name", f"region-{order}"),
            "mode": "single-image", "source": "red-frame", "bounds": bounds,
            "annotationBounds": {k: rectangle[k] for k in content}, "borderWidth": border,
            "confidence": rectangle["confidence"], "selector": hint.get("selector", f'[data-visual="region-{order}"]'),
            **{k: hint[k] for k in ("nodeId", "export", "format", "note") if k in hint},
            "imageBoundary": {"representation": "single-image", "pixsoAccess": "export-only",
                              "descendantAccess": "forbidden", "requireNoVisibleChildren": True}})
    for region in regions:
        parents = [other for other in regions if _inside(other["annotationBounds"], region["annotationBounds"])]
        if parents:
            parent = min(parents, key=lambda candidate: candidate["annotationBounds"]["width"] * candidate["annotationBounds"]["height"])
            region["parentRegionId"] = parent["id"]
    return {"schemaVersion": 1, "kind": "visual-qa-langgraph-intent-plan", "name": f"red-images-{node_id}",
            "status": "ready", "generatedAt": datetime.now(timezone.utc).isoformat(), "ambiguities": [],
            "source": {"provider": "pixso", "nodeId": node_id, "viewport": viewport,
                       "annotatedImage": str(annotated), "frameBounds": frame_bounds, "redAsImage": True,
                       **({"designUrl": design_url} if design_url else {})}, "regions": regions}
