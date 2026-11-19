# 索引存·第 1 课：为什么先检查 PDF

## 这一课要解决的问题

推荐实战项目：**三年级分数讲义知识库**。目标是以后能回答“同分母分数为什么分母不变”，并给出讲义页码和图形证据。现在先确定原始 PDF 进入程序后留下了哪些内容。输入缺失时，切分、embedding 和向量库都不能补回原图。

`deal_pilot_rag` 的索引顺序是“读取来源与版本 → 构建 metadata → 读取正文 → 结构化 → 切片 → 写入存储 → 清理旧版本”。本项目按这个顺序学习，但来源换成课堂 PDF，代码使用 LlamaIndex。

## 为什么选择逐页加载

你的问题需要引用原讲义的具体页面。`PDFReader(return_full_document=False)` 在当前项目安装的版本中返回**每页一个 `Document`**；`True` 会把所有页的文字合并成一个 `Document`，使后续按页追溯更困难。它通过 `pypdf` 提取文字；逐页结果自带 `file_name` 和 `page_label`。物理页序号仍由我们遍历结果时记录，避免把 PDF 自定义页标签误认为从 1 开始的物理页码。

阅读：[LlamaIndex 官方 `PDFReader` 实现](https://github.com/run-llama/llama_index/blob/main/llama-index-integrations/readers/llama-index-readers-file/llama_index/readers/file/docs/base.py)、[官方 Document / Node 概念](https://developers.llamaindex.ai/python/framework/module_guides/loading/documents_and_nodes/)。官方仓库主分支可能继续变化；编写代码时以当前环境的 API 签名和运行结果核对。

```python
PDFReader(return_full_document=False).load_data(file=PDF_PATH)
```

这里给你 API 调用形式。返回值如何遍历、如何设置 ID 和 metadata，由你写在 `llama/indexing_01_pdf_audit.py` 中。

## 对照你已有的 `llama/file.py` 逐段读

1. **第 1～5 行：定位文件。** `Path(__file__).resolve()` 是当前 `file.py` 的绝对路径；`parents[1]` 是 `rag_learning` 目录；再用 `/ "pdf" / "你的课堂讲义.pdf"` 拼出 PDF 路径。这里的 `/` 是 `Path` 的路径拼接运算。
2. **第 6 行：Reader 产出 Document。** `PDFReader(...).load_data(file=pdf)` 返回列表。此例长 3，每个元素是一页的文字 `Document`，初始 metadata 包含 `file_name`、`page_label`，初始 `id_` 为自动生成值。`PDFReader` 本身尚未生成向量、索引或回答。
3. **第 9～12 行：分清三个身份。** `source_id` 指整份讲义；循环变量 `physical_page` 是从 1 开始的实际页序；`doc.id_ = f"{source_id}:page:{physical_page}"` 为这一页指定稳定身份。下一次加载时即使自动 ID 变化，你赋值后的页级 ID 仍相同。
4. **第 13～18 行：补来源信息。** `doc.metadata.update(...)` 原地增加字段，不改 `doc.text`。例如第 2 页应有 `source_id=math-g3-fractions-lesson-01`、`physical_page=2`、`grade=3`、`subject=math`；Reader 自带的 `page_label` 仍在。
5. **第 20～25 行：检查文字。** `doc.text` 是 Reader 提取的文本；`or ""` 处理空值；`strip()` 去除首尾空白；`len(text)` 是 Python 字符串长度，**不是 token 数**。打印前 50～100 字可快速检查，但图形和后文也要另查。
6. **第 3、26 行：当前有一个对象用错。** 导入的 `pypdf.PdfReader` 还没有被使用；LlamaIndex `Document` 没有 `images` 属性，`len(doc.images)` 会抛 `AttributeError`。`images` 属于 `pypdf` 的页面对象，例如 `PdfReader(pdf).pages[0].images`。即使该值为 0，也只能说明没有提取到嵌入图片，不能说明页面没有绘制图形。[pypdf 官方提取图片示例](https://pypdf.readthedocs.io/en/stable/user/extract-images.html)

一次循环的变量可以这样想：`physical_page=2` 时，`doc` 是第二页的 LlamaIndex `Document`；它的 `text` 是文字，`metadata["page_label"]` 是 PDF 页标签，而 `metadata["physical_page"]` 是你补上的实际页序。最后打印的只是检查结果，**打印不会把内容存入索引**。

## 为什么要设 ID 和 metadata

| 字段 | 表示什么 | 为什么需要 |
| --- | --- | --- |
| `source_id` | 整份讲义的业务身份 | 文件改名或内容更新后仍知道是同一份讲义 |
| 页级 `Document.id_` | 某份讲义的某一物理页 | 下次导入时能识别同一页；默认自动 ID 不适合做稳定来源标识 |
| `physical_page` | 从 1 开始数的实际 PDF 页序 | 点击引用时定位原文件的页 |
| `page_label` | PDF 内部自定义的页标签 | 与实际页序对照；它可能是罗马数字或别的编号 |
| `grade`、`subject` | 年级与学科 | 将来限定检索范围，例如只找三年级数学 |
| 内容摘要 `revision` | 当前文件字节内容的版本线索 | 后续判断资料是否变化；它会变，不当作稳定 `source_id` |

LlamaIndex 的 Node 默认继承来源 Document 的 metadata。还要注意：metadata 默认也可能加入供 embedding 或 LLM 使用的文本，后面会学习 `excluded_embed_metadata_keys`、`excluded_llm_metadata_keys`，决定哪些字段只用于过滤与追踪。[官方 Document / Node 说明](https://developers.llamaindex.ai/python/framework/module_guides/loading/documents_and_nodes/)、[官方 Schema API](https://developers.llamaindex.ai/python/framework-api-reference/schema/)

## 为什么要同时看页面图像

这份 PDF 共 3 页。第 2 页文字提取结果有 `1/6：`、`2/6：`、`3/6：`，却没有描述三条分数条各涂了几格；页面渲染后能看到这些格子。`pypdf` 检出的嵌入图片数为 0，说明“没有可直接取出的图片对象”，**不能推断页面没有图形**。本例的分数条是绘制图形。`pypdf` 文档也说明文字提取与 OCR 是不同任务；扫描页可能需要额外识别。[pypdf 官方文字提取说明](https://pypdf.readthedocs.io/en/latest/user/extract-text.html)

运行你完成的练习：

```bash
uv run python projects/rag_learning/llama/indexing_01_pdf_audit.py
```

渲染第 2 页，用自己的眼睛和 `doc.text` 对照：

```bash
pdftoppm -f 2 -l 2 -scale-to 1200 -png \
  projects/rag_learning/pdf/你的课堂讲义.pdf /tmp/rag-lesson-page
```

## 交给你写的部分与验收

你已有 `llama/file.py` 的逐页加载尝试，可以直接用它完成这一课；`llama/indexing_01_pdf_audit.py` 是供你独立重写的可选骨架。暂时不用写向量库或调用模型。请保留两次运行结果，回答：

1. 为什么选 `return_full_document=False`？若设为 `True`，本例会得到几个 `Document`？
2. `source_id`、页级 `id_`、`revision` 在文件内容改变时分别怎样变化？
3. 第 2 页的文字和分数条图形分别提供了什么信息？直接索引 `doc.text` 会漏掉什么？

验收：输出 3 个 `Document`；两次运行的页级 ID 相同；每页能显示 `source_id` 与物理页码；你能指出第 2 页缺失的视觉信息。完成后，我 review 你的代码与解释，再进入“文字 + 图形描述”的统一结构。
