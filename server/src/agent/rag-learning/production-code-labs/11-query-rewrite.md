# 第 11 章：多轮 Query Rewrite 与上下文预算

对应原文：第 26～29 节。

## 任务 1：结构化改写

```ts
const QueryRewriteSchema = z.object({
  standaloneQuery: z.string().trim().min(1).max(500),
  requiresClarification: z.boolean(),
  clarificationQuestion: z.string().trim().max(300).nullable(),
  usedEntityKeys: z.array(z.string().max(50)).max(10),
});
```

输入只包含：当前问题、经过裁剪的最近摘要、当前已验证业务实体。不要传整段无限历史。

## 任务 2：优先确定性补全

```ts
function deterministicRewrite(
  question: string,
  state: AgentConversationState,
): string | null {
  if (!/[它那个这款]/.test(question)) return question;
  if (state.entities.productName) {
    return question.replace(/[它那个这款]/g, state.entities.productName);
  }
  return null;
}
```

存在两个候选商品时返回澄清问题，不让模型猜。

## 任务 3：安全边界

改写模型不能输出或决定 tenantId、visibility、published、asOfTime。即使 standaloneQuery 含有类似过滤表达式，也只是文本 Query，第 09 章 scope 不变。

## 任务 4：Context Selector

```ts
type ContextBudget = {
  maxEvidenceChars: number;
  maxCandidates: number;
  maxPerDocument: number;
};
```

选择顺序综合 rerank/fusion、authority、去重和覆盖度。字符预算是第一版保护，后续可用真实 tokenizer 改为 Token 预算。

## 测试

- 独立问题不被改坏。
- “它”在唯一可信实体时正确补全。
- 多个实体时要求澄清。
- 改写无法改变 scope。
- 总上下文和每篇文档数量受限。
- 冲突版本不会同时进入最终上下文。

## Gate 11

- [ ] 多轮标签问题的 Recall 有单独报告。
- [ ] Query Rewrite 和 Answer Generation 是两个独立调用。
- [ ] 改写失败可降级为原 Query 或澄清。
- [ ] 上下文选择结果可打印 chunkId 解释。

