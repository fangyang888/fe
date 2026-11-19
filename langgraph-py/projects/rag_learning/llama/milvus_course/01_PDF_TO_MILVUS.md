# 第 1 课 · 把讲义从 PDF 放进 Milvus

完成这课后，你能从 Milvus 查回一段讲义，还能指出它来自第几页。本课的向量由我们手工指定，先把数据库的输入、输出看明白。

## 1.1 读出一页 Document

先打开 [`pdf_chunks.py`](pdf_chunks.py)。第一行和最后两行分别讲明脚本用途和运行入口。`Path(__file__).resolve()` 得到当前代码文件的绝对路径，`parents[2]` 回到 `rag_learning/`，因此从仓库其它目录运行时，代码仍能找到 PDF。

```python
pages = PDFReader(return_full_document=False).load_data(file=PDF_PATH)
first_page = pages[0]
print(first_page.text[:80])
print(first_page.metadata)
```

- `PDFReader` 是读取器，负责拿到 PDF 中可提取的文字。`load_data` 返回列表。
- `return_full_document=False` 让这份三页讲义返回 3 个 `Document`。把 `False` 改成 `True` 试一次，比较列表长度，再恢复。
- `Document.text` 是正文，`Document.metadata` 是一个字典，用来放文件名、页码和教材 ID。`[:80]` 只拿前 80 个字符预览。
- `pages[0]` 是第一页，`pages[1]` 是第二页。对外引用从第 1 页数起，所以用 `enumerate(pages, start=1)`。PDF 自己记录的 `page_label` 还可能是罗马数字或特殊标签，引用时另存我们的 `physical_page`。

