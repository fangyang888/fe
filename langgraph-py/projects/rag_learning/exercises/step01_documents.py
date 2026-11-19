"""阶段 1：将 10 篇 Markdown 转成 LangChain Document。

任务：只填写 load_documents() 中的 TODO，不读取 eval/ 下的题目或答案。
运行：uv run python projects/rag_learning/exercises/step01_documents.py
"""

from pathlib import Path

from langchain_core.documents import Document


CORPUS_DIR = Path(__file__).resolve().parents[1] / "corpus"


def load_documents() -> list[Document]:
    """读取 corpus/*.md，每个文件生成一个 Document。

    约定：
    - page_content：完整 Markdown 正文。
    - metadata["source"]：相对项目目录的路径，例如 corpus/01_读者证与账户.md。
    - metadata["doc_id"]：文件名前两位转换成 CG-01 这样的编号。
    - 按文件名排序，确保输出稳定。
    """
    # TODO 1：用 pathlib 找到并排序 10 个 Markdown 文件。
    markdown_files = sorted(CORPUS_DIR.glob("*.md"))
    # TODO 2：以 UTF-8 读取每个文件的完整内容。
    markdown_contents = [file.read_text(encoding="utf-8") for file in markdown_files]
    # TODO 3：构造 Document，保留 source 和 doc_id。
    return [
        Document(
            page_content=content,
            metadata={
                "source": str(file.relative_to(Path(__file__).resolve().parents[1])),
                "doc_id": f"CG-{file.name[:2]}",
            },
        )
        for file, content in zip(markdown_files, markdown_contents)
    ]   
    


def main() -> None:
    documents = load_documents()
    assert len(documents) == 10, f"期望 10 篇文档，实际 {len(documents)} 篇"

    for document in documents:
        assert document.page_content.strip(), "存在空文档"
        assert document.metadata.get("source"), "缺少 source"
        assert document.metadata.get("doc_id"), "缺少 doc_id"
        preview = document.page_content.replace("\n", " ")[:70]
        print(document.metadata["doc_id"], document.metadata["source"], preview)

    print(f"成功加载 {len(documents)} 篇文档")


if __name__ == "__main__":
    main()
