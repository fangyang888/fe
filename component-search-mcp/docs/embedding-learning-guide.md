# Embedding 从入门到精通：以组件语义检索为主线

> 适合读者：会一点 JavaScript/TypeScript，但不了解机器学习、向量或 Embedding。  
> 最终目标：不仅知道 Embedding 是什么，还能独立设计、实现、评测和优化一个“关键词 + 向量”的混合检索系统。  
> 贯穿案例：在前端仓库中搜索“九宫格组件”，找到 `NineGrid`，而不是因为数字 `3` 错误命中 `SwiperSlide3`。

---

## 1. 学完之后，你应该具备什么能力

完成本文的学习和练习后，你应该能够：

1. 用自己的话解释 Embedding、向量、余弦相似度和 Top-K。
2. 理解 Embedding 不是“训练大模型”，而是调用模型把内容转换为向量。
3. 为组件、文档、商品或知识库设计适合检索的文本表示。
4. 编写 `EmbeddingProvider`，批量生成并缓存向量。
5. 实现最小可用的余弦相似度检索。
6. 将关键词检索与向量检索组合成 Hybrid Search。
7. 使用评测集衡量 Top-1、Recall@K、MRR，而不是凭感觉判断效果。
8. 处理模型版本、向量维度、缓存失效、数据权限和线上可观测性。
9. 判断什么时候需要向量数据库，什么时候普通数组遍历就够了。
10. 继续深入 ANN、HNSW、量化、重排模型和领域优化。

---

## 2. 先建立正确的直觉

### 2.1 关键词搜索在做什么

关键词搜索主要比较“字面上是否出现相同内容”。

例如用户查询：

```text
九宫格图片组件
```

候选组件：

```text
NineGrid
SwiperSlide3
TemplateGrid
```

关键词算法可能把查询拆成：

```text
九宫格 / 图片 / 组件 / 9 / grid / 3
```

如果规则设计不当，`SwiperSlide3` 可能因为包含数字 `3` 而获得较高分。关键词搜索擅长精确名称、Props、路径和专业术语，但不真正理解“九宫格”的业务含义。

### 2.2 Embedding 在做什么

Embedding 模型把一段文本转换为固定长度的数字数组：

```text
"九宫格图片组件"
        ↓ Embedding 模型
[0.018, -0.042, 0.113, ..., 0.027]
```

这个数组叫向量。真实向量可能包含几百到几千个数字。

你不需要理解每一个数字的含义。重要的是：语义相近的文本，生成的向量通常也更接近。

```text
"九宫格图片组件"       ─┐
"3×3 图片展示区域"      ├─ 向量距离较近
"NineGrid photo layout" ─┘

"排行榜第三页"          ─── 向量距离较远
```

Embedding 解决的是“字面不同、意思相近”的召回问题。

### 2.3 Embedding 不是什么

Embedding 不是：

- 数据库；
- 搜索引擎的全部；
- 自动保证答案正确的魔法；
- 组件 Props 或导入路径的可靠来源；
- 给业务数据做无监督授权的理由；
- 每次都必须训练自己的模型。

在组件搜索系统中，Embedding 只负责从大量组件中找出“语义上可能相关”的候选。组件名、Props、导出方式、源码位置和真实使用关系仍应由 AST 或依赖图提供。

---

## 3. 必须掌握的最小数学

### 3.1 向量

向量可以先理解为“一组有顺序的数字”：

```text
A = [1, 2, 3]
B = [2, 1, 0]
```

向量的维度是数字的数量。上面的向量维度为 3。

同一次检索中，所有向量必须由同一个模型和相同配置生成，维度也必须一致。

### 3.2 点积

两个向量的点积是对应位置相乘后求和：

```text
A · B = 1×2 + 2×1 + 3×0 = 4
```

点积是余弦相似度的组成部分。

### 3.3 向量长度

向量长度也叫范数：

```text
|A| = sqrt(1² + 2² + 3²)
```

### 3.4 余弦相似度

余弦相似度比较两个向量方向是否接近：

```text
cosine(A, B) = (A · B) / (|A| × |B|)
```

常见理解：

- 越接近 `1`：方向越相近；
- 接近 `0`：相关性较弱；
- 小于 `0`：方向相反，但具体含义依模型而定。

不要把 `0.82` 直接解释成“82% 正确”。它只是特定模型空间中的相似度。

