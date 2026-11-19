from pathlib import Path
from llama_index.readers.file import PDFReader
from pypdf import PdfReader
base_file = Path(__file__).resolve().parents[1] / "pdf"
pdf = base_file / "你的课堂讲义.pdf"
pages = PDFReader(return_full_document=False).load_data(file=pdf)
pdf_reader = PdfReader(pdf)

source_id = "math-g3-fractions-lesson-01"

for physical_page, doc in enumerate(pages, start=1):
    doc.id_ = f"{source_id}:page:{physical_page}"
    doc.metadata.update({
        "source_id": source_id,
        "physical_page": physical_page,
        "grade": 3,
        "subject": "math",
    })

    text = (doc.text or "").strip()
    print(
        physical_page,
        "PDF页标签=", doc.metadata.get("page_label"),
        "字数=", len(text),
        # "预览=", repr(text[:50]),
        "嵌入图片数:", len(pdf_reader.images)
    )