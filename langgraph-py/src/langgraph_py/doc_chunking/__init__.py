"""文档结构化与精细化切片模块。

对外统一导出核心配置、数据模型、工具类与各阶段核心组件。
"""

from .config import ChunkingConfig
from .schemas import ChildRef, Chunk, NodeType, StructuredDocument, TreeNode
from .structurer import DocumentStructurer, format_documents_summary
from .tokenizer import TokenCounter

__all__ = [
    "ChunkingConfig",
    "NodeType",
    "TreeNode",
    "ChildRef",
    "StructuredDocument",
    "Chunk",
    "TokenCounter",
    "DocumentStructurer",
    "format_documents_summary",
]
