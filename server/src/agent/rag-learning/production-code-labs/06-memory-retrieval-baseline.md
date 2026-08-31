# 第 06 章：内存 Dense Retrieval 基线

对应原文：第 16～19 节和作业 3。

## 目标

用最少基础设施验证 Loader、Chunk、Embedding 和检索领域对象。它是学习基线，不是上线存储。

## 任务 1：建立 MemoryVectorStore

```ts
import { Document } from '@langchain/core/documents';
import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory';

const documents = chunks.map(
  (chunk) => new Document({
    id: chunk.chunkId,
    pageContent: chunk.content,
    metadata: chunk,
  }),
);

const store = await MemoryVectorStore.fromDocuments(documents, embeddings);
```

LangChain Document 只存在基础设施适配层，Controller 和 AnswerService 仍使用第 02 章领域对象。

## 任务 2：调试接口

```http
POST /api/internal/knowledge/search-debug
Authorization: Bearer <admin-test-token>
Content-Type: application/json

{"query":"拆封耳机可以退吗","topK":5}
```

返回：

```ts
{
  query: string;
  indexVersion: 'memory-dev-v1';
  candidates: Array<{
    chunkId: string;
    documentId: string;
    title: string;
    sectionPath: string[];
    score: number | null;
    contentPreview: string;
  }>;
}
```

接口必须受保护且只用于开发。普通客服接口不展示原始分数和私有正文。

## 任务 3：20 条最小数据集

```ts
type RetrievalFixture = {
  id: string;
  question: string;
  expectedDocumentIds: string[];
  tags: string[];
};
```

至少覆盖同义表达、编号、例外、无答案、新旧版本和恶意文档。

## 任务 4：记录失败原因

每个 miss 标记：

```text
source_missing
parse_error
chunk_boundary
dense_miss
version_filter
permission_filter
unknown
```

本章尚未实现 BM25 和真实过滤，但数据集必须提前保留这些标签。

## 测试

- Fake Embedding 下排名确定。
- 重复索引不会无限增加相同 Chunk。
- Search 返回稳定领域对象，不泄露 VectorStore 实现。
- 无答案问题仍会返回“最相近候选”，因此本章禁止直接把 Top1 当答案。

## Gate 06

- [ ] 20 条查询能批量运行并输出失败清单。
- [ ] 能计算 Hit Rate@3。
- [ ] 明确记录 Memory Store 重启丢失且不支持多实例。
- [ ] 尚未调用 Chat 模型生成回答。

