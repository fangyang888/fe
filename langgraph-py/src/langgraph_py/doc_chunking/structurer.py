"""阶段二：文档结构化拆解器（Step 3）。

核心职责：
把阶段一解析出来的嵌套树 `TreeNode`，拆解成一组平铺但互相链接的 `StructuredDocument` 列表。
（对应架构设计图第一张：标准结构树 -> Documents + 父引用 + 虚线框子结构占位）

你可以把这一步想象成“把一棵大树拆成几张互相指路的知识卡片”：
1. 【独立成卡】：页面、章节标题、代码、表格、图片，各自变成一张独立的 StructuredDocument 卡片；
2. 【向上指路（parent_id）】：每张子卡片都知道自己的“爸爸”是谁（例如表格指向所属章节）；
3. 【向下占位（{{REF:...}}）】：父卡片里不塞子卡片的全文，只在原地放一张带摘要的“占位小纸条”；
4. 【全模态面包屑】：不管是正文还是代码/表格/图片，都完整继承从根到当前章节的面包屑路径；
5. 【摘取紧邻前文】：给代码/表格/图片自动摘取紧挨着它的前文说明（surrounding_context），防止检索丢失业务语境；
6. 【空壳标题过滤】：如果一个标题下面光秃秃的没有实质正文（只有子标题），标记 indexable=False，只保留树关系、不污染向量库。
"""

from .config import ChunkingConfig
from .schemas import ChildRef, NodeType, StructuredDocument, TreeNode
from .tokenizer import TokenCounter


