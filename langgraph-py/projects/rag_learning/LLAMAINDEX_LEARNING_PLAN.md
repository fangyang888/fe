# LlamaIndex RAG 学习路线

要按“深入掌握并上线”的目标学习，请以 [LLAMAINDEX_MASTERY_PLAN.md](LLAMAINDEX_MASTERY_PLAN.md) 为主路线；本文件保留原来的七次组件练习，作为入门参考。

这份文件保留为组件练习参考。当前主目标是可上线的图书馆问答服务，交付顺序与上线门槛见 [DEPLOYABLE_RAG_PLAN.md](DEPLOYABLE_RAG_PLAN.md)。

这条路线以 [LlamaIndex 的 Loading Data (Ingestion)](https://developers.llamaindex.ai/python/framework/understanding/rag/loading/) 为起点，最终做出能引用来源、遇到无依据问题会拒答的中文图书馆问答。建议按 **7 次练习，每次约 60～90 分钟** 推进；时间仅作安排参考，以每次的验收结果决定是否继续。

## 起点与材料

- `corpus/` 已有 10 篇 Markdown。只把这些文件作为知识库输入。
- `eval/questions.md` 有 20 道题；`eval/answer_key.jsonl` 是评测答案，**不能入库**。
- `exercises/step01_documents.py` 和 `step02_split_documents.py` 是 LangChain 路线，已能分别输出 10 篇文档和 29 个片段；`step03_retrieval.py` 仍是待完成的骨架。
- 当前项目没有安装 LlamaIndex。以下练习建议放在新目录 `llamaindex_exercises/`，复用 `corpus/` 和 `eval/`，不把 LangChain 的 `Document` 直接传给 LlamaIndex。先只围绕本地 Markdown 做实验，其他 Reader 和 LlamaParse 放到最后按需求选学。

## 先建立全局认识

画出两条流程，并在每个箭头写出输入、输出：

```text
入库：Markdown 文件 → Document（原文与 metadata）→ Node（片段）→ embedding → Index → 持久化
提问：问题 → retriever 找 Node → 可选后处理 → LLM 基于证据生成答案与引用
```

其中 [加载文档](https://developers.llamaindex.ai/python/framework/understanding/rag/loading/) 主要讲 Reader、Document 和 transformations；[索引](https://developers.llamaindex.ai/python/framework/understanding/rag/indexing/)、[存储](https://developers.llamaindex.ai/python/framework/understanding/rag/storing/) 和 [查询](https://developers.llamaindex.ai/python/framework/understanding/rag/querying/) 分别补全后续环节。不要把“检索到了相似片段”等同于“片段足以回答”。

## 七次练习

| 次数 | 主题与阅读 | 动手产出 | 通过标准 |
| --- | --- | --- | --- |
| 1 | [RAG 概览](https://developers.llamaindex.ai/python/framework/understanding/rag/) + [加载文档](https://developers.llamaindex.ai/python/framework/understanding/rag/loading/) 的 Loaders | 用 `SimpleDirectoryReader` 或手动构造 LlamaIndex `Document` 读取 `corpus/`；记录 `doc_id`、`source`、正文预览 | 恰好 10 篇；每篇都有稳定的 `CG-xx` 编号与路径；解释 Reader 和 Document 的职责 |
| 2 | 同一篇文档的 Transformations、[Document / Node](https://developers.llamaindex.ai/python/framework/module_guides/loading/documents_and_nodes/) | 用 `SentenceSplitter` 比较两组 `chunk_size` / `chunk_overlap`，打印 `CG-03` 的所有 Node | 能解释片段如何继承来源、为何规则与例外可能被切开；记录两组片段数和边界 |
| 3 | [Embedding](https://developers.llamaindex.ai/python/framework/module_guides/models/embeddings/) + [索引](https://developers.llamaindex.ai/python/framework/understanding/rag/indexing/) | 选定一个能处理中文的 embedding，建本地 `VectorStoreIndex`；只用 retriever 查 Q01、Q06、Q18，输出 Top 3 的片段与来源 | Q01 可见 `CG-01`；Q06 检查 `CG-03`、`CG-05` 是否都出现；能解释 Q18 即使有结果也可能无答案 |
| 4 | [存储](https://developers.llamaindex.ai/python/framework/understanding/rag/storing/) + [保存与加载](https://developers.llamaindex.ai/python/framework/module_guides/storing/save_load/) | 保存索引，另起进程重新加载并查同一问题；观察重复构建的影响 | 重启后无需重新 embedding 即可检索；记录索引目录、模型配置与重复入库策略 |
| 5 | [查询](https://developers.llamaindex.ai/python/framework/understanding/rag/querying/) | 在纯检索基线之上调用 QueryEngine，显示回答及 `source_nodes`；用提示词要求引用 `CG-xx`，证据不足时明确说不知道 | Q01、Q06 的回答能对应来源；Q18～Q20 不编造；能区分检索漏召回与生成误用证据 |
| 6 | [评估](https://developers.llamaindex.ai/python/framework/understanding/evaluating/evaluating/) | 固定 20 道题，记录检索来源命中、回答事实正确、引用正确、无答案拒答 | 形成一次可复现的基线记录；每个失败题标注失败环节，不只报总分 |
| 7 | 回看 [Ingestion Pipeline](https://developers.llamaindex.ai/python/framework/module_guides/loading/ingestion_pipeline/) 与 Querying 的后处理 | 只针对第 6 次发现的具体失败，依次试一个改动，例如切分、Top K、metadata 或后处理 | 同一题集、同一模型下做前后对比，写出提升、退化与额外成本 |

## 每次实验记录模板

在 `llamaindex_exercises/notes.md` 追加一小段即可：

```text
日期 / 当前步骤：
使用的库版本、embedding / LLM：
本次只改变的变量：
预期影响的题目：
实际输出或指标：
失败样例与下一步假设：
```

评估时建议先分开看：**检索来源命中率**（目标 `source_ids` 是否进入 Top K）、**回答正确率**、**引用正确率**、**Q18～Q20 拒答率**。跨文档题必须检查所有目标来源；调整参数前先保存原始输出，避免凭印象判断。

## 现在开始第 1 次

1. 先独立看 `eval/questions.md` 的 Q01、Q06、Q18，在 `corpus/` 中找证据，不打开答案文件。
2. 阅读 [加载文档](https://developers.llamaindex.ai/python/framework/understanding/rag/loading/) 中的 `SimpleDirectoryReader`、直接创建 `Document` 和 metadata 示例。
3. 为这条路线单独安装 LlamaIndex 核心包，并在 `llamaindex_exercises/01_load.py` 做最小实验：只读 `corpus/*.md`，打印数量、编号、来源与正文预览。所选 embedding 和 LLM 的集成包等走到对应步骤再装。
4. 用“10 篇、编号与路径都完整”验收。确认这些值以后能一路传到检索结果，再进入切分。

LlamaIndex 的 `Document` / `Node` 与现有 LangChain `Document` 是两套对象；学习时比较概念和输出，代码保持独立。待基础 RAG 做通、评测结果稳定后，再考虑接入 LangGraph 的 Agent 流程。
