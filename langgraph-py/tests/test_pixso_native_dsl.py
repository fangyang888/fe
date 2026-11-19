import json
import unittest

from langgraph_py.pixso_component_match.pixso import design_roots, node_roots, visible_nodes
from langgraph_py.pixso_component_match.regions import partition


class PixsoNativeDslTests(unittest.TestCase):
    def test_compact_mcp_response_partition_and_instance_visibility(self):
        child = {"type": "TEXT", "componentNodeRef": "6:2", "text": {"content": "旧标题"},
                 "override": {"text": {"content": "家庭会员", "fontSize": 18}}}
        frame = {"id": "88:1", "type": "FRAME", "name": "支付页", "box": {"w": 375, "h": 812},
                 "autoLayout": {"direction": "VERTICAL"}, "children": [
                     child, {"type": "TEXT", "text": "隐藏", "override": {"visible": False}}]}
        compact = {"stats": {}, "roots": [frame], "refsIndex": {"components": {"unused": {"name": "无关组件"}}}}
        mcp = {"content": [{"type": "text", "text": json.dumps(compact)}], "isError": False}
        nodes = visible_nodes(design_roots(mcp, "https://pixso.cn/app/design/test?item-id=88%3A1"))
        self.assertEqual(len(nodes), 2)
        self.assertEqual(nodes[0]["facts"]["bounds"], {"width": 375, "height": 812})
        self.assertEqual(nodes[0]["facts"]["layoutMode"], "VERTICAL")
        self.assertEqual(nodes[1]["facts"]["fontSize"],18)
        self.assertIsNone(nodes[1]["node_id"])
        regions, _ = partition(nodes, structure_only=True)
        self.assertIn("家庭会员", regions[0]["query"])
        self.assertNotIn("隐藏", regions[0]["query"])

    def test_full_dsl_only_walks_selected_frame(self):
        full = {"pixTreeNodes": [{"guid": "1:1", "type": "FRAME", "childNode": [
            {"guid": "1:2", "type": "TEXT", "nodeText": "支付", "left": 8, "top": 16}]}],
                "pixComponentTreeDslNodes": [{"guid": "4:1", "name": "组件定义"}]}
        nodes = visible_nodes(node_roots(full))
        self.assertEqual([n["node_id"] for n in nodes], ["1:1", "1:2"])
        self.assertEqual(nodes[1]["text"], "支付")
        self.assertEqual(nodes[1]["facts"]["bounds"], {"x": 8, "y": 16})

    def test_explicit_target_can_be_nested_and_cannot_be_substituted(self):
        data={"roots": [{"type": "FRAME", "id": "1:1", "children": [{"type":"INSTANCE","id":"2:2"}]}]}
        base="https://pixso.cn/app/design/test?item-id="
        self.assertEqual(design_roots(data, base+"2:2")[0]["id"],"2:2")
        with self.assertRaisesRegex(ValueError, "未找到该图层"):
            design_roots(data,base+"9:9")


if __name__ == "__main__":
    unittest.main()
