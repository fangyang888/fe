# 第 2 课：从模拟商品查询 Tool 到 ProductService

这节课完成一个非常重要的跨越：

~~~text
固定数组中的模拟商品
  ↓
search_product_demo Tool
  ↓
理解 Tool 的输入、执行和输出
  ↓
将固定数组替换为 ProductService
  ↓
查询 MySQL 中的真实上架商品
~~~

这不是简单地“把数组换成数据库”。真正要学习的是：

- Tool 与业务 Service 应该如何分工。
- Agent 如何获得 NestJS 注入的 ProductService。
- 为什么 Tool 不应该自己创建数据库 Repository。
- 为什么后端内部应该直接调用 Service，而不是再请求自己的 HTTP 接口。
- 如何限制输入、输出和查询数量。
- 如何保证 Agent 只能看到上架商品。
- 如何测试 Tool，而不真正调用模型和数据库。

建议先完整完成“阶段 A：模拟数据”，确认理解后，再进入“阶段 B：ProductService”。

## 学习完成标准

完成本课后，你应该能独立解释：

- search_product_demo 为什么属于 Tool。
- Tool 的 name、description、schema、handler 分别负责什么。
- 为什么商品数据应该由 ProductService 查询。
- AgentModule 为什么需要 imports ProductModule。
- ProductModule 为什么需要 exports ProductService。
- ProductService 如何通过构造函数进入 AgentService。
- createAgentTools() 为什么需要接收依赖。
- 为什么真实 Tool 只能调用 findAll()，不能调用 findAllAdmin()。
- 为什么不能把整个 Product Entity 原样交给模型。
- 如何用 Jest Mock 测试商品 Tool。

---

## 一、先看当前商品模块

当前项目已经有完整的商品模块：

~~~text
server/src/product/
├── product.entity.ts
├── product.service.ts
├── product.controller.ts
├── product-admin.controller.ts
└── product.module.ts
~~~

它们分别承担：

| 文件 | 作用 |
| --- | --- |
| product.entity.ts | 定义商品数据库表字段 |
| product.service.ts | 实现商品查询和管理业务 |
| product.controller.ts | 提供用户侧商品 HTTP 接口 |
| product-admin.controller.ts | 提供后台管理接口 |
| product.module.ts | 组装并导出 ProductService |

当前 Product Entity 包含：

~~~text
id              商品 ID
name            商品名称
price           当前价格
originalPrice   原价
image           商品图片
sales           销量
stock           库存
categoryId      分类 ID
description     商品描述
isRecommend     是否推荐
status          是否上架
created_at      创建时间
updated_at      更新时间
~~~

当前 ProductService.findAll() 已经支持：

- 只查询 status = 1 的上架商品。
- 按商品名称模糊查询。
- 分类筛选。
- 分页。
- 按销量、价格或最新排序。
- pageSize 最大不超过 50。

因此，真实商品 Tool 不需要自己重新写 SQL，应该复用 ProductService.findAll()。

---

## 二、阶段 A 的目标：先使用模拟数据

为什么不直接连接 ProductService？

因为直接连接数据库会同时引入：

- NestJS Module。
- 依赖注入。
- TypeORM。
- 数据库连接。
- 数据库数据是否存在。
- Service Mock。

如果 Tool 没有被调用，你很难判断是 Tool 写错、注入失败，还是数据库没有数据。

模拟阶段只验证：

~~~text
用户问题
→ 模型选择 search_product_demo
→ Zod 参数验证
→ 数组搜索
→ 返回结果
→ 模型生成回答
~~~

这一阶段完全理解后，再替换数据来源。

---

## 三、设计模拟商品数据

### 1. 先定义类型

在 agent.tools.ts 中可以定义：

~~~ts
type DemoProduct = {
  id: number;
  name: string;
  price: number;
  stock: number;
  category: string;
};
~~~

这个类型只用于学习，不是数据库 Entity。

### 2. 准备固定数组