### 3.5 TypeScript 实现

```ts
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimensions differ: ${a.length} !== ${b.length}`);
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

练习：

```ts
const query = [1, 1, 0];
const nineGrid = [0.9, 0.8, 0.1];
const swiperSlide3 = [0.1, 0, 1];

console.log(cosineSimilarity(query, nineGrid));
console.log(cosineSimilarity(query, swiperSlide3));
```

预期：`nineGrid` 的相似度明显更高。

> 上面的三维向量只是教学示意。真实 Embedding 向量必须由模型生成，不能手工猜。

---

## 4. 第一个可运行实验：不用模型理解向量检索

在接入真实模型前，先用最简单的词袋向量理解完整流程。

### 4.1 定义词表

```ts
const vocabulary = ["九宫格", "图片", "网格", "排行榜"];
```

### 4.2 把文本转换成计数向量

```ts
function bagOfWords(text: string): number[] {
  return vocabulary.map((word) => {
    const matches = text.match(new RegExp(word, "g"));
    return matches?.length ?? 0;
  });
}
```

### 4.3 检索候选

```ts
const components = [
  {
    id: "NineGrid",
    text: "九宫格 图片 网格，展示九张照片",
  },
  {
    id: "SwiperSlide3",
    text: "排行榜第三页，展示宝宝排行信息",
  },
  {
    id: "TemplateGrid",
    text: "模板网格，展示多个拼图模板",
  },
];

const queryVector = bagOfWords("九宫格图片组件");

const results = components
  .map((component) => ({
    ...component,
    score: cosineSimilarity(queryVector, bagOfWords(component.text)),
  }))
  .sort((a, b) => b.score - a.score);

console.table(results);
```

这个例子不是神经网络 Embedding，因为它仍然依赖人工词表。但它完整展示了检索链路：

```text
文本 → 向量 → 相似度 → 排序 → Top-K
```

真实 Embedding 只是把 `bagOfWords()` 换成能力更强的模型。

---

## 5. 组件应该怎样转换成 Embedding 文本

不要只把组件名送给模型：

```text
NineGrid
```

组件名提供的信息太少。应使用稳定、结构化、面向检索的文本：

```text
Component: NineGrid
Framework: react
Description: 九宫格图片展示组件，用于展示 3×3 照片或卡片
Use cases: 宝宝照片拼图; 图片预览; 九宫格内容展示
Props: images: string[]; onItemClick?: (index: number) => void
Rendered elements: div, img
Source path: modules/puzzle/src/components/NineGrid/index.tsx
```

建议包含：

- 组件名；
- 中文或英文描述；
- 使用场景；
- Props 名称与类型摘要；
- 渲染元素；
- 框架；
- 源码路径；
- 导出信息。

不建议包含：

- 整个源码文件；
- 自动生成的大量 CSS；
- Base64 图片；
- 无意义 import；
- 构建产物；
- 密钥、用户数据或其他敏感内容。

### 5.1 为什么描述和 Use cases 很重要

如果 `NineGrid` 只有空的 JSX：

```tsx
export default function NineGrid() {
  return <div className="nine-grid" />;
}
```

模型能获得的业务语义仍然很少。Embedding 不能凭空知道它应该展示九张图片。

因此高质量检索依赖两部分：

1. 可靠的源码结构抽取；
2. 高质量的描述、JSDoc、Storybook、示例或 `@use-case`。

Embedding 是放大器，输入文档质量决定了它能放大什么。

---

## 6. 设计可替换的 EmbeddingProvider

不要把某个厂商 SDK 直接散落在搜索代码里。先定义接口：

```ts
export interface EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;

  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}
```

调用方只依赖接口：

```ts
async function buildVectors(
  provider: EmbeddingProvider,
  documents: Array<{ id: string; embeddingText: string }>
) {
  const vectors = await provider.embedDocuments(
    documents.map((document) => document.embeddingText)
  );

  return documents.map((document, index) => ({
    id: document.id,
    vector: vectors[index],
    model: provider.model,
    dimensions: provider.dimensions,
  }));
}
```

这样可以自由切换：

- 云端 Embedding 服务；
- 公司内部模型服务；
- 本地开源模型；
- 测试用 Fake Provider。

### 6.1 测试用 Fake Provider

```ts
class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly model = "fake-v1";
  readonly dimensions = 4;

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return texts.map((text) => bagOfWords(text));
  }

  async embedQuery(text: string): Promise<number[]> {
    return bagOfWords(text);
  }
}
```

