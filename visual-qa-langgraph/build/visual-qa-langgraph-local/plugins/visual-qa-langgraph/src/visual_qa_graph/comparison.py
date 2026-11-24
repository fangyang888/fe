"""Local pixelmatch + SSIM comparison. No JavaScript CLI or subprocesses."""

from __future__ import annotations

import math
import time
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image
from pixelmatch.contrib.PIL import pixelmatch
from scipy import ndimage


DEFAULT_THRESHOLDS = {"pixelThreshold": 0.1, "maxMismatchPercent": 1.5, "minSsim": 0.98}
METRICS = {"pixelmatch": "python-pixelmatch", "ssim": "python-ssim-fast-v1"}


def thresholds(values: dict | None = None) -> dict:
    result = {**DEFAULT_THRESHOLDS, **(values or {})}
    for key, maximum in (("pixelThreshold", 1), ("maxMismatchPercent", 100), ("minSsim", 1)):
        value = result[key]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= maximum:
            raise ValueError(f"Invalid thresholds.{key}")
    return result


def _integer_grayscale(image: Image.Image) -> np.ndarray:
    rgb = np.asarray(image.convert("RGB"), dtype=np.uint16)
    return (77 * rgb[:, :, 0] + 150 * rgb[:, :, 1] + 29 * rgb[:, :, 2] + 128) >> 8


def _downsample_grayscale(image: np.ndarray) -> np.ndarray:
    # ssim.js defaults to a symmetric moving average followed by skip sampling.
    factor = math.floor(min(image.shape) / 256 + 0.5)
    if factor <= 1:
        return image
    filtered = ndimage.uniform_filter(image.astype(np.float64), size=factor, mode="nearest")
    return filtered[::factor, ::factor]


def _ssim(expected: Image.Image, actual: Image.Image) -> float:
    first = _downsample_grayscale(_integer_grayscale(expected)).astype(np.float64)
    second = _downsample_grayscale(_integer_grayscale(actual)).astype(np.float64)
    window = 2 * math.floor((min(11, *first.shape) - 1) / 2) + 1
    radius = window // 2
    offsets = np.arange(-radius, radius + 1, dtype=np.float64)
    weights = np.exp(-(offsets ** 2) / (2 * 1.5 ** 2)) / (1.5 * math.sqrt(2 * math.pi))
    weights /= weights.sum()

    def filtered(values: np.ndarray) -> np.ndarray:
        result = ndimage.convolve1d(values, weights, axis=1, mode="constant", cval=0.0)
        result = ndimage.convolve1d(result, weights, axis=0, mode="constant", cval=0.0)
        return result if radius == 0 else result[radius:-radius, radius:-radius]

    mean_first = filtered(first)
    mean_second = filtered(second)
    variance_first = filtered(first * first) - mean_first * mean_first
    variance_second = filtered(second * second) - mean_second * mean_second
    covariance = filtered(first * second) - mean_first * mean_second
    c1, c2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    similarity = (
        (2 * mean_first * mean_second + c1) * (2 * covariance + c2)
        / ((mean_first ** 2 + mean_second ** 2 + c1) * (variance_first + variance_second + c2))
    )
    return float(np.mean(similarity))


def _metrics(expected: Image.Image, actual: Image.Image, config: dict) -> tuple[int, float, Image.Image]:
    diff = Image.new("RGBA", expected.size)
    mismatch = pixelmatch(expected, actual, diff, threshold=config["pixelThreshold"], diff_mask=True)
    if min(expected.size) < 2:
        similarity = 1 - mismatch / (expected.width * expected.height)
    else:
        similarity = _ssim(expected, actual)
    return mismatch, similarity, diff


def validate_region(bounds: dict, size: tuple[int, int]) -> tuple[int, int, int, int]:
    values = [bounds.get(key) for key in ("x", "y", "width", "height")]
    if any(type(value) is not int for value in values):
        raise ValueError("Region bounds must be integer screenshot pixels")
    x, y, width, height = values
    if x < 0 or y < 0 or width <= 0 or height <= 0 or x + width > size[0] or y + height > size[1]:
        raise ValueError("Region bounds must be inside the screenshot")
    return x, y, x + width, y + height


