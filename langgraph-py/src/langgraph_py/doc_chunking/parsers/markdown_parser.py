"""Markdown 文档解析器（Step 2）。

核心职责：
利用工业级解析库 `markdown-it-py`，把一段 Markdown 文本转换成
一棵层级清晰的 `TreeNode` 标准结构树。

小白重点看懂 2 个核心思想：
1. 【markdown-it-py 的 Token 流】：
   调用 `md.parse(text)` 后，Markdown 会变成一维列表（像火车车厢一样依次排列）：
   [heading_open(h1), inline("标题1"), heading_close, paragraph_open, inline("正文"), paragraph_close, ...]
   我们只需要从头到尾遍历一遍这些“车厢”，按类型组装成节点即可。

2. 【标题栈（Stack）构建树形层级】：
   怎么知道 H3 应该挂在 H2 下面，而下一个 H2 又要回到 H1 下面？
   用一个列表 `heading_stack` 模拟“当前所在目录路径”：
   - 初始栈里只有根节点：[PAGE(level=0)]
   - 遇到 H1(level=1)：栈顶 0 < 1，挂在 PAGE 下，入栈 -> [PAGE, H1]
   - 遇到 H2(level=2)：栈顶 1 < 2，挂在 H1 下，入栈 -> [PAGE, H1, H2]
   - 遇到 H3(level=3)：栈顶 2 < 3，挂在 H2 下，入栈 -> [PAGE, H1, H2, H3]
   - 又遇到新 H2(level=2)：栈顶 H3(3>=2) 弹出，旧 H2(2>=2) 弹出！
     现在栈顶是 H1(1<2)，把新 H2 挂在 H1 下，入栈 -> [PAGE, H1, 新H2]
   - 遇到段落/代码/表格/图片：直接挂在“当前栈顶”节点下面即可！
"""

from pathlib import Path
from typing import Any

from markdown_it import MarkdownIt
from markdown_it.token import Token

from ..schemas import NodeType, TreeNode
from .base import BaseDocumentParser


