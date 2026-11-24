"""核心数据模型模块（Step 1）。

整个切片流水线一共经历 3 种核心数据结构（对应设计文档的三个阶段）：
1. TreeNode           （阶段一：标准结构树节点）   -> 还原文档原始层级
2. StructuredDocument （阶段二：结构化逻辑文档）   -> 拆解出父引用 + 带摘要子占位，存入 DocStore
3. Chunk              （阶段三：精细化检索切片）   -> 全模态面包屑 + index_text/content 分离，存入向量库

全部基于 Pydantic v2 定义：
- 写代码时有自动类型提示和校验；
- 调试时调用 .model_dump_json(indent=2) 就能一键导出漂亮的 JSON。
"""

from enum import Enum
from typing import Any
from pydantic import BaseModel, Field


class NodeType(str, Enum):
    """文档结构树的 6 种基础节点类型。

    继承 str 和 Enum 的好处：
    - 代码里用 NodeType.TABLE 有类型检查，不怕拼写错；
    - 转成 JSON 时直接变成字符串 "table"，不会变成奇怪的对象。
    """

    PAGE = "page"            # 文档根节点 / 页面
    HEADING = "heading"      # 章节标题（H1 ~ H6）及其直属正文
    PARAGRAPH = "paragraph"  # 普通正文段落（阶段二会合并进其父级 PAGE/HEADING）
    CODE = "code"            # 代码块 / 配置文件块
    TABLE = "table"          # 表格块
    IMAGE = "image"          # 图片及其说明/OCR


class TreeNode(BaseModel):
    """阶段一输出：标准结构树节点。

    不管是 Markdown、PDF 还是 Word，解析器第一步都统一转成这棵树，
    这样后面的“结构化拆解”和“精细化切片”代码就完全不用关心原始文件格式了。
    """

    node_id: str = Field(
        description="节点唯一 ID，例如 'node_001'",
    )
    node_type: NodeType = Field(
        description="节点类型（page / heading / paragraph / code / table / image）",
    )
    title: str | None = Field(
        default=None,
        description="页面标题或章节标题文本（仅 page / heading 节点有值）",
    )
    level: int = Field(
        default=0,
        ge=0,
        description="层级深度：page=0, H1=1, H2=2, H3=3... 非标题节点一般为 0",
    )
    text: str = Field(
        default="",
        description="节点主要文本（段落内容 / 代码源码 / 表格 Markdown / 图片说明）",
    )
    raw_meta: dict[str, Any] = Field(
        default_factory=dict,
        description=(
            "解析器保留的原始扩展元数据，例如：\n"
            "- code 节点: {'language': 'python'}\n"
            "- image 节点: {'url': 'images/arch.png', 'alt': '系统架构图'}\n"
            "- table 节点: {'headers': ['型号', '功率'], 'rows': [['A100', '10W']]}"
        ),
    )
    children: list["TreeNode"] = Field(
        default_factory=list,
        description="子节点列表（递归嵌套，形成完整的文档树）",
    )


class ChildRef(BaseModel):
    """父节点中记录的子结构占位信息（对应架构图里的“虚线框”）。

    例如：“标题 A”正文中包含一个表格，父节点不塞入整张表，
    而是记录一个 ChildRef，并在正文中放入 {{REF:doc_id|类型=表格|摘要=...}}。
    """

    ref_doc_id: str = Field(
        description="被引用的子 StructuredDocument 的 doc_id",
    )
    node_type: NodeType = Field(
        description="被引用子节点的类型（code / table / image / heading）",
    )
    summary: str = Field(
        description="轻量摘要（如“型号功率与防护等级表”），帮助父节点检索与 Agent 按需展开",
    )

    def to_placeholder(self) -> str:
        """生成插入到父节点正文中的标准占位符字符串。"""
        type_label_map = {
            NodeType.CODE: "代码",
            NodeType.TABLE: "表格",
            NodeType.IMAGE: "图片",
            NodeType.HEADING: "子章节",
            NodeType.PAGE: "页面",
            NodeType.PARAGRAPH: "段落",
        }
        label = type_label_map.get(self.node_type, self.node_type.value)
        return f"{{{{REF:{self.ref_doc_id}|类型={label}|摘要={self.summary}}}}}"


