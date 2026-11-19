"""第 1 课。用手写向量观察 Milvus 的存取。"""

import argparse
import json
import os
from pathlib import Path

from pymilvus import DataType, MilvusClient


COLLECTION = "edu_lab_01_fixed_vectors"
FIELDS = ["course_id", "lesson_id", "source_id", "build_id", "physical_page", "text"]
LESSON_FILTER = 'course_id == "math-grade-3" and lesson_id == "fractions-addition"'


def connect(*, default_uri: str = "http://127.0.0.1:19530") -> MilvusClient:
    return MilvusClient(uri=os.getenv("EDU_MILVUS_URI", default_uri))


def create_collection(
    client: MilvusClient,
    name: str,
    dimension: int,
    *,
    nullable_page: bool = False,
) -> None:
    if not client.has_collection(name):
        schema = client.create_schema(auto_id=False, enable_dynamic_field=False)
        schema.add_field("id", DataType.VARCHAR, is_primary=True, max_length=160)
        schema.add_field("course_id", DataType.VARCHAR, max_length=64)
        schema.add_field("lesson_id", DataType.VARCHAR, max_length=64)
        schema.add_field("source_id", DataType.VARCHAR, max_length=1024)
        schema.add_field("build_id", DataType.VARCHAR, max_length=64)
        schema.add_field("physical_page", DataType.INT64, nullable=nullable_page)
        schema.add_field("text", DataType.VARCHAR, max_length=8192)
        schema.add_field("dense", DataType.FLOAT_VECTOR, dim=dimension)

        indexes = client.prepare_index_params()
        indexes.add_index(field_name="dense", index_type="FLAT", metric_type="COSINE")
        client.create_collection(name, schema=schema, index_params=indexes)

    client.load_collection(name)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("chunks", type=Path)
    parser.add_argument("--read-only", action="store_true", help="只读已有集合，演练重启")
    args = parser.parse_args()

    client = connect()
    try:
        if not args.read_only:
            chunks = json.loads(args.chunks.read_text(encoding="utf-8"))
            create_collection(client, COLLECTION, dimension=3)
            rows = []
            for chunk in chunks:
                row = dict(chunk)
                chunk_number = row.pop("chunk_number")
                row["id"] = f"handout-v1:fractions-addition:{chunk_number}"
                row["build_id"] = "handout-v1"
                if row["physical_page"] == 1:
                    row["dense"] = [1.0, 0.0, 0.0]
                else:
                    row["dense"] = [0.0, 1.0, 0.0]
                rows.append(row)
            print("upsert:", client.upsert(COLLECTION, data=rows))
        else:
            client.load_collection(COLLECTION)

        records = client.query(
            COLLECTION,
            filter=LESSON_FILTER,
            output_fields=["id", "physical_page"],
            limit=20,
            consistency_level="Strong",
        )
        print("query:", records)

        result = client.search(
            COLLECTION,
            data=[[0.0, 1.0, 0.0]],
            anns_field="dense",
            search_params={"metric_type": "COSINE"},
            filter=LESSON_FILTER,
            limit=3,
            output_fields=FIELDS,
            consistency_level="Strong",
        )
        for hit in result[0]:
            entity = hit["entity"]
            print(f"{hit['id']} | {hit['distance']:.3f} | p.{entity['physical_page']}")
            print(entity["text"][:100])
    finally:
        client.close()


if __name__ == "__main__":
    main()
