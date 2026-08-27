# 第 05 章：实现最小可观察检索

## 本章目标

在当前 NestJS 项目中完成第一个可运行版本：输入问题，返回 TopK Chunk、分数和来源，不调用 Chat 模型生成答案。

---

## 一、为什么先只做检索

如果一开始把检索和生成连在一起，回答错误时很难判断：

```text
是正确证据没有被搜到？
还是证据搜到了但模型没有正确使用？
```

本章先建立可观察的检索基线。只有它稳定后，第 6 章才加入回答生成。

---

## 二、第一版目录

```text
server/src/knowledge/
├── knowledge.module.ts
├── api/
│   └── knowledge.controller.ts
├── domain/
│   ├── knowledge-chunk.ts
│   └── retrieval-result.ts
├── ingestion/
│   ├── knowledge-loader.service.ts
│   ├── knowledge-splitter.service.ts
│   └── knowledge-index.service.ts
├── retrieval/
│   └── knowledge-search.service.ts
└── fixtures/
    └── faq/
```

当前阶段不需要修改 `AgentService`，先让 Knowledge 模块独立工作。

---

## 三、稳定的检索领域对象

```ts
type RetrievalCandidate = {
  chunkId: string;
  content: string;
  source: {
    documentId: string;
    title: string;
    sectionPath: string[];
    revision: number;
    sourceUrl: string | null;
  };
  scores: {
    dense: number | null;
  };
};

type RetrievalResult = {
  query: string;
  indexVersion: string;
  candidates: RetrievalCandidate[];
  timings: {
    embeddingMs: number;
    searchMs: number;
    totalMs: number;
  };
};
```

不要把向量库原始对象直接一路传给 Agent 和前端。以后替换 Vector Store 时，上层应该保持稳定。

---

## 四、检索接口

学习接口可以设计为：

```http
POST /api/knowledge/search
Content-Type: application/json

{
  "query": "拆封后的耳机可以退货吗？",
  "topK": 3
}
```

响应示例：

```json
{
  "query": "拆封后的耳机可以退货吗？",
  "indexVersion": "faq-v1",
  "candidates": [
    {
      "chunkId": "return-headphone-v1-opened-0",
      "content": "……",
      "source": {
        "documentId": "return-headphone",
        "title": "耳机退货政策",
        "sectionPath": ["耳机退货政策", "已拆封商品"],
        "revision": 1,
        "sourceUrl": null
      },
      "scores": { "dense": 0.74 }
    }
  ],
  "timings": {
    "embeddingMs": 32,
    "searchMs": 4,
    "totalMs": 38
  }
}
```

学习接口可以展示原始分数；面向普通用户的最终接口不必暴露供应商分数。

---

## 五、实现顺序

### 步骤 1：准备 10 篇 FAQ

人工检查来源、版本、标题层级和例外条件。

### 步骤 2：实现 Loader

只读取允许目录中的 `.md` 文件，拒绝路径穿越和超大文件。

### 步骤 3：实现 Splitter

先测试纯切分逻辑，再接 Embedding。

### 步骤 4：建立学习用内存索引

它适合学习和单元测试，但服务重启会丢失，不是生产存储。

### 步骤 5：实现 SearchService

验证空查询、最大长度、TopK 范围和超时信号。

### 步骤 6：实现调试接口

返回结构化 Chunk、Metadata、分数、索引版本和耗时。

---

## 六、测试清单

### 切分测试

- 相同文档重复执行结果稳定。
- 标题路径和 Chunk ID 正确。
- 超长段落被拆分。
- 空白文件被跳过或拒绝。

### 索引测试

- 重复索引不会无限增加相同 Chunk。
- Embedding 失败时不会发布半成品版本。
- 索引摘要中的文档数和 Chunk 数正确。

### 检索测试

- 空查询返回 400。
- `topK` 有合理上下限。
- 同义问题能召回目标文档。
- 无关问题不会被误判为已有可靠答案。
- 返回结果包含 `indexVersion` 和完整来源。

---

## 七、第一个检索评估

准备至少 20 条：

```ts
type RetrievalCase = {
  id: string;
  question: string;
  expectedDocumentIds: string[];
};
```

计算最简单的 Hit Rate@3：

```text
Top 3 中至少有一个 expectedDocumentId → hit = 1
否则                                      → hit = 0

Hit Rate@3 = 所有 hit 之和 / 问题总数
```

必须保存失败问题清单。失败案例比单个总分更能指导下一步。

## 验收标准

- `/api/knowledge/search` 能返回可追踪的 TopK。
- 20 条固定查询可以重复运行。
- 能看到每条失败发生在哪个文档或 Chunk。
- 当前阶段没有把 Chat 模型接入回答流程。
- 能明确说明内存索引不能用于多实例生产环境。

通过后进入：[第 06 章：2-Step RAG、引用与拒答](./06-two-step-rag-citations-and-refusal.md)。

