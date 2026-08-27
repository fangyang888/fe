# 第 12 章：可观测性、性能、成本与发布

## 本章目标

让 RAG 的每个阶段都可追踪、可超时、可降级，并建立明确的发布门槛。

---

## 一、RAG 慢在哪里

在线链路可能包含：

```text
查询改写
→ Query Embedding
→ Dense Search
→ BM25 Search
→ Fusion / 去重
→ Rerank
→ Context Selection
→ Answer Generation
→ Citation Validation
```

只记录一个总耗时无法定位瓶颈。推荐：

```ts
type RagTimings = {
  rewriteMs: number;
  embeddingMs: number;
  denseMs: number;
  lexicalMs: number;
  fusionMs: number;
  rerankMs: number;
  generationMs: number;
  totalMs: number;
};
```

---

## 二、一次请求的追踪字段

建议记录：

```text
runId
conversationId / turnId
tenantId 的安全标识
queryHash 或经过策略处理的查询
indexVersion
embeddingConfigVersion
retrievalConfigVersion
候选数和最终上下文数
使用的 Chunk ID / sourceId
各阶段耗时
是否证据不足
是否降级
错误码
Token 与估算成本
```

日志、Trace 和业务数据库分别有不同用途，不要把完整私密证据无边界复制到所有系统。

---

## 三、超时和取消

为各阶段设置独立预算，并传递同一个 `AbortSignal`：

```text
客户端 Stop
→ HTTP Abort
→ AnswerService
→ Search / Embedding / Rerank / Model
```

单纯把 Nginx 超时改成很大不能解决下游挂起问题。

需要明确：

- 哪些调用允许有限重试。
- 哪些错误重试也无效，例如鉴权和无效输入。
- 整体截止时间到达后如何取消下游。
- 请求取消是否会错误保存半条最终回答。

---

## 四、降级策略

示例：

```text
查询改写失败 → 原问题检索
BM25 失败     → Dense only
Rerank 超时   → 使用 RRF 排名
生成失败      → 返回受控错误，不伪造答案
向量库失败    → 根据业务要求报错或转人工
```

降级不能绕过权限、版本和引用验证。

每次降级必须记录：

- 哪个阶段失败。
- 使用了什么 fallback。
- 最终回答是否仍满足可信门槛。

---

## 五、缓存

可以评估：

- Query Embedding 缓存。
- 检索结果缓存。
- 低风险公共 FAQ 的最终答案缓存。

Key 必须包含影响结果的范围：

```text
tenantScope
normalizedQuery
indexVersion
retrievalConfigVersion
locale
```

敏感问题、强个性化问题和变化频繁的数据不应简单缓存最终答案。

---

## 六、与第 7 课 Streaming 结合

可以安全展示这些状态：

```text
正在理解问题
正在查询知识库
正在整理证据
正在生成回答
```

最终 `assistant_final` 事件增加公开引用：

```ts
type PublicCitation = {
  title: string;
  section: string;
  url: string | null;
};
```

不要流式输出：

- 内部向量分数。
- 私有 Chunk 全文。
- 系统 Prompt。
- 权限过滤表达式。
- 未验证的模型引用。

流式草稿结束后，以最终结构化回答和已验证引用校正页面状态。

---

## 七、发布门槛

团队应根据业务风险制定真实门槛。示意：

```text
关键政策问题 Hit Rate@5 达标
无答案拒答用例全部通过
跨租户隔离用例全部通过
伪造引用用例全部通过
旧政策污染用例全部通过
P95 延迟在预算内
错误和降级率在预算内
人工抽检 Groundedness 达标
具备索引回滚方案
```

安全隔离类指标不应该用平均分掩盖单次严重泄漏。

---

## 八、上线反馈闭环

```text
线上低满意度/拒答/转人工问题
→ 脱敏和聚类
→ 人工判断原因
→ 补资料或修索引/检索/生成
→ 加入 Golden Dataset
→ 离线对照评估
→ 通过发布门槛
→ 灰度上线
```

不要直接用未经审核的用户反馈自动修改生产知识库。

## 验收标准

- 每个主要阶段有独立耗时和错误信息。
- AbortSignal 能传播到下游调用。
- 每个可选组件都有明确降级策略。
- 发布前自动运行质量与安全评估。
- 任何回答都可以通过 runId 和 indexVersion 追踪。

通过后进入：[第 13 章：Agentic RAG、LangGraph 与毕业项目](./13-agentic-rag-and-graduation.md)。

