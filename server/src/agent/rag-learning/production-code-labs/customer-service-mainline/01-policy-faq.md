# 案例 01：政策 FAQ 客服

## 用户场景

```text
用户：耳机拆封以后还能七天无理由退货吗？
```

这个问题只需要企业政策，不需要商品库存和个人订单，因此走固定 2-Step RAG。

## 对应代码实验

完成主课程 00～12 章。

## 业务资料

准备：

```text
耳机退货政策 v1（已过期）
耳机退货政策 v2（当前生效）
质量问题售后说明
退款到账时间
特殊商品例外
```

每份资料故意包含不同条件，验证 Chunk 不能把规则和例外拆散。

## 新增意图

```ts
export const CustomerIntentNameSchema = z.enum([
  // 现有意图
  'knowledge_query',
]);
```

意图识别测试：

```ts
it.each([
  ['退货政策是什么', 'knowledge_query'],
  ['耳机拆封能退吗', 'knowledge_query'],
  ['退款多久到账', 'knowledge_query'],
  ['这个耳机多少钱', 'price_query'],
])('%s → %s', async (message, intent) => {
  expect((await service.analyze(message)).intent).toBe(intent);
});
```

## KnowledgeCustomerService

```ts
@Injectable()
export class KnowledgeCustomerService {
  constructor(private readonly answers: KnowledgeAnswerService) {}

  async reply(input: {
    question: string;
    context: CustomerServiceContext;
    signal?: AbortSignal;
  }) {
    return this.answers.answer({
      question: input.question,
      scope: {
        tenantId: input.context.knowledgeTenantId,
        allowedVisibility: ['public', 'customer'],
        locale: 'zh-CN',
        asOfTime: new Date().toISOString(),
      },
      signal: input.signal,
    });
  }
}
```

## 预期响应

```json
{
  "reply": "已拆封且影响二次销售的入耳式耳机不适用七天无理由退货；质量问题仍可按质量保障流程处理。",
  "source": "knowledge_rag",
  "intent": "knowledge_query",
  "citations": [
    {
      "title": "耳机退货政策",
      "section": "已拆封商品",
      "revision": 2,
      "url": "/help/return-headphone"
    }
  ],
  "insufficientEvidence": false,
  "indexVersion": "knowledge-20260831-001"
}
```

## Gate CS-01

- [ ] 问题一定检索，不会直接由通用 Agent 猜政策。
- [ ] v1 过期政策不进入候选。
- [ ] 引用 revision=2 且 URL 由服务端映射。
- [ ] “明年是否支持火星配送”明确拒答。

