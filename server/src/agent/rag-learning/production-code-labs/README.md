# 生产级 RAG 代码实验课：从当前项目到真实上线

本目录是 [LESSON_08_PRODUCTION_RAG_AND_KNOWLEDGE_BASE](../../LESSON_08_PRODUCTION_RAG_AND_KNOWLEDGE_BASE.md) 的代码实践拆分版。原文负责完整知识体系，本目录负责把其中每个关键概念落实成当前项目里的 TypeScript、NestJS、LangChain.js、MySQL、Redis、Elasticsearch、SSE 和 Jest 代码。

目标不是运行一个 MemoryVectorStore Demo，而是最终形成可以发布、回滚、评估、鉴权和监控的商城客服知识库。

> 推荐学习入口已经改为：[商城客服 RAG 跟敲版](./guided-build/README.md)。
>
> 跟敲版暂时忽略 Elasticsearch，使用可替换的 SearchPort + MemoryVectorStore 学透 RAG 和客服编排；本目录其余 00～19 文件作为生产架构参考，等你完成客服主线后再按需要选择持久化检索设施。

本课程的业务主角始终是你当前的商城客服。开始代码前先阅读：

- [商城客服 RAG 跟敲版（逐文件、测试和运行命令）](./guided-build/README.md)
- [商城客服 RAG 实战主线](./customer-service-mainline/README.md)

它把商品、库存、订单、退货政策、多轮对话和人工工单串成六个连续案例，并明确对应当前 `ProductCustomerService`、`OrderService`、`AgentConversationService`、历史持久化与 SSE 代码。

技术核对日期：2026-08-31。依赖版本和外部服务能力会变化，升级前必须重新运行本课程的 Golden Dataset 和安全测试。

---

## 一、最终项目形态

```text
React AgentChat
  ↓ POST /api/agent/chat/stream
NestJS AgentStreamApplicationService
  ↓
AgentService 意图路由
  ├─ 商品/库存/价格 → ProductCustomerService / 业务数据库
  ├─ 知识政策       → KnowledgeAnswerService（固定 2-Step RAG）
  ├─ 混合问题       → 受控工作流组合 RAG + 业务 Service
  └─ 普通问题       → 现有 createAgent

KnowledgeAnswerService
  → standalone query
  → KnowledgeSearchService
      → Elasticsearch BM25 + dense_vector
      → tenant/status/time pre-filter
      → RRF
      → 可选 rerank
  → ContextSelector
  → Structured Output
  → CitationValidator
```

存储职责：

```text
MySQL        → 知识来源、revision、索引任务、发布状态、审计
Elasticsearch→ Chunk、BM25、dense_vector、过滤字段、Hybrid Search
Redis        → 队列/锁/短期缓存（按实验逐步加入）
OpenAI       → Embedding 与回答模型；都通过项目 Factory/Adapter 隔离
```

Elasticsearch 知识索引与现有 `agent/elk` 日志诊断 Agent 是两个安全域。不要让日志 MCP 凭据兼任知识库写入凭据。

---

## 二、为什么选择这条生产主线

- 原 Lesson 08 强调 Dense + BM25 + RRF；Elasticsearch 能在同一引擎完成全文、向量、结构化过滤和 Hybrid。
- 你当前项目已经在使用 ELK 进行可观测性学习，运维知识可以复用，但知识索引必须独立授权。
- MySQL 继续保存权威业务状态，不把文档生命周期塞进向量库作为唯一真相。
- 第一版固定 2-Step RAG，先保证一定检索、引用可验证、延迟可控；Agentic RAG 放到最后做对照实验。
- Embedding 第一版比较 `text-embedding-3-small` 与 `text-embedding-3-large`，由中文 Golden Dataset 决定，不把“最新”当作质量证明。

官方资料核对入口：

