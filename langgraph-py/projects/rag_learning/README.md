# 中文 RAG 学习项目

**当前交付目标：** 建成可部署的图书馆业务问答服务。实施里程碑、真实资料接入和上线验收见 [DEPLOYABLE_RAG_PLAN.md](DEPLOYABLE_RAG_PLAN.md)；下面的 LangChain 练习作为现有学习材料保留。

这个目录是一套**虚构的“澄光社区图书馆”练习知识库**。所有规则仅用于学习和评测，不代表真实机构的规定。目标是亲手完成“读取文档 → 切分 → 向量化 → 检索 → 依据证据回答 → 评估”的全过程，最后能独立查 API 文档并更换组件。

## 目录

- `corpus/`：10 篇中文 Markdown 原文；**只有这里的文件可以入库**。
- `eval/questions.md`：20 道练习题，供人工测试。
- `eval/answer_key.jsonl`：按题号排列的参考答案、问题类型和期望来源；评测时读取，不参与检索索引。
- `API_DOCS_GUIDE.md`：按实际开发顺序阅读教程与 API 文档的方法。
- `LLAMAINDEX_LEARNING_PLAN.md`：根据 LlamaIndex 官方 Ingestion 文档制定的独立练习路线，复用同一套语料和评测题。
- `DEPLOYABLE_RAG_PLAN.md`：可部署图书馆问答服务的实施路线和上线门槛。
- `exercises/step01_documents.py`：第一步的代码骨架，需要你亲手补全。
- `exercises/step02_split_documents.py`：第二步的切分实验骨架。
- `exercises/step03_retrieval.py`：第三步的 embedding 与纯检索实验骨架。

## 学习路线：每阶段只增加一个变量

| 阶段 | 动手任务 | 你需要能解释 | 验收方式 |
| --- | --- | --- | --- |
| 0. 理解数据 | 浏览 10 篇原文，先人工回答 Q01、Q06、Q18 | 什么是有答案、跨文档、无答案问题 | 能说出答案来自哪个文档和哪一节 |
| 1. 加载文档 | 完成 `exercises/step01_documents.py`，每篇 Markdown 转成一个 `Document` | `page_content`、`metadata`、`id` 的用途 | 输出恰好 10 个文档，且都带 `source`、`doc_id` |
| 2. 切分 | 用 `RecursiveCharacterTextSplitter` 切分，比较两组大小与重叠参数 | 为什么标题、规则和例外最好同处一个 chunk | 随机查看至少 5 个 chunk，来源字段未丢失 |
| 3. 纯检索 | 选一个中文效果可用的 embedding 模型，先用内存向量库检索 | embedding 与 LLM 的分工，Top K 的含义 | 对 Q01～Q17 打印问题、Top 3 片段和来源，不生成答案 |
| 4. 持久化 | 换用 Qdrant 本地持久化，处理重复入库 | collection、point、payload、向量维度 | 重启后可检索；重复入库不会造成大量重复结果 |
| 5. 回答与引用 | 把检索结果交给模型，回答中带文档编号；证据不足时说不知道 | 检索错误与生成错误的区别 | Q01～Q17 有可靠引用；Q18～Q20 不编造事实 |
| 6. 评估 | 用答案文件记录命中率、引用正确率、拒答效果 | 怎样用固定题集比较修改前后 | 每次修改保留同一批题、同一套指标 |
| 7. 进阶 | 按失败案例尝试 metadata 过滤、混合检索、重排序、查询改写 | 每项技术解决了哪类具体错误 | 新方案在题集上的收益大于复杂度与成本 |
| 8. Agent | 最后再试 LangGraph 的“判断是否检索／是否重试”流程 | 固定两步 RAG 与 Agentic RAG 的取舍 | 能解释每个节点的输入、输出和停止条件 |

建议每阶段保留一份简短实验记录：改了什么、预期改善哪道题、实际结果如何。进入下一阶段前，先完成本阶段的验收。

## 现在先做阶段 0 和 1

