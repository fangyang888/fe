# RAG 从入门到精通：商城客服项目实战

这套文档以当前项目的 React、NestJS、LangChain.js、MySQL、Redis 和单 Agent 服务为练习场。目标不是背诵名词，而是逐步做出一个可检索、可引用、可评估、可上线的商城客服知识库。

已有的两篇第 8 课文档继续作为参考手册：

- [RAG 核心原理与学习要点](../LESSON_08_RAG_KEY_POINTS_AND_LEARNING_GUIDE.md)
- [生产级客服知识库与 RAG](../LESSON_08_PRODUCTION_RAG_AND_KNOWLEDGE_BASE.md)

本目录负责把内容拆成可以按顺序学习和验收的独立章节。

---

## 一、学完后能做什么

完成全部章节后，你应该能够：

- 判断一个问题应该走 RAG、业务 Tool、聊天记忆还是组合流程。
- 独立实现文档解析、切分、Embedding 和向量检索。
- 实现带可信引用和无答案策略的 2-Step RAG。
- 使用固定数据集评估检索质量和回答质量。
- 处理文档版本、权限、更新、删除和 Embedding 迁移。
- 根据失败案例加入 BM25、Hybrid Search、RRF、Rerank 和 Parent-Child。
- 防范跨租户泄漏、伪造引用和间接 Prompt Injection。
- 判断什么时候需要 Agentic RAG、LangGraph、GraphRAG 或多模态 RAG。

---

## 二、章节地图

### 阶段 A：从零做出最小 RAG

1. [第 01 章：认识 RAG 与数据边界](./01-rag-foundations-and-boundaries.md)
2. [第 02 章：离线索引与在线问答](./02-indexing-and-query-pipelines.md)
3. [第 03 章：Document、Chunk 与 Metadata](./03-document-chunk-and-metadata.md)
4. [第 04 章：Embedding 与向量检索](./04-embeddings-and-vector-search.md)
5. [第 05 章：实现最小可观察检索](./05-build-minimum-retrieval.md)

阶段成果：输入一个问题，接口能够返回可追踪来源的 TopK Chunk，但暂时不让模型回答。

### 阶段 B：从检索升级为可信问答

6. [第 06 章：2-Step RAG、引用与拒答](./06-two-step-rag-citations-and-refusal.md)
7. [第 07 章：建立 Golden Dataset 与评估体系](./07-rag-evaluation.md)
8. [第 08 章：持久化、版本、更新与删除](./08-persistence-versioning-and-reindexing.md)
9. [第 09 章：权限、安全与生产边界](./09-permissions-security-and-production-boundaries.md)

阶段成果：系统可以根据证据回答、验证引用、拒绝编造，并且能够证明质量和权限隔离有效。

### 阶段 C：检索优化与高级架构

10. [第 10 章：BM25、Hybrid Search、RRF 与 Rerank](./10-hybrid-search-and-rerank.md)
11. [第 11 章：多轮查询改写与上下文工程](./11-query-rewrite-and-context-engineering.md)
12. [第 12 章：可观测性、性能、成本与发布](./12-observability-performance-and-release.md)
13. [第 13 章：Agentic RAG、LangGraph 与毕业项目](./13-agentic-rag-and-graduation.md)

阶段成果：能根据评估结果升级检索，完成一个有生产边界的商城客服 RAG，并知道高级技术的适用条件。

---

## 三、建议学习节奏

| 阶段 | 建议时间 | 每天投入 | 交付物 |
| --- | --- | --- | --- |
| 阶段 A | 2 周 | 1～2 小时 | TopK 检索接口 |
| 阶段 B | 2～3 周 | 1～2 小时 | 带引用的可信问答 |
| 阶段 C | 2～3 周 | 1～2 小时 | 可评估、可观测的毕业项目 |

时间少时可以延长周期，不要跳过测试和评估。

---

## 四、贯穿全程的项目目录

学习过程中逐步建立下面的目录，不要第一天一次创建所有空文件：

```text
server/src/knowledge/
├── knowledge.module.ts
├── api/
│   └── knowledge.controller.ts
├── domain/
│   ├── knowledge-document.ts
│   ├── knowledge-chunk.ts
│   ├── retrieval-result.ts
│   └── knowledge-answer.ts
├── ingestion/
│   ├── knowledge-loader.service.ts
│   ├── knowledge-splitter.service.ts
│   └── knowledge-index.service.ts
├── retrieval/
│   ├── knowledge-search.service.ts
│   ├── knowledge-hybrid.service.ts
│   └── knowledge-rerank.service.ts
├── answer/
│   ├── knowledge-answer.service.ts
│   └── knowledge-citation.service.ts
├── evaluation/
│   ├── knowledge-evaluation.service.ts
│   └── datasets/
└── fixtures/
    └── faq/
```

分层原则：

```text
ingestion 只负责把资料变成索引
retrieval 只负责返回结构化证据
answer 只负责根据证据生成和验证答案
evaluation 只负责用固定数据集衡量质量
agent 只负责路由和编排，不吞掉所有实现
```

---

## 五、每章固定学习法

每章都使用同一个循环：

1. 用自己的话解释本章概念。
2. 在项目里只实现一个最小变化。
3. 先观察正常输入，再观察失败输入。
4. 给核心纯函数或 Service 补测试。
5. 记录结果，不凭感觉判断质量。
6. 通过本章验收后再进入下一章。

建议每次修改后至少运行：

```bash
cd server
pnpm run build
pnpm test -- --runInBand
```

如果全量测试较慢，开发时先运行本章相关测试，合并前再运行全量测试。

---

## 六、全程必须遵守的边界

- 不把 API Key、用户隐私或完整订单数据写进日志和文档。
- 不把库存、价格、订单状态当成静态 RAG 知识。
- 不允许模型提供 `tenantId`、用户身份或权限过滤条件。
- 不允许模型直接生成最终来源 URL；引用必须由服务端 Metadata 映射。
- 不因为相似度分数高就断言证据正确。
- 没有证据时必须允许系统说“不知道”。
- 没有评估数据时，不盲目加入 GraphRAG、多 Agent 或更多模型调用。

---

## 七、三个里程碑

### 里程碑 1：会检索

- 10 篇人工可检查的 Markdown FAQ。
- 每个 Chunk 有稳定 ID 和完整 Metadata。
- 20 个查询可以直接观察 TopK 结果。
- 能计算 Hit Rate@3。

### 里程碑 2：会可信回答

- 回答只使用检索证据。
- 引用编号经过服务端白名单验证。
- 无证据、冲突证据和过期证据有明确策略。
- 不同租户无法互相检索资料。

### 里程碑 3：会生产优化

- 文档可以更新、删除和回滚。
- 检索与生成指标分开记录。
- Hybrid/Rerank 的加入有对照实验支持。
- 延迟、成本、错误率和索引版本可观察。