class MarkdownParser(BaseDocumentParser):
    """基于 markdown-it-py 的 Markdown 结构树解析器。"""

    def __init__(self) -> None:
        # 【markdown-it-py 核心 API ①】：
        # 使用 "commonmark" 标准语法，并显式 .enable("table") 开启 GFM 表格解析支持
        self._md = MarkdownIt("commonmark").enable("table")

    def parse(
        self,
        content: str,
        source_id: str,
        page_title: str | None = None,
    ) -> TreeNode:
        """将 Markdown 字符串解析为 TreeNode 树。"""
        # 节点自增计数器，用来生成清晰的 node_001, node_002...
        node_seq = 0

        def next_id() -> str:
            nonlocal node_seq
            node_seq += 1
            return f"node_{node_seq:03d}"

        # 1) 创建根节点 PAGE（level=0）
        resolved_title = page_title or Path(source_id).stem or source_id
        page_node = TreeNode(
            node_id=next_id(),
            node_type=NodeType.PAGE,
            title=resolved_title,
            level=0,
            raw_meta={"source_id": source_id},
        )

        # 2) 【标题栈】：栈顶永远指向“当前正文/代码/表格/图片应该挂在谁下面”
        heading_stack: list[TreeNode] = [page_node]

        # 3) 【markdown-it-py 核心 API ②】：把 Markdown 文本解析成扁平的 Token 列表
        tokens: list[Token] = self._md.parse(content)

        # 用来跟踪当前是不是在引用块（>）或列表（- / 1.）内部，保留语义前缀
        blockquote_depth = 0
        # 列表栈每项形如 {"kind": "bullet" | "ordered", "index": int}
        list_stack: list[dict[str, Any]] = []
        # 标记当前列表项是否刚进入（只给列表项的第一段加 "- " 或 "1. " 前缀）
        pending_list_prefix: str | None = None

        i = 0
        n = len(tokens)
        while i < n:
            tok = tokens[i]

            # -------------------------------------------------
            # 情况 A：标题（heading_open -> inline -> heading_close）
            # -------------------------------------------------
            if tok.type == "heading_open":
                # tok.tag 形如 "h1", "h2", ..., "h6"，取后面的数字作为层级
                level = int(tok.tag[1:]) if len(tok.tag) > 1 and tok.tag[1:].isdigit() else 1
                title_text = ""
                if i + 1 < n and tokens[i + 1].type == "inline":
                    title_text = self._extract_plain_text(tokens[i + 1]).strip()

                heading_node = TreeNode(
                    node_id=next_id(),
                    node_type=NodeType.HEADING,
                    title=title_text,
                    level=level,
                )

                # 核心“标题栈”回退逻辑：把所有层级 >= 当前标题的栈顶全部弹出
                while len(heading_stack) > 1 and heading_stack[-1].level >= level:
                    heading_stack.pop()

                # 把新标题挂到当前栈顶（它的父级标题或页面）下面，再把新标题压入栈顶
                heading_stack[-1].children.append(heading_node)
                heading_stack.append(heading_node)

                # 跳过 inline 和 heading_close
                i += 3
                continue

            # -------------------------------------------------
            # 情况 B：代码块（围栏代码块 ```python ... ``` 或缩进代码块）
            # -------------------------------------------------
            if tok.type in ("fence", "code_block"):
                # tok.info 在 ```python 这种围栏块里是 "python"（可能带多余空格或参数）
                lang = tok.info.strip().split()[0] if tok.info.strip() else ""
                code_text = tok.content.rstrip("\n")

                code_node = TreeNode(
                    node_id=next_id(),
                    node_type=NodeType.CODE,
                    text=code_text,
                    raw_meta={"language": lang},
                )
                heading_stack[-1].children.append(code_node)
                i += 1
                continue

            # -------------------------------------------------
            # 情况 C：表格（table_open ... table_close）
            # -------------------------------------------------
            if tok.type == "table_open":
                table_node, next_index = self._parse_table(tokens, i, next_id)
                heading_stack[-1].children.append(table_node)
                i = next_index
                continue

            # -------------------------------------------------
            # 情况 D：引用块与列表的进出状态维护
            # -------------------------------------------------
            if tok.type == "blockquote_open":
                blockquote_depth += 1
                i += 1
                continue
            if tok.type == "blockquote_close":
                blockquote_depth = max(0, blockquote_depth - 1)
                i += 1
                continue

            if tok.type == "bullet_list_open":
                list_stack.append({"kind": "bullet", "index": 0})
                i += 1
                continue
            if tok.type == "bullet_list_close":
                if list_stack:
                    list_stack.pop()
                i += 1
                continue

            if tok.type == "ordered_list_open":
                start_num = int(tok.attrs.get("start", 1)) if tok.attrs else 1
                list_stack.append({"kind": "ordered", "index": start_num - 1})
                i += 1
                continue
            if tok.type == "ordered_list_close":
                if list_stack:
                    list_stack.pop()
                i += 1
                continue

            if tok.type == "list_item_open":
                if list_stack:
                    top = list_stack[-1]
                    indent = "  " * (len(list_stack) - 1)
                    if top["kind"] == "ordered":
                        top["index"] += 1
                        pending_list_prefix = f"{indent}{top['index']}. "
                    else:
                        pending_list_prefix = f"{indent}- "
                i += 1
                continue

            if tok.type == "list_item_close":
                pending_list_prefix = None
                i += 1
                continue

            # -------------------------------------------------
            # 情况 E：段落（可能包含纯文本、图片、或图文混排）
            # -------------------------------------------------
            if tok.type == "paragraph_open":
                if i + 1 < n and tokens[i + 1].type == "inline":
                    inline_tok = tokens[i + 1]
                    # 构造段落前缀（例如引用块 "> " 或列表项 "- " / "1. "）
                    prefix = ""
                    if blockquote_depth > 0:
                        prefix += "> " * blockquote_depth
                    if pending_list_prefix:
                        prefix += pending_list_prefix
                        pending_list_prefix = None  # 只给列表项首段加一次前缀

                    extracted_nodes = self._parse_inline_to_nodes(
                        inline_tok=inline_tok,
                        prefix=prefix,
                        next_id=next_id,
                    )
                    heading_stack[-1].children.extend(extracted_nodes)

                # 跳过 inline 和 paragraph_close
                i += 3
                continue

            # 其他无需单独成节点的 token（如 hr 分割线、html_block 等），可按需扩展，这里直接跳过
            i += 1

        return page_node

    def _parse_inline_to_nodes(
        self,
        inline_tok: Token,
        prefix: str,
        next_id: Any,
    ) -> list[TreeNode]:
        """解析段落内部的 inline token：把文字组装成 PARAGRAPH，把图片独立抽成 IMAGE。

        为什么要专门处理 inline？
        因为在 Markdown 中，`![架构图](arch.png)` 外面包了一层 paragraph_open/close。
        如果不拆出来，图片就会被当成普通段落文字，无法走“图片独立 Document”的流程。
        """
        children = inline_tok.children or []
        nodes: list[TreeNode] = []
        text_buffer: list[str] = []
        used_prefix = False

        def flush_text() -> None:
            nonlocal used_prefix
            raw = "".join(text_buffer).strip()
            text_buffer.clear()
            if not raw:
                return
            if prefix and not used_prefix:
                raw = f"{prefix}{raw}"
                used_prefix = True
            nodes.append(
                TreeNode(
                    node_id=next_id(),
                    node_type=NodeType.PARAGRAPH,
                    text=raw,
                )
            )

        for child in children:
            if child.type == "image":
                # 遇到图片前，先把前面攒下来的文字落盘为一个 PARAGRAPH
                flush_text()

                # markdown-it-py 中：alt 描述在 child.content，图片地址在 child.attrs["src"]
                src = str(child.attrs.get("src", "")) if child.attrs else ""
                title = str(child.attrs.get("title", "")) if child.attrs else ""
                alt = child.content.strip()
                desc_parts = [p for p in [alt, title] if p]
                desc_text = " - ".join(desc_parts) if desc_parts else f"图片({src})"

                nodes.append(
                    TreeNode(
                        node_id=next_id(),
                        node_type=NodeType.IMAGE,
                        text=desc_text,
                        raw_meta={
                            "url": src,
                            "alt": alt,
                            "title": title,
                        },
                    )
                )
            elif child.type == "code_inline":
                # 保留行内代码的反引号，便于后续大模型识别变量名或命令
                text_buffer.append(f"`{child.content}`")
            elif child.type in ("softbreak", "hardbreak"):
                text_buffer.append("\n")
            elif child.type == "text":
                text_buffer.append(child.content)
            # strong_open/close、em_open/close、link_open/close 等样式标签本身无文本，文字在中间的 text 里

        # 把段落末尾剩余的文字也落盘
        flush_text()
        return nodes

    def _parse_table(
        self,
        tokens: list[Token],
        start_idx: int,
        next_id: Any,
    ) -> tuple[TreeNode, int]:
        """解析 GFM 表格（table_open 到 table_close）。

        输出同时保留两份信息：
        1. text：标准 Markdown 表格字符串（方便人类阅读和直接喂给 LLM）
        2. raw_meta：结构化的 {"headers": [...], "rows": [[...], ...]}
           （方便 Step 6 表格切片器直接按行打包、重复表头，完全不用再正则拆字符串！）
        """
        headers: list[str] = []
        rows: list[list[str]] = []

        in_thead = False
        current_row: list[str] = []

        i = start_idx + 1
        n = len(tokens)
        while i < n:
            tok = tokens[i]
            if tok.type == "table_close":
                i += 1
                break
            if tok.type == "thead_open":
                in_thead = True
            elif tok.type == "thead_close":
                in_thead = False
            elif tok.type == "tr_open":
                current_row = []
            elif tok.type == "tr_close":
                if in_thead:
                    headers = current_row
                else:
                    rows.append(current_row)
            elif tok.type in ("th_open", "td_open"):
                cell_text = ""
                if i + 1 < n and tokens[i + 1].type == "inline":
                    cell_text = self._extract_plain_text(tokens[i + 1]).strip()
                current_row.append(cell_text)
            i += 1

        # 拼装标准 Markdown 表格文本
        md_lines: list[str] = []
        if headers:
            md_lines.append("| " + " | ".join(headers) + " |")
            md_lines.append("| " + " | ".join(["---"] * len(headers)) + " |")
        for row in rows:
            md_lines.append("| " + " | ".join(row) + " |")

        table_node = TreeNode(
            node_id=next_id(),
            node_type=NodeType.TABLE,
            text="\n".join(md_lines),
            raw_meta={
                "headers": headers,
                "rows": rows,
                "num_rows": len(rows),
                "num_cols": len(headers) if headers else (len(rows[0]) if rows else 0),
            },
        )
        return table_node, i

    @staticmethod
    def _extract_plain_text(inline_tok: Token) -> str:
        """从 inline token 中提取干净的纯文本（用于标题文本、表格单元格文本）。"""
        if not inline_tok.children:
            return inline_tok.content
        parts: list[str] = []
        for child in inline_tok.children:
            if child.type == "code_inline":
                parts.append(f"`{child.content}`")
            elif child.type in ("softbreak", "hardbreak"):
                parts.append(" ")
            elif child.type in ("text", "image"):
                parts.append(child.content)
        return "".join(parts)


