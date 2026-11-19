"""Regression checks for MCP reply shapes, incomplete DSL and nested region ownership."""
import asyncio
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from mcp.types import CallToolResult, TextContent
from langgraph_py.pixso_component_match.pixso import complete_children, node_roots, tool_arguments, visible_nodes
from langgraph_py.pixso_component_match.regions import partition


class PixsoQueryTests(unittest.TestCase):
    def test_current_selection_or_explicit_layer(self):
        schema = {"properties": {"file_key": {}, "guid": {}}}
        self.assertEqual(tool_arguments(schema, None, {}), {})
        url = "https://pixso.cn/app/design/FILE?item-id=2%3A3"
        self.assertEqual(tool_arguments(schema, url, {}), {"file_key": "FILE", "guid": "2:3"})
        with self.assertRaises(ValueError):
            tool_arguments(schema, url.replace("item-id", "page-id"), {})

    def test_decode_and_expand_only_the_missing_layer(self):
        root = {"id": "1:1", "type": "FRAME", "hasChildren": True}
        body = "图层数据\n```json\n" + json.dumps({"document": root}) + "\n```"
        roots = node_roots({"content": [{"type": "text", "text": body}]})
        self.assertTrue(visible_nodes(roots)[0]["facts"]["incomplete_children"])
        called = []

        class Session:
            async def call_tool(self, name, args):
                called.append((name, args))
                full = dict(root, children=[{"id": "1:2", "type": "TEXT", "characters": "查询"}])
                return CallToolResult(content=[TextContent(type="text", text=json.dumps(full))])

        tool = SimpleNamespace(name="getNodeDSL", inputSchema={"properties": {"guid": {}}})
        reads = asyncio.run(complete_children(Session(), tool, {}, None, roots))
        self.assertEqual(called, [("getNodeDSL", {"guid": "1:1"})])
        self.assertIn("1:1", reads)
        nodes = visible_nodes(roots)
        self.assertNotIn("incomplete_children", nodes[0]["facts"])
        self.assertEqual(nodes[1]["text"], "查询")

    def test_nested_pagination_is_not_counted_in_the_table_twice(self):
        root = {"id": "a", "type": "FRAME", "name": "列表", "children": [
            {"id": "b", "type": "TEXT", "characters": "订单号"},
            {"id": "c", "type": "INSTANCE", "name": "页码", "children": [
                {"id": "d", "type": "TEXT", "characters": "下一页"}]},
            {"id": "e", "type": "TEXT", "visible": False, "characters": "隐藏文案"}]}
        nodes = visible_nodes([root])
        with patch("langgraph_py.pixso_component_match.regions.semantic_groups",
                   return_value=[("表格", [0]), ("分页", [2])]):
            regions, notes = partition(nodes)
        self.assertEqual([r["name"] for r in regions], ["表格", "分页"])
        self.assertNotIn("下一页", regions[0]["query"])
        self.assertIn("下一页", regions[1]["query"])
        self.assertNotIn("隐藏文案", str(regions))
        self.assertFalse(notes)

    def test_parent_and_nested_controls_are_matched_at_arbitrary_depth(self):
        root = {"type": "FRAME", "id": "1:1", "name": "10.底部模态面板/自定义", "children": [
            {"type": "GROUP", "name": "wrapper", "children": [
                {"type": "INSTANCE", "id": "1:2", "name": "FieldGroup", "children": [
                    {"type": "FRAME", "name": "layout", "children": [
                        {"type": "INSTANCE", "id": "1:3", "name": "01.按钮/强调", "children": [
                            {"type": "TEXT", "characters": "保存"}]},
                        {"type": "INSTANCE", "name": "Button", "visible": False}]}]}]}]}
        regions, _ = partition(visible_nodes([root]), True, ["FieldGroup"])
        self.assertEqual([r["component_role"] for r in regions], ["ActionSheet", "FieldGroup", "Button"])
        sheet, group, button = regions
        self.assertEqual(button["parent_region_id"], group["region_id"])
        self.assertEqual(group["parent_region_id"], sheet["region_id"])
        self.assertEqual(button["name"], "按钮 · 保存")
        self.assertNotIn("保存", sheet["query"])
