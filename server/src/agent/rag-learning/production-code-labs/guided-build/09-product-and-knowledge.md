# 第 09 章：商品实时事实 + 商品知识

## 本章结果

正确回答混合客服问题：

```text
用户：降噪耳机多少钱、有货吗？它支持多设备连接吗？
```

价格和库存来自 ProductService，功能说明来自 RAG。不会把动态库存做成向量，也不会让模型编产品参数。

## 第一步：重构 ProductCustomerService 返回结构化事实

当前 `reply()` 直接返回字符串，不方便与知识证据安全组合。先新增领域类型：

```ts
export type ProductFact = {
  /** Product 表中的可信商品主键，用于限定说明书检索范围。 */
  productId: number;
  /** 数据库中的当前商品名称。 */
  name: string;
  /** ProductService 返回的当前销售价格。 */
  price: number;
  /** 可选原价；商品没有原价时为 null。 */
  originalPrice: number | null;
  /** ProductService 返回的实时库存数量。 */
  stock: number;
};

export type ProductLookupQuery = {
  /** 用户表达中用于查找商品的名称；未提供时为 null。 */
  productName: string | null;
  /** 用户表达中用于缩小范围的分类名称；未提供时为 null。 */
  categoryName: string | null;
};

export type ProductLookupResult = {
  /** 数据库查询后得到的结构化商品事实。 */
  facts: ProductFact[];
  /** 本次查找使用的自然语言商品/分类条件，用于解释与调试。 */
  query: ProductLookupQuery;
};
```

在 `ProductCustomerService` 增加：

```ts
async lookup(analysis: CustomerIntent): Promise<ProductLookupResult> {
  // 复用现有 product/category 校验和 findAll 逻辑
  const result = await this.findProducts(analysis);
  return {
    query: {
      productName: analysis.entities.productName,
      categoryName: analysis.entities.categoryName,
    },
    facts: result.list.map((product) => ({
      productId: product.id,
      name: product.name,
      price: product.price,
      originalPrice: product.originalPrice ?? null,
      stock: product.stock,
    })),
  };
}
```

原 `reply()` 可以调用 `lookup()` 后格式化，避免一次重构破坏既有接口。

## 第二步：知识 Chunk 增加 productId

商品说明书 Metadata 增加可选字段：

```ts
/** 说明书所属的可信商品主键；非商品知识为 null。 */
productId: number | null;
/** 知识内容的业务类别，用于选择检索过滤和回答策略。 */
knowledgeType: 'policy' | 'faq' | 'product_manual';
```

注意：productId 必须在导入时与 Product 表校验，不能仅相信 Markdown 作者填的数字。

## 第三步：计划多事实请求

当前意图只有一个 `intent`，为混合商品问题新增规划结果：

```ts
const CustomerFactPlanSchema = z.object({
  requestedFacts: z
    .array(z.enum(['price', 'inventory', 'product_manual']))
    .min(1)
    .max(3)
    .describe('用户明确要求查询的事实种类，不包含任何事实值'),
  productName: z
    .string()
    .nullable()
    .describe('用户明确提到的商品名称；未提到时为 null，不允许模型猜测'),
});
```

这个规划器只决定需要哪些只读事实，不能提供 productId、price 或 stock。

## 第四步：受控组合 Service

```ts
export type ProductSupportInput = {
  /** 结构化规划器判断本轮需要读取的事实种类。 */
  plan: CustomerFactPlan;
  /** 现有客服意图分析结果，用于查询真实商品。 */
  analysis: CustomerIntent;
  /** 服务端根据认证身份构造的知识读取边界。 */
  scope: KnowledgeScope;
  /** 客户端断开或请求超时时用于取消后续调用的信号。 */
  signal?: AbortSignal;
};

@Injectable()
export class ProductSupportService {
  constructor(
    private readonly products: ProductCustomerService,
    private readonly knowledge: KnowledgeAnswerService,
  ) {}

  async answer(input: ProductSupportInput) {
    const productResult = await this.products.lookup(input.analysis);
    if (productResult.facts.length !== 1) {
      return { requiresClarification: true, products: productResult.facts };
    }

    const product = productResult.facts[0];
    const manual = input.plan.requestedFacts.includes('product_manual')
      ? await this.knowledge.answer({
          question: `${product.name} ${input.analysis.normalizedQuery}`,
          scope: input.scope,
          signal: input.signal,
          // SearchPort 后续扩展可信的服务端 filter
          trustedFilter: { productId: product.productId },
        })
      : null;

    return { requiresClarification: false, product, manual };
  }
}
```

`trustedFilter` 来自数据库选中的 productId，而不是模型。

## 第五步：Presenter

```ts
function presentProductSupport(result: ProductSupportResult) {
  const live = `${result.product.name} 当前价格 ¥${result.product.price}，${
    result.product.stock > 0 ? `库存 ${result.product.stock} 件` : '暂时缺货'
  }。`;
  return {
    reply: [live, result.manual?.answer].filter(Boolean).join('\n'),
    citations: result.manual?.citations ?? [],
  };
}
```

## 测试

- 修改数据库 stock 后，不重建知识索引也能得到新库存。
- 修改商品说明书必须发布新知识 revision。
- 模型声称 productId=99 不会绕过数据库匹配。
- 多个同名商品时澄清，不把多个产品说明混在一起。
- ProductService 失败不允许模型用知识文档猜价格。

## Gate 09

- [ ] 每个输出事实都能标记来源是 ProductService 还是知识引用。
- [ ] 动态字段没有进入知识库权威数据。
- [ ] 商品说明只能检索已验证 productId。
- [ ] 既有商品客服测试全部通过。