class StructuredDocument(BaseModel):
    """阶段二输出：带父子关系和占位符的逻辑文档（存入 DocStore）。

    作用：
    1. 保留完整语义单元（完整章节、完整表格、完整代码块、完整图片）；
    2. 通过 parent_id 向上回溯，通过 child_refs 向下展开。
    """

    doc_id: str = Field(
        description="逻辑文档唯一 ID，例如 'doc_0002'",
    )
    source_id: str = Field(
        description="来源文件标识，例如 'docs/产品手册.md'",
    )
    node_type: NodeType = Field(
        description="逻辑文档类型（page / heading / code / table / image）",
    )
    parent_id: str | None = Field(
        default=None,
        description="父引用：指向直属上级 StructuredDocument 的 doc_id（根节点为 None）",
    )
    breadcrumbs: list[str] = Field(
        default_factory=list,
        description="从根节点到当前节点的标题路径，例如 ['产品手册', '安装指南']",
    )
    content: str = Field(
        default="",
        description="文档主体内容（页面/章节含 {{REF:...}} 占位符；代码/表格/图片为其完整内容）",
    )
    surrounding_context: str = Field(
        default="",
        description=(
            "上下文增强字段：针对代码/表格/图片，自动摘取父节点中紧邻的前 1~2 句说明，"
            "解决纯表格/纯代码缺少业务关键词导致搜不到的问题"
        ),
    )
    child_refs: list[ChildRef] = Field(
        default_factory=list,
        description="当前文档中包含的所有子结构引用列表",
    )
    indexable: bool = Field(
        default=True,
        description="是否需要进入向量库建索引。纯空壳标题设为 False（仅保留在 DocStore 维护树关系）",
    )
    meta: dict[str, Any] = Field(
        default_factory=dict,
        description="扩展元数据（如代码语言、图片路径、表格行列结构、页码等）",
    )

    def breadcrumb_path(self, sep: str = " / ") -> str:
        """把面包屑列表拼成人类可读的路径字符串，如 '产品手册 / 安装指南'。"""
        return sep.join(self.breadcrumbs)


class Chunk(BaseModel):
    """阶段三输出：最终写入向量库 / 混合检索引擎的精细化切片。

    核心亮点：index_text 与 content 分离！
    - index_text：带 [路径] + [类型] + [上下文] + 内容，专供 Embedding 和 BM25 检索，最大化召回率；
    - content：更干净的原始内容片段，专供最终组装给 LLM 阅读，省 Token、少噪声。
    """

    chunk_id: str = Field(
        description="切片唯一 ID，例如 'doc_0002_chunk_000'",
    )
    doc_id: str = Field(
        description="所属 StructuredDocument 的 doc_id",
    )
    parent_doc_id: str | None = Field(
        default=None,
        description="所属父 Document 的 doc_id（冗余存一份，检索命中子节点时一步就能回溯父上下文）",
    )
    source_id: str = Field(
        description="来源文件标识",
    )
    node_type: NodeType = Field(
        description="切片所属模态类型（page / heading / code / table / image）",
    )
    chunk_index: int = Field(
        ge=0,
        description="当前切片在所属 Document 内的顺序编号（0, 1, 2...），用于检索后排序合并",
    )
    breadcrumbs: list[str] = Field(
        default_factory=list,
        description="全模态统一面包屑路径，例如 ['产品手册', '安装指南']",
    )
    index_text: str = Field(
        description="用于向量化（Embedding）和关键词搜索（BM25）的增强文本",
    )
    content: str = Field(
        description="用于最终喂给大模型的干净展示文本",
    )
    token_count: int = Field(
        ge=0,
        description="index_text 的 Token 数量（便于监控是否超出 Embedding 模型窗口）",
    )
    referenced_doc_ids: list[str] = Field(
        default_factory=list,
        description="当前切片正文中出现的 {{REF:...}} 引用 ID 列表（检索组装时用于去重和展开）",
    )
    meta: dict[str, Any] = Field(
        default_factory=dict,
        description="扩展元数据（如 image_id、table_row_range、code_language 等）",
    )

    def breadcrumb_path(self, sep: str = " / ") -> str:
        """把面包屑列表拼成路径字符串。"""
        return sep.join(self.breadcrumbs)


# Pydantic v2 对于自引用模型（TreeNode.children 包含 list[TreeNode]）
# 显式调用一次 model_rebuild()，确保递归类型解析完全就绪。
TreeNode.model_rebuild()