def difference_regions(diff: Image.Image, limit: int = 4) -> list[dict]:
    mask = np.asarray(diff)[:, :, 3] > 0
    # Join nearby glyph pixels into actionable regions without enlarging their bounds.
    labels, count = ndimage.label(ndimage.binary_dilation(mask, iterations=3))
    counts = np.bincount(labels[mask], minlength=count + 1)
    regions = []
    for index, slices in enumerate(ndimage.find_objects(labels), 1):
        if slices is None or not counts[index]:
            continue
        local = mask[slices] & (labels[slices] == index)
        ys, xs = np.nonzero(local)
        x, y = int(xs.min() + slices[1].start), int(ys.min() + slices[0].start)
        width, height = int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)
        pixels = int(counts[index])
        regions.append({"x": x, "y": y, "width": width, "height": height,
                        "mismatchPixels": pixels, "mismatchPercent": pixels / (width * height) * 100})
    return sorted(regions, key=lambda region: region["mismatchPixels"], reverse=True)[:limit]


def compare_images(expected_path: Path, actual_path: Path, diff_path: Path,
                   config: dict | None = None, critical_regions: list | None = None) -> dict[str, Any]:
    started = time.perf_counter()
    config = thresholds(config)
    with Image.open(expected_path) as source:
        expected = source.convert("RGBA")
    with Image.open(actual_path) as source:
        actual = source.convert("RGBA")
    if expected.size != actual.size:
        raise ValueError(f"Screenshot dimensions differ: design {expected.size}, actual {actual.size}; check viewport/deviceScaleFactor/fullPage")
    mismatch, similarity, diff = _metrics(expected, actual, config)
    percent = mismatch / (expected.width * expected.height) * 100
    regions = difference_regions(diff)
    critical = []
    for region in critical_regions or []:
        box = validate_region(region["bounds"], expected.size)
        local = thresholds({**config, **region.get("thresholds", {})})
        count, score, _ = _metrics(expected.crop(box), actual.crop(box), local)
        ratio = count / ((box[2] - box[0]) * (box[3] - box[1])) * 100
        passed = ratio <= local["maxMismatchPercent"] and score >= local["minSsim"]
        critical.append({**region, "thresholds": local, "mismatchPercent": ratio, "ssim": score, "passed": passed})
        if not passed and not any(r["x"] <= box[0] and r["y"] <= box[1] and
                r["x"] + r["width"] >= box[2] and r["y"] + r["height"] >= box[3] for r in regions):
            regions.append({**region["bounds"], "mismatchPixels": count, "mismatchPercent": ratio})
    diff_path.parent.mkdir(parents=True, exist_ok=True)
    diff.save(diff_path)
    return {"expectedPath": str(expected_path), "actualPath": str(actual_path), "diffPath": str(diff_path),
            "width": expected.width, "height": expected.height, "mismatchPixels": mismatch,
            "mismatchPercent": percent, "ssim": similarity, "thresholds": config, "metrics": METRICS,
            "passed": percent <= config["maxMismatchPercent"] and similarity >= config["minSsim"] and all(r["passed"] for r in critical),
            "differenceRegions": regions, "criticalRegions": critical,
            "timings": {"totalMs": round((time.perf_counter() - started) * 1000, 2)}}


def write_crops(expected_path: Path, actual_path: Path, regions: list[dict], output: Path) -> list[str]:
    files = []
    with Image.open(expected_path) as expected, Image.open(actual_path) as actual:
        output.mkdir(parents=True, exist_ok=True)
        for index, region in enumerate(regions[:4], 1):
            x, y = max(0, region["x"] - 16), max(0, region["y"] - 16)
            right = min(expected.width, region["x"] + region["width"] + 16)
            bottom = min(expected.height, region["y"] + region["height"] + 16)
            box = (x, y, right, bottom)
            image = Image.new("RGB", ((right - x) * 2 + 2, bottom - y), "#ff0080")
            image.paste(expected.crop(box).convert("RGB"), (0, 0))
            image.paste(actual.crop(box).convert("RGB"), (right - x + 2, 0))
            path = output / f"difference-{index}.png"
            image.save(path)
            files.append(str(path))
    return files
