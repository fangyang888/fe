"""Read a Pixso node tree through MCP or decode an exported JSON snapshot."""
import asyncio
import json
import re
from copy import deepcopy
from datetime import timedelta
from urllib.parse import parse_qs, unquote, urlencode, urlsplit, urlunsplit

from mcp import ClientSession
from mcp.client.sse import sse_client
from mcp.client.streamable_http import streamable_http_client


def tool_arguments(schema, design_url, extra):
    props = schema.get("properties", {})
    values = {}
    if design_url:
        url = urlsplit(design_url)
        if url.scheme not in {"http", "https"} or not url.netloc:
            raise ValueError("设计稿地址需要是完整的 Pixso 图层链接")
        query = parse_qs(url.query)
        node = (query.get("item-id") or query.get("node-id") or [None])[0]
        file = re.search(r"/(?:design|file)/([^/]+)", url.path)
        targeted = False
        for field in props:
            normalized = field.replace("_", "").lower()
            if normalized in {"url", "link", "pixsourl", "designurl", "nodeurl", "fileurl", "layerurl"}:
                values[field] = design_url
                targeted = True
            elif normalized in {"filekey", "fileid"} and file:
                values[field] = unquote(file[1])
            elif normalized in {"guid", "id", "nodeid", "layerid", "itemid"} and node:
                values[field] = node
                targeted = True
        if not targeted and not extra:
            raise ValueError(f"无法从链接定位图层。请使用带 item-id 的链接，或按工具字段 {list(props)} 提供 --tool-args")
    values.update(extra)
    missing = set(schema.get("required", [])) - values.keys()
    if missing:
        raise ValueError("Pixso 工具还需要参数：" + ", ".join(sorted(missing)) + "。请提供图层链接或 --tool-args")
    return values


async def resolve_button_labels(session, roots, query_tool):
    """Read missing instance text from the current file, keeping instance-local paths intact."""
    from .regions import layer_role

    pending = {}
    stack = list(roots)
    while stack:
        node = stack.pop()
        override = node.get("override")
        effective = node | override if isinstance(override, dict) else node
        if effective.get("visible") is False or effective.get("isVisible") is False:
            continue
        children, _ = children_of(effective)
        stack.extend(children)
        guid = node_id(node)
        if guid and node.get("type", "").upper() == "INSTANCE" and layer_role(node.get("name", "")).casefold() == "button":
            visible = visible_nodes([node])
            if any(n["type"].upper() == "TEXT" and not n["text"] for n in visible):
                pending[guid] = node
    if not pending:
        return {}

    def copy_labels(target, resolved):
        if target.get("type", "").casefold() != resolved.get("type", "").casefold() or target.get("name") != resolved.get("name"):
            return
        if resolved.get("nodeText") and target.get("type", "").upper() == "TEXT":
            target["characters"] = resolved["nodeText"]
        children, _ = children_of(target)
        resolved_children = resolved.get("childNode", [])
        if len(children) == len(resolved_children):
            for child, resolved_child in zip(children, resolved_children):
                if isinstance(resolved_child, dict):
                    copy_labels(child, resolved_child)

    reads = {}
    ids = list(pending)
    for start in range(0, len(ids), 20):
        result = await session.call_tool(query_tool, {
            "nodeIds": ids[start:start+20], "fields": ["nodeText"], "resolveInstances": True,
            "searchDepth": 1, "readDepth": 3})
        if result.isError:
            continue
        for block in result.content:
            if block.type != "text":
                continue
            for resolved in node_roots(json_text(block.text)):
                guid = node_id(resolved)
                if guid in pending:
                    copy_labels(pending[guid], resolved)
                    reads[guid] = resolved
    return reads


async def fetch_dsl(endpoint, design_url, extra, transport):
    connect = sse_client if transport == "sse" else streamable_http_client
    async with asyncio.timeout(90), connect(endpoint) as streams:
        async with ClientSession(*streams[:2], read_timeout_seconds=timedelta(seconds=60)) as session:
            await session.initialize()
            cursor = None
            tools = {}
            while True:
                page = await session.list_tools(cursor=cursor)
                tools.update({t.name.replace("_", "").lower(): t for t in page.tools})
                cursor = page.nextCursor
                if not cursor:
                    break
            tool = tools.get("getnodedsl")
            if not tool:
                raise ValueError(f"MCP 服务没有提供 get_node_dsl。已发现工具：{', '.join(tools)}")
            args = tool_arguments(tool.inputSchema, design_url, extra)
            result = await session.call_tool(tool.name, args)
            if result.isError:
                detail = " ".join(b.text for b in result.content if b.type == "text")
                raise ValueError(f"{tool.name} 读取失败：{detail[:600]}")
            raw = result.model_dump(mode="json", exclude_none=True)
            roots = deepcopy(design_roots(raw, design_url))
            reads = await complete_children(session, tool, args, design_url, roots)
            labels = {}
            if "querynodes" in tools:
                labels = await resolve_button_labels(session, roots, tools["querynodes"].name)
            if reads or labels:
                return dict(document=roots, mcp_response=raw, child_responses=reads, instance_labels=labels)
            return raw


