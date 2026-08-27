# 第 13 章：Agentic RAG、LangGraph 与毕业项目

## 本章目标

理解固定 2-Step RAG、受控组合流程和 Agentic RAG 的取舍，完成整个学习路径的毕业项目。

---

## 一、三种架构

### 2-Step RAG

```text
问题 → 固定检索 → 固定生成 → 验证引用
```

适合 FAQ、政策、说明书等明确知识问题。优点是稳定、低延迟、容易测试。

### 受控组合流程

```text
代码路由
├── 政策问题 → 2-Step RAG
├── 实时数据 → 业务 Tool
└── 混合问题 → 固定顺序组合 RAG、Service 和业务规则
```

这是当前商城客服最推荐的目标架构。

### Agentic RAG

```text
Agent 自己判断：
是否检索
检索什么
是否改写
是否再次检索
是否调用其他 Tool
```

适合开放式研究、多数据源探索或步骤无法提前完全固定的任务。

代价是调用次数、延迟、费用和行为路径更不稳定，评估与安全更复杂。

---

## 二、什么时候值得使用 Agentic RAG

只有评估和真实需求表明存在这些情况时再考虑：

- 一个问题需要跨多个知识源迭代搜索。
- 第一次检索不足，需要根据证据继续提出新查询。
- 需要动态选择文档库、搜索 API 和业务 Tool。
- 任务是探索性研究，不是稳定 FAQ。
- 固定工作流无法合理覆盖主要路径。

不应因为：

- “Agentic”听起来更高级。
- 想减少路由代码。
- 还没有建立检索评估。
- 基础切分和权限问题尚未解决。

而提前使用它。

---

## 三、Retriever Tool 的安全设计

如果将检索封装成 Tool，输入只允许业务查询本身：

```ts
const searchKnowledgeSchema = z.object({
  query: z.string().min(1).max(500),
});
```

不要让模型提交：

```text
tenantId
userId
visibility
published 状态
内部 collection 名称
绕过有效期的开关
```

Tool 内部从服务端上下文生成 `KnowledgeAccessScope`，并限制：

- 每轮最大检索次数。
- Query 长度。
- TopK 上限。
- 超时和总 Token 预算。
- 可使用的数据源。

检索资料仍然不能直接授权其他敏感 Tool。

---

## 四、什么时候使用自定义 LangGraph

当流程具有明确状态和控制要求时：

- 搜索后需要判断证据是否足够。
- 不足时允许有限次数改写并重试。
- 政策与订单必须按固定顺序组合。
- 需要暂停并等待人工审批。
- 需要从失败节点恢复。
- 每个节点都需要独立追踪和测试。

概念图：

```text
START
→ classify_intent
→ route
   ├── knowledge_search
   │   → assess_evidence
   │      ├── sufficient → answer_with_citations
   │      ├── retryable  → rewrite_query → knowledge_search
   │      └── insufficient → handoff
   ├── business_tool
   └── mixed_workflow
→ validate_response
→ END
```

重试边必须有最大次数，不能形成无限搜索循环。

---

## 五、进阶技术地图

### Contextual Retrieval

为孤立 Chunk 补充所属文档语境。适合 Chunk 脱离父文档后语义不完整的情况，但会增加离线处理成本。

### Multi-Vector / Multi-Representation

为同一内容建立摘要、问题或不同粒度表示，适合同一资料有多种检索入口的情况。

### Late Interaction / ColBERT

保留更细粒度 Token 表示以提高匹配能力，代价是索引和运维复杂度。

### Multimodal RAG

当关键信息存在图片、图表、扫描件或视频中时使用，需要同时评估 OCR、视觉理解和跨模态引用。

### GraphRAG

适合实体关系、社区结构和跨文档全局问题。它不能自动修复错误文档、权限设计或基础检索。

这些能力都必须由失败数据触发，而不是作为第一版默认组件。

---

## 六、毕业项目需求

实现“商城客服知识中心”，至少包含：

### 数据

- 10～20 篇 Markdown FAQ/政策。
- 至少两个 revision。
- 至少两个 tenant 或 visibility 范围。
- 精确政策编号、例外条款和过期文档。

### 离线管道

- 解析、结构切分和稳定 Chunk ID。
- 幂等索引。
- 发布、更新、删除和回滚。
- Embedding 与 indexVersion 记录。

### 在线管道

- Dense Retrieval 基线。
- 服务端权限 Pre-filter。
- 2-Step RAG。
- Structured Output。
- 引用白名单验证。
- 无答案和冲突策略。

### 质量

- 至少 50 条 Golden Dataset。
- Hit Rate@3、Recall@5 和 MRR。
- Correctness、Groundedness 和引用检查。
- Dense 与 Hybrid 的对照实验。

### 生产边界

- 超时、取消和有限重试。
- 分阶段日志和耗时。
- Prompt Injection 测试。
- 跨租户隔离测试。
- 索引失败不影响当前线上版本。
- 第 7 课前端展示已验证引用和检索状态。

---

## 七、毕业演示脚本

1. 查询普通政策，展示回答和引用。
2. 使用同义表达，证明 Dense 能召回。
3. 查询政策编号，比较 Dense 和 Hybrid。
4. 查询知识库不存在的问题，展示拒答。
5. 查询过期政策，证明旧版本不进入结果。
6. 使用 A 租户查询 B 文档，证明权限隔离。
7. 导入包含恶意指令的文档，证明不会调用敏感 Tool。
8. 发布新政策，不改 Prompt 即可得到新回答。
9. 展示一次回答的 runId、indexVersion、Chunk 和阶段耗时。
10. 展示评估报告和一次失败案例的修复过程。

---

## 八、毕业自测

1. RAG、微调、Tool 和聊天记忆分别解决什么问题？
2. 为什么离线索引和在线查询必须拆开？
3. Chunk 太大和太小分别有什么后果？
4. 为什么 Metadata 与正文同样重要？
5. 为什么更换 Embedding 通常要重建索引？
6. Dense Search 为什么可能漏掉 SKU？
7. 为什么 Dense 和 BM25 原始分数不能直接相加？
8. RRF 和 Rerank 分别解决什么问题？
9. 为什么权限必须 Pre-filter？
10. 如何保证模型不能伪造引用？
11. 如何区分检索失败和生成失败？
12. `thread_id` 为什么不能代替鉴权？
13. RAG 文档为什么也可能攻击 Agent？
14. 如何发布新索引并保留回滚能力？
15. 什么证据能证明应该升级为 Agentic RAG？

## 最终验收标准

- 能独立画出系统架构和数据流。
- 能用固定数据证明当前方案的质量。
- 能安全处理权限、引用、版本和拒答。
- 能解释每一个新增组件解决了哪类失败。
- 即使不使用 GraphRAG 或多 Agent，也能做出稳定、可信的生产 RAG。

完成后，可把 [生产级客服知识库与 RAG](../LESSON_08_PRODUCTION_RAG_AND_KNOWLEDGE_BASE.md) 作为长期参考手册继续查阅。

