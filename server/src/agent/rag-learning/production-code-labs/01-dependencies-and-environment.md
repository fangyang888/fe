# 第 01 章：依赖、版本和环境配置

对应原文：第 6、13～16 节。

## 现状

项目当前安装了 `langchain@1.5.5`、`@langchain/core@1.2.5`、`@langchain/openai@1.5.6`，但没有安装官方教程使用的 `@langchain/textsplitters` 和 `@langchain/classic`。代码实验不能假设它们已经存在。

## 任务 1：学习阶段依赖

真正开始本章编码时执行：

```bash
cd server
pnpm add @langchain/textsplitters @langchain/classic
```

进入 Elasticsearch 实验前再增加：

```bash
pnpm add @elastic/elasticsearch
```

不要提前安装 PDF、OCR、Rerank 等本阶段未使用的包。

## 任务 2：环境变量

在 `server/.env.example` 只写占位说明：

```dotenv
# RAG models
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_EMBEDDING_DIMENSIONS=
RAG_ANSWER_MODEL=

# Knowledge search; do not reuse Kibana browser cookies or ELK MCP token
KNOWLEDGE_ELASTICSEARCH_NODE=http://127.0.0.1:9200
KNOWLEDGE_ELASTICSEARCH_API_KEY=
KNOWLEDGE_INDEX_ALIAS=knowledge_chunks_current

# Runtime gates
RAG_ENABLED=false
RAG_RETRIEVAL_TOP_K=20
RAG_CONTEXT_TOP_K=6
```

Embedding 维度留空时使用模型默认值；如果显式降维，必须写入 indexVersion 并重新评估。

## 任务 3：配置校验

未来建立：

```ts
// server/src/knowledge/config/knowledge-config.ts
import { z } from 'zod';

export const KnowledgeConfigSchema = z.object({
  enabled: z.boolean(),
  embeddingModel: z.string().min(1),
  embeddingDimensions: z.number().int().positive().optional(),
  elasticsearchNode: z.string().url(),
  indexAlias: z.string().regex(/^[a-z0-9_-]+$/),
  retrievalTopK: z.number().int().min(1).max(100),
  contextTopK: z.number().int().min(1).max(20),
}).refine((v) => v.contextTopK <= v.retrievalTopK, {
  message: 'contextTopK 不能大于 retrievalTopK',
});
```

API Key 不属于可打印配置对象。启动日志只能输出模型名、索引别名和非敏感开关。

## 任务 4：版本快照

每次评估报告保存：

```ts
type RagRuntimeVersion = {
  appCommit: string;
  nodeVersion: string;
  langchainVersion: string;
  embeddingModel: string;
  embeddingDimensions: number;
  answerModel: string;
  elasticsearchVersion: string;
  indexVersion: string;
  retrievalConfigVersion: string;
};
```

“latest”不能写进生产配置作为不可追踪版本。升级依赖或模型时先构建新索引并运行同一套评估。

## Gate 01

- [ ] Node 版本满足项目 `>=20.19.0`，不要使用终端里意外出现的 Node 18。
- [ ] `.env.example` 不含真实密钥。
- [ ] 应用启动时能拒绝矛盾配置。
- [ ] 知识 ES 凭据与日志 ELK MCP 凭据明确隔离。

