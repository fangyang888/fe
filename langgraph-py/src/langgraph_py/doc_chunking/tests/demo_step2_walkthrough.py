"""Step 2 小白拆解演练脚本：一次只看 1 个知识点，彻底看懂 MarkdownParser！

为什么看 markdown_parser.py 觉得东西多？
因为解析器里同时处理了 5 类语法（标题、段落图片、代码、列表引用、表格）。
这个脚本帮你把它们拆成 5 个独立的迷你 .md 文件，每次只看一类：
  1 -> 01_headings.md            (只看：多级标题如何靠“栈”变成树)
  2 -> 02_paragraph_and_image.md (只看：图片怎么从段落里被摘出来)
  3 -> 03_code_and_list.md       (只看：代码块、列表、引用怎么处理)
  4 -> 04_table.md               (只看：表格怎么拆出 headers 和 rows)
  5 -> 05_full_demo.md           (完整综合文档)

运行方式（在项目根目录执行）：
  # 只看第 1 个样例（推荐从 1 开始一个个看！）
  uv run python src/langgraph_py/doc_chunking/tests/demo_step2_walkthrough.py 1

  # 看第 2 个样例
  uv run python src/langgraph_py/doc_chunking/tests/demo_step2_walkthrough.py 2

  # 不传参数：依次展示 1 ~ 4 四个教学样例
  uv run python src/langgraph_py/doc_chunking/tests/demo_step2_walkthrough.py
"""

from pathlib import Path
import sys

from markdown_it import MarkdownIt

from langgraph_py.doc_chunking.parsers import MarkdownParser, format_tree

SAMPLES_DIR = Path(__file__).parent / "samples"

SAMPLE_MAP = {
    "1": ("01_headings.md", "知识点 1：多级标题 & 标题栈 (heading_stack)"),
    "2": ("02_paragraph_and_image.md", "知识点 2：段落 & 图文混排抽离图片"),
    "3": ("03_code_and_list.md", "知识点 3：代码块、列表与引用块"),
    "4": ("04_table.md", "知识点 4：Markdown 表格提取 headers + rows"),
    "5": ("05_full_demo.md", "知识点 5：综合完整文档"),
}


def inspect_sample(key: str) -> None:
    """对比打印：原始 Markdown -> markdown-it-py 原始 Token 流 -> 最终 TreeNode 树。"""
    filename, desc = SAMPLE_MAP[key]
    file_path = SAMPLES_DIR / filename
    raw_md = file_path.read_text(encoding="utf-8")

    print("=" * 72)
    print(f"【样例 {key}】{desc}")
    print(f"文件位置: {file_path}")
    print("=" * 72)

    # 1) 打印原始 Markdown 文本
    print("\n--- ① 原始 Markdown 文本 ---")
    print(raw_md.strip())

    # 2) 打印 markdown-it-py 吐出来的原始 Token 流（就是 markdown_parser.py 里 while 循环遍历的对象）
    print("\n--- ② markdown-it-py 解析出的原始 Token 流（火车车厢） ---")
    md = MarkdownIt("commonmark").enable("table")
    tokens = md.parse(raw_md)
    for idx, tok in enumerate(tokens):
        extra = ""
        if tok.info:
            extra += f" info={tok.info!r}"
        if tok.content:
            preview = tok.content.replace("\n", "\\n")
            if len(preview) > 40:
                preview = preview[:40] + "..."
            extra += f" content={preview!r}"
        # 如果 inline 里有图片，额外标出来方便观察
        if tok.children:
            img_children = [c for c in tok.children if c.type == "image"]
            if img_children:
                extra += f" [内含 {len(img_children)} 张 image]"
        print(f"  [{idx:02d}] type={tok.type:<18} tag={tok.tag:<10}{extra}")

    # 3) 打印我们的 MarkdownParser 组装后的标准结构树 TreeNode
    print("\n--- ③ 我们的 MarkdownParser 生成的 TreeNode 标准结构树 ---")
    parser = MarkdownParser()
    tree = parser.parse_file(file_path)
    print(format_tree(tree))
    print()


if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else None
    if arg:
        if arg not in SAMPLE_MAP:
            print(f"请输入 1~5 之间的编号，收到的是: {arg!r}")
            sys.exit(1)
        inspect_sample(arg)
    else:
        for k in ("1", "2", "3", "4"):
            inspect_sample(k)
