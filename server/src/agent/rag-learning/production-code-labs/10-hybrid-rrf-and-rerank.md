# 第 10 章：BM25 + Dense + RRF + 可选 Rerank

对应原文：第 20～23、28 节。

## 任务 1：两路候选

```text
BM25：content/title 匹配，擅长 SKU、政策编号和专有名词
Dense：query vector kNN，擅长同义表达和中文语义
```

两个分支使用第 09 章同一安全 Filter。

## 任务 2：优先使用 ES 原生 RRF

概念请求：

```json
{
  "retriever": {
    "rrf": {
      "retrievers": [
        {
          "standard": {
            "query": {
              "bool": {
                "must": { "multi_match": { "query": "POLICY-2026-08", "fields": ["title^2", "content"] } },
                "filter": []
              }
            }
          }
        },
        {
          "knn": {
            "field": "embedding",
            "query_vector": [],
            "k": 30,
            "num_candidates": 100,
            "filter": []
          }
        }
      ],
      "rank_window_size": 60,
      "rank_constant": 60
    }
  },
  "size": 20
}
```

具体 DSL 要以目标 Elasticsearch 版本官方文档和集成测试为准。课程保留应用层 RRF 纯函数作为可测试降级方案：

```ts
export function reciprocalRankFusion(
  rankings: string[][],
  rankConstant = 60,
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, index) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (rankConstant + index + 1));
    });
  }
  return scores;
}
```

不要直接相加 BM25 与 cosine 原始分数。

## 任务 3：去重和 Parent 展开

按 chunkId/contentHash 去重；相同 parent 只保留有限 child。只有评估显示 child 缺上下文时才加载 parent，并重新执行权限/版本检查。

## 任务 4：Rerank 端口

```ts
export interface RerankPort {
  rerank(input: {
    query: string;
    candidates: RetrievalCandidate[];
    topN: number;
    signal?: AbortSignal;
  }): Promise<RetrievalCandidate[]>;
}
```

第一版使用 `NoopRerankAdapter`。只有 Hybrid 候选找全但排序仍差时才接真实 Cross-Encoder/供应商服务。

降级：Rerank 超时返回 RRF 排名并设置 `degraded=true`；Dense/BM25 任一路失败可以按策略单路运行，但绝不能去掉安全 Filter。

## Gate 10

- [ ] 50 条数据比较 Dense、BM25、RRF 三组结果。
- [ ] 编号类和同义类问题分别有标签报告。
- [ ] RRF 纯函数有确定性单测。
- [ ] Rerank 收益必须覆盖额外 P95 和成本。

