# 怎样读 API 文档，直到能独立选型和排错

API 文档不是从第一页读到最后一页的教材。围绕当前要写的一行代码，按“**教程定位 → API 确认 → 本地实验 → 回到源码排错**”的顺序使用。教程说明流程，API 参考说明准确的参数、类型和方法；你当前安装的版本决定最终可运行的行为。

## 每次查一个 API，回答六个问题

以 `Document` 为例，先打开 [官方 API 参考](https://reference.langchain.com/python/langchain-core/documents/base/Document)，再查 [官方教程](https://docs.langchain.com/oss/python/langchain/knowledge-base)。在笔记里写下：

1. **从哪里导入？** 例如 `from langchain_core.documents import Document`。包名和导入路径可能不同。
2. **输入是什么？** 构造对象时正文是字符串；metadata 是字典。分清必填、可选和默认值。
3. **输出是什么？** 得到 `Document` 对象；后续检索通常返回 `Document` 列表。
4. **最小调用怎样写？** 只写三到五行，打印对象及其关键字段。
5. **边界条件是什么？** 缺失 `source` 会怎样？空文档、重复 ID 如何处理？这些需自己实验或读相关实现。
6. **本项目用它解决什么问题？** `page_content` 放正文，`metadata["source"]` 放路径，`metadata["doc_id"]` 放稳定文档编号；以后引用答案时要靠这些字段。

不要只记方法名。能预测输出类型、解释字段何时保留或丢失，才算真正会用。

## 按项目阶段查文档

| 阶段 | 先看教程／概念 | 再看 API 时重点查什么 |
| --- | --- | --- |
| 加载 | [语义搜索教程](https://docs.langchain.com/oss/python/langchain/knowledge-base) | [`Document`](https://reference.langchain.com/python/langchain-core/documents/base/Document) 的正文、metadata、id |
| 切分 | [递归切分指南](https://docs.langchain.com/oss/python/integrations/splitters/recursive_text_splitter) | `chunk_size`、`chunk_overlap`、`length_function`、`split_documents` 的输入输出 |
| 向量化 | [Embedding 概览](https://docs.langchain.com/oss/python/integrations/embeddings) | `embed_documents` 与 `embed_query`，模型和向量维度 |
| 检索 | [Retriever 概览](https://docs.langchain.com/oss/python/integrations/retrievers) | `similarity_search`、`as_retriever`、`invoke` 及返回的文档 |
| Qdrant | [Qdrant 的 LangChain 集成](https://qdrant.tech/documentation/frameworks/langchain/) | 本地持久化、collection、检索模式、重复写入与过滤 |
| Agent | [LangGraph 自定义 RAG 教程](https://docs.langchain.com/oss/python/langgraph/agentic-rag) | 节点状态、条件边、检索工具的输入输出 |

中文切分尤其要观察标点和语义边界。[官方递归切分指南](https://docs.langchain.com/oss/python/integrations/splitters/recursive_text_splitter)说明默认分隔符可能切开中文词，并给出加入中文句号、逗号等分隔符的例子。这里的 `chunk_size` 按 `length_function` 计算；`len` 是字符数，不等于模型 token 数。

## 用本地环境验证版本和签名

文档页面和已安装包可能不同步。先查版本：

```bash
uv run python -c 'from importlib.metadata import version; print("langchain", version("langchain")); print("langchain-core", version("langchain-core"))'
```

再在一个小实验里查签名，确认实际可用的参数：

```python
import inspect
from langchain_core.documents import Document

print(inspect.signature(Document))
print(Document(page_content="测试", metadata={"source": "demo.md"}))
```

若教程代码运行失败，按顺序检查：包是否安装、导入路径、当前包版本、方法签名、输入类型、返回类型。最后再看错误栈指向的具体调用。不要先猜是模型或数据库的问题。

## 从“会调”到“熟练”再到“精通”

- **会调：** 能按教程写出最小例子，并说清每步的输入输出。
- **熟练：** 不复制完整教程，也能用 API 参考替换 embedding 或 vector store；能根据报错定位参数、版本或数据问题。
- **精通：** 面对真实失败样本，设计对照实验，量化效果；能阅读接口与源码，判断某个功能是否适合当前数据、成本和延迟要求。

本项目每个阶段都让你做一次小实验。记录“官方文档说什么、本地实际输出是什么、差异为何出现”。这一习惯比背 API 名称更有用。
