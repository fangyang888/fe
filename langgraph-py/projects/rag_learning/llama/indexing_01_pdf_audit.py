"""索引存·第 1 课练习骨架。先阅读 INDEXING_LESSON_01.md，再自己填写。"""

from pathlib import Path

from llama_index.readers.file import PDFReader


PDF_PATH = Path(__file__).resolve().parents[1] / "pdf" / "你的课堂讲义.pdf"
SOURCE_ID = "math-g3-fractions-lesson-01"


def main() -> None:
    # TODO 1：用 PDFReader 按页加载 PDF，打印返回的 Document 数量。
    # TODO 2：按物理页码遍历 Document，赋予稳定的 id_。
    # TODO 3：在 metadata 中加入 source_id、physical_page、grade、subject。
    # TODO 4：打印每页的 id_、page_label、physical_page、文字长度和预览。
    # TODO 5：运行两次，确认相同页面的 id_ 不变。
    raise NotImplementedError("请先完成 PDF 加载与逐页检查练习")


if __name__ == "__main__":
    main()
