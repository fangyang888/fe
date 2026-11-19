# 第 2 课 · 用中文问题找讲义证据

第 1 课的向量是我们按页手写的。这课用你自己的模型服务调用 Embedding API，让模型读正文和问题，再让 Milvus 比较向量。最后你能打开终端，自己判断是「没检索到证据」还是「检索到了相近但回答不了问题的文字」。

## 2.1 向量是模型算出来的一串数

**Embedding** 把一段文字编码成定长的浮点数列表。你可以记录词义相近的两段文字能否排在一起。向量的第一个数字没有公开的固定含义，也不需要人工读懂每一维。**维度**是列表中有多少个数，Milvus schema 会检查这个数。**Cosine 相似度**比较方向，查询与片段越相近，分数通常越高。它是排序的信号，无法直接当作「回答正确的概率」。[LlamaIndex Embeddings 概念](https://developers.llamaindex.ai/python/framework/module_guides/models/embeddings/) · [Milvus 相似度指标](https://milvus.io/docs/metric.md)

模型服务可能同时提供两个接口。**Embedding API** 输入文字，返回向量，供 Milvus 搜索。**聊天接口** 输入问题和证据，返回给孩子看的讲解。先在服务商文档里找「文本向量」或「Embedding」的模型名与接口地址。脚本用 `OpenAILikeEmbedding` 接 OpenAI 兼容格式，因此要确认这个服务确实有可用的 `/embeddings` 接口。

接着用两种方法调用同一个 embedding 模型。下面几行可以从完整脚本中单独拿出来理解。

```python
import os

from llama_index.embeddings.openai_like import OpenAILikeEmbedding

embedding = OpenAILikeEmbedding(
    model_name=os.environ["EDU_EMBED_MODEL"],
    api_base=os.environ["EDU_EMBED_BASE_URL"],
    api_key=os.environ["EDU_EMBED_API_KEY"],
)
text_vectors = embedding.get_text_embedding_batch([
    "同分母分数相加，分母不变，分子相加。",
    "英语词汇复习今天学习 apple 和 pear。",
])
query_vector = embedding.get_query_embedding("分母为什么不变？")

print(len(text_vectors))
print(len(text_vectors[0]), len(query_vector))
print(query_vector[:3])
```

- `get_text_embedding_batch` 输入多段正文，输出同样多的向量。`get_query_embedding` 输入一个问题，输出一个向量。
- 预期分别看到 `2` 和两个相同的维度，例如服务返回 1024 维时打印 `1024 1024`。数字由你配置的模型决定。模型换了，即使维度相同，旧向量也应使用新模型重新生成。
- SDK 会把输入和模型名发送至服务，响应的 `data` 中包含每条结果的 `embedding`。LlamaIndex 把向量提取出来。示例在连接外部服务时会发送讲义公开页和查询文字，并产生该服务的调用量。 [LlamaIndex OpenAILikeEmbedding API](https://developers.llamaindex.ai/python/framework-api-reference/embeddings/openai_like/) · [PyPI 集成包](https://pypi.org/project/llama-index-embeddings-openai-like/)

**小练习。** 先只打印向量长度和前三个数字。再把问题换成同义表达「相加以后每一份的大小为什么一样？」。你会得到不同的数字，后面用排序观察含义是否仍接近。

## 2.2 把片段与向量一一配对

[`embedding_search.py`](embedding_search.py) 读取第 1 课生成的 `chunks.json`。它先取每条的 `text`，批量生成向量，再用 `zip(chunks, vectors, strict=True)` 一条片段配一条向量。`strict=True` 使两边长度不同时立即报错，避免悄悄漏掉后面的数据。

这里从 `len(query_vector)` 取实际维度，同时检查每个正文向量的长度。原讲义练习按服务地址、模型名、模型版本和实际维度使用 `edu_lab_02_api_<摘要>` 集合。目录语料还会用 JSON 文件的内容摘要选定对应的集合。换模型或更新目录语料后，先跑一次 `--ingest`。如果服务商在同一模型名下更新了底层模型，可以设置 `EDU_EMBED_VERSION` 来显式更换版本并重建。密钥只用于鉴权。

把真实的服务地址、模型名和密钥填在项目根目录的 `.env` 中。脚本启动时会自动读取它，终端已有的环境变量优先。下面是示意值。

```dotenv
EDU_EMBED_BASE_URL=https://your-provider.example/v1
EDU_EMBED_MODEL=your-embedding-model
EDU_EMBED_API_KEY=your-api-key
```

`EDU_EMBED_BASE_URL` 是服务文档给出的 API 基础地址。若完整接口是 `https://example.com/v1/embeddings`，这里填写 `https://example.com/v1`，客户端会追加 `/embeddings`。有的服务基础路径不是 `/v1`，以该服务的文档为准。

```bash
uv run "$EDU_COURSE/embedding_search.py" "$EDU_LAB_DIR/chunks.json" \
  '同分母分数相加时，为什么分母不变？' --ingest
```

直接把脚本路径交给 `uv run`，uv 就会按脚本开头的版本和依赖准备环境。Milvus 默认使用 `/tmp/edu-milvus-lesson01.db`。如果你的练习库放在其他位置，可以在 `.env` 或终端设置 `EDU_MILVUS_URI`。 [uv 脚本依赖说明](https://docs.astral.sh/uv/guides/scripts/)

`--ingest` 代表写入本课资料。换问题时运行同一条命令，去掉 `--ingest`，脚本读取 JSON 来确认查询哪一批资料，只为问题生成向量。将来「管理员上传」和「孩子问问题」可以沿用这两条路径。

| 如果报错 | 可以先核对什么 |
| --- | --- |
| 401 或 403 | 密钥是否属于这个服务地址，是否有调用该模型的权限。 |
| 404 | 基础地址有没有重复写 `/embeddings`，模型名和服务端是否开通。 |
| 400 | 模型是否接受批量输入，是否需要服务商特定的参数，文本是否超长。 |
| 429 | 是否触发调用频率或账户额度限制。 |
| 向量维度不一致 | 查询和入库是否用了同一模型及配置，服务返回的维度是多少。 |

## 2.3 课程范围和相似度分别负责什么

把 `filter` 理解成候选集条件。`course_id` 和 `lesson_id` 都匹配的行才能参加比较，`limit=3` 决定最多返回三条。例子把一段第 2 页原文完整复制了一份，给它另一课的 `lesson_id`。不加过滤时，两条可以一起被命中；加过滤后，输出只能属于 `fractions-addition`。两个完全相同的向量可能同分，保留顺序无需一样。 [Milvus Filtered Search](https://milvus.io/docs/filtered-search.md)

```text
course_id == "math-grade-3" and lesson_id == "fractions-addition"
```

本地脚本的条件为已知的固定常量。服务端应先根据登入身份确认允许访问的课，再使用支持过滤模板的 Standalone SDK 传值。例如 `filter='course_id == {course} and lesson_id == {lesson}'`，另传 `filter_params={"course": course_id, "lesson": lesson_id}`。将来还会加有效 `build_id`。访问权由应用确认，过滤条件负责让数据库只在该范围搜索。 [Milvus Filter Templating](https://milvus.io/docs/filtering-templating.md) · [PyMilvus Search 参数](https://milvus.io/api-reference/pymilvus/v3.0.x/MilvusClient/Vector/search.md)

**小练习。** 保持问题和模型不动，只比较两组结果。把两组 Top 3 的课次、页码和片段抄下来，用笔圈出被排除的 `fractions-review`。

## 2.4 用三次查询检查结果

| 问题 | 应检查的证据 |
| --- | --- |
| 同分母分数相加为什么分母不变？ | 看 Top 3 是否包含第 2 页「每份仍是六分之一」的解释。只返回提问式的自检片段，证据还不够。 |
| 分母表示什么？ | 看 Top 3 能否找到第 1 页「平均分成几份」。如果只命中重复标题，检查切分边界。 |
| 这节课怎样把分母不同的两个分数通分？ | Milvus 可能给出近似片段。人工读正文，确认两页没有教通分的完整步骤。以后讲解模块遇到这种状态应说明教材未提供。 |

先人工读候选片段，暂时只记录页码和证据。出了问题，每次只改一个条件，例如切片方式、查询表达、Top K 或模型。保留同样三个问题做改动前后对照。只看 Top K 里的页码还不够，最后要找出哪一句支持答案。

第 2 课过关时，你能解释数据入库时谁负责生成向量、搜索时谁负责比较、哪条代码限制了课次。下一步进入[第 3 课](03_INCREMENTAL_PUBLISH.md)。

## 2.5 直接查看已经存入 Milvus 的记录

[`inspect_milvus.py`](inspect_milvus.py) 直接读取 Milvus。先设置跟入库时相同的 `EDU_MILVUS_URI`，再运行下方命令列出集合。把入库时打印的 `edu_lab_02_api_...` 集合名加到命令末尾，就能查看片段的完整正文、页码、课次和向量前五位。它只需要 Milvus 客户端，不需要读 `.env` 或调用模型。

```bash
uv run --no-project --python 3.13 \
  --with 'pymilvus==3.0.2' --with 'milvus-lite==3.2.2' \
  python -B "$EDU_COURSE/inspect_milvus.py"
```

## 2.6 检索整个 resource 目录的资料

用 `pdf_chunks.py` 导出 PDF、Markdown 和 TXT 的片段后，传入生成的 JSON。第一次带 `--ingest` 入库。后续换问题时去掉 `--ingest`。

```bash
uv run "$EDU_COURSE/embedding_search.py" a.json '1+1为什么等于2' --ingest
uv run "$EDU_COURSE/embedding_search.py" a.json '750 毫升等于多少升？'
```

目录语料在这份 JSON 自己的集合里搜索。结果显示来源文件，PDF 有数字页码时还会显示页码，Markdown 和 TXT 直接显示文件名。用第 2.5 节的方法查看时，选择脚本输出的 `edu_lab_02_corpus_...` 集合。