- [OpenAI text-embedding-3-large](https://developers.openai.com/api/docs/models/text-embedding-3-large)
- [OpenAI text-embedding-3-small](https://developers.openai.com/api/docs/models/text-embedding-3-small)
- [LangChain.js Semantic Search](https://docs.langchain.com/oss/javascript/langchain/knowledge-base)
- [Elastic Hybrid Search](https://www.elastic.co/docs/solutions/search/hybrid-search)
- [Elastic Vector Search](https://www.elastic.co/docs/solutions/search/vector)
- [LangGraph Agentic RAG](https://docs.langchain.com/oss/javascript/langgraph/agentic-rag)

---

## 三、章节与原文映射

| 代码实验 | 原 Lesson 08 章节 | 交付物 |
| --- | --- | --- |
| [00 架构与完成定义](./00-architecture-and-definition-of-done.md) | 1～5、57～60 | ADR、边界图、上线目标 |
| [01 依赖与环境](./01-dependencies-and-environment.md) | 6、13～16 | 版本锁定、配置校验 |
| [02 领域模型](./02-domain-models.md) | 7～8、12、35 | 稳定领域类型 |
| [03 FAQ 与 Loader](./03-fixtures-and-loader.md) | 8～9 | 可信 Markdown Loader |
| [04 结构切分](./04-structure-aware-splitting.md) | 10～12 | Chunk、父子关系、稳定 ID |
| [05 Embedding Adapter](./05-embedding-adapter.md) | 13～15 | 批处理、重试、版本信息 |
| [06 内存检索基线](./06-memory-retrieval-baseline.md) | 16～19、58.3 | 可观察 Dense baseline |
| [07 MySQL 生命周期](./07-mysql-knowledge-lifecycle.md) | 25、43～44 | source/revision/job 表 |
| [08 Elasticsearch 索引](./08-elasticsearch-index.md) | 16～19、43 | mapping、alias、批量写入 |
| [09 权限预过滤](./09-access-scope-and-prefilter.md) | 24～25 | tenant/status/time filter |
| [10 Hybrid 与 Rerank](./10-hybrid-rrf-and-rerank.md) | 20～23、28 | BM25+dense+RRF+降级 |
| [11 查询改写](./11-query-rewrite.md) | 26～29 | 多轮 standalone query |
| [12 2-Step 回答与引用](./12-two-step-answer-and-citations.md) | 30～38 | Structured Output、拒答、引用 |
| [13 接入 Agent 路由](./13-agent-routing-integration.md) | 39～42 | knowledge_query 路由和 SSE |
| [14 Golden Dataset](./14-golden-dataset-and-metrics.md) | 47～54 | Hit/Recall/MRR/nDCG、回答评估 |
| [15 安全攻防测试](./15-security-tests.md) | 24、30～33、53.5 | 越权、注入、伪造引用测试 |
| [16 缓存与可观测性](./16-cache-observability-and-cost.md) | 45～46、51～52 | timings、indexVersion、缓存键 |
| [17 发布、回滚与运维](./17-release-rollback-and-runbook.md) | 14、43～46、60 | 蓝绿索引、回滚、Runbook |
| [18 Agentic RAG 对照](./18-agentic-rag-experiment.md) | 4、40～41、55 | LangGraph 受控实验 |
| [19 毕业验收](./19-graduation-checklist.md) | 56～60 | 上线报告和演示脚本 |

高级技术不进入第一版主线，完成后再查：[附录 A1：2026 高级技术雷达与采用门槛](./A1-advanced-technology-radar.md)。

---

## 四、学习规则

每章严格执行：

```text
读对应原文章节
→ 创建本章代码
→ 先写失败测试
→ 实现最小功能
→ 运行本章命令
→ 保存观察结果
→ 通过 Gate 后进入下一章
```

不要一次复制所有代码。课程中的类型和接口是目标形状；每章只引入当前需要的文件。

每次至少运行：

```bash
cd server
pnpm run build
pnpm test -- knowledge --runInBand
```

最终发布前运行全量测试，不使用 `--passWithNoTests` 掩盖缺失测试。

---

## 五、明确不做的捷径

- 不把所有订单、库存和用户数据 Embedding。
- 不在每次提问时重新索引全部文档。
- 不让模型生成 tenantId、过滤器或真实引用 URL。
- 不把相似度阈值写成未经评估的固定真理。
- 不在 Retriever 返回后才删除无权限内容。
- 不先做 Agentic RAG、GraphRAG 或多 Agent。
- 不把开发内存索引当成可上线存储。
- 不共用日志 ELK 的浏览器/MCP 会话作为知识索引客户端。

从 [第 00 章](./00-architecture-and-definition-of-done.md) 开始。
