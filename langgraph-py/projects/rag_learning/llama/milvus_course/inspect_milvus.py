"""查看 Milvus 练习集合及已保存的片段，无需调用 embedding 模型。"""

import argparse

from milvus_basics import FIELDS, connect


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("collection", nargs="?", help="集合名，省略时列出所有集合")
    parser.add_argument("--limit", type=int, default=10, help="最多查看多少条片段")
    args = parser.parse_args()

    client = connect()
    try:
        collections = client.list_collections()
        if args.collection is None:
            for name in sorted(collections):
                print(name)
            return
        if args.collection not in collections:
            parser.error(f"集合不存在：{args.collection}。省略集合名可查看列表。")

        client.load_collection(args.collection)
        records = client.query(
            args.collection,
            filter="",
            output_fields=["id", *FIELDS, "dense"],
            limit=args.limit,
            consistency_level="Strong",
        )
        print(f"{args.collection} | 返回 {len(records)} 条记录")
        for record in sorted(records, key=lambda row: (row["source_id"], row["physical_page"] or 0, row["id"])):
            page = record["physical_page"]
            page_label = f" | 第 {page} 页" if page is not None else ""
            print(f"\n{record['id']}{page_label}")
            print(f"课程 {record['course_id']} | 课次 {record['lesson_id']}")
            print(f"资料 {record['source_id']} | 批次 {record['build_id']}")
            vector = record["dense"]
            print(f"向量 {len(vector)} 维 | 前五位 {[round(value, 6) for value in vector[:5]]}")
            print(record["text"])
    finally:
        client.close()


if __name__ == "__main__":
    main()