Fake Provider 不能用于真实语义检索，但非常适合先打通索引、缓存、搜索和测试。

---

## 7. 建立最小向量索引

对于几百或几千个组件，第一版不必立即引入向量数据库。可以先把向量保存在本地索引中并线性扫描。

### 7.1 推荐的数据结构

```ts
interface VectorRecord {
  id: string;
  vector: number[];
  documentHash: string;
  model: string;
  dimensions: number;
  indexedAt: string;
}
```

必须保存：

- `documentHash`：判断 `embeddingText` 是否变化；
- `model`：模型升级时使旧缓存失效；
- `dimensions`：防止不同维度被混用；
- `indexedAt`：排查索引陈旧问题。

### 7.2 线性向量搜索

```ts
interface VectorSearchResult {
  id: string;
  vectorScore: number;
}

function searchVectors(
  queryVector: number[],
  records: VectorRecord[],
  limit = 20
): VectorSearchResult[] {
  return records
    .map((record) => ({
      id: record.id,
      vectorScore: cosineSimilarity(queryVector, record.vector),
    }))
    .sort((a, b) => b.vectorScore - a.vectorScore)
    .slice(0, limit);
}
```

### 7.3 增量更新

每次重建索引前：

1. 计算新的 `embeddingText` 哈希；
2. 哈希未变化并且模型相同：复用旧向量；
3. 哈希变化：重新生成向量；
4. 组件删除：删除对应向量；
5. 新组件：生成新向量。

不要每次启动 MCP 都为全部组件重新请求向量，这会浪费时间和费用。

---

## 8. 为什么不能只使用向量搜索

向量搜索擅长业务语义，但以下查询通常更适合关键词搜索：

```text
NineGrid
onVisibleChange
modules/puzzle/src/components
CalendarNew
```

这些是组件名、Props 或路径，精确匹配比语义相似更可靠。

推荐架构：

```text
用户查询
   ├── 关键词/BM25 Top-20：名称、Props、路径、精确术语
   └── Embedding Top-20：业务语义、中英文表达、相似用途
                    ↓
                 合并去重
                    ↓
       业务重排：usage、deprecated、scope
                    ↓
                  Top-10
```

这叫 Hybrid Search，即混合检索。

---

## 9. 使用 RRF 合并关键词与向量排名

关键词分数和余弦相似度不在同一尺度：

```text
keywordScore = 96
vectorScore  = 0.84
```

直接相加没有合理含义。第一版可以使用 RRF（Reciprocal Rank Fusion），它主要关注排名而不是原始分数。

```text
RRF score = 1 / (k + rank)
```

### 9.1 TypeScript 实现

```ts
interface RankedItem {
  id: string;
}

function reciprocalRankFusion(
  rankings: RankedItem[][],
  limit = 10,
  k = 60
) {
  const scores = new Map<string, number>();

  for (const ranking of rankings) {
    ranking.forEach((item, index) => {
      const rank = index + 1;
      scores.set(item.id, (scores.get(item.id) ?? 0) + 1 / (k + rank));
    });
  }

  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
```

### 9.2 再叠加业务规则

RRF 召回后，可以继续调整：

```ts
function applyBusinessBoost(
  score: number,
  component: {
    usageCount: number;
    status: "stable" | "deprecated";
    exactNameMatch: boolean;
  }
) {
  let finalScore = score;

  if (component.exactNameMatch) finalScore += 0.05;
  finalScore += Math.min(component.usageCount, 10) * 0.001;
  if (component.status === "deprecated") finalScore -= 1;

  return finalScore;
}
```

业务加权需要通过评测数据调整，不要不断加入只对某一个查询有效的特殊规则。

---

## 10. 怎样证明 Embedding 真的有效

“看起来搜得不错”不是评测。

### 10.1 建立查询评测集

```ts
interface EvaluationCase {
  query: string;
  expectedComponentIds: string[];
}

const cases: EvaluationCase[] = [
  {
    query: "九宫格图片展示组件",
    expectedComponentIds: [
      "node-tools:modules/puzzle/src/components/NineGrid/index.tsx#NineGrid",
    ],
  },
  {
    query: "可以左右切换拼图模板的弹窗",
    expectedComponentIds: [
      "node-tools:modules/puzzle/src/components/PreviewModal.tsx#PreviewModal",
    ],
  },
];
```

