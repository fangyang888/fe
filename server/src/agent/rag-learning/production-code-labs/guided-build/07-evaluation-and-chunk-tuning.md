# 第 07 章：Golden Dataset、检索指标与切分调优

## 本章结果

不再凭感觉调 Chunk。建立第一版 30～50 条客服数据集，计算 Hit Rate、Recall 和 MRR，并用失败案例调整切分与检索。

## 第一步：JSONL 数据集

创建：

```text
server/src/knowledge/evaluation/datasets/customer-rag-v1.jsonl
```

先定义每行数据的含义，防止团队成员写出无法自动验收的样本：

```ts
export type RagGoldenCase = {
  /** 数据集内稳定且唯一的用例 ID，用于对比不同实验结果。 */
  id: string;
  /** 模拟真实客服表达的用户问题。 */
  question: string;
  /** 一个合格检索结果应命中的知识文档 ID。 */
  expectedDocumentIds: string[];
  /** 一个合格答案必须表达的关键事实，可为空。 */
  expectedFacts: string[];
  /** 答案绝不能出现的错误、越权或过期事实。 */
  forbiddenFacts: string[];
  /** 当前已发布知识是否足以回答该问题。 */
  answerable: boolean;
  /** 用于分组定位失败模式的标签，例如 synonym、exception。 */
  tags: string[];
};
```

每行一个 JSON：

```json
{"id":"return-001","question":"耳机拆了还能退吗","expectedDocumentIds":["return-headphone"],"expectedFacts":["已拆封影响二次销售时不适用七天无理由"],"forbiddenFacts":["所有耳机都可以无理由退货"],"answerable":true,"tags":["synonym","exception"]}
{"id":"code-001","question":"POLICY-2026-08 说了什么","expectedDocumentIds":["return-headphone"],"expectedFacts":[],"forbiddenFacts":[],"answerable":true,"tags":["exact_code"]}
{"id":"none-001","question":"明年支持火星配送吗","expectedDocumentIds":[],"expectedFacts":[],"forbiddenFacts":[],"answerable":false,"tags":["no_answer"]}
```

## 第二步：指标函数

```ts
export function hitAtK(actual: string[], expected: Set<string>, k: number) {
  return actual.slice(0, k).some((id) => expected.has(id)) ? 1 : 0;
}

export function recallAtK(actual: string[], expected: Set<string>, k: number) {
  if (expected.size === 0) return 1;
  const found = new Set(actual.slice(0, k).filter((id) => expected.has(id)));
  return found.size / expected.size;
}

export function reciprocalRank(actual: string[], expected: Set<string>) {
  const index = actual.findIndex((id) => expected.has(id));
  return index < 0 ? 0 : 1 / (index + 1);
}
```

为指标本身写测试：正确结果在第一、第二、缺失时分别得到 1、0.5、0。

## 第三步：运行器

```ts
for (const item of dataset) {
  const result = await search.search({
    query: item.question,
    scope: defaultCustomerScope,
    topK: 5,
  });
  const actual = result.candidates.map((x) => x.chunk.documentId);
  const expected = new Set(item.expectedDocumentIds);
  rows.push({
    id: item.id,
    tags: item.tags,
    actual,
    hitAt3: hitAtK(actual, expected, 3),
    recallAt5: recallAtK(actual, expected, 5),
    reciprocalRank: reciprocalRank(actual, expected),
  });
}
```

输出总分和每个 tag 分数，还要打印所有失败案例。

## 第四步：切分对照实验

固定数据集和 Embedding，依次比较：

```text
A: chunkSize=500 overlap=50
B: chunkSize=800 overlap=100
C: chunkSize=1200 overlap=150
```

每次保存：配置、Hit@3、Recall@5、MRR、失败列表和索引 Chunk 数。不能同时换 Embedding，否则不知道提升来自哪里。

## 第五步：建立拒答数据

对所有 `answerable=false` 问题记录 Top1 分数分布；再记录 answerable=true 的正确 Top1 分数分布。只有看到两组真实数据后，才设置初始阈值。

阈值仍不等于绝对真理：

```text
低于阈值 → 大概率拒答
高于阈值 → 仍需模型判断证据是否支持答案
```

换 Embedding 或 VectorStore 后必须重新标定。

## 第六步：回答评估

确定性检查：

```ts
const containsForbiddenFact = item.forbiddenFacts.some((fact) =>
  answer.answer.includes(fact),
);
const citationValid = answer.citations.every((citation) =>
  item.expectedDocumentIds.includes(resolveDocumentId(citation)),
);
```

再人工评审 Correctness、Relevance、Groundedness。语言流畅不能代替正确。

## 故意破坏实验

把整篇政策作为一个 Chunk，重新跑评估；再每句话一个 Chunk。观察不同失败标签如何变化，而不是只看总平均。

## Gate 07

- [ ] 至少 30 条，进入高级检索前扩充到 50 条。
- [ ] 能一条命令重复运行。
- [ ] 报告包含按 tag 的失败案例。
- [ ] 每次调参只改变一个变量。
- [ ] 拒答策略来自数据，而不是照抄 0.8。
