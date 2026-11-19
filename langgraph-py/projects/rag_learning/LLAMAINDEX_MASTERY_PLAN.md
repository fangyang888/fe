# LlamaIndex 深入学习与上线实战路线

目标：**独立设计、实现、评估、部署并维护一个有可靠引用的中文 RAG 服务**。跑通示例调用不算通过；每阶段都要能解释原理、检查中间结果、定位失败，并留下可复现的实验记录。

首个实战项目是本目录的图书馆业务问答服务，上线要求见 [DEPLOYABLE_RAG_PLAN.md](DEPLOYABLE_RAG_PLAN.md)。完成后，再把同一套资料管线迁移到小学课堂 PDF。试卷识别、批改与学情分析属于后续应用层，须单独验收。

学习进度和每次验收结果记录在 [LLAMAINDEX_PROGRESS.md](LLAMAINDEX_PROGRESS.md)。

## 仓库起点

- `corpus/` 有 10 篇虚构中文 Markdown，作为唯一入库语料；`eval/questions.md` 有 20 道题，`eval/answer_key.jsonl` 只用于评测，绝不入库。
- `exercises/step01_documents.py`、`step02_split_documents.py` 是 LangChain 练习；`step03_retrieval.py` 尚未完成。LlamaIndex 的 `Document` / `Node` 与 LangChain 对象不同，练习放在独立的 `llamaindex_exercises/`。
- 目前项目依赖中还没有 LlamaIndex、Qdrant 或 HTTP 服务框架。按阶段需要安装并锁定版本。
- 先在本地语料上建立可复现基线，再接真实资料。虚构语料的结果不能当作上线验收。

## 怎样才算掌握

每阶段按五项验收：

1. **解释：** 不看代码，说清输入、输出、关键参数和失败方式。
2. **实现：** 独立完成最小实现，能在新进程或新环境复现。
3. **观察：** 打印或记录关键中间产物，不只看最终回答。
4. **诊断：** 对至少一个失败样例给出证据、原因和下一次只改变一个变量的实验。
5. **迁移：** 说出这一步用于课堂 PDF 时新增的风险，如页码、扫描质量或访问权限。

教学循环：官方文档定位 → 关键概念提问 → 你动手 → 我按证据 review → 修正 → 进入下一阶段。进度由验收结果决定。

## 全局模型

```text
离线入库：源文件 → Reader → Document + metadata → transformation → Node
         → embedding → index / vector store → 持久化与版本管理

在线问答：问题 → 检索 Node → 过滤 / 重排 → 证据检查
         → 回答合成 → 答案 + 可核对的原文引用

质量闭环：固定题集 → 检索评测 + 回答评测 + 引用核对 + 拒答评测
         → 失败归因 → 单变量实验 → 发布 / 回滚
```

