# 案例 02：商品实时事实 + 商品说明

## 用户场景

```text
用户：这款降噪耳机多少钱、有货吗？它支持多设备连接吗？
```

这是两个事实源：

```text
价格和库存       → ProductService
多设备连接说明   → 商品说明书 RAG
```

## 不要做的实现

- 不把商品当前 price/stock 写进知识 Chunk 作为权威答案。
- 不让模型看到两个结果后自由决定哪个是最新。
- 不把混合问题简单归类成其中一个意图，漏掉另一半。

## 增加多意图表达

当前 `CustomerIntentSchema` 只有一个 `intent`。第一版可以增加受控字段：

```ts
const CustomerRequestPlanSchema = z.object({
  primaryIntent: CustomerIntentNameSchema,
  requestedFacts: z.array(z.enum([
    'product_search',
    'price',
    'inventory',
    'product_documentation',
  ])).max(4),
  entities: CustomerEntitiesSchema,
});
```

也可以先限制一次只处理主要问题并提示用户追问；选择必须写入 ADR 和测试。

## 受控组合

```ts
const productFacts = await productCustomer.lookupFacts(plan.entities);
const documentation = plan.requestedFacts.includes('product_documentation')
  ? await knowledgeAnswers.answer({
      question,
      scope,
      metadataFilter: { productId: productFacts.selectedProductId },
      signal,
    })
  : null;

return composeProductSupportReply(productFacts, documentation);
```

`metadataFilter.productId` 必须来自数据库查到的商品，不相信模型直接给出的任意 ID。

## 数据结构改进

当前 `ProductCustomerService.reply()` 直接返回字符串。为了安全组合，先重构为：

```ts
type ProductFacts = {
  productId: number;
  name: string;
  price: number;
  stock: number;
};
```

由最外层 Presenter 统一生成中文，不从已有字符串反向解析数据。

## Gate CS-02

- [ ] price/stock 与数据库当前值一致。
- [ ] 产品说明引用对应 productId 的已发布文档。
- [ ] 修改库存不需要重建知识索引。
- [ ] 修改说明书后通过新 revision/索引发布生效。
- [ ] 混合响应可以分别追踪业务事实和知识引用。

