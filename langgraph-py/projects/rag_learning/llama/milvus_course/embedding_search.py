# /// script
# requires-python = ">=3.13,<3.14"
# dependencies = [
#     "pymilvus==3.0.2",
#     "milvus-lite==3.2.2",
#     "llama-index-embeddings-openai-like==0.4.0",
#     "python-dotenv==1.2.4",
# ]
# ///

"""第 2 课。用模型服务的 Embedding API 为讲义和问题生成向量。"""

import argparse
import hashlib
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from llama_index.embeddings.openai_like import OpenAILikeEmbedding

from milvus_basics import FIELDS, LESSON_FILTER, connect, create_collection


PROJECT_ENV_FILE = Path(__file__).resolve().parents[4] / ".env"
DEFAULT_MILVUS_URI = "/tmp/edu-milvus-lesson01.db"


def prepare_rows(chunks: list[dict], revision: str, *, legacy_handout: bool) -> list[dict]:
    rows = []
    for chunk in chunks:
        source_id = chunk.get("source_id") or chunk.get("file_name")
        if not source_id:
            raise ValueError("片段需要 source_id 或 file_name 才能追溯到原文")

        # 旧 PDF 的页码是整数。目录导出的 PDF 页标签可能是字符串，正文文件没有页码。
        page = chunk.get("physical_page")
        if page is None:
            page = chunk.get("page_label")
        page_text = str(page)
        physical_page = int(page_text) if page_text.isascii() and page_text.isdecimal() else None

        course_id = chunk.get("course_id") or "primary-math"
        lesson_id = chunk.get("lesson_id") or "general"
        chunk_number = chunk["chunk_number"]
        if legacy_handout:
            build_id = f"{source_id}-v1"
            row_id = f"{build_id}:{lesson_id}:{chunk_number}"
        else:
            # 多文本的文件名可能较长。用来源、页码和片段编号生成定长主键。
            build_id = revision
            locator = json.dumps([source_id, course_id, lesson_id, page, chunk_number])
            row_id = hashlib.sha256(locator.encode("utf-8")).hexdigest()

        rows.append({
            "id": row_id,
            "course_id": course_id,
            "lesson_id": lesson_id,
            "source_id": source_id,
            "build_id": build_id,
            "physical_page": physical_page,
            "text": chunk["text"],
        })
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("chunks", type=Path)
    parser.add_argument("question")
    parser.add_argument("--ingest", action="store_true", help="为这批片段生成向量并写入 Milvus")
    args = parser.parse_args()

    # 查询也读取 JSON，用它的内容摘要找到该批资料对应的集合。
    try:
        payload = args.chunks.read_bytes()
        chunks = json.loads(payload)
    except (OSError, ValueError) as error:
        parser.error(f"无法读取片段文件 {args.chunks}：{error}")
    if not isinstance(chunks, list) or not chunks or not all(isinstance(chunk, dict) for chunk in chunks):
        parser.error("片段文件需要是含有记录的 JSON 数组")

    revision = hashlib.sha256(payload).hexdigest()
    # 第 2 课的原讲义保留已有集合和课次过滤。目录语料以内含文件为查询范围。
    legacy_handout = all(chunk.get("source_id") == "fractions-handout" for chunk in chunks)

    if args.ingest:
        if legacy_handout:
            example = next((chunk for chunk in chunks if chunk.get("physical_page") == 2), None)
            if example is not None:
                chunks.append({**example, "lesson_id": "fractions-review", "source_id": "filter-control"})
        rows = prepare_rows(chunks, revision, legacy_handout=legacy_handout)

    # 以脚本的位置找到项目根目录，启动时从 .env 加载配置。终端已有的环境变量优先。
    load_dotenv(PROJECT_ENV_FILE)
    # 先检查地址、模型名和密钥是否齐全，缺哪项就直接提示对应的变量名。
    config = {}
    for name in ("EDU_EMBED_BASE_URL", "EDU_EMBED_MODEL", "EDU_EMBED_API_KEY"):
        value = os.getenv(name, "").strip()
        if not value:
            parser.error(f"请先设置环境变量 {name}")
        config[name] = value

    # api_base 填到接口的基础路径，例如百炼兼容模式的 /compatible-mode/v1。
    # 客户端会拼接 /embeddings，所以配置时填的是基础地址。
    api_base = config["EDU_EMBED_BASE_URL"].rstrip("/")
    model_name = config["EDU_EMBED_MODEL"]
    model = OpenAILikeEmbedding(
        model_name=model_name,
        api_base=api_base,
        api_key=config["EDU_EMBED_API_KEY"],
    )
    # 先把问题变成向量。这个向量一会儿交给 Milvus，用来比较哪些讲义片段和问题接近。
    # 从实际返回值计算维度，例如本次练习是 1024。建集合时也用这个数字。
    question_vector = model.get_query_embedding(args.question)
    dimension = len(question_vector)

    # 用模型配置生成固定的集合名。同一个配置再次运行，会找到上次写入的集合。
    # 即使两个模型恰好都是 1024 维，它们生成的数字也可能属于不同的向量空间。
    # 地址、模型、版本或维度变更时，这里会换集合。服务商沿用模型名但升级底层模型时，
    # 可以手工修改 EDU_EMBED_VERSION，再执行一次 --ingest。密钥只用于鉴权。
    model_config = [api_base, model_name, os.getenv("EDU_EMBED_VERSION", ""), dimension]
    fingerprint = hashlib.sha256(json.dumps(model_config).encode("utf-8")).hexdigest()[:12]
    if legacy_handout:
        collection = f"edu_lab_02_api_{fingerprint}"
        scope = LESSON_FILTER
    else:
        # 模型配置相同的几批资料也可以各自入库。改动 JSON 后会选中新的资料版本。
        collection = f"edu_lab_02_corpus_{fingerprint}_{revision[:12]}"
        scope = ""
    print(f"model: {model_name} | query dimension: {dimension} | collection: {collection}")

    # 练习默认使用现有的 Milvus Lite。EDU_MILVUS_URI 可指定其他本地库或服务。
    client = connect(default_uri=DEFAULT_MILVUS_URI)
    try:
        if args.ingest:
            # 模型只需要片段正文。批量传入多段文字，每段会得到一个向量。
            # Milvus 的 dense 字段要求固定长度，写入前就检查它们是否和问题向量一样长。
            texts = [row["text"] for row in rows]
            vectors = model.get_text_embedding_batch(texts)
            if any(len(vector) != dimension for vector in vectors):
                raise ValueError("片段和查询的向量维度不一致")

            # strict=True 会在两边数量不同时报错，防止少配一条却继续写入。
            for row, vector in zip(rows, vectors, strict=True):
                row["dense"] = vector

            create_collection(client, collection, dimension=dimension, nullable_page=not legacy_handout)
            # 同一份 JSON 的主键固定，重复入库会按 id 更新已有片段。
            print("upsert:", client.upsert(collection, data=rows))
        elif not client.has_collection(collection):
            parser.error(f"{args.chunks} 在当前模型下还没有对应集合，请先使用 --ingest 入库")
        else:
            # 加载已经保存的集合，使它可以被搜索。教材向量沿用上次写入的结果。
            client.load_collection(collection)

        # Milvus 的 data 支持一批查询向量。本次只有一个问题，所以外面再包一层列表。
        # dense 是存教材向量的字段，COSINE 比较方向相似度，分数越大越相近。
        # 旧讲义按课过滤，多文本模式在当前 JSON 对应的集合中搜索。
        # limit=1 最多取一个片段。FIELDS 让结果带回正文、页码等来源字段。
        # Strong 用于在刚完成入库后也能查到此次写入的数据。
        results = client.search(
            collection,
            data=[question_vector],
            anns_field="dense",
            search_params={"metric_type": "COSINE"},
            filter=scope,
            limit=1,
            output_fields=FIELDS,
            consistency_level="Strong",
        )

        # results[0] 是第一个问题的命中列表。展示原文时同时给出来源。
        print(f"\n查询范围：{scope or args.chunks.name}")
        if not results[0]:
            print("无结果")
        for hit in results[0]:
            entity = hit["entity"]
            source = entity["source_id"]
            page = entity.get("physical_page")
            location = source if page is None else f"{source} · 第 {page} 页"
            print(f"来源：{location} | 相似度 {hit['distance']:.3f}")
            print(entity["text"])
    finally:
        # 搜索结束或中途出错都关闭客户端，释放连接和本地库占用的资源。
        client.close()


if __name__ == "__main__":
    main()
