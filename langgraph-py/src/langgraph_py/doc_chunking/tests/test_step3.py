"""Step 3 验收测试脚本：验证 DocumentStructurer 把结构树拆解成带父子关系的 StructuredDocument。

测试覆盖 5 大核心机制：
1. 独立成卡：页面、章节、表格、图片、代码各自分配唯一 doc_id；
2. 父引用正确：子节点的 parent_id 准确指向直属父节点；
3. 子结构占位：父节点正文中按原顺序插入带摘要的 {{REF:doc_id|类型=...|摘要=...}}；
4. 全模态面包屑 & 紧邻前文：表格/图片/代码都继承了完整面包屑，并自动抓到紧邻的前一句说明；
5. 空壳标题过滤：没有实质正文的“目录型空标题”标记为 indexable=False，但仍保留在列表中维护树关系。

运行方式（在项目根目录执行）：
    uv run python src/langgraph_py/doc_chunking/tests/test_step3.py
"""

import json
from pathlib import Path

from langgraph_py.doc_chunking import DocumentStructurer, NodeType, format_documents_summary
from langgraph_py.doc_chunking.parsers import MarkdownParser

SAMPLES_DIR = Path(__file__).parent / "samples"
OUTPUT_DIR = Path(__file__).parent / "output"


def test_full_demo_structuring() -> None:
    """1. 用综合样例 05_full_demo.md 跑通“Markdown -> TreeNode -> StructuredDocument”。"""
    parser = MarkdownParser()
    structurer = DocumentStructurer()

    tree = parser.parse_file(SAMPLES_DIR / "05_full_demo.md", page_title="产品手册")
    docs = structurer.structure(tree, source_id="05_full_demo.md")

    # 建一个 doc_id -> StructuredDocument 的字典，方便按 ID 校验父子关系
    doc_map = {d.doc_id: d for d in docs}

    # 1) 验证根节点
    root_doc = docs[0]
    assert root_doc.node_type == NodeType.PAGE
    assert root_doc.parent_id is None
    assert root_doc.breadcrumbs == ["产品手册"]
    assert root_doc.indexable is True
    assert len(root_doc.child_refs) == 2  # 安装指南、故障排查

    # 2) 验证表格 Document（属于“安装指南”）
    table_docs = [d for d in docs if d.node_type == NodeType.TABLE]
    assert len(table_docs) == 1
    table_doc = table_docs[0]
    assert table_doc.breadcrumbs == ["产品手册", "安装指南"]
    assert table_doc.parent_id is not None
    assert doc_map[table_doc.parent_id].breadcrumbs == ["产品手册", "安装指南"]
    # 验证自动抓取了紧邻前文说明
    assert "供电环境" in table_doc.surrounding_context
    # 验证父章节正文里包含了指向这张表的 {{REF:...}} 占位符
    parent_doc = doc_map[table_doc.parent_id]
    assert f"{{{{REF:{table_doc.doc_id}|" in parent_doc.content

    # 3) 验证图片 Document（紧邻前文是 "> 注意：户外场景..."）
    image_docs = [d for d in docs if d.node_type == NodeType.IMAGE]
    assert len(image_docs) == 1
    image_doc = image_docs[0]
    assert image_doc.breadcrumbs == ["产品手册", "安装指南"]
    assert "IP65" in image_doc.surrounding_context

    # 4) 验证代码 Document（属于“产品手册 / 安装指南 / 快速启动代码”）
    code_docs = [d for d in docs if d.node_type == NodeType.CODE]
    assert len(code_docs) == 1
    code_doc = code_docs[0]
    assert code_doc.breadcrumbs == ["产品手册", "安装指南", "快速启动代码"]
    assert "Python" in code_doc.surrounding_context
    assert code_doc.meta.get("language") == "python"

    # 5) 导出成真实 JSON 文件，方便你在编辑器里直接打开看全貌
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_file = OUTPUT_DIR / "step3_documents.json"
    out_file.write_text(
        json.dumps([d.model_dump(mode="json") for d in docs], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"[PASS] 05_full_demo.md 结构化拆解通过！共生成 {len(docs)} 个 StructuredDocument。")
    print(f"       完整 JSON 已导出到: {out_file}\n")
    print(format_documents_summary(docs))


def test_empty_heading_filtering() -> None:
    """2. 专门验证“空壳标题过滤”：一级标题下没有正文、直接接二级标题时，标记 indexable=False。"""
    md_with_empty_shell = """\
# 第一部分 总览

## 1.1 具体说明

这里是真正有价值的正文内容。
"""
    parser = MarkdownParser()
    structurer = DocumentStructurer()

    tree = parser.parse(md_with_empty_shell, source_id="empty_shell.md", page_title="测试文档")
    docs = structurer.structure(tree)

    # 0: PAGE(空壳，无正文)  1: H1(空壳，无正文)  2: H2(有正文)
    assert docs[0].node_type == NodeType.PAGE and docs[0].indexable is False
    assert docs[1].node_type == NodeType.HEADING and docs[1].indexable is False
    assert docs[2].node_type == NodeType.HEADING and docs[2].indexable is True
    # 虽然 H1 是空壳不入向量库，但 H2 依然完整保留了包含 H1 的面包屑路径和 parent_id！
    assert docs[2].parent_id == docs[1].doc_id
    assert docs[2].breadcrumbs == ["测试文档", "第一部分 总览", "1.1 具体说明"]

    print("[PASS] 空壳标题过滤通过：空壳标记为 indexable=False，子章节面包屑与父引用完整保留！")


if __name__ == "__main__":
    test_full_demo_structuring()
    print("-" * 72)
    test_empty_heading_filtering()
    print("\n🎉 Step 3 全部验证通过！")
