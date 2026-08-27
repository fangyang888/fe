# 第 07 章：建立 Golden Dataset 与评估体系

## 本章目标

从“问几次感觉不错”升级为可重复、可比较的 RAG 评估，并能判断问题发生在检索还是生成。

---

## 一、为什么 RAG 必须分层评估

一次错误回答可能来自：

```text
原始文档错误
→ 解析错误
→ 切分错误
→ 索引错误
→ 检索漏召回
→ 排序错误
→ 上下文选择错误
→ 生成没有忠于证据
→ 引用映射错误
```

只评估最终答案会掩盖真正原因。

建议至少分成：

```text
检索评估 → 是否找到正确证据
生成评估 → 是否根据证据正确回答
系统评估 → 延迟、成本、安全和稳定性
```

---

## 二、Golden Dataset 结构

第一版准备 30～50 条，逐步扩展：

```ts
type RagEvaluationCase = {
  id: string;
  question: string;
  tenantId: string;
  asOfTime: string;
  expectedDocumentIds: string[];
  expectedChunkIds?: string[];
  expectedFacts: string[];
  forbiddenFacts: string[];
  answerable: boolean;
  tags: string[];
};
```

`expectedFacts` 是回答必须包含的事实，`forbiddenFacts` 用于检查常见误答和旧政策污染。

数据集应由了解业务规则的人审核，不能完全依赖另一个模型自动生成真值。

---

## 三、必须覆盖的问题类型

| 类型 | 示例 | 主要检查 |
| --- | --- | --- |
| 同义表达 | “怎么退货” | Dense Retrieval |
| 精确编号 | `POLICY-2026-08` | 关键词能力 |
| 条件与例外 | “拆封耳机能退吗” | Chunk 完整性 |
| 多证据 | “条件和到账时间” | 多 Chunk 召回 |
| 无答案 | “是否支持火星配送” | 拒答 |
| 冲突版本 | 新旧政策不同 | 版本过滤 |
| 权限隔离 | A 租户查 B 资料 | Pre-filter |
| 恶意资料 | 文档包含越权指令 | Prompt Injection |
| 多轮指代 | “那多久能到账” | 查询改写 |

线上出现的新失败问题，应脱敏后进入候选评估集，经人工标注再加入 Golden Dataset。

---

## 四、检索指标

### Hit Rate@K

TopK 中是否至少出现一个正确证据。

适合快速观察“能不能找到”。

### Recall@K

应该召回的证据中，有多少进入 TopK。

```text
Recall@K = TopK 中相关证据数 / 全部相关证据数
```

适合需要多个证据共同回答的问题。

### Precision@K

TopK 中有多少是真正相关的。

```text
Precision@K = TopK 中相关证据数 / K
```

### MRR

观察第一个正确结果排在多前：

```text
第一名正确 → 1
第二名正确 → 1/2
第三名正确 → 1/3
```

### nDCG@K

适合证据有“高度相关、部分相关、不相关”等多级标注时衡量整体排序质量。

第一版优先掌握 Hit Rate@3、Recall@5 和 MRR。

---

## 五、生成评估

至少从四个维度检查：

- Correctness：结论与业务真值是否一致。
- Relevance：是否回答用户实际问题。
- Groundedness/Faithfulness：结论是否能从证据推出。
- Citation Correctness：引用是否真的支持对应结论。

不要把“语言流畅”当作回答正确。

评估方法可以组合：

```text
确定性代码检查
人工标注
模型评审
线上用户反馈
```

模型评审不是绝对真值；高风险政策必须人工抽检。

---

## 六、对照实验

每次优化都固定：

- 相同 Dataset。
- 相同过滤范围和时间点。
- 相同或明确记录的模型版本。
- 相同指标实现。
- 记录延迟与成本。

实验报告示例：

| 版本 | Hit@3 | Recall@5 | MRR | Groundedness | P95 | 单次成本 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Dense v1 |  |  |  |  |  |  |
| 调整切分 v2 |  |  |  |  |  |  |
| Hybrid v3 |  |  |  |  |  |  |

不能只报告提升的指标，也要记录变差的部分。

---

## 七、固定排错顺序

```text
1. 原始资料正确吗？
2. 解析结果完整吗？
3. 正确内容进入了完整 Chunk 吗？
4. Metadata、权限、版本和有效期正确吗？
5. Chunk 确实进入当前 indexVersion 吗？
6. 正确 Chunk 进入候选 TopK 吗？
7. 融合或 Rerank 错误降级了吗？
8. 最终上下文包含正确证据吗？
9. 模型忠于证据吗？
10. 引用验证和映射正确吗？
```

跳过前面步骤直接改 Prompt，通常只会掩盖检索问题。

---

## 八、本章作业

1. 建立至少 30 条 Golden Cases。
2. 实现 Hit Rate@3、Recall@5 和 MRR。
3. 输出每条失败案例，而不只输出平均值。
4. 对比两种 Chunk 参数，写出数据结论。
5. 为无答案和伪造引用建立确定性测试。

## 验收标准

- 一条命令可以重复运行同一评估集。
- 检索指标和回答指标分别报告。
- 每次配置变化都有版本和对照结果。
- 能根据失败案例定位应该修改哪一层。

通过后进入：[第 08 章：持久化、版本、更新与删除](./08-persistence-versioning-and-reindexing.md)。