1. 只读 `corpus/01_读者证与账户.md`、`03_续借规则.md`、`05_图书预约.md`、`08_研讨室预约.md`，自己回答 Q01、Q06、Q18，并记下证据章节。
2. 读 [LangChain 的 `Document` API](https://reference.langchain.com/python/langchain-core/documents/base/Document) 和 [语义搜索教程中的 Create documents 小节](https://docs.langchain.com/oss/python/langchain/knowledge-base#create-documents)。按 `API_DOCS_GUIDE.md` 的方法提取输入、输出和 metadata 用法。
3. 补全 `exercises/step01_documents.py`。运行 `uv run python projects/rag_learning/exercises/step01_documents.py`，应输出 10 个文档和每个文档的 `doc_id`、`source`、正文预览。
4. 完成后把代码和输出发给我，我们只检查这一阶段，再进入切分。遇到 API 报错时，连同错误和你查到的文档位置一起发来。

## 资料与约定

- 文档编号 `CG-01`～`CG-10` 是稳定引用标识；文件路径放进 `metadata["source"]`，编号放进 `metadata["doc_id"]`。
- 题目中的日期和数字完全以 `corpus/` 内容为准，不调用外部常识补答案。
- 问题类型 `direct`、`multi_hop`、`unanswerable` 分别表示单文档、跨文档和知识库没有确定答案。
- 前几阶段不用 Tree-sitter、LlamaIndex、MCP 或复杂 Agent。只有出现对应需求时再加入。

本仓库已有 LangChain 与 LangGraph 依赖；后续切分、Qdrant 等组件按各阶段的官方文档补充到项目依赖中。

## 第二步：文档切分

第一步完成后，先运行 `uv add langchain-text-splitters`。阅读[递归切分官方指南](https://docs.langchain.com/oss/python/integrations/splitters/recursive_text_splitter)，重点找出 `chunk_size`、`chunk_overlap`、`length_function` 和中文分隔符的作用。然后补全 `exercises/step02_split_documents.py`，运行 `uv run python projects/rag_learning/exercises/step02_split_documents.py`。

先用 `chunk_size=180`、`chunk_overlap=30`、`length_function=len`，保留默认分隔符；记录片段总数和 `CG-03` 的片段边界。再只修改一个变量：把 `chunk_size` 改成 300，观察变化。最后恢复 180，并试着加入中文句号 `。`、逗号 `，`，观察句子是否更完整。检查每个片段的 `source` 和 `doc_id` 是否保留。此阶段只看检索前的数据，不调用 embedding 或 LLM。

## 第三步：Embedding 与纯检索

完成切分后，补全 `exercises/step03_retrieval.py`。先读 [Embedding 接口](https://docs.langchain.com/oss/python/integrations/embeddings) 和 [LangChain 语义搜索教程](https://docs.langchain.com/oss/python/langchain/knowledge-base)。这一步用内存向量库观察检索结果，**不生成答案**。

建议先用仓库已安装的 `langchain-openai` 中的 `OpenAIEmbeddings(model="text-embedding-3-small")`。它需要一个可用的 OpenAI API key，通过 `OPENAI_API_KEY` 环境变量提供；不要把密钥写入练习代码。如果使用第三方兼容接口，应先确认它确实提供 embedding 模型和 `/embeddings` 能力，聊天模型可用并不代表 embedding 也可用。没有可用的 embedding 服务时，告诉我你计划使用的服务，我会按对应官方文档调整练习。

第三步依次做：

1. 分别调用 `embed_documents([一段正文])` 和 `embed_query(一个问题)`，打印向量长度，不打印完整向量；两者长度应相同。
2. 用 `InMemoryVectorStore.from_documents` 将第二步得到的片段入库，再用 `similarity_search(question, k=3)` 查询。
3. 对 Q01、Q06、Q18 打印 Top 3 的 `doc_id`、`source` 和正文预览。Q18 是无答案题：向量搜索仍可能返回相似片段，不能仅凭“有结果”认定文档回答了问题。
4. 记录 Q01 的目标来源 `CG-01`、Q06 的两个目标来源 `CG-03` 与 `CG-05` 是否出现在 Top 3。暂时不要调整提示词或让聊天模型生成答案。

每次运行都会重新向量化这些片段，因为内存向量库不会保存到下一次进程。完成初次实验后保留输出，再决定是否更换模型或切分参数。
