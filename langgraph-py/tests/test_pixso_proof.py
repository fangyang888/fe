import unittest
from pathlib import Path
from unittest.mock import patch

from langgraph_py.pixso_component_match.match import graph
from langgraph_py.pixso_component_match.pixso import visible_nodes
from langgraph_py.pixso_component_match.proof import confirmed_match, navigation_claim
from langgraph_py.pixso_component_match.regions import partition


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.source = dict(kind="api", title="属性", component_id="ui#Badge", text="数量\ncount 控制数量", start=55,
                           path="Badge.md", snapshot="snapshot.md")
        self.choice = dict(component_id="ui#Badge", name="Badge", build_id="abc",
                           library="ui", release="1", import_path="ui")
        self.region = dict(name="徽标", anchors=["0"], candidates=[self.choice], query="徽标", observations=[
            dict(path="0", type="TEXT", name="未读数量", text="8", facts={}, node_id="1:2", url="design")])
        self.model = dict(component="ui#Badge", paths=["0"], reason="显示未读数量",
                          checks={"main": [{"id": "0-e", "quote": "count 控制数量"}]})

    def decide(self, extra=()):
        with (patch("langgraph_py.pixso_component_match.proof.ask_json", return_value={"match": self.model}),
              patch("langgraph_py.pixso_component_match.proof.collect_sources",
                    return_value=({"e": self.source}, {}, {}))):
            return confirmed_match(self.region, extra, {"abc": {}}, Path("."))

    def test_grounded_match_has_source_line_and_layer(self):
        result = self.decide()
        self.assertEqual(result["sources"][0]["line"], 56)
        self.assertEqual(result["design_url"], "design")
        self.assertNotIn("candidates", result)

    def test_only_supported_claims_are_published(self):
        self.assertIsNone(self.decide(["自定义徽标色"]))
        for change in ({"component_id": "ui#Button"}, {"text": "其他文案"}, {"kind": "figure"}):
            with self.subTest(change=change), patch.dict(self.source, change):
                self.assertIsNone(self.decide())
        self.model["paths"] = ["不存在的图层"]
        self.assertIsNone(self.decide())

    def test_page_containing_controls_cannot_match_a_button_for_the_whole_page(self):
        self.region.update(component_role="账户页-概览", child_controls=["列表项", "按钮"])
        with patch.dict(self.choice, name="SubscriptionButton"):
            self.assertIsNone(self.decide())

    def test_graph_finishes_without_review_and_exports_only_report(self):
        self.assertNotIn("human_review", graph.nodes)
        self.assertEqual(set(graph.get_output_jsonschema()["properties"]), {"report"})


class NavigationTests(unittest.TestCase):
    def regions(self, title="不同的页面", icon="箭头/返回", name="横向排列"):
        root = {"id": "1", "type": "FRAME", "box": {"w": 375, "h": 812}, "children": [
            {"id": "2", "type": "FRAME", "name": name, "box": {"x": 0, "y": 44, "w": 375, "h": 44},
             "children": [{"type": "VECTOR", "name": icon},
                          {"type": "TEXT", "name": "标题", "text": title}]}]}
        return partition(visible_nodes([root]), structure_only=True)[0]

    def test_unnamed_navigation_owns_back_and_title(self):
        regions = self.regions()
        self.assertEqual(len(regions), 1)
        nav = regions[0]["navigation"]
        self.assertEqual(nav["node_id"], "2")
        self.assertEqual(nav["title"], "不同的页面")
        self.assertIn("NavBar", regions[0]["query"])

    def test_navigation_needs_both_title_api_and_back_documentation(self):
        nav = self.regions()[0]["navigation"]
        options = [{"component_id": "ui#Nav", "name": "Nav"}]
        sources = {
            "t": dict(component_id="ui#Nav", kind="api", path="types.ts", text="/** 页面标题 */\n title: string;"),
            "b": dict(component_id="ui#Nav", kind="example", path="README.md", text="默认显示单箭头返回"),
        }
        self.assertEqual(navigation_claim(nav, options, sources)["component"], "ui#Nav")
        with patch.dict(sources["b"], component_id="ui#Other"):
            self.assertIsNone(navigation_claim(nav, options, sources))
        with patch.dict(sources["b"], text="隐藏单箭头返回"):
            self.assertIsNone(navigation_claim(nav, options, sources))

    def test_background_is_not_a_back_arrow(self):
        self.assertFalse(any(r["navigation"] for r in self.regions(icon="background")))
