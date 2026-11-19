from pathlib import Path
from llama_index.core import SimpleDirectoryReader

base_file = Path(__file__).resolve().parents[1] / "corpus"
print("corpus 目录：", base_file)
corpus = base_file
files = sorted(corpus.glob("*.md"))

# documents = SimpleDirectoryReader(
#     input_files=[str(path) for path in files]
# ).load_data()

documents = SimpleDirectoryReader(input_dir=corpus).load_data()

print("文件数：", len(files))
print("Document 数：", len(documents))

print(documents[0].metadata)

# for doc in documents:
#     print(
#         doc.metadata.get("file_name"),
#         doc.metadata.get("file_path"),
#         repr(doc.text[:60]),
#     )