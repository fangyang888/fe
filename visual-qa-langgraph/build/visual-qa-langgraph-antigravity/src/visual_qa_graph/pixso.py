"""Read declared Pixso design data without inspecting opaque image descendants."""

from __future__ import annotations

import base64
import hashlib
import json
import re
import threading
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
from PIL import Image

from .design import generation_context, read_design_tree


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


class PixsoMcpClient:
    def __init__(self, endpoint: str):
        self.endpoint = endpoint
        self.http = httpx.Client(timeout=45, trust_env=False)
        self.session_id: str | None = None
        self.next_id = 1
        self.lock = threading.Lock()

    def __enter__(self) -> "PixsoMcpClient":
        self._rpc("initialize", {
            "protocolVersion": "2025-03-26", "capabilities": {},
            "clientInfo": {"name": "visual-qa-langgraph", "version": "0.1.0"},
        })
        return self

    def __exit__(self, *_exc: object) -> None:
        self.http.close()

    def _rpc(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            request_id = self.next_id
            self.next_id += 1
            headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
            if self.session_id:
                headers["Mcp-Session-Id"] = self.session_id
            response = self.http.post(self.endpoint, headers=headers, json={
                "jsonrpc": "2.0", "id": request_id, "method": method, "params": params,
            })
            response.raise_for_status()
            self.session_id = self.session_id or response.headers.get("mcp-session-id")
            if "text/event-stream" in response.headers.get("content-type", ""):
                messages = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")]
                payload = next((item for item in messages if item.get("id") == request_id), None)
            else:
                payload = response.json()
            if not isinstance(payload, dict):
                raise RuntimeError(f"Pixso MCP returned no response for {method}")
            if payload.get("error"):
                raise RuntimeError(f"Pixso MCP {method}: {payload['error']}")
            return payload

    def call(self, name: str, args: dict[str, Any]) -> list[dict[str, Any]]:
        payload = self._rpc("tools/call", {"name": name, "arguments": args})
        result = payload.get("result") or {}
        if result.get("isError"):
            message = next((part.get("text", "") for part in result.get("content", []) if part.get("type") == "text"), "")
            raise RuntimeError(f"Pixso {name}: {message[:500]}")
        return result.get("content") or []

    def query_nodes(self, node_ids: list[str], fields: list[str]) -> list[dict[str, Any]]:
        content = self.call("query_nodes", {
            "nodeIds": node_ids, "readDepth": 1, "searchDepth": 1,
            "resolveInstances": False, "includePathGeometry": False, "fields": fields,
        })
        text = next((item.get("text", "") for item in content if item.get("type") == "text"), "")
        nodes = json.loads(text)
        if not isinstance(nodes, list) or {node.get("guid") for node in nodes} != set(node_ids):
            raise RuntimeError("Pixso query_nodes returned unexpected node IDs")
        # Pixso omits childNode for a leaf even when it was requested. Its
        # schema defines an omitted selected field as absent/not applicable.
        if "childNode" in fields:
            for node in nodes:
                node.setdefault("childNode", [])
        return nodes

    def export_png(self, node_id: str, scale: int) -> bytes:
        content = self.call("get_export_image", {
            "guid": node_id,
            "exportSettings": {"constraint": {"type": 1, "value": scale}, "imageType": 1},
        })
        image = next((item for item in content if item.get("type") == "image" and item.get("data")), None)
        if image:
            data = base64.b64decode(image["data"], validate=True)
        else:
            text = next((item.get("text", "") for item in content if item.get("type") == "text"), "")
            match = re.search(r"https?://[^\s\"\)]+", text)
            if not match:
                raise RuntimeError(f"Pixso export {node_id} returned no image")
            url = match.group(0)
            host = urlparse(url).hostname
            if host not in {"127.0.0.1", "localhost", "::1"}:
                raise RuntimeError("Pixso export URL must be local")
            response = self.http.get(url)
            response.raise_for_status()
            data = response.content
        if not data.startswith(PNG_SIGNATURE):
            raise RuntimeError(f"Pixso export {node_id} is not PNG")
        return data


def _write(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _node_ids(plan: dict[str, Any]) -> list[str]:
    ids: set[str] = set()
    for region in plan.get("regions", []):
        if region.get("export") is False or region.get("mode") not in {"single-image", "layers"}:
            continue
        entries = region.get("layers", []) if region.get("mode") == "layers" else [region]
        for entry in entries:
            if entry.get("export") is False:
                continue
            node_id = entry.get("nodeId")
            if not isinstance(node_id, str) or not re.fullmatch(r"\d+:\d+", node_id):
                raise ValueError("Every Pixso image needs a Pixso nodeId; a red frame only marks its approximate location")
            ids.add(node_id)
    return sorted(ids)


def resolve_red_image_nodes(endpoint: str, plan: dict[str, Any]) -> dict[str, Any]:
    """Resolve loose red frames to node IDs from shallow layout bounds when available.

    The matched node is never queried. If Pixso omits positional metadata, an
    explicit order-to-node hint is required instead of cropping the red frame.
    """
    missing = [region for region in plan.get("regions", [])
               if region.get("mode") == "single-image" and region.get("source") == "red-frame"
               and region.get("export") is not False and not region.get("nodeId")]
    if not missing:
        return plan
    root_id = plan["source"]["nodeId"]
    viewport = plan["source"].get("viewport") or {}
    if not viewport.get("width") or not viewport.get("height"):
        raise ValueError("Red-frame image matching needs the design viewport")

    def box(node: dict[str, Any], origin: tuple[float, float]) -> tuple[float, float, float, float] | None:
        absolute = node.get("absoluteBoundingBox")
        raw = absolute if isinstance(absolute, dict) else node
        values = [raw.get(key) for key in ("x", "y", "width", "height")]
        if any(not isinstance(value, (int, float)) for value in values):
            return None
        x, y, width, height = map(float, values)
        x -= origin[0]
        y -= origin[1]
        return x, y, width, height

    def score(candidate: tuple[float, float, float, float], wanted: dict[str, Any]) -> float:
        x, y, width, height = candidate
        if width <= 0 or height <= 0:
            return 0.0
        wx, wy = float(wanted["x"]), float(wanted["y"])
        ww, wh = float(wanted["width"]), float(wanted["height"])
        overlap = max(0, min(x + width, wx + ww) - max(x, wx)) * max(0, min(y + height, wy + wh) - max(y, wy))
        union = width * height + ww * wh - overlap
        return overlap / union if union else 0.0

    with PixsoMcpClient(endpoint) as client:
        fields = ["guid", "name", "type", "x", "y", "width", "height", "absoluteBoundingBox", "childNode"]
        root = client.query_nodes([root_id], fields)[0]
        origin_box = box(root, (0, 0))
        origin = (origin_box[0], origin_box[1]) if origin_box else (0.0, 0.0)
        candidates: list[tuple[str, tuple[float, float, float, float]]] = []
        # Read only the root's immediate children. A deeper, unnamed target
        # needs an explicit nodeId hint; walking into it could expose an image.
        for node in root.get("childNode") or []:
            node_id = node.get("guid")
            if not isinstance(node_id, str):
                continue
            bounds = box(node, origin)
            if bounds:
                candidates.append((node_id, bounds))
    used = {region.get("nodeId") for region in plan.get("regions", []) if region.get("nodeId")}
    for region in missing:
        bounds = region.get("bounds")
        if not bounds:
            raise ValueError(f"Red image {region['id']} has no mapped design bounds")
        ranked = sorted(((score(candidate, bounds), node_id) for node_id, candidate in candidates
                         if node_id not in used), reverse=True)
        if not ranked or ranked[0][0] < 0.55 or (len(ranked) > 1 and ranked[0][0] - ranked[1][0] < 0.12):
            raise ValueError(f"Cannot uniquely locate Pixso image node for {region['id']}; provide its nodeId in --image-map. Red bounds are not crop dimensions")
        region["nodeId"] = ranked[0][1]
        used.add(ranked[0][1])
    return plan


def fetch_design(
    *, endpoint: str, revision: str, plan_path: Path, design_hash: str,
    cache_dir: Path, scale: int, refresh: bool,
) -> dict[str, Any]:
    """Read shallow design batches in Python and cache pruned local evidence."""
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    if plan.get("status") != "ready" or not plan.get("source", {}).get("nodeId"):
        raise ValueError("Pixso fetch requires a ready intent plan with a root node")
    if scale < 1 or scale > 4:
        raise ValueError("Pixso export scale must be 1–4")
    cache_plan = {key: value for key, value in plan.items() if key != "generatedAt"}
    key = hashlib.sha256(json.dumps({
        "engine": "python-v1", "revision": revision, "plan": cache_plan, "designHash": design_hash, "scale": scale,
    }, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    folder = cache_dir / "pixso" / key
    marker = folder / "metadata.json"
    if marker.is_file() and not refresh:
        cached = json.loads(marker.read_text(encoding="utf-8"))
        paths = [Path(cached["contextPath"]), *(Path(item["path"]) for item in cached["assets"])]
        if all(path.is_file() for path in paths) and all(
            item.get("scale") == scale and item.get("pixelWidth") and item.get("pixelHeight")
            for item in cached["assets"]
        ):
            return {**cached, "cached": True}

    folder.mkdir(parents=True, exist_ok=True)
    state_path = folder / "read-state.json"
    responses_path = folder / "responses.json"
    image_ids = _node_ids(plan)
    with PixsoMcpClient(endpoint) as client:
        tree, queried, responses = read_design_tree(client, plan)
        context = generation_context(plan, tree)
        _write(state_path, {"schemaVersion": 1, "tree": tree, "queriedNodeIds": queried})
        _write(responses_path, responses)
        context_path = folder / "generation-context.json"
        _write(context_path, context)
        assets = []
        for node_id in image_ids:
            asset_path = folder / "assets" / f"{node_id.replace(':', '_')}.png"
            data = client.export_png(node_id, scale)
            asset_path.parent.mkdir(parents=True, exist_ok=True)
            asset_path.write_bytes(data)
            with Image.open(BytesIO(data)) as exported:
                pixel_width, pixel_height = exported.size
            if pixel_width < 1 or pixel_height < 1:
                raise RuntimeError(f"Pixso export {node_id} has invalid dimensions")
            assets.append({"nodeId": node_id, "path": str(asset_path), "scale": scale,
                           "pixelWidth": pixel_width, "pixelHeight": pixel_height,
                           "cssWidth": pixel_width / scale, "cssHeight": pixel_height / scale,
                           "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)})

    metadata = {"key": key, "revision": revision, "contextPath": str(context_path),
                "assets": assets, "queriedNodes": len(queried), "cached": False}
    _write(marker, metadata)
    return metadata
