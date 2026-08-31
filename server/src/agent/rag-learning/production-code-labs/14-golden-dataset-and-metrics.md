# 第 14 章：Golden Dataset、检索指标与回答评估

对应原文：第 47～54 节。

## 任务 1：数据格式

```ts
export type RagGoldenCase = {
  id: string;
  question: string;
  tenantId: string;
  role: 'customer' | 'staff';
  asOfTime: string;
  expectedDocumentIds: string[];
  expectedChunkIds?: string[];
  expectedFacts: string[];
  forbiddenFacts: string[];
  answerable: boolean;
  tags: string[];
};
```

保存为版本控制内的 JSONL，敏感线上问题先脱敏并人工审核。

## 任务 2：指标纯函数

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
  return index === -1 ? 0 : 1 / (index + 1);
}
```

nDCG 只有在标注多级相关性后加入，不用二元数据伪装精细指标。

## 任务 3：分标签报告

总平均外必须输出：

```text
synonym
exact_code
exception
multi_evidence
no_answer
version_conflict
cross_tenant
prompt_injection
multi_turn
```

否则总体分数会掩盖政策编号或权限等关键失败。

## 任务 4：回答评估

确定性检查优先：

- `forbiddenFacts` 是否出现。
- answerable=false 是否拒答。
- citation ID 是否全部有效。
- expectedFacts 是否覆盖。

再加入人工或模型评审：Correctness、Relevance、Groundedness、Citation Correctness。模型评审器和版本也要记录，不能作为唯一真值。

## 任务 5：命令

```json
{
  "scripts": {
    "rag:eval:retrieval": "ts-node src/knowledge/evaluation/run-retrieval-eval.ts",
    "rag:eval:answer": "ts-node src/knowledge/evaluation/run-answer-eval.ts"
  }
}
```

报告输出到临时/构建产物目录；基准摘要和配置版本进入版本控制，不提交含隐私的完整 Trace。

## Gate 14

- [ ] 至少 50 条人工审核案例。
- [ ] Dense、BM25、Hybrid、Hybrid+Rerank 使用相同数据集比较。
- [ ] 每次报告包含失败案例而不只有平均值。
- [ ] 检索失败和生成失败能独立定位。