评测集应该来自真实开发问题，而不是为了迎合当前算法临时编造。

### 10.2 关注的指标

#### Top-1 Accuracy

第一名是否为正确结果：

```text
正确 Top-1 数量 / 总查询数
```

#### Recall@K

前 K 个结果里是否至少出现一个正确结果：

```text
命中查询数 / 总查询数
```

组件推荐常看 Recall@3 或 Recall@5，因为 Agent 还能继续检查少量候选。

#### MRR

正确结果越靠前，得分越高：

```text
第 1 名命中：1
第 2 名命中：1/2
第 3 名命中：1/3
```

#### 业务指标

- 推荐结果最终被复用的比例；
- 搜索后仍然新建重复组件的比例；
- deprecated 组件误推荐率；
- 无结果率；
- 查询耗时；
- 索引更新时间和失败率。

### 10.3 必须进行三组对比

```text
A：纯关键词
B：纯向量
C：关键词 + 向量混合检索
```

只有 C 在真实评测集上稳定优于 A，才能证明接入 Embedding 带来了价值。

---

## 11. 什么时候需要向量数据库

### 普通遍历就够了

- 几百到几千个组件；
- 单机、本地 MCP；
- 更新不频繁；
- 希望快速验证效果；
- 允许几十毫秒级线性扫描。

### 考虑向量数据库

- 数十万或数百万条文档；
- 多仓库、多团队；
- 需要高并发查询；
- 需要按部门、权限、框架等元数据过滤；
- 需要在线更新和持久化；
- 线性扫描无法满足延迟要求。

常见向量检索能力包括：

- ANN：近似最近邻；
- HNSW：常见的图索引算法；
- IVF：先分桶再搜索；
- Quantization：降低向量存储和计算成本；
- Metadata Filtering：先按权限或业务字段过滤。

学习阶段不要一开始就陷入数据库选型。先证明检索质量，再优化基础设施。

---

## 12. 从入门到精通的学习路线

这里的“精通”不是背完所有论文，而是能够独立完成设计、实现、评测、排障和优化。

### 第一阶段：建立直觉（2～3 天）

学习：

- 文本为什么可以表示成向量；
- 向量维度；
- 点积、范数、余弦相似度；
- Top-K 检索。

实践：

1. 手算两个三维向量的余弦相似度。
2. 实现本文的 `cosineSimilarity()`。
3. 完成词袋向量搜索示例。

验收标准：

- 能解释向量相似度为什么不是准确率；
- 能排查维度不一致和零向量；
- 能实现一个内存 Top-K 搜索。

### 第二阶段：接入真实 Embedding（3～5 天）

学习：

- 文档向量与查询向量；
- 批量请求；
- 输入长度和截断；
- 模型、维度与版本管理；
- 本地模型和远程服务的差异。

实践：

1. 定义 `EmbeddingProvider`。
2. 实现 Fake Provider 测试。
3. 接入一个支持中英文的真实 Provider。
4. 为 20 个组件生成向量并持久化。

验收标准：

- 相同文本可以稳定生成同维度向量；
- 文档和查询使用兼容的模型；
- 能批量生成、缓存和重试；
- 不会在日志中泄露密钥。

### 第三阶段：实现混合检索（3～5 天）

学习：

- 倒排索引与 BM25；
- 向量召回；
- RRF；
- 业务重排；
- 元数据过滤。

实践：

1. 保留现有关键词搜索。
2. 增加向量 Top-20。
3. 使用 RRF 合并。
4. 为 exact name、usage、deprecated 增加重排。

验收标准：

- `NineGrid` 精确查询仍然稳定命中；
- “展示九张宝宝照片”也能命中 `NineGrid`；
- `SwiperSlide3` 不再因数字 `3` 排在九宫格查询首位。

### 第四阶段：建立评测体系（3～7 天）

学习：

- Top-1、Recall@K、MRR；
- 正例、难负例和 hard negative；
- 离线评测与线上指标；
- 错误分析。

实践：

1. 收集 30～50 条真实查询。
2. 对比关键词、向量和混合检索。
3. 对错误结果按原因分类。
4. 调整文档构造、召回数量和重排规则。

验收标准：

- 每次修改检索算法都能自动输出对比结果；
- 能说清提升来自哪里，退化发生在哪里；
- 不用单个演示案例代替整体效果。

