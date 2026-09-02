# 第 01 章：创建 KnowledgeModule 与配置

## 本章结果

建立一个尚不检索、但能被 NestJS 正确加载的 `KnowledgeModule`，并用 Zod 校验 RAG 配置。

## 开始前状态

- `server/src/knowledge` 不存在。
- `AgentModule` 不依赖知识模块。
- 本章不调用模型，也不连接 Elasticsearch。

## 第一步：安装最小依赖

```bash
cd server
pnpm add @langchain/textsplitters @langchain/classic
```

为什么现在安装：第 03 章需要 TextSplitter，第 04 章需要 MemoryVectorStore。其他向量数据库客户端不属于当前客服跟敲主线，等完成第 12 章的存储替换实验后再选择。

运行：

```bash
pnpm why @langchain/textsplitters
pnpm why @langchain/classic
```

确认依赖来自当前 `server` package，而不是全局环境。

## 第二步：创建配置文件

新建：

```text
server/src/knowledge/config/knowledge.config.ts
```

```ts
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const optionalPositiveInt = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? Number(value) : undefined))
  .pipe(z.number().int().positive().optional());

export const KnowledgeConfigSchema = z
  .object({
    enabled: booleanFromString.describe('是否启用 RAG 路由；关闭时不能静默改由通用模型猜政策'),
    embeddingModel: z
      .string()
      .trim()
      .min(1)
      .describe('生成文档与查询向量的 Embedding 模型名称'),
    embeddingDimensions: optionalPositiveInt.describe(
      '可选的向量维度；为空时使用模型默认维度，变化后必须重建索引',
    ),
    retrievalTopK: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .describe('Retriever 第一阶段最多召回的候选 Chunk 数量'),
    contextTopK: z.coerce
      .number()
      .int()
      .min(1)
      .max(20)
      .describe('去重和重排后最多交给回答模型的证据数量'),
    tenantId: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .describe('知识所属商城标识；当前单商城固定由服务端配置'),
  })
  .refine((value) => value.contextTopK <= value.retrievalTopK, {
    message: 'RAG_CONTEXT_TOP_K 不能大于 RAG_RETRIEVAL_TOP_K',
  });

export type KnowledgeConfig = z.infer<typeof KnowledgeConfigSchema>;

export function readKnowledgeConfig(config: ConfigService): KnowledgeConfig {
  return KnowledgeConfigSchema.parse({
    enabled: config.get('RAG_ENABLED') ?? 'false',
    embeddingModel:
      config.get('OPENAI_EMBEDDING_MODEL') ?? 'text-embedding-3-small',
    embeddingDimensions: config.get('OPENAI_EMBEDDING_DIMENSIONS'),
    retrievalTopK: config.get('RAG_RETRIEVAL_TOP_K') ?? '20',
    contextTopK: config.get('RAG_CONTEXT_TOP_K') ?? '6',
    tenantId: config.get('RAG_TENANT_ID') ?? 'default-shop',
  });
}
```

### 逐段理解

- 环境变量全部是字符串，不能用 `Boolean('false')`，结果会是 `true`。
- `retrievalTopK` 是候选召回数，`contextTopK` 是最终交给模型的数量。
- 当前项目是单商城，tenantId 使用服务端配置，不接受前端参数。
- 配置矛盾时应用尽早失败，比运行到检索阶段更容易排查。

## 第三步：先写配置测试

新建：

```text
server/src/knowledge/config/knowledge.config.spec.ts
```

```ts
import { ConfigService } from '@nestjs/config';
import { readKnowledgeConfig } from './knowledge.config';

describe('knowledge config', () => {
  it('读取默认的学习配置', () => {
    const result = readKnowledgeConfig(new ConfigService({}));
    expect(result).toMatchObject({
      enabled: false,
      embeddingModel: 'text-embedding-3-small',
      retrievalTopK: 20,
      contextTopK: 6,
      tenantId: 'default-shop',
    });
  });

  it('拒绝 contextTopK 大于 retrievalTopK', () => {
    const config = new ConfigService({
      RAG_RETRIEVAL_TOP_K: '3',
      RAG_CONTEXT_TOP_K: '6',
    });
    expect(() => readKnowledgeConfig(config)).toThrow(
      /RAG_CONTEXT_TOP_K/,
    );
  });

  it('正确解析 false，不把非空字符串当 true', () => {
    const config = new ConfigService({ RAG_ENABLED: 'false' });
    expect(readKnowledgeConfig(config).enabled).toBe(false);
  });
});
```

运行：

```bash
pnpm test -- knowledge.config.spec.ts --runInBand
```

## 第四步：创建空 Module

新建 `server/src/knowledge/knowledge.module.ts`：

```ts
import { Module } from '@nestjs/common';

@Module({})
export class KnowledgeModule {}
```

暂时不要导入 `AgentModule`，避免循环依赖。后面由 `AgentModule` 单向 import `KnowledgeModule`。

## 第五步：补环境示例

在 `.env.example` 增加：

```dotenv
RAG_ENABLED=false
RAG_TENANT_ID=default-shop
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_EMBEDDING_DIMENSIONS=
RAG_RETRIEVAL_TOP_K=20
RAG_CONTEXT_TOP_K=6
```

不要填写真实 Key。

## 故意破坏实验

把 `RAG_ENABLED` 设置为 `1`，观察 Zod 拒绝。理解严格配置比“兼容所有写法”更容易保证上线一致性。

## Gate 01

- [ ] 配置测试全部通过。
- [ ] `pnpm run build` 通过。
- [ ] 能解释为什么 Chat 模型和 Embedding 模型配置分开。
- [ ] 没有修改现有 Agent 路由。
