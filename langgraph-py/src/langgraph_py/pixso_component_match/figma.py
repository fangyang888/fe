"""Read Figma desktop MCP metadata into the design tree used by component matching."""
import asyncio
import math
import re
from datetime import timedelta
from urllib.parse import parse_qs, urlsplit
from xml.etree import ElementTree as ET

from mcp import ClientSession
from mcp.client.sse import sse_client
from mcp.client.streamable_http import streamable_http_client


DEFAULT_FIGMA_MCP_URL = "http://127.0.0.1:3845/mcp"


def is_figma_url(url):
    host = urlsplit(url).hostname or ""
    return host == "figma.com" or host.endswith(".figma.com")


def figma_target(url):
    parts = urlsplit(url)
    file = re.match(r"^/(?:design|file|proto)/([a-zA-Z0-9]+)(?:/|$)", parts.path)
    node_id = parse_qs(parts.query).get("node-id", [""])[0]
    if (parts.scheme not in {"http", "https"} or not is_figma_url(url) or not file
            or not re.fullmatch(r"\d+[:-]\d+", node_id)):
        raise ValueError("请提供带 node-id 的 Figma 设计图层链接，例如 ?node-id=23-2")
    return file[1], node_id.replace("-", ":")


def metadata_tree(blocks, target):
    def convert(element):
        attrs = element.attrib
        kind = element.tag.upper().replace("-", "_")
        node = {"type": kind, "name": attrs.get("name", ""), "id": attrs.get("id")}
        bounds = {}
        for key in ("x", "y", "width", "height"):
            if key in attrs:
                value = float(attrs[key])
                if math.isfinite(value):
                    bounds[key] = value
        if bounds:
            node["bounds"] = bounds
        if attrs.get("visible") == "false" or attrs.get("hidden") == "true":
            node["visible"] = False
        if kind == "TEXT":
            # Metadata often supplies only a layer name, which designers can edit independently.
            node["characters"] = attrs.get("characters") or attrs.get("text") or (element.text or "").strip()
        if len(element):
            node["children"] = [convert(child) for child in element]
        return node

    for block in blocks:
        if block.type != "text" or not block.text.lstrip().startswith("<"):
            continue
        try:
            root = ET.fromstring(block.text)
        except ET.ParseError as exc:
            raise ValueError("Figma 图层 XML 不完整，请选择较小的画板或组件") from exc
        for element in root.iter():
            if element.get("id") == target:
                return convert(element)
    raise ValueError(f"Figma MCP 未返回目标图层 {target}，请在 Figma 桌面端打开链接对应的文件")


async def fetch_metadata(endpoint, url, extra, transport):
    file_key, node_id = figma_target(url)
    connect = sse_client if transport == "sse" else streamable_http_client
    async with asyncio.timeout(90), connect(endpoint) as streams:
        async with ClientSession(*streams[:2], read_timeout_seconds=timedelta(seconds=60)) as session:
            await session.initialize()
            cursor = None
            while True:
                page = await session.list_tools(cursor=cursor)
                tool = next((t for t in page.tools if t.name == "get_metadata"), None)
                if tool or not page.nextCursor:
                    break
                cursor = page.nextCursor
            if not tool:
                raise ValueError("Figma MCP 未提供 get_metadata，请检查 FIGMA_MCP_URL")
            args = dict(extra, nodeId=node_id)
            if "fileKey" in tool.inputSchema.get("properties", {}):
                args["fileKey"] = file_key
            result = await session.call_tool(tool.name, args)
            if result.isError:
                detail = " ".join(b.text for b in result.content if b.type == "text")
                raise ValueError(f"读取 Figma 节点 {node_id} 失败，请确认桌面端已打开对应文件。{detail[:400]}")
            return {"source": "figma", "file_key": file_key,
                    "document": metadata_tree(result.content, node_id)}