### 第五阶段：工程化与生产能力（1～3 周）

学习：

- 增量索引；
- 并发、限流、重试和退避；
- 请求费用与批处理；
- 数据权限与脱敏；
- 监控和追踪；
- 向量数据库与 ANN。

实践：

1. 基于 `documentHash` 只更新变化组件。
2. 保存模型版本和向量维度。
3. 增加索引构建耗时、查询耗时和失败率日志。
4. 做一次模型升级和全量重建演练。
5. 数据量扩大后再比较线性扫描与向量数据库。

验收标准：

- 服务重启后索引仍可使用；
- 模型或维度变化不会误用旧缓存；
- 单个 Provider 失败不会破坏原有关键词搜索；
- 能安全地回滚到旧索引。

### 第六阶段：高级优化（持续学习）

深入主题：

- Dual Encoder 与对比学习；
- Cross Encoder / Reranker；
- Hard Negative Mining；
- 多向量表示；
- Query Rewrite；
- HyDE；
- 向量空间各向异性与 hubness；
- HNSW 参数；
- 量化与召回损失；
- 领域微调和蒸馏。

达到这个阶段后，应先用数据说明基础混合检索的瓶颈，再选择高级方法。

---

## 13. 推荐的项目落地顺序

以 `component-search-mcp` 为例：

```text
src/types.ts
  已有 ComponentMetadata
        ↓
src/embedding-document.ts
  已有 embeddingText
        ↓
新增 src/embedding/provider.ts
  EmbeddingProvider 接口与实现
        ↓
新增 src/vector-store.ts
  保存、加载、增量更新和线性检索
        ↓
修改 src/scanner.ts
  扫描后为新增/变化组件生成向量
        ↓
修改 src/search.ts
  关键词 Top-K + 向量 Top-K + RRF
        ↓
新增 test/evaluation.test.ts
  真实查询评测集和指标
```

建议分成以下提交：

1. `test: add semantic search evaluation cases`
2. `feat: define embedding provider abstraction`
3. `feat: add local vector index and cosine search`
4. `feat: add hybrid ranking with RRF`
5. `feat: add incremental vector cache`
6. `docs: document provider configuration and privacy`

每个提交都可测试、可回滚，比一次性加入模型、数据库和新排序更容易排查。

---

## 14. 常见错误与排查方式

### 错误 1：把相似度当概率

错误说法：

```text
相似度 0.86，所以有 86% 概率是正确组件。
```

正确做法：通过评测集观察某个相似度区间的实际命中情况。

### 错误 2：文档和查询使用不同模型

结果可能维度不同，或即使维度相同也不在同一个向量空间中。

索引必须保存：

```text
provider + model + dimensions + documentHash
```

### 错误 3：只向量化组件名

`NineGrid` 的信息远少于结构化 `embeddingText`。应补充描述、Use cases、Props 和路径。

### 错误 4：只用向量搜索

精确名称、Props 和路径会退化。应保留关键词召回并混合排序。

### 错误 5：没有评测集就调权重

你会不断修复演示查询，却不知道其他查询是否已经退化。

### 错误 6：每次启动都重建全部向量

应基于文档哈希和模型版本增量更新。

### 错误 7：忽略空组件和低质量文档

Embedding 无法从空壳组件中推断完整业务能力。需要补充 JSDoc、Props、Story 或真实用例。

### 错误 8：提前引入复杂向量数据库

数据量很小时，复杂基础设施不会自动提高检索质量。先做线性扫描和效果评测。

### 错误 9：忽略数据安全

如果使用远程模型，不要默认把整个内部源码发送出去。应明确：

- 哪些字段允许离开本地；
- 是否需要只发送描述和公开 Props；
- 服务是否保存输入；
- 密钥如何注入；
- 日志是否包含源码；
- 不同项目和团队如何隔离。

---

## 15. 练习题

### 入门练习

1. 为什么两个文本字面完全不同，Embedding 仍可能相似？
2. 为什么余弦相似度不能直接解释为正确率？
3. 两个不同维度的向量能否直接计算余弦相似度？
4. 为什么组件名、Props 和路径仍需要关键词搜索？

### 编程练习

