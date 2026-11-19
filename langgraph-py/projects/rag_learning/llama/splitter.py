# from pathlib import Path
# from llama_index.readers.file import PDFReader
# from llama_index.core.node_parser import SentenceSplitter

# pdf = Path(__file__).resolve().parents[1] / "pdf" / "你的课堂讲义.pdf"
# pages = PDFReader(return_full_document=False).load_data(file=pdf)

# for page_no, doc in enumerate(pages, start=1):
#     doc.id_ = f"fractions:page:{page_no}"
#     doc.metadata["physical_page"] = page_no

# for size in (128, 256):
#     splitter = SentenceSplitter(chunk_size=size, chunk_overlap=20)
#     nodes = splitter.get_nodes_from_documents(pages)

#     print(f"\nchunk_size={size}, Node 数={len(nodes)}")
#     for node in nodes:
#         print(
#             "来源=", node.ref_doc_id,
#             "页码=", node.metadata.get("physical_page"),
#             "内容=", repr(node.text[:100]),
#         )


from pathlib import Path

from llama_index.core import Document
from llama_index.core.node_parser import SentenceSplitter
from llama_index.readers.file import PDFReader

# 实验 1：加法是长 Document，减法是短 Document。
# 这样可以同时看到：长 Document 内部的 overlap，以及两个 Document 之间不会 overlap。
sections = [
    Document(
        text=(
            "今天学习同分母分数加法。\n"
            "分母是六。\n"
            "每份是六分之一。\n"
            "先取一份。\n"
            "再取两份。\n"
            "合起来是三份。\n"
            "同分母分数相加时，分母不变，分子相加。\n"
            "一加二等于三。\n"
            "结果写成 3/6。\n"
            "画图检查。\n"
            "把六格画好。\n"
            "第一格涂蓝色。\n"
            "另外两格涂绿色。\n"
            "现在共涂三格。\n"
            "剩下三格不涂。\n"
            "所以答案是 3/6。\n"
            "最后读作六分之三。"
        ),
        id_="lesson-01:page-4:add",
        metadata={"source_id": "lesson-01", "page": 4, "topic": "加法"},
    ),
    Document(
        text="同分母分数减法。分母不变，分子相减。4/6 - 1/6 = 3/6。因为每份大小没变。",
        id_="lesson-01:page-4:subtract",
        metadata={"source_id": "lesson-01", "page": 4, "topic": "减法"},
    ),
]

# chunk_size 是每个 Node 的 token 容量，不是汉字数。
# 原来的 60 太小，metadata 也会占用一部分容量；80 避免提示，同时仍能把加法切开。
# 先让 overlap=0，再让 overlap=20：只改这一个参数，比较 Node 的开头。
for overlap in (0, 20):
    nodes = SentenceSplitter(chunk_size=80, chunk_overlap=overlap).get_nodes_from_documents(sections)
    print(f"\n实验 1：chunk_size=80，chunk_overlap={overlap} → {len(nodes)} 个 Node")
    for number, node in enumerate(nodes, start=1):
        print(f"Node {number}｜{node.metadata['topic']}｜来自 {node.ref_doc_id}")
        print(node.text)
        print("---")

# 观察 overlap=20 的输出：后一段是否重复了前一段结尾的完整句子。
# 减法是另一份 Document，不会重复加法的结尾；它自身很短，也只生成 1 个 Node。


