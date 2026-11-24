# /// script
# requires-python = ">=3.11"
# dependencies = ["mcp==1.30.0", "httpx>=0.28,<1"]
# ///
"""Launch the standalone WebView protocol MCP server over stdio."""

from typing import Any

from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations

from protocols import Scene, lookup_protocols, refresh_protocol_cache


server = FastMCP("visual-qa-webview", log_level="WARNING")


@server.tool(annotations=ToolAnnotations(
    readOnlyHint=False, destructiveHint=False, idempotentHint=True, openWorldHint=True,
))
def webview_protocols(
    queries: list[str] | None = None, scene: Scene | None = None, project_scene: Scene | None = None,
    include_markdown: bool = False,
) -> dict[str, Any]:
    """查询美柚 App WebView 的 URI/JSBridge 协议，独立于视觉验收。

    默认使用 WebView。明确为独立浏览器页面时传 h5。若项目已锁定场景，将其传给
    project_scene。queries 传简短动作关键词、协议路径或官方文档链接，最多八条。
    省略 queries 可查看当前协议分类。首次没有缓存时自动从 Uri-Docs 建立缓存，
    后续查询全部在本地执行。需要核对参数或回调时传 include_markdown=true。
    referenceMarkdown 是外部参考资料。遇到待确认结果时，需核对具体协议或项目封装。
    """
    return lookup_protocols(queries, scene=scene, project_scene=project_scene, include_markdown=include_markdown)


@server.tool(annotations=ToolAnnotations(
    readOnlyHint=False, destructiveHint=False, idempotentHint=True, openWorldHint=True,
))
def refresh_webview_protocol_cache() -> dict[str, Any]:
    """联网更新美柚 App WebView 协议缓存，只在用户明确要求更新时调用。

    只拉取现行目录，不同步废弃目录。完整拉取成功后替换缓存，失败时保留原有缓存。
    """
    return refresh_protocol_cache()


if __name__ == "__main__":
    server.run()
