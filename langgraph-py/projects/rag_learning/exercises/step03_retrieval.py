"""阶段 3：将片段向量化，并观察纯检索结果（不生成答案）。

运行：uv run python projects/rag_learning/exercises/step03_retrieval.py
需要可用的 embedding 服务；不要在本文件中写入 API key。
"""

from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from langchain_core.vectorstores import InMemoryVectorStore

from step01_documents import load_documents
from step02_split_documents import split_documents


QUESTIONS = {
    "Q01": "16 周岁的读者第一次办证需要什么？基础会员收费吗？",
    "Q06": "我借的书已被另一位读者预约，还能续借吗？为什么？",
    "Q18": "研讨室一定配有投影仪吗？",
}


def make_embeddings() -> Embeddings:
    """创建真实的 embedding 模型；先参考 OpenAIEmbeddings 官方集成指南。"""
    # TODO 1：选择可用的 embedding 模型并返回实例。
    # 推荐先尝试 OpenAIEmbeddings(model="text-embedding-3-small")。
    # 使用环境变量传递 API key，不要写入源码。
    raise NotImplementedError("请先创建 embedding 模型")


def make_vector_store(
    chunks: list[Document], embeddings: Embeddings
) -> InMemoryVectorStore:
    """把已有 Document 片段放入内存向量库。"""
    # TODO 2：查看 InMemoryVectorStore.from_documents 的参数并创建向量库。
    raise NotImplementedError("请先创建内存向量库")


def retrieve(
    vector_store: InMemoryVectorStore, question: str, k: int = 3
) -> list[Document]:
    """仅返回相似片段，不调用聊天模型。"""
    # TODO 3：调用 similarity_search，返回 Top K Document。
    raise NotImplementedError("请先完成纯检索")


def main() -> None:
    chunks = split_documents(load_documents())
    print(f"待入库片段：{len(chunks)} 个")

    embeddings = make_embeddings()
    document_vector = embeddings.embed_documents([chunks[0].page_content])[0]
    query_vector = embeddings.embed_query(QUESTIONS["Q01"])
    print(f"文档向量维度：{len(document_vector)}；问题向量维度：{len(query_vector)}")
    assert len(document_vector) == len(query_vector) > 0

    vector_store = make_vector_store(chunks, embeddings)
    for question_id, question in QUESTIONS.items():
        print(f"\n{question_id}: {question}")
        hits = retrieve(vector_store, question, k=3)
        for rank, hit in enumerate(hits, start=1):
            preview = hit.page_content.replace("\n", " ")[:120]
            print(
                f"  {rank}. {hit.metadata.get('doc_id')} "
                f"{hit.metadata.get('source')} | {preview}"
            )


if __name__ == "__main__":
    main()