你原来的 [`file.py`](../file.py) 在 `pdf_reader.images` 会报错。想看嵌入图片，可以用 `pdf_reader.pages[physical_page - 1].images`。本讲义第 2 页用了绘制出来的分数条，文字读取能看到 `1/6` 等标签，无法告诉你涂了哪些格子。对照原页就能发现这一点。 [LlamaIndex Document / Node](https://developers.llamaindex.ai/python/framework/module_guides/loading/documents_and_nodes/) · [pypdf 文字提取](https://pypdf.readthedocs.io/en/stable/user/extract-text.html) · [Python pathlib](https://docs.python.org/3.13/library/pathlib.html)

**小练习。** 对照 PDF 第 2 页，写下「文字已经有的解释」和「看图才知道的内容」各一项。

## 1.2 让每个 Node 知道自己来自哪里

搜索通常返回一小段有用文字。`SentenceSplitter` 负责从一页 `Document` 切出一个或几个 `Node`。下面三行放在切分前，Node 才会继承正确的来源。

```python
document.id_ = f"{SOURCE_ID}:page:{page_number}"
document.metadata["source_id"] = SOURCE_ID
document.metadata["physical_page"] = page_number
```

`id_` 标识一页，`source_id` 标识整份教材。运行两次应看到同一个页级 ID。`node.ref_doc_id` 指回父 `Document`，`node.metadata["physical_page"]` 可用来展示页码。稍后会另给 Milvus 那一行分配主键，三个 ID 有不同用途。

`chunk_size=256` 是切分的 token 预算。汉字数、UTF-8 字节数和 token 数是三种不同的计数。`chunk_overlap=20` 允许上一段末尾有些内容出现在下一段开头。切分器按句子或更细的边界取内容，实际重叠可少于设置值。`pages[:2]` 只切前两页，因为第 3 页有练习参考答案。

```bash
.venv/bin/python -B "$EDU_COURSE/pdf_chunks.py" --output "$EDU_LAB_DIR/chunks.json"
```

当前环境中这份讲义共 3 个 `Document`，前两页共得到 4 个 `Node`。查看 JSON，你应看到 `course_id`、`lesson_id`、`source_id`、`physical_page`、`chunk_number` 和 `text`。这个文件就是交给 Milvus 脚本的输入。 [SentenceSplitter API](https://developers.llamaindex.ai/python/framework-api-reference/node_parsers/sentence_splitter/)

**小练习。** 把 overlap 改成 `0`，用另一个输出文件跑一次。比较两个版本中同一页相邻 Node 的尾部和开头。比较结束后恢复示例参数，再重新输出 `chunks.json`。

## 1.3 认识集合、主键、向量字段和索引

把 **collection** 理解为一张存片段的表。每个片段是一行，**schema** 是它有哪些列、每列接受什么类型的规则。**主键**用来精确识别一行。以下是 [`milvus_basics.py`](milvus_basics.py) 里几个关键字段。

| 字段 | 类型 | 为什么存它 |
| --- | --- | --- |
| `id` | `VARCHAR` 主键 | `upsert` 用它决定哪个片段要写入或替换。`auto_id=False` 由程序分配稳定值。 |
| `course_id`、`lesson_id` | `VARCHAR` | 按课程和课次过滤。 |
| `source_id`、`build_id` | `VARCHAR` | 回到教材，或者只查当前发布的批次。 |
| `physical_page`、`text` | `INT64`、`VARCHAR` | 返回原文片段和物理页码。`VARCHAR` 的长度限制按 UTF-8 字节核对。 |
| `dense` | `FLOAT_VECTOR` | 一串浮点数。第 1 课令维度 `dim=3`，每条记录和每个查询向量都须有三个数。 |

`index_type="FLAT"` 让例子用精确向量比较。`metric_type="COSINE"` 指定按方向相似程度比较，值越大越像。集合需要加载后才能提供检索。脚本执行 `create_collection` 后显式调用 `load_collection`，二次运行也会确保集合处于可查状态。 [集合创建 API](https://milvus.io/api-reference/pymilvus/v3.0.x/MilvusClient/Collections/create_collection.md) · [主键与 AutoID](https://milvus.io/docs/primary-field.md) · [距离指标](https://milvus.io/docs/metric.md)

## 1.4 真正写进去，再用两种方法读回来

先按[课程入口](README.md#从仓库根目录运行)设置 `EDU_MILVUS_URI`。这个命令额外带了 Lite 包，URI 是 HTTP 时会连接服务器，是文件路径时使用 Lite。

```bash
uv run --no-project --python 3.13 \
  --with 'pymilvus==3.0.2' --with 'milvus-lite==3.2.2' \
  python -B "$EDU_COURSE/milvus_basics.py" "$EDU_LAB_DIR/chunks.json"
```

- `upsert(collection, data=rows)` 写入字典列表。同一个主键再次写入会替换现有实体。这个例子把固定的课次和片段编号拼进主键。第 3 课会加上真正的发布批次。
- `query(filter=..., output_fields=...)` 按普通字段找符合条件的行。例子用它核对实际写了哪些 ID 和页码。`output_fields` 决定返回哪些列。
- `search(data=[[0, 1, 0]], limit=3, ...)` 按向量找最像的三个片段。外层列表表示可以一次送入多个查询，`result[0]` 取第一个查询的命中列表。命中的正文和页码从 `hit["entity"]` 读取。

脚本把第一页设成 `[1, 0, 0]`，第二页设成 `[0, 1, 0]`。所以查 `[0, 1, 0]` 时，第二页会排前面。这是人为设置的排序，两块同页片段同分时可交换位置。`distance` 在此对应 COSINE 的分数，换成 L2 后排序方向会变。 [Upsert API](https://milvus.io/api-reference/pymilvus/v3.0.x/MilvusClient/Vector/upsert.md) · [Query API](https://milvus.io/api-reference/pymilvus/v3.0.x/MilvusClient/Vector/query.md) · [Search API](https://milvus.io/api-reference/pymilvus/v3.0.x/MilvusClient/Vector/search.md)

**小练习。** 用相同命令再跑一次，再加 `--read-only` 启动一个新进程。你应能读回四个原来的主键。然后把查询向量改成 `[[1.0, 0.0, 0.0]]`，猜哪一页会排第一。试一个只有两个数的向量，观察错误，再恢复成三维。

| 如果看到了 | 优先检查 |
| --- | --- |
| 报连接失败 | 检查是 HTTP 开发服务还是 `.db` 路径、端口是否可达。HTTP 服务可查 `http://127.0.0.1:9091/healthz`。 |
| 报维度不一致 | 检查 schema 的 `dim`、写入的向量长度和查询长度。换维度时给新练习建新集合。 |
| `query` 是空列表 | 检查当前连接的数据库、集合名和过滤值。先核对 `upsert` 的结果。 |
| `query` 有记录但 `search` 没结果 | 检查集合是否加载、向量字段 `dense`、过滤条件和查询向量。 |

第 1 课过关的证据是四个稳定主键、一条能追到第 2 页的 `search` 输出，以及重开进程的读取结果。下一步进入[第 2 课](02_EMBEDDING_SEARCH.md)。
