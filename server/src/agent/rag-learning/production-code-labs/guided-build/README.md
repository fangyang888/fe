# 商城客服 RAG 跟敲版

这不是架构提纲，而是一套打开 IDE 后可以逐步执行的课程。每章只增加一小段能力，并且保留一个可运行、可测试的状态。

上层参考资料：

- [生产级 RAG 原理总章](../../../LESSON_08_PRODUCTION_RAG_AND_KNOWLEDGE_BASE.md)
- [生产代码实验参考目录](../README.md)
- [商城客服业务主线](../customer-service-mainline/README.md)

---

## 学习项目

最终完成下面的客服对话：

```text
用户：降噪耳机多少钱，还有货吗？
客服：从 ProductService 返回实时价格和库存。

用户：拆封以后还能退吗？
客服：从知识库检索当前退货政策，回答并显示引用。

用户：我的订单 202608310001 呢？
客服：从 JWT 用户身份和 OrderService 查询自己的订单。

用户：那这个订单还能退吗？
客服：组合会话状态、订单事实、当前政策和确定性规则。

用户：我情况特殊，帮我转人工。
客服：真正创建 support_ticket 并返回 ticketId。
```

---

## 跟敲章节

### 第一阶段：本地最小 RAG

1. [第 01 章：创建 KnowledgeModule 与配置](./01-scaffold-and-config.md)
2. [第 02 章：编写第一批客服 FAQ 与安全 Loader](./02-faq-and-loader.md)
3. [第 03 章：结构切分与稳定 Chunk ID](./03-splitter-and-stable-id.md)
4. [第 04 章：Embedding 与 MemoryVectorStore](./04-embedding-and-memory-store.md)
5. [第 05 章：只返回证据的检索接口](./05-retrieval-debug-api.md)

阶段结果：能输入“耳机拆封能退吗”，观察 TopK Chunk；不生成自然语言答案。

### 第二阶段：可信客服 RAG

6. [第 06 章：2-Step 回答、拒答和可信引用](./06-answer-and-citations.md)
7. [第 07 章：Golden Dataset、检索指标与切分调优](./07-evaluation-and-chunk-tuning.md)
8. [第 08 章：多轮 Query Rewrite 与 Agent 路由](./08-query-rewrite-and-agent-routing.md)

阶段结果：客服一定先找证据，引用可验证，无资料会拒答，并能理解“那它能退吗”。

### 第三阶段：结合当前商城业务

9. [第 09 章：商品实时事实 + 商品知识](./09-product-and-knowledge.md)
10. [第 10 章：JWT、订单事实 + 退货政策](./10-order-policy-workflow.md)
11. [第 11 章：真正转人工、历史与 SSE](./11-handoff-history-and-streaming.md)

阶段结果：把 ProductService、OrderService、会话状态、RAG 和工单串成真实客服闭环。

### 第四阶段：从会用到精通

12. [第 12 章：Hybrid、Rerank、Parent-Child 与高级检索](./12-advanced-retrieval.md)
13. [第 13 章：安全、可观测、版本发布与精通验收](./13-security-observability-and-mastery.md)

阶段结果：能根据失败数据选择检索技术，能评估、安全发布和定位 RAG 的每一类故障。

---

## 每章怎么学

每章按相同顺序：

1. 查看“开始前状态”，确认没有跳章。
2. 只创建本章列出的文件。
3. 先复制测试，让测试失败。
4. 再编写实现，让测试通过。
5. 运行构建和本章测试。
6. 按“故意破坏实验”观察错误。
7. 用自己的话回答本章自测题。
8. Gate 全部勾选后进入下一章。

不要一次复制后面所有代码。RAG 的学习价值来自观察每一层独立失败。

---

## 命令约定

所有命令默认从项目根目录开始：

```bash
cd server
pnpm run build
```

测试文件统一使用 `knowledge` 前缀，开发时可以运行：

```bash
pnpm test -- knowledge --runInBand
```

最终发布前运行全量测试：

```bash
pnpm test -- --runInBand
```

---

## 当前项目的重要事实

- 当前 Node 引擎要求 `>=20.19.0`，如果终端显示 Node 18，先切换 Node 版本。
- 当前没有安装 `@langchain/textsplitters` 和 `@langchain/classic`。
- 当前 `AgentController` 普通客服入口没有 JWT Guard，订单接入前必须修复。
- 当前 `OrderService` 有用户归属查询，但没有面向 Agent 的订单号只读方法。
- 当前 `human_handoff` 没有创建真实工单。
- 当前知识模块尚不存在，所以第一章从零建立。

本跟敲主线暂不依赖 Elasticsearch。MemoryVectorStore 只是学习载体，所有核心服务都依赖自己的 `KnowledgeSearchPort`，以后可以替换为 Qdrant、pgvector、Elasticsearch 或云检索服务，而不用重写客服业务层。向量库选型不等于 RAG 精通；检索质量、评估、引用和业务边界才是主线。

现在进入[第 01 章](./01-scaffold-and-config.md)。
