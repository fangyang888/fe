# 第 04 章：Embedding 与向量检索

## 本章目标

理解文本怎样变成向量、相似度检索能做什么，以及为什么向量分数不能被当成事实置信度。

---

## 一、Chat 模型和 Embedding 模型

```text
Chat 模型      → 输入消息，输出文字或结构化结果
Embedding 模型 → 输入文字，输出固定维度的数字向量
```

文档 Chunk 和用户查询需要进入同一个兼容的向量空间：

```text
Chunk → Embedding → 文档向量
Query → Embedding → 查询向量
```

系统寻找与查询向量距离较近的 Chunk 向量。

---

## 二、相似度不等于正确性

向量检索表达的是语义接近程度，不表示：

- 文档内容一定真实。
- 文档一定是最新版本。
- 当前用户有权查看。
- 这段证据足以回答问题。
- 模型最终一定忠于证据。

因此一个候选进入最终上下文前，还需要权限、状态、版本、有效期和质量检查。

---

## 三、为什么向量检索会失败

Dense Retrieval 擅长同义表达：

```text
“怎么把耳机退掉”
≈ “音频商品退货流程”
```

但可能漏掉：

- `POLICY-2026-08` 等精确编号。
- `SKU-XM-2048` 等罕见型号。
- 很短的缩写。
- 只有一个字符不同的编码。

这些失败将在第 10 章用 BM25 和 Hybrid Search 处理。第一版仍应先建立 Dense Retrieval 基线。

---

## 四、距离、相似度和 Score

不同向量库可能返回：

- Cosine similarity：通常越大越相似。
- Cosine distance：通常越小越相似。
- Euclidean distance：越小越近。
- 内积或经过转换的供应商分数。

不要写死：

```ts
if (score > 0.8) {
  // 一定相关 —— 错误假设
}
```

正确做法：

1. 查清当前向量库分数定义。
2. 保存使用的 Embedding、距离度量和索引版本。
3. 使用标注数据观察相关与不相关结果的分布。
4. 把阈值作为版本化配置。
5. 更换模型或向量库后重新评估。

---

## 五、Embedding 版本管理

索引至少记录：

```ts
type EmbeddingIndexConfig = {
  provider: string;
  model: string;
  dimensions: number;
  distanceMetric: string;
  normalization: string;
  indexVersion: string;
};
```

更换 Embedding 模型或维度后通常必须重建全部文档向量。不要把新查询向量拿去搜索旧模型建立的索引。

生产迁移推荐：

```text
保留 v1 在线
→ 后台构建 v2
→ 用同一评估集测试 v2
→ 切换读取别名到 v2
→ 观察并保留回滚窗口
→ 再删除 v1
```

---

## 六、TopK 的正确理解

`TopK = 5` 表示返回排名最靠前的 5 个候选，不表示这 5 个都相关。

TopK 太小：可能漏掉正确证据。

TopK 太大：噪音、延迟和上下文费用增加，甚至让模型被错误证据干扰。

第一版建议把两个数量分开：

```text
retrievalCandidateK → 召回候选数量
finalContextK       → 最终交给模型的数量
```

以后加入 Rerank 时，可以先召回较多候选，再选少量上下文。

---

## 七、本章实验

使用同一个 Embedding 模型比较这些查询：

1. 原句和同义改写。
2. 相同主题但结论不同的条款。
3. 精确政策编号。
4. 完全无关问题。
5. 很短的单词或型号。

记录：

```text
query
topKChunkIds
rawScores
是否包含正确证据
观察结论
```

不要只打印拼接后的正文，否则很难排查索引和版本。

## 验收标准

- 能解释 Chat 模型和 Embedding 模型的区别。
- 知道向量相似度不能证明事实正确。
- 知道更换 Embedding 为什么需要重建索引。
- 能解释 TopK 太大和太小的代价。

通过后进入：[第 05 章：实现最小可观察检索](./05-build-minimum-retrieval.md)。

