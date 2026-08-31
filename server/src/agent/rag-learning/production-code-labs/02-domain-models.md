# 第 02 章：先写稳定领域模型

对应原文：第 7～8、12、35 节。

## 目标

上层代码不依赖 LangChain Document 或 Elasticsearch Hit 的原始结构，使向量库、Embedding 和 Reranker 可以替换。

## 任务 1：KnowledgeChunk

```ts
// server/src/knowledge/domain/knowledge-chunk.ts
export type KnowledgeVisibility = 'public' | 'customer' | 'staff';
export type KnowledgeStatus = 'draft' | 'published' | 'archived';

export type KnowledgeChunk = {
  chunkId: string;
  documentId: string;
  parentId: string | null;
  content: string;
  contentHash: string;
  title: string;
  sectionPath: string[];
  canonicalUrl: string | null;
  tenantId: string;
  visibility: KnowledgeVisibility;
  revision: number;
  status: KnowledgeStatus;
  validFrom: string | null;
  validTo: string | null;
  chunkIndex: number;
  parserVersion: string;
  splitterVersion: string;
};
```

## 任务 2：RetrievalCandidate

```ts
// server/src/knowledge/domain/retrieval-result.ts
export type RetrievalCandidate = {
  chunk: KnowledgeChunk;
  scores: {
    dense?: number;
    lexical?: number;
    fusion?: number;
    rerank?: number;
  };
};

export type RetrievalResult = {
  query: string;
  indexVersion: string;
  candidates: RetrievalCandidate[];
  degraded: boolean;
  timings: {
    rewriteMs: number;
    embeddingMs: number;
    denseMs: number;
    lexicalMs: number;
    fusionMs: number;
    rerankMs: number;
    totalMs: number;
  };
};
```

## 任务 3：权限范围

```ts
// server/src/knowledge/domain/knowledge-access-scope.ts
export type KnowledgeAccessScope = {
  tenantId: string;
  allowedVisibility: Array<'public' | 'customer' | 'staff'>;
  locale: string;
  asOfTime: string;
};
```

这个对象必须由认证用户和服务端时钟构造，Controller DTO 不允许直接接收它。

## 任务 4：端口接口

```ts
export interface KnowledgeSearchPort {
  search(input: {
    query: string;
    scope: KnowledgeAccessScope;
    candidateK: number;
    signal?: AbortSignal;
  }): Promise<RetrievalResult>;
}

export interface EmbeddingPort {
  readonly version: string;
  embedDocuments(texts: string[], signal?: AbortSignal): Promise<number[][]>;
  embedQuery(text: string, signal?: AbortSignal): Promise<number[]>;
}
```

## 测试

类型不能替代运行时校验。为 Loader 输入和 Elasticsearch 输出建立 Zod Schema，测试未知字段、缺失 tenantId、负 revision 和非法时间。

## Gate 02

- [ ] Domain 层不 import `@elastic/elasticsearch`。
- [ ] Domain 层不 import `@langchain/*`。
- [ ] `KnowledgeAccessScope` 不来自请求 DTO。
- [ ] RetrievalResult 能记录所有后续阶段的分数和耗时。

