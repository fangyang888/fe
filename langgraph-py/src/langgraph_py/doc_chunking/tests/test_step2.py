"""Step 2 验收测试脚本：验证 MarkdownParser 把真实 Markdown 解析为标准结构树 TreeNode。

运行方式（在项目根目录执行）：
    uv run python src/langgraph_py/doc_chunking/tests/test_step2.py
"""

from langgraph_py.doc_chunking.parsers import MarkdownParser, format_tree
from langgraph_py.doc_chunking.schemas import NodeType

SAMPLE_MARKDOWN = """\
本手册用于指导工程师完成设备安装、参数核对与 SDK 接入。

# 安装指南

安装前请先确认供电环境和防护等级要求：

| 型号 | 功率 | 防护 |
| --- | --- | --- |
| A100 | 10 W | IP54 |
| A200 | 20 W | IP65 |
| A300 | 30 W | IP67 |

> 注意：户外场景请至少选择 IP65 及以上型号。

![设备接线示意图](images/wiring.png "标准接线图")

## 快速启动代码

下面演示如何用 Python 调用初始化函数：

```python
def init_device(model: str) -> str:
    return f"Device {model} ready"

print(init_device("A200"))
```

### 常见检查项

- 确认电源线连接牢固
- 确认指示灯呈绿色常亮

# 故障排查

若设备无法上线，请先检查网络配置。
"""


def test_markdown_parser() -> None:
    """验证标题层级嵌套、表格行列提取、代码块语言识别、图片抽离、列表与引用保留。"""
    parser = MarkdownParser()
    tree = parser.parse(
        content=SAMPLE_MARKDOWN,
        source_id="产品手册.md",
        page_title="产品手册",
    )

    # 1) 验证根节点
    assert tree.node_type == NodeType.PAGE
    assert tree.title == "产品手册"

    # 根节点下应该有 3 个直属子节点：页面前言段落 + H1(安装指南) + H1(故障排查)
    assert len(tree.children) == 3, f"根节点子节点数异常: {len(tree.children)}"
    assert tree.children[0].node_type == NodeType.PARAGRAPH
    h1_install = tree.children[1]
    h1_trouble = tree.children[2]
    assert h1_install.node_type == NodeType.HEADING and h1_install.level == 1 and h1_install.title == "安装指南"
    assert h1_trouble.node_type == NodeType.HEADING and h1_trouble.level == 1 and h1_trouble.title == "故障排查"

    # 2) 验证 H1(安装指南) 下的多模态子节点：段落 + 表格 + 引用段落 + 图片 + H2(快速启动代码)
    install_types = [c.node_type for c in h1_install.children]
    assert install_types == [
        NodeType.PARAGRAPH,
        NodeType.TABLE,
        NodeType.PARAGRAPH,
        NodeType.IMAGE,
        NodeType.HEADING,
    ], f"安装指南子节点类型不符合预期: {install_types}"

    # 3) 验证表格结构化元数据
    table_node = h1_install.children[1]
    assert table_node.raw_meta["headers"] == ["型号", "功率", "防护"]
    assert table_node.raw_meta["num_rows"] == 3
    assert table_node.raw_meta["rows"][1] == ["A200", "20 W", "IP65"]

    # 4) 验证引用前缀保留
    quote_node = h1_install.children[2]
    assert quote_node.text.startswith("> ")

    # 5) 验证图片节点元数据
    image_node = h1_install.children[3]
    assert image_node.raw_meta["url"] == "images/wiring.png"
    assert image_node.raw_meta["alt"] == "设备接线示意图"
    assert image_node.raw_meta["title"] == "标准接线图"

    # 6) 验证 H2 -> 代码块 + H3 -> 列表段落 的深层嵌套
    h2_code = h1_install.children[4]
    assert h2_code.level == 2 and h2_code.title == "快速启动代码"
    code_node = h2_code.children[1]
    assert code_node.node_type == NodeType.CODE
    assert code_node.raw_meta["language"] == "python"
    assert "def init_device" in code_node.text

    h3_check = h2_code.children[2]
    assert h3_check.level == 3 and h3_check.title == "常见检查项"
    assert len(h3_check.children) == 2
    assert h3_check.children[0].text == "- 确认电源线连接牢固"

    print("[PASS] MarkdownParser 全部结构断言通过！\n")
    print("解析出的标准结构树可视化预览：\n")
    print(format_tree(tree))


if __name__ == "__main__":
    test_markdown_parser()
    print("\n🎉 Step 2 全部验证通过！")