~~~ts
const demoProducts: DemoProduct[] = [
  {
    id: 1,
    name: '无线蓝牙耳机',
    price: 199,
    stock: 35,
    category: '数码',
  },
  {
    id: 2,
    name: '机械键盘',
    price: 299,
    stock: 18,
    category: '数码',
  },
  {
    id: 3,
    name: '纯棉短袖 T 恤',
    price: 89,
    stock: 50,
    category: '服装',
  },
  {
    id: 4,
    name: '保温水杯',
    price: 69,
    stock: 0,
    category: '生活',
  },
];
~~~

这里故意保留一个库存为 0 的商品，用于学习如何表达“暂时无货”。

### 3. 为什么模拟数据不要太多

模拟阶段只需要 4～8 条数据。

数据太多会让你把时间花在准备数据，而不是理解 Tool。

---

## 四、设计 search_product_demo 的输入

用户可能说：

~~~text
有没有蓝牙耳机？
帮我找一个键盘。
搜索数码商品。
有没有 100 元以内的商品？
~~~

第一版先只支持两个参数：

~~~text
keyword   搜索关键词
limit     最多返回几条
~~~

对应 Zod：

~~~ts
schema: z.object({
  keyword: z
    .string()
    .trim()
    .min(1, 'keyword 不能为空')
    .max(50, 'keyword 不能超过 50 个字符')
    .describe('商品名称或分类关键词，例如耳机、数码'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(5)
    .default(3)
    .describe('最多返回的商品数量'),
}),
~~~

逐项解释。

### keyword 为什么需要 trim()

用户或模型可能产生：

~~~text
"   耳机   "
~~~

trim() 会去掉首尾空格，得到：

~~~text
"耳机"
~~~

### 为什么限制最大长度

商品关键词不需要几千个字符。限制长度可以：

- 减少无意义查询。
- 降低日志和数据库压力。
- 限制恶意或错误输入。

### limit 为什么必须是整数

下面都不适合作为查询数量：

~~~text
1.5
-3
10000
~~~

因此使用：

~~~ts
z.number().int().min(1).max(5).default(3)
~~~

### default(3) 的作用

模型没有传 limit 时，Zod 会使用 3。

这样 Tool 最多默认返回 3 条商品，避免把大量数据发送给模型。

---

## 五、实现模拟搜索逻辑

### 1. 先理解普通函数版本

在包装为 Tool 前，先把搜索想成一个普通函数：

~~~ts
function searchDemoProducts(keyword: string, limit: number) {
  const normalizedKeyword = keyword.trim().toLowerCase();

  return demoProducts
    .filter((product) => {
      const searchableText =
        product.name.toLowerCase() + ' ' + product.category.toLowerCase();

      return searchableText.includes(normalizedKeyword);
    })
    .slice(0, limit);
}
~~~

### 2. normalizedKeyword

~~~ts
const normalizedKeyword = keyword.trim().toLowerCase();
~~~

作用：

- 去掉首尾空格。
- 英文关键词统一转换为小写。

中文不区分大小写，但商品名称可能混有英文。

### 3. filter()

~~~ts
.filter((product) => {
  // 返回 true 的商品会被保留
})
~~~

filter 不会修改原数组，而是返回一个新数组。

### 4. searchableText

~~~ts
const searchableText =
  product.name.toLowerCase() + ' ' + product.category.toLowerCase();
~~~

把商品名称和分类拼在一起，因此搜索“数码”也能找到耳机和键盘。

### 5. includes()

~~~ts
searchableText.includes(normalizedKeyword)
~~~

表示 searchableText 中是否包含关键词。

这只是简单的子字符串搜索，不是语义搜索。

例如：

- 搜索“耳机”能找到“无线蓝牙耳机”。
- 搜索“听音乐设备”不一定能找到耳机。

后者需要以后学习 Embedding 和 RAG。

### 6. slice()

~~~ts
.slice(0, limit)
~~~

只返回前 limit 条，避免结果过多。

---

## 六、把普通函数包装成 Tool

完整模拟 Tool：

~~~ts
const searchProductDemoTool = tool(
  ({ keyword, limit }) => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    const products = demoProducts
      .filter((product) => {
        const searchableText =
          product.name.toLowerCase() + ' ' + product.category.toLowerCase();

        return searchableText.includes(normalizedKeyword);
      })
      .slice(0, limit);

    return {
      keyword,
      total: products.length,
      products: products.map((product) => ({
        id: product.id,
        name: product.name,
        price: product.price,
        inStock: product.stock > 0,
      })),
    };
  },
  {
    name: 'search_product_demo',
    description:
      '在模拟商品数据中按名称或分类搜索商品。用户询问有没有某类商品、商品价格或库存时使用。',
    schema: z.object({
      keyword: z
        .string()
        .trim()
        .min(1, 'keyword 不能为空')
        .max(50, 'keyword 不能超过 50 个字符')
        .describe('商品名称或分类关键词，例如耳机、数码'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(5)
        .default(3)
        .describe('最多返回的商品数量'),
    }),
  },
);
~~~

### 为什么返回对象

返回对象比拼接长字符串更适合商品数据：

~~~ts
{
  keyword: '耳机',
  total: 1,
  products: [
    {
      id: 1,
      name: '无线蓝牙耳机',
      price: 199,
      inStock: true,
    },
  ],
}
~~~

优点：

- 模型容易区分字段。
- 测试容易断言。
- 后续增加字段更清晰。
- 避免让模型从不规则文字中重新解析数据。

### 为什么不返回所有字段

模拟数据虽然字段少，但也要养成输出白名单习惯。

Tool 应该只返回回答用户所需的信息，不要默认返回：

- 内部成本价。
- 供应商信息。
- 后台备注。
- 数据库更新时间。
- 下架原因。
- 管理员字段。

---

## 七、将模拟 Tool 注册给 Agent

当前 createAgentTools() 返回：

~~~ts
export function createAgentTools() {
  return [calculatorTool, currentTimeTool];
}
~~~

加入模拟 Tool：

~~~ts
export function createAgentTools() {
  return [
    calculatorTool,
    currentTimeTool,
    searchProductDemoTool,
  ];
}
~~~

只有加入数组，createAgent() 才能把这个 Tool 告诉模型。

### 测试问题

~~~text
有蓝牙耳机吗？
~~~

~~~text
帮我找 2 个数码商品。
~~~

~~~text
保温杯有库存吗？
~~~

~~~text
你们有没有食品？
~~~

### 没有结果时应该怎样回答

Tool 返回：

~~~json
{
  "keyword": "食品",
  "total": 0,
  "products": []
}
~~~

模型应该明确说没有找到，而不是编造商品。

可以在 System Prompt 增加规则：

~~~text
商品查询必须以工具结果为准。
工具没有返回商品时，明确说明暂未找到，不得编造商品、价格或库存。
~~~

---

## 八、阶段 A 测试

### 1. 为什么先直接测试 Tool

如果只通过 Agent 测试，失败可能来自：

- 模型没有选择 Tool。
- Tool description 不清楚。
- 模型供应商不支持 Tool Calling。
- Tool 本身搜索逻辑错误。

直接调用 Tool 可以先排除模型因素。

### 2. 找到并调用 Tool

当前 Tool 没有单独导出时，可以从数组查找：

~~~ts
const tools = createAgentTools();
const searchTool = tools.find(
  (currentTool) => currentTool.name === 'search_product_demo',
);

if (!searchTool) {
  throw new Error('没有找到 search_product_demo');
}

const result = await searchTool.invoke({
  keyword: '耳机',
  limit: 3,
});
~~~

### 3. 建议测试场景

- [ ] 搜索商品名称。
- [ ] 搜索分类名称。
- [ ] 大小写混合英文。
- [ ] 关键词首尾有空格。
- [ ] 没有匹配结果。
- [ ] limit 为 1。
- [ ] limit 超过 5。
- [ ] keyword 为空字符串。
- [ ] keyword 超过 50 个字符。
- [ ] 库存为 0 的商品返回 inStock false。

### 4. Agent 集成测试

直接 Tool 测试通过后，再通过 Agent 页面验证：

- [ ] 模型是否选择正确 Tool。
- [ ] Tool 参数是否符合预期。
- [ ] 最终回答是否以 Tool 结果为准。
- [ ] 没有结果时是否拒绝编造。

---

## 九、什么时候进入阶段 B

满足下面全部条件后再连接 ProductService：

- [ ] 能独立解释模拟 Tool 每一行代码。
- [ ] 能直接 invoke Tool 并查看对象结果。
- [ ] Agent 能调用模拟 Tool。
- [ ] 能解释 Zod 为什么限制 keyword 和 limit。
- [ ] 能解释为什么返回字段使用白名单。
- [ ] 没有结果时 Agent 不会编造商品。

---

## 十、阶段 B 的目标：换成 ProductService

阶段 A 的数据来源：

~~~text
demoProducts 固定数组
~~~

阶段 B 的数据来源：

~~~text
ProductService
  ↓
TypeORM Repository
  ↓
MySQL product 表
~~~

工具的输入和输出尽量保持不变，只替换内部数据来源。

这是一个重要设计原则：

~~~text
Tool 对外契约稳定，内部实现可以替换。
~~~

这样 Agent 不需要因为数据来源改变而重新学习完全不同的工具格式。

---

## 十一、为什么 Tool 应该调用 ProductService

错误做法：

~~~ts
const repo = new Repository<Product>();
~~~

Tool 不应该自己创建 Repository，因为：

- Repository 需要 TypeORM 管理。
- 会绕过 NestJS 依赖注入。
- 会重复业务规则。
- 难以测试。
- 容易错误查询下架商品。

另一个不推荐的做法：

~~~ts
fetch('http://127.0.0.1:3000/api/product?keyword=耳机')
~~~

同一个 NestJS 进程内部不应该为了调用自己的业务，再发送一次 HTTP 请求。

正确调用：

~~~ts
await productService.findAll({
  keyword,
  page: 1,
  pageSize: limit,
  sort: 'sales',
});
~~~

好处：

- 复用已有业务规则。
- 复用上架状态过滤。
- 更容易 Mock。
- 不增加 HTTP 延迟。
- 不依赖本机端口和 Nginx。

---

## 十二、理解 NestJS 依赖注入链路

要让 Agent 使用 ProductService，需要完成这条链：

~~~text
ProductModule
  exports ProductService
      ↓
AgentModule
  imports ProductModule
      ↓
AgentService 构造函数
  注入 ProductService
      ↓
createAgentTools({ productService })
      ↓
search_product Tool
  调用 productService.findAll()
~~~

每一步都不能缺少。

---

## 十三、ProductModule 为什么可以被使用

当前 ProductModule 已经包含：

~~~ts
@Module({
  imports: [TypeOrmModule.forFeature([Product])],
  controllers: [ProductController, ProductAdminController],
  providers: [ProductService],
  exports: [ProductService],
})
export class ProductModule {}
~~~

逐项解释：

- imports：让 ProductService 能注入 Product Repository。
- providers：在 ProductModule 中创建 ProductService。
- exports：允许其他 Module 使用 ProductService。

如果没有：

~~~ts
exports: [ProductService]
~~~

AgentModule 即使 imports ProductModule，也不能注入 ProductService。

---

## 十四、修改 AgentModule

当前 AgentModule：

~~~ts
@Module({
  controllers: [AgentController],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
~~~

需要导入 ProductModule：

~~~ts
import { ProductModule } from '../product/product.module';

@Module({
  imports: [ProductModule],
  controllers: [AgentController],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
~~~

这表示：

~~~text
AgentModule 需要使用 ProductModule 对外提供的 Provider。
~~~

不要在 AgentModule 里重复注册 ProductService：

~~~ts
providers: [AgentService, ProductService]
~~~

重复注册可能创建不正确的依赖范围，而且 ProductService 需要 Product Repository。

---

## 十五、把 ProductService 注入 AgentService

当前构造函数：

~~~ts
constructor(private readonly configService: ConfigService) {}
~~~

改为：

~~~ts
constructor(
  private readonly configService: ConfigService,
  private readonly productService: ProductService,
) {}
~~~

并导入：

~~~ts
import { ProductService } from '../product/product.service';
~~~

NestJS 启动时会：

1. 发现 AgentService 需要 ProductService。
2. 到 AgentModule 导入的 ProductModule 中查找。
3. ProductModule 已经 export ProductService。
4. 把 ProductService 实例传给 AgentService 构造函数。

这就是依赖注入。

---

## 十六、让 createAgentTools() 接收依赖

模拟阶段：

~~~ts
export function createAgentTools() {
  return [calculatorTool, currentTimeTool, searchProductDemoTool];
}
~~~

真实阶段需要 ProductService，因此定义依赖类型：

~~~ts
import { ProductService } from '../product/product.service';

type AgentToolDependencies = {
  productService: ProductService;
};
~~~

修改函数：

~~~ts
export function createAgentTools({
  productService,
}: AgentToolDependencies) {
  const searchProductTool = createSearchProductTool(productService);

  return [
    calculatorTool,
    currentTimeTool,
    searchProductTool,
  ];
}
~~~

然后在 AgentService 中传入：

~~~ts
tools: createAgentTools({
  productService: this.productService,
}),
~~~

### 为什么不用全局变量保存 ProductService

不要写：

~~~ts
let globalProductService: ProductService;
~~~

依赖应该通过参数显式传入。这样：

- 依赖关系清楚。
- 更容易测试。
- 不依赖初始化顺序。
- 不会产生隐藏全局状态。

---

## 十七、创建真实商品 Tool

推荐把创建逻辑封装成函数：

~~~ts
function createSearchProductTool(productService: ProductService) {
  return tool(
    async ({ keyword, limit, sort }) => {
      const result = await productService.findAll({
        keyword,
        page: 1,
        pageSize: limit,
        sort,
      });

      return {
        keyword,
        total: result.total,
        products: result.list.map((product) => ({
          id: product.id,
          name: product.name,
          price: product.price,
          originalPrice: product.originalPrice ?? null,
          sales: product.sales,
          inStock: product.stock > 0,
          image: product.image ?? null,
        })),
      };
    },
    {
      name: 'search_product',
      description:
        '查询商城中已上架的真实商品。用户询问商品名称、价格、销量或库存时使用。查询结果为空时不得编造商品。',
      schema: z.object({
        keyword: z
          .string()
          .trim()
          .min(1, 'keyword 不能为空')
          .max(50, 'keyword 不能超过 50 个字符')
          .describe('商品名称关键词，例如耳机、键盘'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(5)
          .default(3)
          .describe('最多返回的商品数量'),
        sort: z
          .enum(['sales', 'price', 'newest'])
          .default('sales')
          .describe('商品排序方式'),
      }),
    },
  );
}
~~~

### 为什么 handler 是 async

~~~ts
async ({ keyword, limit, sort }) => {
~~~

ProductService.findAll() 会查询数据库，返回 Promise，因此需要 await：

~~~ts
const result = await productService.findAll(...);
~~~

### 为什么调用 findAll()

findAll() 是用户侧查询，它会自动限制：

~~~text
status = 1
~~~

因此不会搜索下架商品。

绝不能给普通客服 Tool 调用：

~~~ts
findAllAdmin()
findOneAdmin()
~~~

这些方法包含后台数据和下架商品。

### 为什么 page 固定为 1

第一版 Agent 商品搜索只返回最相关的少量商品：

~~~ts
page: 1,
pageSize: limit,
~~~

避免模型一次加载很多商品。

以后如果需要翻页，应设计明确的 page 参数，并限制最大值。

### 为什么使用输出白名单

没有直接：

~~~ts
return result;
~~~

而是重新 map：

~~~ts
products: result.list.map((product) => ({
  id: product.id,
  name: product.name,
  price: product.price,
  originalPrice: product.originalPrice ?? null,
  sales: product.sales,
  inStock: product.stock > 0,
  image: product.image ?? null,
}))
~~~

这样只把客服回答需要的信息交给模型。

### 为什么返回 inStock 而不是 stock

是否直接暴露库存数量取决于业务规则。

如果不希望用户知道精确库存，可以只返回：

~~~ts
inStock: product.stock > 0
~~~

如果业务允许展示库存，再返回 stock。

Tool 不能自行决定商业敏感字段，应该遵循产品规则。

---

## 十八、完整依赖组装示例

### agent.module.ts

~~~ts
import { Module } from '@nestjs/common';
import { ProductModule } from '../product/product.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [ProductModule],
  controllers: [AgentController],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
~~~

### agent.service.ts 构造函数

~~~ts
import { ProductService } from '../product/product.service';

constructor(
  private readonly configService: ConfigService,
  private readonly productService: ProductService,
) {}
~~~

### agent.service.ts 创建 Agent

~~~ts
this.agent = createAgent({
  name: 'fe_assistant',
  model,
  tools: createAgentTools({
    productService: this.productService,
  }),
  systemPrompt: [
    '你是 FE 商城的中文 AI 客服。',
    '商品名称、价格、库存和销量必须以工具返回结果为准。',
    '没有查询到商品时明确说明，不得编造。',
  ].join('\n'),
});
~~~

### agent.tools.ts

~~~ts
type AgentToolDependencies = {
  productService: ProductService;
};

function createSearchProductTool(productService: ProductService) {
  // 返回真实商品搜索 Tool
}

export function createAgentTools({
  productService,
}: AgentToolDependencies) {
  return [
    calculatorTool,
    currentTimeTool,
    createSearchProductTool(productService),
  ];
}
~~~

---

## 十九、Agent 缓存与 Tool 依赖

当前 AgentService 有：

~~~ts
private agent?: SingleAgent;
~~~

第一次调用时创建 Agent：

~~~ts
if (this.agent) {
  return this.agent;
}
~~~

ProductService 默认是 NestJS 单例。创建 Tool 时，函数闭包会保存这个 ProductService 引用：

~~~text
Agent
  → searchProductTool
      → productService
~~~

后续请求可以复用同一个 Agent 和同一个 ProductService 实例。

这里的闭包可以理解为：

~~~text
createSearchProductTool() 创建函数时，
把当时传入的 productService 记住。
以后 Tool 被执行时仍然能使用它。
~~~

---

## 二十、真实 Tool 单元测试

测试真实 Tool 时，不需要真的连接 MySQL。

应该 Mock ProductService：

~~~ts
const productService = {
  findAll: jest.fn().mockResolvedValue({
    list: [
      {
        id: 1,
        name: '无线蓝牙耳机',
        price: 199,
        originalPrice: 249,
        sales: 120,
        stock: 10,
        image: '/images/headphone.png',
      },
    ],
    total: 1,
    page: 1,
    pageSize: 3,
  }),
} as unknown as ProductService;
~~~

创建工具：

~~~ts
const tools = createAgentTools({ productService });
const searchTool = tools.find(
  (currentTool) => currentTool.name === 'search_product',
);

if (!searchTool) {
  throw new Error('没有找到 search_product');
}
~~~

调用：

~~~ts
const result = await searchTool.invoke({
  keyword: '耳机',
  limit: 3,
  sort: 'sales',
});
~~~

验证 Service 收到正确参数：

~~~ts
expect(productService.findAll).toHaveBeenCalledWith({
  keyword: '耳机',
  page: 1,
  pageSize: 3,
  sort: 'sales',
});
~~~

还应该验证：

- 返回对象不包含 status。
- 返回对象不包含 created_at。
- stock 转换成 inStock。
- 数据库没有结果时 products 是空数组。
- ProductService 抛异常时 Tool 不伪造成功结果。

---

## 二十一、AgentService 测试为什么会受影响

当前 AgentService 测试只 Mock ConfigService：

~~~ts
const service = new AgentService(configService);
~~~

增加 ProductService 构造函数依赖后，需要改成：

~~~ts
const productService = {
  findAll: jest.fn(),
} as unknown as ProductService;

const service = new AgentService(
  configService,
  productService,
);
~~~

否则 TypeScript 会提示构造函数缺少参数。

这正体现了依赖注入的特点：

~~~text
一个类明确声明了自己需要哪些依赖，
测试就必须提供真实实现或 Mock。
~~~

---

## 二十二、集成测试问题

Tool 单元测试通过后，通过页面测试：

### 商品存在

~~~text
搜索耳机商品，最多返回 3 个。
~~~

检查：

- 是否调用 search_product。
- keyword 是否是“耳机”。
- limit 是否是 3。
- 回答的价格是否和数据库一致。

### 没有商品

~~~text
你们有宇宙飞船吗？
~~~

检查：

- products 是否为空。
- Agent 是否明确说没有找到。
- Agent 是否编造名称和价格。

### 库存为 0

~~~text
保温杯现在有货吗？
~~~

检查 Agent 是否根据 inStock 回答。

### 普通聊天

~~~text
你好。
~~~

检查是否错误调用商品工具。

### 数学问题

~~~text
125 乘以 8 等于多少？
~~~

检查是否仍然调用 calculator，而不是商品工具。

---

## 二十三、安全边界

商品查询虽然是只读功能，也需要边界。

### 1. 只允许用户侧 Service

使用：

~~~ts
productService.findAll()
productService.findOne()
~~~

不要使用 Admin 方法。

### 2. 限制返回数量

limit 最大 5，防止模型上下文被大量商品占满。

### 3. 输出字段白名单

只返回客服真正需要的字段。

### 4. 数据库内容也是不可信文本

商品名称和 description 可能包含异常内容。

模型应该把数据库内容当成商品数据，而不是新的系统指令。

### 5. Tool 不能写数据库

这一课只查询商品，不执行：

- 修改价格。
- 修改库存。
- 上下架。
- 删除商品。

### 6. 不打印完整商品描述

日志建议只记录：

~~~ts
{
  tool: 'search_product',
  keywordLength: keyword.length,
  resultCount: result.list.length,
}
~~~

避免记录用户隐私或过长内容。

---

## 二十四、常见错误

### Nest 无法解析 ProductService

可能错误：

~~~text
Nest can't resolve dependencies of the AgentService
~~~

检查：

1. ProductModule 是否 providers ProductService。
2. ProductModule 是否 exports ProductService。
3. AgentModule 是否 imports ProductModule。
4. AgentService import 路径是否正确。

### Tool 定义了但模型不调用

检查：

1. 是否加入 createAgentTools() 返回数组。
2. description 是否明确。
3. 模型是否支持 Tool Calling。
4. System Prompt 是否要求商品事实必须使用 Tool。

### 查询结果总是为空

检查：

1. 数据库是否有 status = 1 的商品。
2. keyword 是否和商品名称匹配。
3. MySQL 字符集和排序规则是否正常。
4. ProductService.findAll() 单独调用是否有结果。

### 模型编造价格

检查：

1. System Prompt 是否规定价格必须以 Tool 为准。
2. Tool 是否真的执行。
3. Tool 是否返回 price。
4. 没有结果时是否明确返回空数组。

### 测试启动时连接真实数据库

说明测试没有正确 Mock ProductService 或 Nest TestingModule 导入过多模块。

Tool 单元测试应该只提供 Mock，不需要导入整个 AppModule。

---

## 二十五、推荐完成顺序

### 阶段 A

- [ ] 定义 DemoProduct。
- [ ] 添加 4～8 个模拟商品。
- [ ] 编写普通数组搜索函数。
- [ ] 包装成 search_product_demo。
- [ ] 使用 Zod 限制 keyword 和 limit。
- [ ] 返回结构化对象。
- [ ] 加入 createAgentTools()。
- [ ] 直接 invoke Tool。
- [ ] 通过 Agent 页面测试。
- [ ] 验证没有结果时不编造。

### 阶段 B

- [ ] 读懂 ProductService.findAll()。
- [ ] 确认 ProductModule 已 export ProductService。
- [ ] AgentModule imports ProductModule。
- [ ] AgentService 注入 ProductService。
- [ ] createAgentTools() 接收依赖对象。
- [ ] 创建 search_product。
- [ ] 调用 ProductService.findAll()。
- [ ] 使用输出字段白名单。
- [ ] Mock ProductService 写 Tool 测试。
- [ ] 更新 AgentService 原有测试。
- [ ] 通过页面测试真实商品。
- [ ] 执行构建和测试。

---

## 二十六、验收问题

完成后尝试口头回答：

1. 为什么先做模拟 Tool？
2. Tool 为什么不直接创建 Repository？
3. 为什么不调用本机的 /api/product HTTP 接口？
4. ProductModule 的 exports 有什么作用？
5. AgentModule 的 imports 有什么作用？
6. ProductService 是谁创建的？
7. createSearchProductTool 为什么能一直访问 productService？
8. 为什么只调用 findAll()，不调用 findAllAdmin()？
9. 为什么 limit 最大只能是 5？
10. 为什么返回 inStock 而不是完整 Product Entity？
11. 如何在不连接数据库的情况下测试真实商品 Tool？
12. 模型没有调用 Tool 时，应该先检查什么？

如果这些问题有一半无法解释，建议回到对应章节重新实践。

---

## 二十七、构建和测试

每完成一个小步骤就执行：

~~~bash
cd server
pnpm run build
pnpm test -- agent.service.spec.ts --runInBand
~~~

不要等所有代码都写完才第一次构建。

推荐顺序：

~~~text
添加类型
→ 构建
→ 添加模拟数组
→ 构建
→ 添加 Tool
→ 构建
→ 加入 Agent
→ 测试
→ 接入 ProductService
→ 构建
→ Mock 测试
→ 页面验证
~~~

---

## 二十八、下一课预告

完成商品搜索后，下一步建议学习：

~~~text
商品详情 Tool
  ↓
从用户问题中提取商品 ID
  ↓
ProductService.findOne()
  ↓
NotFoundException 与 Tool 错误处理
  ↓
Structured Output 进行客服意图分类
~~~

暂时不要立刻做订单工具。订单涉及用户身份和数据归属，比公开商品查询更敏感。

---

## 官方资料

- LangChain Tools：<https://docs.langchain.com/oss/javascript/langchain/tools>
- LangChain Agents：<https://docs.langchain.com/oss/javascript/langchain/agents>
- NestJS Modules：<https://docs.nestjs.com/modules>
- NestJS Providers：<https://docs.nestjs.com/providers>
- NestJS Testing：<https://docs.nestjs.com/fundamentals/testing>
- TypeORM Find Options：<https://typeorm.io/find-options>

阅读顺序：

1. LangChain Tools 的 Create tools。
2. NestJS Providers。
3. NestJS Modules。
4. NestJS Testing。

---

## 本课学习记录

~~~text
完成日期：

阶段 A 完成情况：

我对模拟 Tool 的理解：

我对 ProductService 的理解：

我对 NestJS 依赖注入的理解：

我对 createAgentTools 依赖参数的理解：

我写了哪些测试：

遇到的错误：

错误的根本原因：

我是如何验证修复的：

仍然不理解的问题：

下一次只做的一件事：
~~~