class DocumentStructurer:
    """将标准结构树 TreeNode 转换为结构化逻辑文档列表 list[StructuredDocument]。"""

    def __init__(
        self,
        config: ChunkingConfig | None = None,
        token_counter: TokenCounter | None = None,
    ) -> None:
        self.config = config or ChunkingConfig()
        self.token_counter = token_counter or TokenCounter(self.config.encoding_name)

    def structure(
        self,
        root: TreeNode,
        source_id: str | None = None,
    ) -> list[StructuredDocument]:
        """入口方法：传入 PAGE 根节点，返回按阅读顺序排列的所有 StructuredDocument。"""
        resolved_source = source_id or str(root.raw_meta.get("source_id", "unknown.md"))
        docs: list[StructuredDocument] = []
        doc_seq = 0

        def next_doc_id() -> str:
            nonlocal doc_seq
            doc_seq += 1
            return f"doc_{doc_seq:04d}"

        def visit_container(
            node: TreeNode,
            parent_id: str | None,
            parent_breadcrumbs: list[str],
        ) -> StructuredDocument:
            """处理容器节点（PAGE 或 HEADING）：
            - 合并其直属的 PARAGRAPH 为正文；
            - 把非段落子节点（CODE / TABLE / IMAGE / 子 HEADING）递归拆成独立卡片；
            - 在父节点正文原地留下带摘要的 {{REF:...}} 占位符。
            """
            my_id = next_doc_id()

            # 1) 拼接当前节点的完整面包屑路径（例如 ["产品手册", "安装指南"]）
            my_breadcrumbs = list(parent_breadcrumbs)
            if node.title and (not my_breadcrumbs or my_breadcrumbs[-1] != node.title):
                my_breadcrumbs.append(node.title)

            # 先占好列表中的位置，确保最终输出保持“父在前、子在后”的自然阅读顺序
            placeholder_index = len(docs)
            docs.append(None)  # type: ignore[arg-type]

            body_parts: list[str] = []      # 拼装当前容器的正文片段（正文 + 占位符交替排列）
            child_refs: list[ChildRef] = [] # 记录所有子引用对象
            has_substantive_text = False    # 是否包含真正的正文文字（用来判断是不是“空壳标题”）
            last_para_text = ""             # 记录紧邻的前一段文字，给随后的代码/表格/图片做上下文增强

            for child in node.children:
                # 情况 1：普通正文段落 -> 直接保留在父容器正文中（不单独成卡）
                if child.node_type == NodeType.PARAGRAPH:
                    para = child.text.strip()
                    if para:
                        body_parts.append(para)
                        has_substantive_text = True
                        last_para_text = para
                    continue

                # 情况 2：子章节（HEADING）-> 递归生成独立子卡片，并在父正文留占位
                if child.node_type == NodeType.HEADING:
                    child_doc = visit_container(
                        node=child,
                        parent_id=my_id,
                        parent_breadcrumbs=my_breadcrumbs,
                    )
                    summary = (child.title or "未命名章节").strip()
                    ref = ChildRef(
                        ref_doc_id=child_doc.doc_id,
                        node_type=NodeType.HEADING,
                        summary=summary,
                    )
                    child_refs.append(ref)
                    body_parts.append(ref.to_placeholder())
                    # 跨过子章节后，之前的段落不再算后面内容的“紧邻前文”
                    last_para_text = ""
                    continue

                # 情况 3：异构多模态节点（CODE / TABLE / IMAGE）-> 各自独立成卡
                if child.node_type in (NodeType.CODE, NodeType.TABLE, NodeType.IMAGE):
                    # 自动截取紧邻前文的最后 N 个 Token（默认 <= 80 tokens）作为上下文说明
                    surrounding = self._build_surrounding_context(last_para_text)
                    child_doc = build_leaf_document(
                        node=child,
                        parent_id=my_id,
                        breadcrumbs=my_breadcrumbs,
                        surrounding_context=surrounding,
                    )
                    summary = self._build_summary(child)
                    ref = ChildRef(
                        ref_doc_id=child_doc.doc_id,
                        node_type=child.node_type,
                        summary=summary,
                    )
                    child_refs.append(ref)
                    body_parts.append(ref.to_placeholder())
                    continue

            # 2) 判断当前容器是否应该进向量库建索引：
            #    如果开启了 filter_empty_headings，且当前节点下只有子标题/占位、没有任何实质正文，
            #    就标记 indexable=False（它依然留在 DocStore 中维护面包屑与树关系！）
            if self.config.filter_empty_headings and not has_substantive_text:
                is_indexable = False
            else:
                is_indexable = bool(body_parts)

            container_doc = StructuredDocument(
                doc_id=my_id,
                source_id=resolved_source,
                node_type=node.node_type,
                parent_id=parent_id,
                breadcrumbs=my_breadcrumbs,
                content="\n\n".join(body_parts),
                child_refs=child_refs,
                indexable=is_indexable,
                meta={
                    "title": node.title or "",
                    "level": node.level,
                    "source_node_id": node.node_id,
                },
            )
            docs[placeholder_index] = container_doc
            return container_doc

        def build_leaf_document(
            node: TreeNode,
            parent_id: str,
            breadcrumbs: list[str],
            surrounding_context: str,
        ) -> StructuredDocument:
            """处理独立模态节点（CODE / TABLE / IMAGE）。

            关键设计：
            - 直接继承父容器的完整 breadcrumbs（全模态面包屑对齐）；
            - 带上从父容器提取的 surrounding_context（紧邻前文），大幅提升代码/表格/图片的召回率。
            """
            my_id = next_doc_id()
            meta = dict(node.raw_meta)
            meta["source_node_id"] = node.node_id

            leaf_doc = StructuredDocument(
                doc_id=my_id,
                source_id=resolved_source,
                node_type=node.node_type,
                parent_id=parent_id,
                breadcrumbs=list(breadcrumbs),
                content=node.text,
                surrounding_context=surrounding_context,
                indexable=bool(node.text.strip()),
                meta=meta,
            )
            docs.append(leaf_doc)
            return leaf_doc

        visit_container(node=root, parent_id=None, parent_breadcrumbs=[])
        return docs

    def _build_surrounding_context(self, prev_text: str) -> str:
        """从紧邻前文中截取最多 surrounding_context_max_tokens 个 Token，避免上下文过长喧宾夺主。"""
        cleaned = prev_text.strip()
        max_tokens = self.config.surrounding_context_max_tokens
        if not cleaned or max_tokens <= 0:
            return ""
        return self.token_counter.take_tail(cleaned, max_tokens=max_tokens).strip()

    @staticmethod
    def _build_summary(node: TreeNode) -> str:
        """为代码/表格/图片生成简洁的占位符摘要（放入 {{REF:...|摘要=...}} 中）。"""
        if node.node_type == NodeType.TABLE:
            headers = node.raw_meta.get("headers") or []
            num_rows = node.raw_meta.get("num_rows", 0)
            if headers:
                cols = "、".join(str(h) for h in headers[:5])
                return f"表格[{cols}](共{num_rows}行)"
            return f"表格(共{num_rows}行)"

        if node.node_type == NodeType.CODE:
            lang = node.raw_meta.get("language") or "text"
            first_line = ""
            for line in node.text.splitlines():
                if line.strip():
                    first_line = line.strip()[:40]
                    break
            return f"{lang}代码: {first_line}" if first_line else f"{lang}代码块"

        if node.node_type == NodeType.IMAGE:
            alt = str(node.raw_meta.get("alt") or "").strip()
            title = str(node.raw_meta.get("title") or "").strip()
            if alt and title:
                return f"{alt}({title})"
            return alt or title or node.text[:40]

        return node.text[:40]


def format_documents_summary(docs: list[StructuredDocument]) -> str:
    """将 StructuredDocument 列表格式化为直观的卡片摘要，方便调试与肉眼核对。"""
    lines: list[str] = []
    for doc in docs:
        flag = "入向量库" if doc.indexable else "空壳仅存树(indexable=False)"
        parent_str = doc.parent_id or "无(根)"
        path_str = doc.breadcrumb_path()
        lines.append(
            f"[{doc.doc_id}] 类型={doc.node_type.value:<7} | 父={parent_str:<8} | 状态={flag}"
        )
        lines.append(f"  路径: {path_str}")
        if doc.surrounding_context:
            lines.append(f"  紧邻前文: {doc.surrounding_context}")
        if doc.child_refs:
            refs_str = ", ".join(f"{r.ref_doc_id}({r.node_type.value})" for r in doc.child_refs)
            lines.append(f"  子占位引用: {refs_str}")
        preview = doc.content.replace("\n", " ↵ ")
        if len(preview) > 90:
            preview = preview[:90] + "..."
        lines.append(f"  内容预览: {preview}")
        lines.append("")
    return "\n".join(lines)