def format_tree(node: TreeNode, indent: int = 0) -> str:
    """将 TreeNode 树渲染成直观的缩进树形文本，方便调试和肉眼检查解析结果。"""
    prefix = "  " * indent + ("└─ " if indent > 0 else "")

    if node.node_type == NodeType.PAGE:
        label = f"[PAGE] {node.title} ({node.node_id})"
    elif node.node_type == NodeType.HEADING:
        label = f"[H{node.level}] {node.title} ({node.node_id})"
    elif node.node_type == NodeType.CODE:
        lang = node.raw_meta.get("language") or "plain"
        first_line = node.text.splitlines()[0] if node.text else ""
        label = f"[CODE:{lang}] {first_line[:35]}... ({node.node_id})"
    elif node.node_type == NodeType.TABLE:
        r = node.raw_meta.get("num_rows", 0)
        c = node.raw_meta.get("num_cols", 0)
        label = f"[TABLE {r}行x{c}列] 表头={node.raw_meta.get('headers', [])} ({node.node_id})"
    elif node.node_type == NodeType.IMAGE:
        label = f"[IMAGE] {node.text} -> {node.raw_meta.get('url', '')} ({node.node_id})"
    else:
        preview = node.text.replace("\n", " ")[:40]
        label = f"[PARA] {preview} ({node.node_id})"

    lines = [f"{prefix}{label}"]
    for child in node.children:
        lines.append(format_tree(child, indent + 1))
    return "\n".join(lines)
