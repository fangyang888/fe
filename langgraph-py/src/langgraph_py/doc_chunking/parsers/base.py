"""文档解析器统一接口（Step 2）。

设计理念（面向接口编程）：
不管是 Markdown、PDF、Word 还是网页 HTML，解析器的职责都只有一件事：
    “把原始文档转换成同一套标准结构树 TreeNode”

只要所有解析器都继承 BaseDocumentParser 并返回 TreeNode：
- 现在我们用 MarkdownParser 跑通整套切片流水线；
- 以后要接入 Docling / MinerU 解析 PDF，只需要新增一个 pdf_parser.py 继承它；
- 下游的 structurer.py 和所有 chunkers 一行代码都不用改！
"""

from abc import ABC, abstractmethod
from pathlib import Path

from ..schemas import TreeNode


class BaseDocumentParser(ABC):
    """所有文档解析器的抽象基类。"""

    @abstractmethod
    def parse(
        self,
        content: str,
        source_id: str,
        page_title: str | None = None,
    ) -> TreeNode:
        """将文档原始内容解析为以 PAGE 为根节点的标准结构树。

        参数说明：
            content: 文档原始文本内容（例如读取出来的 Markdown 字符串）
            source_id: 来源标识（通常是文件名或相对路径，如 '产品手册.md'）
            page_title: 页面标题（可选；不传时通常默认取 source_id 去掉后缀的文件名）

        返回：
            TreeNode（根节点 node_type 固定为 NodeType.PAGE，level=0）
        """
        raise NotImplementedError

    def parse_file(
        self,
        file_path: str | Path,
        page_title: str | None = None,
        encoding: str = "utf-8",
    ) -> TreeNode:
        """便捷方法：直接传入本地文件路径，读取并解析为 TreeNode。"""
        path = Path(file_path)
        content = path.read_text(encoding=encoding)
        # 默认用文件名（不含后缀）作为页面标题，例如 "产品手册.md" -> "产品手册"
        resolved_title = page_title or path.stem
        return self.parse(content=content, source_id=path.name, page_title=resolved_title)
