"""第 4 课。用实际 Milvus 记录观察半写入、发布、重试和回滚。"""

from uuid import uuid4

from pymilvus import MilvusClient

from milvus_basics import LESSON_FILTER, connect, create_collection


COLLECTION = "edu_lab_04_versions"


def make_row(build_id: str, chunk_number: int, text: str) -> dict:
    return {
        "id": f"{build_id}:fractions-addition:{chunk_number}",
        "course_id": "math-grade-3",
        "lesson_id": "fractions-addition",
        "source_id": "fractions-handout",
        "build_id": build_id,
        "physical_page": 2,
        "text": text,
        "dense": [0.0, 1.0, 0.0],
    }


def read_build(client: MilvusClient, build_id: str | None) -> dict:
    if build_id is None:
        return {}

    # 插值只用本脚本生成的 UUID。应用服务使用参数化过滤。
    records = client.query(
        COLLECTION,
        filter=f'{LESSON_FILTER} and build_id == "{build_id}"',
        output_fields=["id", "text"],
        limit=20,
        consistency_level="Strong",
    )
    return {record["id"]: record["text"] for record in records}


def main() -> None:
    client = connect()
    try:
        create_collection(client, COLLECTION, dimension=3)
        v1 = uuid4().hex
        v2 = uuid4().hex
        old_rows = [make_row(v1, 1, "V1 例题 1/6 + 2/6")]
        new_rows = [
            make_row(v2, 1, "V2 例题 1/8 + 3/8"),
            make_row(v2, 2, "V2 提示 每份大小保持不变"),
        ]

        client.upsert(COLLECTION, data=old_rows)
        # 这一变量模拟 PostgreSQL 目录返回的 active_build_id。
        active_build_id = v1
        print("已发布 V1:", read_build(client, active_build_id))

        try:
            client.upsert(COLLECTION, data=new_rows[:1])
            raise InterruptedError("练习用故障，第二批没有写入")
        except InterruptedError as error:
            print(error)

        print("后台看见的半成品 V2:", read_build(client, v2))
        print("学生在失败后仍读 V1:", read_build(client, active_build_id))

        # 从头重写全部片段，第一条使用和上次相同的主键。
        client.upsert(COLLECTION, data=new_rows)
        expected = {row["id"]: row["text"] for row in new_rows}
        if read_build(client, v2) != expected:
            raise RuntimeError("V2 写入核对失败，不发布")

        active_build_id = v2
        print("发布后只读 V2:", read_build(client, active_build_id))
        active_build_id = v1
        print("回滚后只读 V1:", read_build(client, active_build_id))
        active_build_id = None
        print("下架后无可读批次:", read_build(client, active_build_id))
    finally:
        client.close()


if __name__ == "__main__":
    main()
