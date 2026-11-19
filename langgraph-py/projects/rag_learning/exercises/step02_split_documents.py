"""阶段 2：比较不同切分参数，检查片段边界和 metadata。

先安装：uv add langchain-text-splitters
运行：uv run python projects/rag_learning/exercises/step02_split_documents.py
"""

from collections import Counter

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from step01_documents import load_documents


def split_documents(documents: list[Document]) -> list[Document]:
    """先用 chunk_size=180、chunk_overlap=30、length_function=len。

    第一次保持默认 separators。完成后再做两次对照实验：
    1. 只把 chunk_size 改为 300。
    2. 恢复 180，只调整 separators，加入中文句号和逗号。
    """
    # TODO 1：构造 RecursiveCharacterTextSplitter。
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=180,
        chunk_overlap=30,
        length_function=len,
    )
    # TODO 2：使用 split_documents 处理已有的 Document 列表。
    return text_splitter.split_documents(documents)


def main() -> None:
    documents = load_documents()
    chunks = split_documents(documents)
    print(f"原文档：{len(documents)} 篇；切分后：{len(chunks)} 个片段")

    counts = Counter(chunk.metadata.get("doc_id") for chunk in chunks)
    for doc_id, count in sorted(counts.items()):
        print(f"{doc_id}: {count} 个片段")

    for index, chunk in enumerate(chunks):
        assert chunk.page_content.strip(), f"片段 {index} 为空"
        assert chunk.metadata.get("source"), f"片段 {index} 缺少 source"
        assert chunk.metadata.get("doc_id"), f"片段 {index} 缺少 doc_id"
        if chunk.metadata["doc_id"] == "CG-03":
            print(f"\nCG-03 片段 {index}，长度 {len(chunk.page_content)}：")
            print(chunk.page_content)


if __name__ == "__main__":
    main()
