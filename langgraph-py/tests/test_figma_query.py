import unittest
from types import SimpleNamespace
from unittest.mock import patch

from langgraph_py.pixso_component_match.figma import figma_target, metadata_tree
from langgraph_py.pixso_component_match.match import build_graph, graph
from langgraph_py.pixso_component_match.pixso import visible_nodes, design_roots

URL = "https://www.figma.com/design/EeMX4Dd7H6pVo9hOKB2TMH/设计稿?node-id=23-2&m=dev"


class FigmaTests(unittest.TestCase):
    def test_dev_link_decodes_file_and_node(self):
        self.assertEqual(figma_target(URL), ("EeMX4Dd7H6pVo9hOKB2TMH", "23:2"))
        for url in [URL.replace("node-id", "page-id"), URL.replace("figma.com", "figma.com.example.org")]:
            with self.assertRaises(ValueError):
                figma_target(url)

    def test_metadata_preserves_nested_layers_bounds_and_real_text(self):
        blocks = [SimpleNamespace(type="text", text=t) for t in [
            "Currently selected nodes: 23:2", '<frame id="23:2" name="页面" width="390">'
            '<instance id="23:3" name="Button - 返回"><text id="23:4" name="文本层"/>'
            '<text id="23:5" name="label" characters="返回"/><text hidden="true"/></instance></frame>']]
        doc = {"source": "figma", "document": metadata_tree(blocks, "23:2")}
        nodes = visible_nodes(design_roots(doc, URL))
        self.assertEqual([n["node_id"] for n in nodes], ["23:2", "23:3", "23:4", "23:5"])
        self.assertEqual(nodes[0]["facts"]["bounds"]["width"], 390)
        self.assertEqual([n["text"] for n in nodes[-2:]], ["", "返回"])
        with self.assertRaisesRegex(ValueError, "目标图层"):
            metadata_tree(blocks, "99:9")

    def test_descriptive_button_layer_gets_its_own_region_in_structural_partition(self):
        from langgraph_py.pixso_component_match.regions import partition

        markup = """<frame id="23:2" name="Page">
          <frame id="2012:2" name="宝宝睡眠测评">
            <text id="2012:3" name="宝宝睡眠测评"/>
            <frame id="2012:9" name="开始测评按钮" width="90" height="44">
              <text id="2012:10" name="开始测评 ›"/>
            </frame>
          </frame>
        </frame>"""
        root = metadata_tree([SimpleNamespace(type="text", text=markup)], "23:2")
        regions, _ = partition(visible_nodes([root]), structure_only=True, source="figma")
        button = next(r for r in regions if r["component_role"] == "Button")
        self.assertEqual(button["name"], "开始测评按钮")
        self.assertEqual({n["node_id"] for n in button["observations"]}, {"2012:9", "2012:10"})

    def test_studio_accepts_explicit_source_and_url_only(self):
        schema = graph.get_input_jsonschema()
        self.assertEqual(schema["required"], ["design_url"])
        self.assertEqual(set(schema["properties"]["type"]["enum"]), {"figma", "pixso"})

    def test_type_routes_to_exactly_one_reader(self):
        module = "langgraph_py.pixso_component_match.match"
        pixso = "https://pixso.cn/app/design/example?item-id=23:2"
        with (patch(module + ".active_builds", return_value=[]),
              patch(module + ".fetch_metadata", return_value={}) as figma_read,
              patch(module + ".fetch_dsl", return_value={}) as pixso_read,
              patch(module + ".atomic_write")):
            for source, url in (("pixso", pixso), ("figma", URL)):
                for explicit in (False, True):
                    with self.subTest(source=source, explicit=explicit):
                        request = {"design_url": url}
                        if explicit:
                            request["type"] = source
                        updates = list(graph.stream(request, stream_mode="updates",
                            interrupt_before=["partition_regions · 拆分区域与嵌套控件"]))
                        nodes = [name.split(" · ")[0] for step in updates for name in step if name != "__interrupt__"]
                        self.assertEqual(nodes, ["route_design", "read_" + source])
                        self.assertEqual(figma_read.await_count, int(source == "figma"))
                        self.assertEqual(pixso_read.await_count, int(source == "pixso"))
                        figma_read.reset_mock()
                        pixso_read.reset_mock()
            with self.assertRaisesRegex(ValueError, "type"):
                graph.invoke({"design_url": URL, "type": "pixso"})
            cli = build_graph(studio=False)
            updates = list(cli.stream({"request": {"design_json": {}}}, stream_mode="updates",
                                      interrupt_before=["partition_regions"]))
            self.assertTrue(any("read_local" in step for step in updates))
            figma_read.assert_not_awaited()
            pixso_read.assert_not_awaited()

    def test_navigation_composes_heading_badge_and_back_but_keeps_separate_action(self):
        from langgraph_py.pixso_component_match.regions import partition

        markup = """<frame id="1" width="390" y="600">
          <frame name="body" y="44">
            <frame name="Header" id="2" width="390" height="52">
              <frame name="Button - Back" id="3"/>
              <frame name="Heading 1"><frame name="Button - Settings" id="4">
                <text name="另一个页面" id="5"/>
                <frame name="Image - 会员" id="6"><text name="VIP" id="7"/></frame>
              </frame></frame>
              <frame name="Button - Help" id="8"/>
            </frame>
          </frame>
        </frame>"""

        def regions(xml):
            root = metadata_tree([SimpleNamespace(type="text", text=xml)], "1")
            return partition(visible_nodes([root]), True, source="figma")[0]

        for name in ("Header", "Frame"):
            result = regions(markup.replace('name="Header"', f'name="{name}"'))
            nav = next(r for r in result if r["navigation"])
            self.assertEqual((nav["navigation"]["node_id"], nav["navigation"]["title"], nav["navigation"]["badge"]),
                             ("2", "另一个页面", "VIP"))
            self.assertEqual([r["name"] for r in result if r["parent_region_id"] == nav["region_id"]],
                             ["Button - Help"])
        self.assertFalse(any(r["navigation"] for r in regions(markup.replace('y="44"', 'y="420"'))))
        self.assertFalse(any(r["navigation"] for r in regions(markup.replace("Button - Back", "Button - Help"))))
