# 从一份讲义学 Milvus 和增量入库

这套课接在你已有的 [`file.py`](../file.py) 和 [`splitter.py`](../splitter.py) 后面。以[三年级分数讲义](../../pdf/你的课堂讲义.pdf)为例，从能读懂终端输出开始，逐步做到「学生查得到已发布资料，管理员能改版、重试和回滚」。[教育项目上线路线](../../EDUCATION_RAG_ROADMAP.md)

| 课次 | 一次学习一个小问题 | 跑哪个例子 |
| --- | --- | --- |
| [01 · 从 PDF 到 Milvus](01_PDF_TO_MILVUS.md) | Reader 返回什么 → 片段从哪一页来 → 集合如何定义 → `query` 和 `search` 查到什么 | [`pdf_chunks.py`](pdf_chunks.py)、[`milvus_basics.py`](milvus_basics.py) |
| [02 · 真实语义检索](02_EMBEDDING_SEARCH.md) | 文本怎么变成向量 → 怎么限定课程 → Top 3 怎么验收 | [`embedding_search.py`](embedding_search.py) |
| [03 · 重复上传和发布改版](03_INCREMENTAL_PUBLISH.md) | 文件摘要怎么比较 → 三种 ID 各管什么 → PostgreSQL 怎么切换可见版本 | [`publish_lab.sql`](publish_lab.sql) 的第 1～3 步 |
| [04 · 写失败了怎么恢复](04_FAILURE_AND_ROLLBACK.md) | 中断、幂等重试、迟到任务、下架和清理分别怎么验证 | [`version_visibility.py`](version_visibility.py)、[`publish_lab.sql`](publish_lab.sql) 的第 4～6 步 |

## 从仓库根目录运行

终端当前目录应是 `langgraph-py`，这里有 `pyproject.toml` 和 `projects/`。以下变量仅在当前终端会话生效。用同一个终端做四课，`EDU_LAB_DIR` 下面存放本次练习的 JSON 和可选的本地数据库。

```bash
export EDU_COURSE=projects/rag_learning/llama/milvus_course
export EDU_LAB_DIR=$(mktemp -d /tmp/edu-rag-course.XXXXXX)
.venv/bin/python -B "$EDU_COURSE/pdf_chunks.py"
```

这条命令只读 PDF，用现有 `.venv`。看到 3 条 `Document` 和 4 条 `Node` 后，才需要选数据库环境。

- **练习和预发可以用独立的 Milvus Standalone。** 准备好开发实例后，在当前终端设置 `export EDU_MILVUS_URI=http://127.0.0.1:19530`，或换成你的独立开发服务地址。浏览器端口 `9091` 可做健康检查，Python 客户端连接 `19530`。 [Milvus Standalone 官方部署](https://milvus.io/docs/install_standalone-docker-compose.md)
- **手边没有服务时，可以用 Milvus Lite 先完成本地练习。** 设置 `export EDU_MILVUS_URI="$EDU_LAB_DIR/learning.db"`，直接沿用各课的 `uv run` 命令。这个路径是本地存储位置。当前例子用的 Milvus Lite 3.2.2 会创建同名目录，重开进程要继续用同一个路径。教学代码用固定条件兼容 Lite，正式部署需在 Standalone 上重新验收过滤、一致性和重启。 [Milvus Lite 官方说明](https://milvus.io/docs/milvus_lite.md)
- **第 2 课用你自己的模型服务。** 配置支持 OpenAI 兼容 Embedding API 的服务地址、embedding 模型名和密钥。第 3 课再连接本地开发 PostgreSQL，练习 SQL 只创建会话临时表，结束时回滚。

后续示例使用 `uv run --no-project --python 3.13 --with …`。`--no-project` 让练习独立于仓库依赖，`--with` 给这次运行补包。示例固定 PyMilvus 3.0.2，方便与参考工程对照。 [uv 官方脚本指南](https://docs.astral.sh/uv/guides/scripts/)

## 每个小点都这样学

1. 先在课件找到一个要回答的问题，例如「把 `limit=3` 改成 `1` 会怎样？」在运行前写下自己的猜测。
2. 跑一次示例，找到那一行输出。再只改一个参数，比较两次结果。
3. 查该小节末尾的官方 API，先看参数与返回值。用自己的话解释这行代码以后放在哪个业务步骤里。

现在只读[第 1 课的 1.1](01_PDF_TO_MILVUS.md#11-读出一页-document)，把 `Document`、`metadata` 和物理页码这三个词弄清楚。
