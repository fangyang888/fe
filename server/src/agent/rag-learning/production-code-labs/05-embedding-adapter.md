# 第 05 章：Embedding Adapter、批处理与版本迁移

对应原文：第 13～15 节。

## 任务 1：与回答模型分开 Factory

现有 `AgentModelFactory` 负责 Chat 模型。新建独立 Adapter：

```ts
// server/src/knowledge/embedding/openai-embedding.adapter.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIEmbeddings } from '@langchain/openai';

@Injectable()
export class OpenAiEmbeddingAdapter implements EmbeddingPort {
  private readonly client: OpenAIEmbeddings;
  readonly version: string;

  constructor(config: ConfigService) {
    const model = config.getOrThrow<string>('OPENAI_EMBEDDING_MODEL');
    const baseURL = config.get<string>('OPENAI_BASE_URL')?.trim();
    this.client = new OpenAIEmbeddings({
      apiKey: config.getOrThrow<string>('OPENAI_API_KEY'),
      model,
      batchSize: 64,
      ...(baseURL ? { configuration: { baseURL } } : {}),
    });
    this.version = model;
  }

  embedDocuments(texts: string[]): Promise<number[][]> {
    return this.client.embedDocuments(texts);
  }

  embedQuery(text: string): Promise<number[]> {
    return this.client.embedQuery(text);
  }
}
```

核对当前 SDK 是否能直接传 `AbortSignal`。不能可靠下传时，由应用层整体 deadline 包装并记录限制，不要假装已经可取消。

## 任务 2：输入校验

```ts
function validateEmbeddingTexts(texts: string[]) {
  if (texts.length === 0) throw new Error('Embedding 批次不能为空');
  if (texts.some((text) => text.trim().length === 0)) {
    throw new Error('Embedding 文本不能为空');
  }
  if (texts.some((text) => text.length > 30_000)) {
    throw new Error('Embedding 文本过长，切分策略失效');
  }
}
```

字符上限是应用防线，不等同于模型 Token 上限。

## 任务 3：批处理与有限重试

只对 429、可恢复网络错误和部分 5xx 使用指数退避与抖动；401、403、无效输入和维度错误不重试。每个索引任务记录 attempt、成功 Chunk 和失败 Chunk，避免整批静默丢失。

## 任务 4：比较 small 与 large

```text
baseline-small → text-embedding-3-small
candidate-large → text-embedding-3-large
```

使用同一中文 Golden Dataset 比较 Hit Rate、Recall、MRR、索引体积、Embedding 成本和 P95。官方将 large 定位为更强的多语言模型，但你的生产选择仍要由数据决定。

## 任务 5：版本描述符

```ts
type EmbeddingDescriptor = {
  provider: 'openai-compatible';
  model: string;
  dimensions: number;
  normalization: 'provider-default';
};

function embeddingVersion(v: EmbeddingDescriptor): string {
  return sha256(JSON.stringify(v)).slice(0, 16);
}
```

模型或维度变化必须建立新 indexVersion，不能把两种向量混在同一字段。

## 测试

- 通过 FakeEmbeddingAdapter 生成确定向量，不在单元测试调用真实 API。
- 空文本和超长文本被拒绝。
- 不可重试错误只调用一次。
- 可重试错误达到上限后任务失败且不发布。
- 文档向量与查询向量维度必须一致。

## Gate 05

- [ ] Chat 和 Embedding 配置完全分离。
- [ ] 测试不消耗真实模型额度。
- [ ] 任何向量都能追踪 embeddingVersion。
- [ ] 已设计 small/large 对照实验。