def json_text(value):
    value = value.strip()
    try:
        return json.loads(value)
    except ValueError:
        blocks = re.findall(r"```(?:json)?\s*\n(.*?)```", value, re.I | re.S)
        if blocks:
            return [json.loads(block) for block in blocks]
        # Some tool versions prefix the JSON with a line of explanatory text.
        for start in re.finditer(r"(?m)^\s*(?=[\[{])", value):
            try:
                return json.JSONDecoder().raw_decode(value[start.end():])[0]
            except ValueError:
                continue
        return None


def node_roots(data):
    """Unwrap MCP structuredContent, text blocks, and common DSL/document envelopes."""
    if isinstance(data, str):
        return node_roots(json_text(data))
    if isinstance(data, list):
        return [node for item in data for node in node_roots(item)]
    if not isinstance(data, dict):
        return []
    if data.get("isError"):
        raise ValueError("快照记录的是失败的 MCP 调用")
    # Pixso's compact and full envelopes also contain component definitions and
    # asset indexes. Only these arrays represent the selected design.
    for field in ("roots", "pixTreeNodes"):
        if isinstance(data.get(field), list):
            return node_roots(data[field])
    if "structuredContent" in data or isinstance(data.get("content"), list) and all(
        isinstance(v, dict) and v.get("type") in {"text", "resource", "image"} for v in data["content"]
    ) and "type" not in data:
        nodes = node_roots(data.get("structuredContent"))
        if nodes:
            return nodes
        nodes = []
        for block in data.get("content", []):
            value = block.get("text") or block.get("resource", {}).get("text")
            nodes.extend(node_roots(value))
        return nodes
    if any(k in data for k in ("children", "layerType", "nodeType")) or (
        any(k in data for k in ("type", "name", "layerName")) and
        any(k in data for k in ("id", "guid", "nodeId", "name", "characters", "layers")) and
        not any(k in data for k in ("document", "nodes", "dsl", "data", "result"))
    ):
        return [data]
    for field in ("document", "dsl", "node", "root", "layers", "nodes", "data", "result"):
        value = data.get(field)
        if field == "nodes" and isinstance(value, dict):
            value = list(value.values())
        nodes = node_roots(value) if value is not None else []
        if nodes:
            return nodes
    return []


def node_id(node):
    ref = node.get("id", node.get("nodeId", node.get("guid")))
    if isinstance(ref, dict) and {"sessionID", "localID"} <= ref.keys():
        return f"{ref['sessionID']}:{ref['localID']}"
    return str(ref) if isinstance(ref, (str, int)) else None


def children_of(node):
    raw = node.get("children", node.get("childNode", node.get("layers", [])))
    children = [item for item in raw if isinstance(item, dict)] if isinstance(raw, list) else []
    partial = (not isinstance(raw, list) or len(raw) != len(children)
               or node.get("hasChildren") is True and not children
               or isinstance(node.get("childCount"), int) and node["childCount"] > len(children)
               or node.get("truncated") is True)
    return children, partial


def design_roots(data, design_url):
    roots = node_roots(data)
    if not design_url or not roots:
        return roots
    query = parse_qs(urlsplit(design_url).query)
    target = (query.get("item-id") or query.get("node-id") or [None])[0]
    if not target:
        return roots
    if isinstance(data, dict) and data.get("source") == "figma":
        target = target.replace("-", ":")
    pending = list(roots)
    while pending:
        node = pending.pop()
        if node_id(node) == target:
            return [node]
        pending.extend(children_of(node)[0])
    received = ", ".join(node_id(r) or "无 ID" for r in roots[:4])
    raise ValueError(f"链接指定图层 {target}，返回的树中未找到该图层（根节点 {received}）。"
                     "请在设计工具中激活对应文件，再从相应的读取节点重新运行")


async def complete_children(session, tool, args, link, roots):
    """Try one targeted read per explicitly incomplete layer, up to 12 per request."""
    props = tool.inputSchema.get("properties", {})
    identifiers = [k for k in props if k.replace("_", "").lower() in {"guid", "id", "nodeid", "layerid", "itemid"}]
    links = [k for k in props if k.replace("_", "").lower() in {"url", "link", "pixsourl", "designurl", "nodeurl", "fileurl", "layerurl"}]
    if not identifiers and not (links and link):
        return {}
    pending, reads = list(roots), {}
    while pending and len(reads) < 12:
        node = pending.pop()
        children, partial = children_of(node)
        ref = node_id(node)
        if partial and ref and ref not in reads:
            target = dict(args)
            target.update({k: ref for k in identifiers})
            if link and links:
                parsed = urlsplit(link)
                query = parse_qs(parsed.query)
                query["item-id"] = [ref]
                if "node-id" in query:
                    query["node-id"] = [ref]
                updated = urlunsplit(parsed._replace(query=urlencode(query, doseq=True)))
                target.update({k: updated for k in links})
            response = await session.call_tool(tool.name, target)
            reads[ref] = response.model_dump(mode="json", exclude_none=True)
            if not response.isError:
                for found in node_roots(reads[ref]):
                    if node_id(found) == ref and len(children_of(found)[0]) > len(children):
                        node.clear()
                        node.update(found)
                        children, _ = children_of(node)
                        break
        pending.extend(children)
    return reads