官方总览：[RAG 概览](https://developers.llamaindex.ai/python/framework/understanding/rag/)、[数据加载](https://developers.llamaindex.ai/python/framework/understanding/rag/loading/)、[索引](https://developers.llamaindex.ai/python/framework/understanding/rag/indexing/)、[存储](https://developers.llamaindex.ai/python/framework/understanding/rag/storing/)、[查询](https://developers.llamaindex.ai/python/framework/understanding/rag/querying/)。

## 阶段与交付

| 阶段 | 深入学习与实验 | 必须交付的证据 |
| --- | --- | --- |
| 0. 人工基线 | 只看语料和问题，手工回答 Q01、Q06、Q18；标出证据和无答案原因 | 三题的来源判断；区分“检索不到”和“资料本来没有” |
| 1. Reader / Document | 对比 `SimpleDirectoryReader` 与手动构造 `Document`；检查文件类型、编码、稳定 ID、metadata、错误文件处理 | 10 篇原文的 `doc_id`、`source`、标题、正文预览；重复运行 ID 不变 |
| 2. Node / 切分 | 用 `SentenceSplitter` 比较两组 `chunk_size` / `chunk_overlap`；检查父文档关系、metadata 继承、中文句边界和规则例外被切开的情况 | 两组 Node 数、边界样例、Q06 相关规则是否仍可独立理解 |
| 3. Embedding / 索引 | 显式选中文可用的 embedding；验证文档和查询向量；用 `VectorStoreIndex` 建索引，比较关键词查找与语义检索 | 模型名、维度、调用成本；Q01、Q06、Q18 的 Top K Node 和来源；不调用回答模型 |
| 4. 检索诊断 | 比较 Top K、metadata 过滤、不同切分；区分召回与排序问题；需要时再试混合检索或重排 | 固定题集下的来源命中率、跨文档全来源命中率、失败题归因与改动前后对照 |
| 5. 持久化 / 文档生命周期 | 保存与重载索引；接 Qdrant；用稳定 ID 和内容校验处理新增、更新、删除、重复导入；演练索引版本切换 | 重启后检索一致；重复导入无重复；修改/删除后旧内容不可见；可回滚 |
| 6. 回答 / 引用 / 拒答 | 分开 retriever、node postprocessor、response synthesizer；检查 `source_nodes`；明确证据不足条件 | Q01、Q06 的回答逐句能由引用支持；Q18～Q20 拒答；不能只因 Top K 有结果就回答 |
| 7. 评测体系 | 固定语料、题集、模型和参数版本；分开检索、答案事实、引用支持、无答案拒答；人工复核高风险样例 | 可复现的逐题报告、聚合指标、失败分类；改变参数后有可比较的基线 |
| 8. 服务化 | 导入命令、HTTP API、最小网页；输入校验、超时、错误状态、请求 ID；记录耗时和模型调用量 | `POST /v1/ask` 返回答案、状态和可打开的来源；依赖故障有明确错误；重启可用 |
| 9. 上线运维 | 容器化、配置/密钥、健康检查、限流、日志与指标、备份恢复、发布/回滚；接经授权的真实资料 | 预发布演练资料更新、服务重启、向量库/模型故障、恢复和回滚；业务方核对真实题集 |
| 10. PDF 迁移 | 对照文本 PDF 和扫描 PDF；评估解析/OCR 的页码、表格、图片、公式；按年级/科目/章节过滤 | 每个引用能返回原文件和页码；低质量页能标记复核；与 Markdown 基线分开评测 |

### 每阶段优先读的官方文档

- 1～2：[Loading Data](https://developers.llamaindex.ai/python/framework/understanding/rag/loading/)、[Documents / Nodes](https://developers.llamaindex.ai/python/framework/module_guides/loading/documents_and_nodes/)、[Ingestion Pipeline](https://developers.llamaindex.ai/python/framework/module_guides/loading/ingestion_pipeline/)。
- 3～4：[Embeddings](https://developers.llamaindex.ai/python/framework/module_guides/models/embeddings/)、[Indexing](https://developers.llamaindex.ai/python/framework/understanding/rag/indexing/)、[Querying](https://developers.llamaindex.ai/python/framework/understanding/rag/querying/)。
- 5：[Storing](https://developers.llamaindex.ai/python/framework/understanding/rag/storing/)、[Persisting & Loading](https://developers.llamaindex.ai/python/framework/module_guides/storing/save_load/)、[Document Management](https://developers.llamaindex.ai/python/framework/module_guides/indexing/document_management/)、[QdrantVectorStore API](https://developers.llamaindex.ai/python/framework-api-reference/storage/vector_store/qdrant/)。
- 6～7：[Querying](https://developers.llamaindex.ai/python/framework/understanding/rag/querying/)、[Evaluating](https://developers.llamaindex.ai/python/framework/understanding/evaluating/evaluating/)、[Observability](https://developers.llamaindex.ai/python/framework/module_guides/observability/)。
- 10：从 [Loading Data 的 Reader 入口](https://developers.llamaindex.ai/python/framework/understanding/rag/loading/) 开始；根据真实 PDF 的失败样例，再决定是否采用专门解析服务或 OCR。

阅读方式：先找该页的概念、最小示例和限制；写出输入/输出与默认值；跑通后故意制造一个失败案例；最后回查 API Reference。官方文档会更新，遇到版本差异以本项目锁定版本和实际运行结果为准。

## 上线质量门槛

先按 [DEPLOYABLE_RAG_PLAN.md](DEPLOYABLE_RAG_PLAN.md) 完成纵向切片，再用真实资料和真实问题形成基线，与业务方确认每类问题的门槛。至少分别检查：

- **资料完整性：** 新增、修改、删除、重复导入、失败重试、版本回滚。
- **检索：** 目标来源是否进入 Top K；跨文档问题所需来源是否全部进入；错误来源是否被权限过滤。
- **生成：** 答案事实、引用是否真正支持该断言、无依据问题是否拒答。
- **运行：** 端到端延迟、调用成本、超时、限流、备份恢复、故障时的用户可见状态。
- **业务与数据：** 真实来源链接可访问，旧规定已失效，管理员导入受控，日志不记录不必要的敏感内容。

## 实验记录模板

在 `llamaindex_exercises/notes.md` 持续追加：

```text
日期 / 阶段 / Git 提交或代码版本：
文档版本 / 模型与 embedding / 依赖版本：
本次假设与只改变的变量：
预期改善的题目和指标：
关键中间输出（Document / Node / Top K / source_nodes）：
逐题结果与失败归因：
延迟、调用量与成本：
下一步：
```

## 现在开始：第 0～1 阶段

1. **先不要打开答案文件。** 阅读 `eval/questions.md` 的 Q01、Q06、Q18，并在 `corpus/` 中手工找证据。每题写“答案或拒答理由 + 文档编号 + 原文位置”。
2. 阅读 [Loading Data 的 Loaders 部分](https://developers.llamaindex.ai/python/framework/understanding/rag/loading/) 和 [Documents / Nodes](https://developers.llamaindex.ai/python/framework/module_guides/loading/documents_and_nodes/)。用自己的话回答：Reader、Document、metadata、`doc_id` 分别承担什么职责？为什么 `answer_key.jsonl` 不能入库？
3. 给 LlamaIndex 练习单独建 `llamaindex_exercises/01_load.py`；只安装此练习所需的包。只读 `corpus/*.md`，打印文档数、稳定编号、来源和正文预览；重复运行验证 ID 稳定。暂不建索引或调用模型。
4. 把三题的人工判断、上述概念回答、代码和两次运行输出发给我。我会按“内容正确、来源可追溯、ID 稳定、无评测答案泄漏”逐项 review，再进入切分。

后续课堂 PDF 项目复用这条知识库链路，但要另建**试卷识别、评分标准、逐题批改、学情记录和人工复核**模块。图书馆问答服务上线与课堂批改产品上线分别验收。
