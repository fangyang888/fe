# 第 05 章：只返回证据的检索接口

## 本章结果

建立一个受保护的学习接口：输入客服问题，返回 TopK Chunk、来源和分数。仍然不调用 Chat 模型回答。

## 为什么必须经过这一章

如果直接让模型生成答案，错误时你无法判断：

```text
正确 Chunk 没搜到
还是正确 Chunk 已搜到但模型没用好
```

真正精通 RAG 的第一步，就是能单独观察 Retriever。

## 第一步：定义稳定检索结果

新建 `server/src/knowledge/domain/retrieval-result.ts`：

```ts
import { KnowledgeChunk } from './knowledge-chunk';

export type RetrievalCandidate = {
  /** 完整且经过领域校验的候选知识 Chunk。 */
  chunk: KnowledgeChunk;
  /** 当前检索实现返回的原始相关性分数；不同实现不可直接横向比较。 */
  score: number | null;
  /** 候选在本次最终结果中的一基排名。 */
  rank: number;
};

export type RetrievalResult = {
  /** 实际送入 Retriever 的独立查询文本。 */
  query: string;
  /** 本次检索读取的索引版本，用于复现回答。 */
  indexVersion: string;
  /** 按当前检索策略排序后的候选证据。 */
  candidates: RetrievalCandidate[];
  /** 当前 SearchPort 完整执行耗时，单位毫秒。 */
  durationMs: number;
};
```

## 第二步：定义 SearchPort

新建 `server/src/knowledge/retrieval/knowledge-search.port.ts`：

```ts
import { RetrievalResult } from '../domain/retrieval-result';

export type KnowledgeScope = {
  /** 允许检索的商城标识；必须由服务端认证/配置产生。 */
  tenantId: string;
  /** 当前登录角色允许读取的知识可见级别。 */
  allowedVisibility: Array<'public' | 'customer' | 'staff'>;
  /** 判断政策生效和失效的可信查询时间。 */
  asOfTime: string;
};

export type KnowledgeSearchInput = {
  /** 实际送入检索器的独立查询；不得把未验证的过滤条件拼入字符串。 */
  query: string;
  /** 服务端根据认证身份构造的知识读取边界。 */
  scope: KnowledgeScope;
  /** 过滤和排序后最多返回的候选数量。 */
  topK: number;
  /** 客户端断开或请求超时时用于取消检索的信号。 */
  signal?: AbortSignal;
};

export abstract class KnowledgeSearchPort {
  /** 在可信 Scope 内检索知识，并返回可复现的排序结果。 */
  abstract search(input: KnowledgeSearchInput): Promise<RetrievalResult>;
}
```

以后换向量数据库时，只替换这个 Port 的 Adapter。

## 第三步：适配内存索引

```ts
@Injectable()
export class MemoryKnowledgeSearchAdapter extends KnowledgeSearchPort {
  constructor(private readonly index: MemoryKnowledgeIndexService) {
    super();
  }

  async search(input: KnowledgeSearchInput): Promise<RetrievalResult> {
    const startedAt = Date.now();
    const raw = await this.index.search(input.query, input.topK * 3);

    const candidates = raw
      .map(([document, score]) => ({
        chunk: document.metadata as KnowledgeChunk,
        score,
      }))
      .filter(({ chunk }) => isAllowed(chunk, input.scope))
      .slice(0, input.topK)
      .map((candidate, index) => ({ ...candidate, rank: index + 1 }));

    return {
      query: input.query,
      indexVersion: 'memory-dev-v1',
      candidates,
      durationMs: Date.now() - startedAt,
    };
  }
}
```

学习版只能在内存搜索后过滤，因此不能作为生产权限方案。这个缺陷必须写进测试名称和代码注释；生产 Adapter 必须在候选检索前过滤。

```ts
function isAllowed(chunk: KnowledgeChunk, scope: KnowledgeScope) {
  const now = new Date(scope.asOfTime).getTime();
  return (
    chunk.tenantId === scope.tenantId &&
    scope.allowedVisibility.includes(chunk.visibility) &&
    chunk.status === 'published' &&
    (!chunk.validFrom || new Date(chunk.validFrom).getTime() <= now) &&
    (!chunk.validTo || new Date(chunk.validTo).getTime() > now)
  );
}
```

## 第四步：DTO 与 Controller

```ts
export class KnowledgeSearchDebugDto {
  /** 仅包含用户要检索的自然语言问题，不接受权限过滤表达式。 */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  query: string;

  /** 调试接口希望展示的最大候选数，限制为 1～20。 */
  @IsInt()
  @Min(1)
  @Max(20)
  topK = 5;
}
```

```ts
@Controller('api/internal/knowledge')
@UseGuards(JwtAuthGuard)
export class KnowledgeDebugController {
  constructor(private readonly search: KnowledgeSearchPort) {}

  @Post('search')
  async searchEvidence(@Body() dto: KnowledgeSearchDebugDto) {
    const result = await this.search.search({
      query: dto.query,
      topK: dto.topK,
      scope: {
        tenantId: 'default-shop',
        allowedVisibility: ['public', 'customer'],
        asOfTime: new Date().toISOString(),
      },
    });
    return {
      ...result,
      candidates: result.candidates.map(({ chunk, score, rank }) => ({
        rank,
        score,
        chunkId: chunk.chunkId,
        documentId: chunk.documentId,
        title: chunk.title,
        sectionPath: chunk.sectionPath,
        contentPreview: chunk.content.slice(0, 300),
      })),
    };
  }
}
```

内部接口仍需要权限。真正上线时应进一步限制为管理员或关闭。

## 第五步：手工请求

```bash
curl -X POST http://127.0.0.1:3000/api/internal/knowledge/search \
  -H 'Authorization: Bearer YOUR_TEST_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"query":"耳机拆了还能退吗","topK":3}'
```

逐条检查 `documentId`、`sectionPath`、正文和分数，不只看第一名。

## 故意破坏实验

问“火星配送需要多久”，观察向量检索仍返回某些候选。结论：Retriever 总能找出“相对最近”的内容，但不代表知识库有答案。

## Gate 05

- [ ] 空 query、超长 query、非法 topK 被 DTO 拒绝。
- [ ] 能直接看到 TopK 的来源和正文。
- [ ] 能说出至少三个失败 Query 及其原因。
- [ ] 没有让 Chat 模型生成最终回答。