def visible_nodes(roots):
    nodes = []

    def visit(node, parent, path):
        if not isinstance(node, dict):
            return
        if isinstance(node.get("override"), dict):
            overrides = dict(node["override"])
            for field in ("box", "text", "autoLayout"):
                if isinstance(node.get(field), dict) and isinstance(overrides.get(field), dict):
                    overrides[field] = {**node[field], **overrides[field]}
            node = {**node, **overrides}
        if node.get("visible") is False or node.get("isVisible") is False:
            return
        ref = node_id(node)
        label = node.get("name") or node.get("layerName") or ""
        kind = str(node.get("type") or node.get("nodeType") or node.get("layerType") or "")
        content = node.get("characters") or node.get("text") or node.get("nodeText") or node.get("content")
        if isinstance(content, dict):
            content = content.get("characters") or content.get("content") or content.get("text")
        style = node.get("style") if isinstance(node.get("style"), dict) else {}
        facts = {}
        layout = node.get("autoLayout")
        if isinstance(layout, dict) and isinstance(layout.get("direction"), str):
            facts["layoutMode"] = layout["direction"]
        if isinstance(node.get("radius"), (int, float)):
            facts["cornerRadius"] = node["radius"]
        if isinstance(node.get("text"), dict) and isinstance(node["text"].get("fontSize"), (int, float)):
            facts["fontSize"] = node["text"]["fontSize"]
        for field in ("layoutMode", "flexDirection", "cornerRadius", "fontSize", "componentName"):
            value = node.get(field, style.get(field))
            if isinstance(value, (int, float, str)):
                facts[field] = value
        box = node.get("absoluteBoundingBox") or node.get("bounds") or node.get("box") or node
        if isinstance(box, dict):
            bounds = {}
            for field, alias in (("x", "left"), ("y", "top"), ("width", "w"), ("height", "h")):
                value = box.get(field, box.get(alias))
                if isinstance(value, (int, float)):
                    bounds[field] = value
            if bounds:
                facts["bounds"] = bounds
        idx = len(nodes)
        nodes.append(dict(index=idx, parent=parent, path=path, node_id=ref, name=str(label), type=kind,
                          text=content if isinstance(content, str) else "", facts=facts, children=[]))
        if parent is not None:
            nodes[parent]["children"].append(idx)
        children, partial = children_of(node)
        if partial:
            facts["incomplete_children"] = True
        for i, child in enumerate(children):
            visit(child, idx, f"{path}/{i}")

    for i, root in enumerate(roots):
        visit(root, None, str(i))
    if not nodes:
        raise ValueError("未发现可见的 Pixso 图层树，请检查选区和 DSL JSON")
    return nodes


async def capture_regions(endpoint, transport, matches, directory):
    """Attach the original PNG/JPEG for each matched layer when this Pixso client supports it."""
    import base64
    from .ingest import atomic_write

    notes = []
    connect = sse_client if transport == "sse" else streamable_http_client
    async with asyncio.timeout(60), connect(endpoint) as streams:
        async with ClientSession(*streams[:2], read_timeout_seconds=timedelta(seconds=15)) as session:
            await session.initialize()
            cursor = None
            while True:
                page = await session.list_tools(cursor=cursor)
                tool = next((t for t in page.tools if t.name.replace("_", "").lower() == "getscreenshot"), None)
                if tool or not page.nextCursor:
                    break
                cursor = page.nextCursor
            if not tool:
                return ["当前设计 MCP 未提供 get_screenshot"]
            for i, match in enumerate(matches, 1):
                node_id = match["node_id"]
                if not node_id:
                    continue
                schema = tool.inputSchema
                key = next((k for k in schema.get("properties", {}) if k in {"guid", "nodeId", "node_id"}), None)
                if not key and not match.get("design_url"):
                    continue
                args = tool_arguments(schema, match.get("design_url"), {key: node_id} if key else {})
                pattern = schema.get("properties", {}).get(key, {}).get("pattern") if key else None
                if pattern and not re.fullmatch(pattern, node_id):
                    notes.append(f"截图工具不支持该图层 ID：{node_id}")
                    continue
                res = await session.call_tool(tool.name, args)
                image = next((b for b in res.content if b.type == "image" and
                              b.mimeType in {"image/png", "image/jpeg"}), None)
                if res.isError or not image:
                    notes.append(f"{node_id} 的截图工具未返回图片")
                    continue
                suffix = "png" if image.mimeType == "image/png" else "jpg"
                path = directory / f"region-{i}.{suffix}"
                await asyncio.to_thread(atomic_write, path, base64.b64decode(image.data, validate=True))
                match["screenshot"] = str(path)
    return notes
