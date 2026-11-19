"""第 1 课。把学生可见的 PDF 页面切成带来源的片段。"""

import argparse
import json
from pathlib import Path

from llama_index.core import SimpleDirectoryReader
from llama_index.core.node_parser import SentenceSplitter
from llama_index.readers.file import PDFReader
from pypdf import PdfReader


RESOURCE_DIR = Path(__file__).resolve().parents[2] / "resource" 
SOURCE_ID = "fractions-handout"
COURSE_ID = "math-grade-3"
LESSON_ID = "fractions-addition"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-file", type=Path, help="可选的 JSON 输出文件")
    parser.add_argument("--output", type=Path, help="可选的 JSON 输出文件")
    args = parser.parse_args()

    # pages = PDFReader(return_full_document=False).load_data(file=PDF_PATH)
    # pdf_reader = PdfReader(PDF_PATH)
    # for page_number, document in enumerate(pages, start=1):
    #     document.id_ = f"{SOURCE_ID}:page:{page_number}"
    #     document.metadata["source_id"] = SOURCE_ID
    #     document.metadata["physical_page"] = page_number
    #     print(f"Document {document.id_} | {document.text[:36]!r}")
    #     print(f"Images in page {page_number}: {len(pdf_reader.pages[page_number - 1])}")
    documents = SimpleDirectoryReader(
        input_dir=RESOURCE_DIR,
        recursive=True,
        required_exts=[".pdf", ".md", ".txt"],
        filename_as_id=True,
        file_extractor={".pdf": PDFReader(return_full_document=False)},
    ).load_data()
    # 第 3 页有参考答案。切分的是学生可见的前两页。
    for doc in documents:
       path = Path(doc.metadata["file_path"])
       doc.metadata["source_id"] = path.relative_to(RESOURCE_DIR).as_posix()
    splitter = SentenceSplitter(chunk_size=256, chunk_overlap=0)
    nodes = splitter.get_nodes_from_documents(documents)

    rows = []
    for chunk_number, node in enumerate(nodes, start=1):
        rows.append({
            "course_id": COURSE_ID,
            "lesson_id": LESSON_ID,
            "source_id": node.metadata["source_id"],
            "physical_page": node.metadata.get("page_label"),
            "chunk_number": chunk_number,
            "text": node.text,
        })
        print(f"Node {chunk_number} from {node.ref_doc_id} | {node.text[:36]!r}")

    if args.output is not None:
        args.output.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Saved {len(rows)} chunks to {args.output}")


if __name__ == "__main__":
    main()
