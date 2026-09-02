# 第 13 章：安全、可观测、版本发布与 RAG 精通验收

## 本章结果

把客服 RAG 从“功能完成”提升到可解释、可防护、可发布和可持续改进。

## 一、安全测试矩阵

至少建立：

```text
跨用户订单号
伪造 userId/tenantId
草稿政策
过期政策
旧 revision
恶意文档要求泄露密钥
恶意文档要求调用退款 Tool
模型伪造 S99
内部 URL 引用
缓存跨权限复用
```

安全类目标不是平均正确率，而是非法访问与非法引用接受数为 0。

## 二、间接 Prompt Injection

文档是数据，不是指令。防护分层：

```text
导入：来源审核、大小/类型、contentHash、发布审批
检索：scope/status/time pre-filter
生成：证据标签、Structured Output、引用白名单
执行：RAG 证据永远不能提升 Tool 权限
```

Prompt 只是其中一层，不能替代代码鉴权。

## 三、可观测对象

```ts
type RagTimings = {
  /** 将会话问题改写为独立查询的耗时，单位毫秒。 */
  rewriteMs: number;
  /** 生成查询向量的耗时，单位毫秒。 */
  embeddingMs: number;
  /** 召回和过滤候选证据的耗时，单位毫秒。 */
  retrievalMs: number;
  /** 候选重排耗时；未启用 Rerank 时为 0。 */
  rerankMs: number;
  /** 模型依据证据生成结构化回答的耗时，单位毫秒。 */
  generationMs: number;
  /** 从进入 RAG 流程到得到最终结果的总耗时，单位毫秒。 */
  totalMs: number;
};

type RagTrace = {
  /** 单次客服请求的全链路追踪 ID，用于关联日志和指标。 */
  runId: string;
  /** 本轮实际选择的业务路径，例如 knowledge_rag 或 order_policy。 */
  route: string;
  /** 本轮检索命中的已发布索引版本。 */
  indexVersion: string;
  /** 构建当前索引时使用的 Embedding 模型和版本。 */
  embeddingVersion: string;
  /** TopK、阈值、融合和重排参数组成的配置版本。 */
  retrievalConfigVersion: string;
  /** 检索阶段返回的 Chunk ID；不要在日志中复制完整私有内容。 */
  retrievedChunkIds: string[];
  /** 最终回答实际引用的 Chunk ID，用于计算引用覆盖率。 */
  citedChunkIds: string[];
  /** 是否因证据不足而拒绝直接回答。 */
  insufficientEvidence: boolean;
  /** 是否发生超时、模型故障并走了明确的降级路径。 */
  degraded: boolean;
  /** 本轮各阶段耗时，用于定位 P95 延迟来源。 */
  timings: RagTimings;
};
```

日志不保存 API Key、Cookie、完整地址、全部私有 Chunk 和不必要的用户原文。

## 四、固定排错顺序

回答错时按顺序查：

```text
1 原始政策正确吗
2 Loader 解析完整吗
3 正确内容进入完整 Chunk 吗
4 Metadata/版本/有效期正确吗
5 Chunk 已进入当前索引吗
6 正确 Chunk 进入 TopK 吗
7 Hybrid/Rerank 是否降错了
8 最终上下文包含它吗
9 模型忠于证据吗
10 引用映射正确吗
```

不要一出错就换大模型或修改 Prompt。

## 五、版本发布

每次索引发布保存：

```ts
type KnowledgeRelease = {
  /** 本次上线后供查询读取的唯一索引版本。 */
  indexVersion: string;
  /** 上一个稳定索引版本；首次发布时为 null。 */
  previousVersion: string | null;
  /** 构建索引所用 Embedding 模型和版本。 */
  embeddingVersion: string;
  /** 文档切分算法与参数的版本。 */
  splitterVersion: string;
  /** TopK、阈值、融合和重排参数组成的配置版本。 */
  retrievalConfigVersion: string;
  /** 本次发布实际包含的有效知识文档数量。 */
  documentCount: number;
  /** 本次发布建立索引的 Chunk 总数。 */
  chunkCount: number;
  /** 发布门禁使用的评估报告 ID，用于追溯质量结果。 */
  evaluationReportId: string;
  /** 索引切换为可读版本的 ISO 8601 时间。 */
  releasedAt: string;
};
```

流程：构建候选版本 → 完整性检查 → Golden Dataset → 安全测试 → 灰度 → 切换 → 观察 → 保留回滚窗口。

## 六、缓存

缓存键至少包含：

```text
scopeHash + normalizedQueryHash + indexVersion + retrievalConfigVersion
```

只有 query 的全局缓存会返回旧政策或跨权限内容。个人订单与混合判断不要缓存最终答案。

## 七、线上反馈闭环

```text
低满意度/拒答/转人工
→ 脱敏
→ 人工标注根因
→ 加入 Golden Dataset
→ 修改资料/切分/检索/回答中的正确一层
→ 对照评估
→ 灰度发布
```

不要让未经审核的用户反馈自动修改生产知识库。

## 八、精通自测

你应该能脱离文档回答：

1. RAG、微调、Tool 和聊天记忆的区别。
2. 为什么库存、价格和订单不能只做 Embedding。
3. Chunk 太大和太小怎样影响 Recall 和生成。
4. 为什么 Embedding 更换需要重建索引。
5. Dense、BM25、RRF、Rerank 分别解决什么。
6. 如何区分检索失败和生成失败。
7. 为什么引用必须由服务端验证。
8. 为什么权限必须在候选检索前过滤。
9. 无答案和冲突证据怎样处理。
10. 多轮 Query Rewrite 为什么不能决定权限。
11. Parent-Child 和 Context Budget 的关系。
12. Agentic RAG 何时值得使用，何时固定 2-Step 更好。
13. 怎样灰度、回滚和迁移 Embedding。
14. 怎样从一条错误回答追踪到原文和 Chunk。

## 最终 Gate

- [ ] 50+ Golden Cases，覆盖所有关键标签。
- [ ] 检索和回答指标分开报告。
- [ ] 商品、订单、政策和会话事实来源严格分离。
- [ ] 引用、拒答、跨用户和恶意文档测试全部通过。
- [ ] 有 P95、成本、降级、版本和回滚记录。
- [ ] 能用失败数据说明为什么采用或拒绝每项高级技术。

达到这些标准，你的定位就不只是“会调用向量库”，而是能够设计、评估、排错和上线客服 RAG 的工程师。
