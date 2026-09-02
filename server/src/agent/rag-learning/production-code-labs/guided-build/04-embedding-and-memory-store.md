# 第 04 章：Embedding 与 MemoryVectorStore

## 本章结果

第一次把 Chunk 变成向量，并在内存中搜索。先使用 Fake Embedding 写稳定测试，再使用真实 OpenAI Embedding 做人工实验。

## 第一步：定义 Adapter 端口

新建 `server/src/knowledge/embedding/embedding.port.ts`：

```ts
export abstract class EmbeddingPort {
  /** Embedding 配置版本；至少包含模型和维度，用于判断索引是否兼容。 */
  abstract readonly version: string;
  /** 批量把文档 Chunk 文本转换为同一向量空间中的向量。 */
  abstract embedDocuments(texts: string[]): Promise<number[][]>;
  /** 把单条用户检索 Query 转换为与文档兼容的查询向量。 */
  abstract embedQuery(text: string): Promise<number[]>;
}
```

使用 abstract class 而不是 TypeScript interface，是因为 NestJS 运行时依赖注入需要真实 Token。

## 第二步：真实 Adapter

新建 `openai-embedding.adapter.ts`：

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIEmbeddings } from '@langchain/openai';
import { EmbeddingPort } from './embedding.port';

@Injectable()
export class OpenAiEmbeddingAdapter extends EmbeddingPort {
  readonly version: string;
  private readonly client: OpenAIEmbeddings;

  constructor(config: ConfigService) {
    super();
    const model = config.get('OPENAI_EMBEDDING_MODEL') ?? 'text-embedding-3-small';
    const baseURL = config.get<string>('OPENAI_BASE_URL')?.trim();
    this.version = model;
    this.client = new OpenAIEmbeddings({
      apiKey: config.getOrThrow('OPENAI_API_KEY'),
      model,
      batchSize: 64,
      maxRetries: 2,
      ...(baseURL ? { configuration: { baseURL } } : {}),
    });
  }

  embedDocuments(texts: string[]) {
    this.validate(texts);
    return this.client.embedDocuments(texts);
  }

  embedQuery(text: string) {
    this.validate([text]);
    return this.client.embedQuery(text);
  }

  private validate(texts: string[]) {
    if (texts.length === 0 || texts.some((x) => !x.trim())) {
      throw new Error('Embedding 文本不能为空');
    }
  }
}
```

## 第三步：为什么测试不用真实 API

真实 Embedding 有费用、限流和网络不确定性。单元测试用确定性 Fake：

```ts
export class FakeEmbeddingAdapter extends EmbeddingPort {
  readonly version = 'fake-v1';

  async embedDocuments(texts: string[]) {
    return Promise.all(texts.map((text) => this.embedQuery(text)));
  }

  async embedQuery(text: string) {
    const normalized = text.toLowerCase();
    return [
      normalized.includes('退货') ? 1 : 0,
      normalized.includes('耳机') ? 1 : 0,
      normalized.includes('退款') ? 1 : 0,
    ];
  }
}
```

Fake 不是为了模拟真实语义质量，而是让索引和路由测试稳定。

## 第四步：建立内存索引 Service

```ts
import { Injectable } from '@nestjs/common';
import { Document } from '@langchain/core/documents';
import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory';

@Injectable()
export class MemoryKnowledgeIndexService {
  private store?: MemoryVectorStore;

  constructor(private readonly embeddings: EmbeddingPort) {}

  async rebuild(chunks: KnowledgeChunk[]) {
    const documents = chunks.map(
      (chunk) =>
        new Document({
          id: chunk.chunkId,
          pageContent: `${chunk.sectionPath.join(' > ')}\n${chunk.content}`,
          metadata: chunk,
        }),
    );
    this.store = await MemoryVectorStore.fromDocuments(
      documents,
      this.embeddings,
    );
  }

  async search(query: string, k = 3) {
    if (!this.store) throw new Error('知识索引尚未构建');
    return this.store.similaritySearchWithScore(query, k);
  }
}
```

标题路径加入 Embedding 文本，但原始 `chunk.content` 保持未污染，方便引用和展示。

## 第五步：测试

```ts
it('耳机退货问题优先找到对应政策', async () => {
  const index = new MemoryKnowledgeIndexService(new FakeEmbeddingAdapter());
  await index.rebuild(chunks);
  const results = await index.search('耳机可以退货吗', 3);
  expect(results[0][0].metadata.documentId).toBe('return-headphone');
});
```

## 第六步：人工真实实验

使用本地 `.env` 的 Key，写一个不进入 Jest 的开发脚本，分别查询：

```text
耳机拆了还能退吗
入耳式音频商品七天无理由限制
POLICY-2026-08
你们支持火星配送吗
```

观察：同义问题通常适合 Dense；精确编号可能表现不稳定；无答案问题仍会返回最相近结果。因此向量库的 Top1 不能直接视为答案。

## 故意破坏实验

用模型 A 建文档向量，再临时改成模型 B 生成查询向量，观察维度错误或语义空间不兼容。这就是升级 Embedding 必须重建索引的原因。

## Gate 04

- [ ] Fake 测试稳定且不访问网络。
- [ ] 真实实验能输出 TopK 和分数。
- [ ] 能解释相似度不是事实置信度。
- [ ] 明确 MemoryVectorStore 不能跨重启和多实例上线。
