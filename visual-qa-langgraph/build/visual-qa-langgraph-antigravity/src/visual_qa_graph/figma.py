"""Capture a Figma Design node as a visual reference using the desktop MCP."""

from __future__ import annotations

import base64
import binascii
from io import BytesIO

import httpx
from PIL import Image

from .mcp_http import McpClient


DEFAULT_FIGMA_ENDPOINT = "http://127.0.0.1:3845/mcp"


class FigmaMcpClient(McpClient):
    server_name = "Figma"


def fetch_screenshot(endpoint: str, node_id: str) -> bytes:
    try:
        with FigmaMcpClient(endpoint) as client:
            parts = client.call("get_screenshot", {"nodeId": node_id})
    except (httpx.HTTPError, RuntimeError) as exc:
        raise RuntimeError(
            f"Figma MCP could not capture node {node_id}. Open the linked file in Figma Desktop "
            f"and enable its MCP server at {endpoint}. {exc}"
        ) from exc

    png = next((part["data"] for part in parts if part.get("type") == "image"
                and part.get("mimeType") == "image/png" and part.get("data")), None)
    if not png:
        detail = next((part.get("text", "") for part in parts if part.get("type") == "text"), "")
        raise RuntimeError(f"Figma MCP returned no PNG for node {node_id}. {detail[:300]}")
    try:
        data = base64.b64decode(png, validate=True)
        with Image.open(BytesIO(data), formats=["PNG"]) as image:
            image.load()
    except (ValueError, OSError, binascii.Error) as exc:
        raise RuntimeError(f"Figma MCP returned an invalid PNG for node {node_id}") from exc
    return data