1. 为 `cosineSimilarity()` 增加单元测试。
2. 实现 `topK()`，避免修改原始数组。
3. 为 Fake Provider 增加批量调用计数，验证索引是否重复生成。
4. 实现基于 SHA-256 的 `documentHash`。
5. 实现 RRF，并测试一个组件同时被两路召回时排名会上升。
6. 为 deprecated 组件增加强降权。

### 项目练习

1. 收集 30 条真实组件搜索问题。
2. 标注每条查询的期望组件。
3. 输出当前关键词检索的 Top-1 和 Recall@3。
4. 加入向量检索后重新评测。
5. 找出 5 个 hard negatives，例如：

```text
NineGrid vs SwiperSlide3
TemplateGrid vs NineGrid
PreviewModal vs 普通 Modal
CalendarNew vs 普通 Grid
图片选择器 vs 图片展示组件
```

6. 写出每个错误的原因：文档问题、召回问题、重排问题还是索引问题。

---

## 16. 自测答案

<details>
<summary>展开查看入门练习答案</summary>

1. Embedding 模型学习的是语义模式，不只比较相同字符，因此中英文、同义词和相近业务描述可能靠近。
2. 相似度是向量空间中的几何关系，没有天然的概率校准。
3. 不能。维度不同通常说明模型或配置不同，应阻止比较。
4. 精确名称、Props 和路径属于强字面信号，关键词搜索通常更可靠。

</details>

---

## 17. 每周学习安排示例

### 第 1 周：理解并手写

- Day 1：向量、维度、点积。
- Day 2：范数、余弦相似度。
- Day 3：完成词袋检索。
- Day 4：阅读组件索引的数据结构。
- Day 5：设计 20 条评测查询。

### 第 2 周：接入模型

- Day 1：定义 `EmbeddingProvider`。
- Day 2：完成 Fake Provider 和测试。
- Day 3：接入真实 Provider。
- Day 4：批量生成和缓存向量。
- Day 5：实现向量 Top-K。

### 第 3 周：混合检索

- Day 1：理解关键词检索和 BM25。
- Day 2：实现 RRF。
- Day 3：加入 usage/deprecated 重排。
- Day 4：对比三种检索方式。
- Day 5：分析错误案例。

### 第 4 周：工程化

- Day 1：增量索引。
- Day 2：失败重试与降级。
- Day 3：模型版本和缓存迁移。
- Day 4：权限、脱敏和日志。
- Day 5：整理评测报告和下一阶段计划。

每天建议：

```text
30 分钟概念学习
60 分钟编码实验
30 分钟记录结果与问题
```

---

## 18. 精通检查清单

如果下面大部分问题都能独立回答和实现，就已经具备工程上的熟练能力：

- [ ] 能解释 Embedding 与关键词搜索的边界。
- [ ] 能实现并测试余弦相似度。
- [ ] 能设计高质量 `embeddingText`。
- [ ] 能实现可替换的 Provider。
- [ ] 能批量生成并增量缓存向量。
- [ ] 能完成 Top-K 向量检索。
- [ ] 能用 RRF 实现混合召回。
- [ ] 能设计 hard negative。
- [ ] 能计算 Top-1、Recall@K 和 MRR。
- [ ] 能根据错误分类优化系统。
- [ ] 能处理模型升级和向量维度变化。
- [ ] 能设计失败时回退到关键词搜索的方案。
- [ ] 能判断何时需要向量数据库。
- [ ] 能评估源码发送到远程 Provider 的安全风险。
- [ ] 能通过数据说明一次优化是否真实有效。

---

## 19. 一页速查表

```text
Embedding：文本 → 数字向量
Vector：一组有顺序的数字
Dimension：向量包含多少个数字
Cosine Similarity：比较向量方向
Top-K：取最相近的 K 个候选
Vector Search：用向量相似度召回候选
Keyword Search：按名称、词语、Props、路径召回候选
Hybrid Search：关键词 + 向量
RRF：按多个结果列表的排名进行融合
Rerank：对候选进行更精细的重新排序
Recall@K：前 K 个结果是否包含正确答案
MRR：正确答案出现得越靠前越好
ANN：牺牲少量精度换取更快的近似向量搜索
HNSW：常见 ANN 图索引
Hard Negative：看起来很像但实际上错误的候选
```

最重要的原则：

```text
先建立评测集，再接 Embedding；
先使用简单向量遍历，再考虑向量数据库；
保留关键词检索，使用混合排序；
让向量负责召回，让 AST 和业务规则保证可靠性。
```

