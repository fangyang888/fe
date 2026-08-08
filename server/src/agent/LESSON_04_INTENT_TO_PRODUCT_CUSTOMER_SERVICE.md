# 第 4 课：从 Structured Output 到可运行的商品客服

这一课不再只讲概念，而是把第三课的 Structured Output 真正接到当前项目中。

我们最终要实现这样的效果：

```text
用户：无线蓝牙耳机库存还有多少？

程序先得到：
intent = inventory_query
productName = 无线蓝牙耳机

程序再调用：
ProductService.findAll({ keyword: '无线蓝牙耳机' })

最后回答：
无线蓝牙耳机当前库存 35 件，可以购买。
```

这一章会尽量使用白话解释每个步骤。不要一次把所有代码全部复制进去，建议完成一个阶段、验证一个阶段，再进入下一个阶段。

---

## 先说清楚：第四章只处理单轮，不处理多轮

你前面观察得很准确：这一章仍然是单次请求。

它只解决：

```text
用户一次把问题说完整
→ 程序识别意图
→ 程序提取商品名
→ 程序查询数据库
→ 本次请求结束
```

例如：

```text
无线蓝牙耳机库存多少？
```

这一章暂时不解决：

```text
用户：帮我查库存
客服：请问什么商品？
用户：无线蓝牙耳机
```

第二个例子需要保存上一轮的 `pendingIntent`，属于下一章的多轮会话状态。

所以第四章的边界是：

> 先学会正确处理一句完整的商品问题，再学习怎样记住上一轮。

### 第一遍只完成三个目标

第一次学习第四章时，不要尝试完成全文所有扩展，只完成：

1. `CustomerIntentSchema` 能通过测试。
2. `/api/agent/intent` 能返回结构化 JSON。
3. “无线蓝牙耳机库存多少”能提取出正确的 `productName`。

完成这三个目标以后，先停下来确认自己能解释调用流程。

### 第二遍再完成商品查询

第二遍才继续：

1. 根据 `intent` 判断是否属于商品业务。
2. 把 `productName` 传给 ProductService。
3. 使用数据库返回的 `stock` 生成回答。

价格、分类、前端调试信息和性能优化，都放到最后再看。

---

## 一、这一章实际上只做一件事

这一章只打通下面这一条线：

```text
一句用户消息
→ 一个结构化对象
→ 一次 ProductService 查询
→ 一个客服回答
```

请从头到尾只跟踪这一个例子：

```ts
const message = '无线蓝牙耳机库存多少？';
```

第一步，模型只负责把句子拆开：

```ts
const analysis = {
  intent: 'inventory_query',
  entities: {
    productName: '无线蓝牙耳机',
  },
};
```

第二步，代码只取商品名称：

```ts
const keyword = analysis.entities.productName;
// keyword === '无线蓝牙耳机'
```

第三步，ProductService 查询数据库：

```ts
const result = await productService.findAll({
  keyword: '无线蓝牙耳机',
  page: 1,
  pageSize: 5,
});
```

第四步，代码读取真实库存：

```ts
const stock = result.list[0].stock;
// 假设数据库返回 35
```

第五步，组成回答：

```text
无线蓝牙耳机当前库存 35 件。
```

只要这五步能讲清楚，第四章的主线就已经掌握了。

---

## 二、三个东西不要混在一起

第四章容易模糊，主要是因为下面三个东西看起来都和 AI 有关，但职责不同。

| 名称 | 输入 | 输出 | 是否查询数据库 |
| --- | --- | --- | --- |
| Structured Output | 用户的一句话 | `intent`、`productName` 等结构 | 否 |
| ProductService | 商品名、分类 ID | 真实商品、价格、库存 | 是 |
| Agent + Tool | 用户问题 | 模型决定是否调用工具后生成回答 | 可能 |

### Structured Output 只负责拆句子

```text
“无线蓝牙耳机库存多少”
→ intent = inventory_query
→ productName = 无线蓝牙耳机
```

它不会返回真实库存。

### ProductService 只负责查真数据

```text
keyword = 无线蓝牙耳机
→ 数据库
→ stock = 35
```

它不负责理解“还有货吗”这种自然语言。

### Agent 继续处理其他问题

```text
计算、时间、普通聊天、开放式建议
→ 原来的 createAgent()
```

第四章对明确的商品查询选择：

```text
Structured Output
→ 代码判断
→ 直接调用 ProductService
```

不要在同一条商品请求中又直接调用 ProductService，又让 Agent 再调用一次 `search_product` Tool。

---

## 三、每一个文件只承担一个职责

第一遍只关注四个文件：

| 文件 | 这一章中的职责 | 暂时不要放什么 |
| --- | --- | --- |
| `agent.intent.ts` | 定义固定表格 | 不调用模型、不查数据库 |
| `agent.intent.service.ts` | 让模型填写表格 | 不查询商品 |
| `agent.controller.ts` | 提供 `/intent` 测试入口 | 不写业务判断 |
| `agent.service.ts` | 根据意图分流并生成最终回答 | 不重新定义 Schema |

ProductService 已经存在，不需要重新创建。

文件之间的关系是：

```text
agent.intent.ts
  被 agent.intent.service.ts 使用

agent.intent.service.ts
  被 agent.controller.ts 单独测试
  也被 agent.service.ts 用来分流

agent.service.ts
  调用已有 ProductService
```

如果你发现自己正在 `agent.intent.ts` 里写数据库查询，说明职责放错了。

---

## 四、只看五个检查点

不要用“我把整章代码都复制完了”判断是否完成，要看下面五个检查点。

| 检查点 | 输入 | 你必须看到的结果 | 失败时只检查 |
| --- | --- | --- | --- |
| 1. Schema | 手写对象 | Jest 测试通过 | `agent.intent.ts` |
| 2. 模型提取 | 完整用户句子 | `intent` 和 `productName` | `agent.intent.service.ts`、模型接口 |
| 3. HTTP 接口 | POST `/api/agent/intent` | 结构化 JSON | Controller、Module |
| 4. 商品查询 | `productName` | ProductService 返回商品 | ProductService、数据库数据 |
| 5. 最终聊天 | 原始用户句子 | 返回准确库存 | `AgentService.chat()` 路由 |

必须按照 `1 → 2 → 3 → 4 → 5` 前进。

例如检查点 2 还没有通过，就不要开始改 ProductService。

第一遍阅读顺序：

```text
阶段 A
→ 阶段 B
→ 阶段 C
→ 停下来测试 /api/agent/intent
```

第二遍阅读顺序：

```text
阶段 D 的商品路由
→ handleProductIntent
→ 接入 chat()
→ 测试最终库存回答
```

后面的价格、分类、日志、前端显示和性能优化先当作参考资料，不要求一次完成。

### 你现在走到哪里了

根据当前项目代码，你已经创建了：

```text
agent.intent.ts
agent.intent.spec.ts
```

所以你现在只在“检查点 1：Schema”。

当前测试做的是：

```text
你手写一个对象
→ 交给 CustomerIntentSchema
→ 检查这个对象合不合格
```

当前测试没有做：

```text
没有调用 ChatOpenAI
没有让模型识别用户问题
没有调用 ProductService
没有调用 search_product Tool
没有查询数据库
```

这点非常重要。Schema 测试通过，只能证明“表格规则写对了”，不能证明“模型会正确填表”。

你的下一个唯一任务是：

```text
把 agent.intent.spec.ts 的三条测试全部跑通
```

三条都通过以后，再创建 `agent.intent.service.ts`。在这之前不要改 `AgentService.chat()`。

---

## 五、阶段 A：创建客服意图 Schema

新建文件：

```text
server/src/agent/agent.intent.ts
```

写入：

```ts
import { z } from 'zod';

/**
 * 第一版客服意图。
 * 不要一开始放几十种意图，分类越多越容易混淆。
 */
export const CustomerIntentNameSchema = z.enum([
  'product_search',
  'inventory_query',
  'price_query',
  'order_status',
  'refund_request',
  'complaint',
  'human_handoff',
  'general_chat',
  'unknown',
]);

/**
 * 用户话语中明确出现的关键数据。
 * 没有出现的字段统一返回 null，不允许模型猜测。
 */
export const CustomerEntitiesSchema = z.object({
  productName: z
    .string()
    .nullable()
    .describe('用户明确提到的商品名称，未提到时为 null'),

  categoryName: z
    .string()
    .nullable()
    .describe('用户明确提到的商品分类，未提到时为 null'),

  orderNo: z
    .string()
    .nullable()
    .describe('用户明确提供的订单号，未提供时为 null'),

  budgetMax: z
    .number()
    .nonnegative()
    .nullable()
    .describe('用户明确表达的最高预算，未表达时为 null'),

  quantity: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe('用户明确表达的数量，未表达时为 null'),

  reason: z
    .string()
    .nullable()
    .describe('退款或投诉原因，未表达时为 null'),
});

export const MissingFieldSchema = z.enum([
  'productName',
  'categoryName',
  'orderNo',
  'budgetMax',
  'quantity',
  'reason',
]);

/**
 * 模型最终必须填写的完整登记表。
 */
export const CustomerIntentSchema = z.object({
  intent: CustomerIntentNameSchema.describe(
    '用户当前最主要的客服意图',
  ),

  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('模型对主要意图的判断信心，范围 0 到 1'),

  entities: CustomerEntitiesSchema,

  missingFields: z
    .array(MissingFieldSchema)
    .describe('完成当前请求仍缺少的关键字段'),

  normalizedQuery: z
    .string()
    .describe('整理后的用户请求，不得增加用户没有说过的事实'),
});

export type CustomerIntentName = z.infer<
  typeof CustomerIntentNameSchema
>;

export type CustomerEntities = z.infer<
  typeof CustomerEntitiesSchema
>;

export type CustomerIntent = z.infer<
  typeof CustomerIntentSchema
>;
```

### 每个字段的白话解释

#### intent

```ts
intent: 'inventory_query'
```

相当于服务台说：

```text
这位顾客现在主要想查库存。
```

它只负责分类，不包含真实库存数据。

#### confidence

```ts
confidence: 0.95
```

相当于服务台说：

```text
我非常确定他是在问库存。
```

它不是经过统计证明的真实概率，只能用作辅助判断。

#### entities

```ts
entities.productName = '无线蓝牙耳机'
```

相当于从用户原话中圈出关键词。

#### missingFields

用户只说：

```text
帮我查库存
```

程序应该得到：

```ts
missingFields: ['productName']
```

这样代码就知道应该追问商品名称。

#### normalizedQuery

它只是把口语整理得更清楚：

```text
原话：耳机那个还有吗，三百以内的
整理：查询 300 元以内耳机的库存
```

它不能偷偷增加商品、订单号或金额。

---

## 六、先在本地验证 Schema

Schema 本身不需要调用模型，可以直接写单元测试。

新建：

```text
server/src/agent/agent.intent.spec.ts
```

第一组测试：合法结果能够通过。

```ts
import { CustomerIntentSchema } from './agent.intent';

describe('CustomerIntentSchema', () => {
  it('接受合法的库存查询结果', () => {
    const result = CustomerIntentSchema.parse({
      intent: 'inventory_query',
      confidence: 0.95,
      entities: {
        productName: '无线蓝牙耳机',
        categoryName: null,
        orderNo: null,
        budgetMax: 300,
        quantity: null,
        reason: null,
      },
      missingFields: [],
      normalizedQuery: '查询无线蓝牙耳机库存，预算不超过300元',
    });

    expect(result.intent).toBe('inventory_query');
    expect(result.entities.productName).toBe('无线蓝牙耳机');
    expect(result.entities.budgetMax).toBe(300);
  });
});
```

第二组测试：非法意图不能通过。

```ts
it('拒绝枚举以外的意图', () => {
  const result = CustomerIntentSchema.safeParse({
    intent: '随便查一下',
    confidence: 0.9,
    entities: {
      productName: null,
      categoryName: null,
      orderNo: null,
      budgetMax: null,
      quantity: null,
      reason: null,
    },
    missingFields: [],
    normalizedQuery: '随便查一下',
  });

  expect(result.success).toBe(false);
});
```

第三组测试：置信度超过范围不能通过。

```ts
it('拒绝错误的 confidence', () => {
  const result = CustomerIntentSchema.safeParse({
    intent: 'general_chat',
    confidence: 5,
    entities: {
      productName: null,
      categoryName: null,
      orderNo: null,
      budgetMax: null,
      quantity: null,
      reason: null,
    },
    missingFields: [],
    normalizedQuery: '你好',
  });

  expect(result.success).toBe(false);
});
```

运行：

```bash
cd server
pnpm test -- agent.intent.spec.ts --runInBand
```

阶段 A 验收：

- [ ] 合法结果测试通过。
- [ ] 非法意图被拒绝。
- [ ] 错误数字范围被拒绝。
- [ ] 能解释 `parse()` 与 `safeParse()` 的区别。

白话记忆：

```text
parse     = 不合格就直接抛异常
safeParse = 不合格时返回 success: false，方便自己处理
```

---

## 七、阶段 B：创建 AgentIntentService

新建：

```text
server/src/agent/agent.intent.service.ts
```

完整学习版代码：

```ts
import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import {
  CustomerIntent,
  CustomerIntentSchema,
} from './agent.intent';

const DEFAULT_MODEL = 'gpt-4.1-mini';

@Injectable()
export class AgentIntentService {
  private readonly logger = new Logger(AgentIntentService.name);
  private model?: ChatOpenAI;

  constructor(private readonly configService: ConfigService) {}

  async analyze(message: string): Promise<CustomerIntent> {
    const startedAt = Date.now();

    try {
      const structuredModel = this.getModel().withStructuredOutput(
        CustomerIntentSchema,
        {
          name: 'customer_intent',
        },
      );

      const result = await structuredModel.invoke([
        {
          role: 'system',
          content: [
            '你是商城客服意图识别器，不负责直接回答用户。',
            '只提取用户明确表达的信息，不得编造商品、订单号、金额或原因。',
            '用户明确要求人工时，intent 优先返回 human_handoff。',
            '用户询问商品是否有货或库存数量时，返回 inventory_query。',
            '用户只询问商品价格时，返回 price_query。',
            '用户搜索、推荐或浏览商品时，返回 product_search。',
            '无法可靠判断时返回 unknown。',
            '缺失的数据返回 null，并写入 missingFields。',
          ].join('\n'),
        },
        {
          role: 'user',
          content: message,
        },
      ]);

      const parsed = CustomerIntentSchema.parse(result);

      this.logger.debug(
        `意图识别成功 intent=${parsed.intent} durationMs=${Date.now() - startedAt}`,
      );

      return parsed;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      const detail = error instanceof Error ? error.stack : String(error);
      this.logger.error('客服意图识别失败', detail);

      throw new BadGatewayException(
        '客服意图识别失败，请检查模型是否支持 Structured Output',
      );
    }
  }

  private getModel(): ChatOpenAI {
    if (this.model) {
      return this.model;
    }

    const apiKey = this.configService
      .get<string>('OPENAI_API_KEY')
      ?.trim();

    if (!apiKey) {
      throw new ServiceUnavailableException(
        '尚未配置 OPENAI_API_KEY，无法识别客服意图',
      );
    }

    const baseURL = this.configService
      .get<string>('OPENAI_BASE_URL')
      ?.trim();

    const model =
      this.configService.get<string>('OPENAI_MODEL')?.trim() ||
      DEFAULT_MODEL;

    this.model = new ChatOpenAI({
      apiKey,
      model,
      temperature: 0,
      ...(baseURL
        ? {
            configuration: { baseURL },
          }
        : {}),
    });

    return this.model;
  }
}
```

### 逐段解释

#### 为什么单独创建 Service

```text
AgentIntentService：只负责听懂用户的话
AgentService：负责最终聊天回答和 Agent Tool
```

如果全部写在一个方法中，出现错误时很难判断到底是哪一层失败。

#### 为什么缓存 ChatOpenAI

```ts
private model?: ChatOpenAI;
```

第一次调用时创建，后面复用同一个模型客户端配置。

缓存的是客户端对象，不是用户对话内容，所以不会自动获得长期记忆。

#### 为什么 structuredModel 可以每次创建

```ts
this.getModel().withStructuredOutput(CustomerIntentSchema)
```

它主要是给已有模型包上一层输出约束。第一版先保持代码类型简单，后面确认稳定后再考虑缓存。

#### 为什么 Prompt 说“不负责回答用户”

因为这个模型的任务只是填表，不是生成客服回复。

如果职责不清晰，模型可能一边填表一边尝试回答问题，增加输出错误概率。

---

## 八、注册 AgentIntentService

打开：

```text
server/src/agent/agent.module.ts
```

导入：

```ts
import { AgentIntentService } from './agent.intent.service';
```

修改 providers：

```ts
@Module({
  imports: [ProductModule, CategoryModule],
  controllers: [AgentController],
  providers: [AgentService, AgentIntentService],
  exports: [AgentService],
})
export class AgentModule {}
```

白话解释：

```text
providers 就像 NestJS 的员工名单。
不把 AgentIntentService 登记进去，NestJS 就不知道应该怎样创建它。
```

构建验证：

```bash
cd server
pnpm run build
```

阶段 B 验收：

- [ ] 构建成功。
- [ ] NestJS 没有“无法解析依赖”的错误。
- [ ] 能解释为什么 API Key 仍然只在后端读取。

---

## 九、阶段 C：增加独立意图接口

不要马上修改现有 `/api/agent/chat`。

先创建一个只用于观察结果的接口：

```http
POST /api/agent/intent
```

修改 `agent.controller.ts`。

增加导入：

```ts
import { AgentIntentService } from './agent.intent.service';
```

修改构造函数：

```ts
constructor(
  private readonly agentService: AgentService,
  private readonly agentIntentService: AgentIntentService,
) {}
```

增加接口：

```ts
/** POST /api/agent/intent — 学习阶段：识别意图和关键字段 */
@Post('intent')
analyzeIntent(@Body() dto: AgentChatDto) {
  return this.agentIntentService.analyze(dto.message);
}
```

完整调用关系：

```text
POST /api/agent/intent
→ ValidationPipe 检查 message
→ AgentIntentService.analyze()
→ ChatOpenAI.withStructuredOutput()
→ CustomerIntentSchema.parse()
→ 返回 JSON
```

### 第一次测试

```bash
curl -X POST http://127.0.0.1:3000/api/agent/intent \
  -H 'Content-Type: application/json' \
  -d '{"message":"无线蓝牙耳机库存多少，预算最多300元"}'
```

重点检查：

```text
intent 是否为 inventory_query
productName 是否为 无线蓝牙耳机
budgetMax 是否为 300
orderNo 是否为 null
```

### 第二次测试

```bash
curl -X POST http://127.0.0.1:3000/api/agent/intent \
  -H 'Content-Type: application/json' \
  -d '{"message":"帮我查库存"}'
```

重点检查：

```text
intent = inventory_query
productName = null
missingFields 包含 productName
```

### 第三次测试

```bash
curl -X POST http://127.0.0.1:3000/api/agent/intent \
  -H 'Content-Type: application/json' \
  -d '{"message":"请计算125乘以8"}'
```

这个问题不属于当前商品意图，可能得到 `unknown` 或其他非商品分类。后面它应该继续交给原来的 Agent，而不是强行走商品查询。

---

## 十、自定义模型接口可能出现的兼容问题

你当前使用 `OPENAI_BASE_URL` 指向兼容接口。

“兼容 OpenAI”可能只代表它支持普通聊天：

```text
messages → 文本回答
```

不一定支持：

- Tool Calling。
- JSON Schema。
- `response_format`。
- strict Structured Output。
- Tool 和 Structured Output 同时使用。

常见现象：

### 返回 400

日志可能出现：

```text
response_format is not supported
json_schema is not supported
```

说明供应商没有实现对应参数。

### 返回 404

可能是模型名称错误，或者 Base URL 路径不正确。

### 一直 pending

可能是：

- 中转接口没有正确处理 Structured Output。
- 模型请求没有超时。
- 上游模型连接异常。

### 返回了文字但解析失败

说明模型或接口没有真正遵循 Schema。

此时不要先修改业务路由，应该先让 `/api/agent/intent` 单独工作。

---

## 十一、准备商品业务的确定性路由

先定义哪些意图由商品代码处理：

```ts
const PRODUCT_INTENTS = new Set([
  'product_search',
  'inventory_query',
  'price_query',
]);
```

白话解释：

```text
如果用户明确是在搜商品、问库存、问价格，
我们已经知道应该查 ProductService，
不需要再让 Agent 猜下一步。
```

不要把下面意图接入当前商品 Service：

```text
order_status
refund_request
complaint
```

因为项目还没有完成对应的安全业务流程。

---

## 十二、先处理“缺少商品名称”

最重要的保护逻辑不是查询，而是知道什么时候不能查。

```ts
private getProductKeyword(analysis: CustomerIntent): string | null {
  return (
    analysis.entities.productName?.trim() ||
    analysis.entities.categoryName?.trim() ||
    null
  );
}
```

如果返回 null：

```ts
if (!keyword) {
  return {
    reply: '请告诉我你想查询的商品名称或分类，例如“无线蓝牙耳机”或“数码”。',
    source: 'intent_router',
  };
}
```

为什么这一步能解决前面的问题？

用户输入：

```text
帮我查库存
```

以前模型可能调用：

```ts
keyword: '库存'
```

现在 Structured Output 会表达：

```ts
intent: 'inventory_query'
productName: null
```

代码发现没有商品名称，会先追问，而不是把“库存”当商品名。

---

## 十三、根据商品名称查询 ProductService

商品名称查询可以直接复用已有方法：

```ts
const result = await this.productService.findAll({
  keyword,
  page: 1,
  pageSize: 5,
  sort: 'sales',
});
```

这里没有重新写 SQL，也没有请求自己的 `/api/product` 接口。

原因是：

```text
AgentService 和 ProductService 都在同一个 NestJS 进程中，
可以直接通过依赖注入调用。
```

错误做法：

```ts
await fetch('http://localhost:3000/api/product?...');
```

这种写法会增加：

- 一次无意义的 HTTP 请求。
- 网络错误点。
- 序列化和反序列化。
- 环境地址配置。
- 测试复杂度。

---

## 十四、按分类名称查询商品

`ProductService.findAll()` 接收的是：

```ts
categoryId?: number
```

但用户说的是：

```text
数码
```

所以需要先使用 CategoryService 把分类名称转换成分类 ID。

```ts
private async findCategoryId(
  categoryName: string,
): Promise<number | null> {
  const normalizedName = categoryName.trim().toLowerCase();
  const categories = await this.categoryService.findAll();

  const category = categories.find((item) => {
    const name = item.name.trim().toLowerCase();

    return (
      name === normalizedName ||
      name.includes(normalizedName) ||
      normalizedName.includes(name)
    );
  });

  return category?.id ?? null;
}
```

然后查询：

```ts
const categoryId = analysis.entities.categoryName
  ? await this.findCategoryId(analysis.entities.categoryName)
  : undefined;

const result = await this.productService.findAll({
  categoryId,
  keyword: analysis.entities.productName ?? undefined,
  page: 1,
  pageSize: 5,
  sort: 'sales',
});
```

如果用户明确提供了分类，但数据库找不到：

```ts
if (analysis.entities.categoryName && !categoryId) {
  return `没有找到“${analysis.entities.categoryName}”这个商品分类。`;
}
```

不要把不存在的分类当成“全部分类”继续查询，否则用户问“食品”，系统却可能返回耳机。

---

## 十五、分别生成搜索、库存和价格回答

ProductService 返回真实数据后，可以按照意图生成确定性回答。

### 商品搜索回答

```ts
private formatProductSearchReply(
  products: Array<{
    name: string;
    price: number;
    stock: number;
  }>,
): string {
  const lines = products.map(
    (product) =>
      `- ${product.name}：¥${product.price}，${
        product.stock > 0 ? '有货' : '暂时缺货'
      }`,
  );

  return ['找到以下商品：', ...lines].join('\n');
}
```

### 库存回答

```ts
private formatInventoryReply(
  products: Array<{
    name: string;
    stock: number;
  }>,
): string {
  return products
    .map((product) => {
      if (product.stock <= 0) {
        return `${product.name} 当前库存为 0，暂时缺货。`;
      }

      return `${product.name} 当前库存 ${product.stock} 件，可以购买。`;
    })
    .join('\n');
}
```

### 价格回答

```ts
private formatPriceReply(
  products: Array<{
    name: string;
    price: number;
    originalPrice?: number;
  }>,
): string {
  return products
    .map((product) => {
      const originalPrice = product.originalPrice
        ? `，原价 ¥${product.originalPrice}`
        : '';

      return `${product.name} 当前价格 ¥${product.price}${originalPrice}。`;
    })
    .join('\n');
}
```

为什么这里不用模型组织语言？

因为这些回答：

- 结构简单。
- 数据敏感。
- 不能把库存数字说错。
- 不需要创意。

确定性代码更快、更便宜、更容易测试。

---

## 十六、商品意图处理方法完整示例

可以先在 `AgentService` 中增加一个私有方法。后面代码变大以后，再抽成独立 RouterService。

```ts
private async handleProductIntent(
  analysis: CustomerIntent,
): Promise<string> {
  const productName = analysis.entities.productName?.trim();
  const categoryName = analysis.entities.categoryName?.trim();

  if (!productName && !categoryName) {
    return '请告诉我你想查询的商品名称或分类，例如“无线蓝牙耳机”或“数码”。';
  }

  let categoryId: number | undefined;

  if (categoryName) {
    const matchedCategoryId = await this.findCategoryId(categoryName);

    if (!matchedCategoryId) {
      return `没有找到“${categoryName}”这个商品分类。`;
    }

    categoryId = matchedCategoryId;
  }

  const result = await this.productService.findAll({
    keyword: productName || undefined,
    categoryId,
    page: 1,
    pageSize: 5,
    sort: 'sales',
  });

  if (result.total === 0) {
    const target = productName || categoryName;
    return `没有找到与“${target}”相关的已上架商品。`;
  }

  switch (analysis.intent) {
    case 'inventory_query':
      return this.formatInventoryReply(result.list);

    case 'price_query':
      return this.formatPriceReply(result.list);

    case 'product_search':
    default:
      return this.formatProductSearchReply(result.list);
  }
}
```

### 为什么查询结果为空时不能交给模型补充

数据库返回：

```ts
result.total === 0
```

这表示当前数据库没有匹配的已上架商品。

正确回答：

```text
没有找到与“游戏主机”相关的已上架商品。
```

错误回答：

```text
我们可能有某品牌游戏主机，价格大约……
```

模型不能使用记忆编造商城商品。

---

## 十七、扩展聊天响应类型

当前响应只有：

```ts
export interface AgentChatResponseDto {
  reply: string;
  model: string;
}
```

为了开发阶段方便观察，可以增加可选调试字段：

```ts
import type {
  CustomerEntities,
  CustomerIntentName,
} from './agent.intent';

export interface AgentChatResponseDto {
  reply: string;
  model: string;
  source?: 'intent_router' | 'agent';
  intent?: CustomerIntentName;
  entities?: CustomerEntities;
}
```

为什么使用可选字段 `?`？

因为现有前端只依赖：

```ts
reply
model
```

增加可选字段不会立刻破坏现有页面。前端不知道这些字段时会自动忽略。

生产环境是否返回完整 entities，需要根据隐私要求决定。订单号、手机号等敏感数据不应该随意回显。

---

## 十八、阶段 E：接入现有 chat()

先在 `AgentService` 中注入：

```ts
constructor(
  private readonly configService: ConfigService,
  private readonly productService: ProductService,
  private readonly categoryService: CategoryService,
  private readonly agentIntentService: AgentIntentService,
) {}
```

增加导入：

```ts
import { AgentIntentService } from './agent.intent.service';
import {
  CustomerIntent,
  CustomerIntentName,
} from './agent.intent';
```

定义商品意图集合：

```ts
const PRODUCT_INTENTS: ReadonlySet<CustomerIntentName> =
  new Set<CustomerIntentName>([
    'product_search',
    'inventory_query',
    'price_query',
  ]);
```

然后调整 `chat()`：

```ts
async chat(message: string): Promise<AgentChatResponseDto> {
  const modelName = this.getModelName();

  try {
    const analysis = await this.agentIntentService.analyze(message);

    if (PRODUCT_INTENTS.has(analysis.intent)) {
      const reply = await this.handleProductIntent(analysis);

      return {
        reply,
        model: modelName,
        source: 'intent_router',
        intent: analysis.intent,
        entities: analysis.entities,
      };
    }

    const result = await this.getAgent().invoke({
      messages: [{ role: 'user', content: message }],
    });

    const lastMessage = result.messages.at(-1);

    return {
      reply: this.extractText(lastMessage?.content),
      model: modelName,
      source: 'agent',
      intent: analysis.intent,
      entities: analysis.entities,
    };
  } catch (error) {
    if (error instanceof ServiceUnavailableException) {
      throw error;
    }

    const detail = error instanceof Error ? error.stack : String(error);
    this.logger.error('单 Agent 调用失败', detail);

    throw new BadGatewayException(
      'AI 服务调用失败，请检查模型名称、API Key、Base URL 或稍后重试',
    );
  }
}
```

现在两条路径非常清楚：

```text
商品意图 → handleProductIntent → ProductService
其他意图 → getAgent().invoke → 原有 Agent
```

### 这段代码的代价

对于普通聊天，会发生两次模型调用：

```text
第一次：识别意图
第二次：Agent 生成回答
```

学习阶段可以接受，因为更容易看懂。

后面优化时可以：

- 对“转人工”等明显关键词先使用规则。
- 只对可能涉及业务的消息做意图识别。
- 让最终 Agent 使用统一 `responseFormat`。
- 使用更便宜、更快的分类模型。

不要在第一版同时做所有优化。

---

## 十九、是否还需要 search_product Tool

接入确定性商品路由后，你可能会问：

> ProductService 已经直接查询商品了，`search_product` Tool 还有用吗？

答案是：有，但职责需要明确。

### 确定性路由使用 ProductService

```text
已经明确识别为商品搜索/库存/价格
→ 代码直接调用 ProductService
```

### Agent Tool 处理开放式问题

```text
用户提出更开放的问题
→ Agent 在推理过程中可能需要搜索商品
→ Agent 调用 search_product Tool
```

例如：

```text
我准备送朋友一件礼物，预算 300 元，你可以结合商城商品给点建议吗？
```

它可能需要模型推理后调用 Tool。

所以当前可以保留 Tool，不需要删除。

但要避免同一次明确商品请求同时走：

```text
确定性 ProductService 查询
+ Agent 再查一次 Tool
```

商品路由已经返回回答后，就直接结束请求。

---

## 二十、给 systemPrompt 补充业务边界

虽然明确商品意图会被提前路由，但原有 Agent 仍可能在开放问题中调用商品 Tool。

建议把现有 `systemPrompt` 调整为：

```ts
systemPrompt: [
  '你是 FE 商城项目的中文 AI 客服助手。',
  '回答要准确、简洁；不知道时明确说明，不得编造事实。',
  '需要计算或获取当前时间时，应调用提供的工具。',
  '涉及商城商品、价格、库存或分类时，必须以工具返回结果为准。',
  '商品工具没有返回结果时，应明确说明没有找到，不得根据模型记忆推荐虚构商品。',
  '当前 Agent 没有用户订单写权限，也没有长期记忆。',
].join('\n'),
```

Tool description 负责解释“这个 Tool 能做什么”。

System Prompt 负责解释“整个 Agent 必须遵守什么规则”。

这两者不要混为一谈。

---

## 二十一、前端怎样观察 intent

当前 `AgentChat.tsx` 只读取：

```ts
data.reply
data.model
```

如果只想先验证功能，不需要修改前端。打开浏览器开发者工具：

```text
Network
→ /api/agent/chat
→ Response
```

就可以看到：

```json
{
  "reply": "无线蓝牙耳机当前库存 35 件，可以购买。",
  "model": "...",
  "source": "intent_router",
  "intent": "inventory_query",
  "entities": {
    "productName": "无线蓝牙耳机"
  }
}
```

学习第二步再考虑在消息下面显示：

```text
intent: inventory_query
source: intent_router
```

不要第一天就把整个 entities JSON 永久展示给普通用户，它更适合作为开发调试信息。

---

## 二十二、完整手动测试清单

### 商品搜索

输入：

```text
有哪些耳机？
```

检查：

```text
intent = product_search
productName = 耳机
source = intent_router
返回真实数据库商品
```

### 库存查询

输入：

```text
无线蓝牙耳机库存多少？
```

检查：

```text
intent = inventory_query
productName = 无线蓝牙耳机
回答包含准确 stock
```

### 缺货商品

输入：

```text
保温杯还有货吗？
```

检查：

```text
stock = 0 时明确回答暂时缺货
不能只回答 inStock=false
```

### 价格查询

输入：

```text
机械键盘多少钱？
```

检查：

```text
intent = price_query
回答来自数据库 price
```

### 分类查询

输入：

```text
有哪些数码商品？
```

检查：

```text
categoryName = 数码
先找到 categoryId
再查询该分类商品
```

### 缺少商品名称

输入：

```text
帮我查库存
```

检查：

```text
不查询数据库
不把“库存”当 keyword
追问商品名称或分类
```

### 不存在商品

输入：

```text
火箭发动机多少钱？
```

检查：

```text
明确回答没有找到
不得编造价格
```

### 原有计算 Tool

输入：

```text
请计算 125 × 8
```

检查：

```text
source = agent
calculator Tool 仍能工作
```

### 普通聊天

输入：

```text
你好
```

检查：

```text
source = agent
正常返回问候
```

---

## 二十三、建议增加的日志

不要只打印：

```ts
console.log(result);
```

建议记录有定位价值、但不泄露敏感信息的字段：

```ts
this.logger.debug(
  JSON.stringify({
    event: 'customer_intent_detected',
    intent: analysis.intent,
    confidence: analysis.confidence,
    missingFields: analysis.missingFields,
  }),
);
```

商品查询可以记录：

```ts
this.logger.debug(
  JSON.stringify({
    event: 'product_intent_routed',
    intent: analysis.intent,
    hasProductName: Boolean(analysis.entities.productName),
    hasCategoryName: Boolean(analysis.entities.categoryName),
    matchedCount: result.list.length,
  }),
);
```

不建议直接记录：

```text
完整用户聊天内容
API Key
模型 access token
用户手机号
完整订单信息
```

---

## 二十四、测试时怎样快速定位错误

### `/api/agent/intent` 就失败

问题通常在：

```text
ChatOpenAI 配置
模型名称
Base URL
Structured Output 兼容性
Schema
```

这时先不要检查 ProductService。

### `/api/agent/intent` 正常，但 `/api/agent/chat` 查不到商品

检查：

```text
analysis.entities.productName
analysis.entities.categoryName
ProductService.findAll() 参数
数据库是否有 status=1 的商品
```

### 数据库查到了，回答库存不对

检查格式化函数是不是使用：

```ts
product.stock
```

而不是只使用：

```ts
product.stock > 0
```

`inStock` 只能表达有没有货，不能表达具体有多少件。

### 商品查询正常，计算器坏了

检查非商品意图是否仍然进入：

```ts
this.getAgent().invoke(...)
```

不要让所有意图都提前 return。

---

## 二十五、单元测试应该分成三层

### 第一层：Schema 测试

不调用模型、不连接数据库。

验证：

- 枚举。
- null。
- 数字范围。
- 缺失字段。

### 第二层：路由测试

Mock `AgentIntentService` 和 `ProductService`。

例如让意图 Service 固定返回：

```ts
{
  intent: 'inventory_query',
  confidence: 1,
  entities: {
    productName: '无线蓝牙耳机',
    categoryName: null,
    orderNo: null,
    budgetMax: null,
    quantity: null,
    reason: null,
  },
  missingFields: [],
  normalizedQuery: '查询无线蓝牙耳机库存',
}
```

然后断言：

```ts
expect(productService.findAll).toHaveBeenCalledWith({
  keyword: '无线蓝牙耳机',
  categoryId: undefined,
  page: 1,
  pageSize: 5,
  sort: 'sales',
});
```

### 第三层：真实模型评估

只在本地或测试环境运行，不要让普通单元测试依赖真实模型。

准备固定数据集：

```ts
const cases = [
  {
    message: '无线蓝牙耳机库存多少',
    expectedIntent: 'inventory_query',
    expectedProductName: '无线蓝牙耳机',
  },
  {
    message: '机械键盘多少钱',
    expectedIntent: 'price_query',
    expectedProductName: '机械键盘',
  },
];
```

统计：

```text
意图正确率
商品名称提取正确率
是否编造字段
平均耗时
失败率
```

---

## 二十六、这一版暂时不要做的事情

为了保持学习范围清晰，暂时不要同时增加：

- 自动退款。
- 自动取消订单。
- 自动修改收货地址。
- TAPD OAuth。
- 长期记忆。
- 向量数据库。
- 多 Agent。
- 自定义 LangGraph。

先把下面一条链做稳定：

```text
用户商品问题
→ 正确意图
→ 正确商品关键词
→ ProductService 真实数据
→ 正确回答
```

这条链稳定后，再向订单和售后扩展。

---

## 二十七、性能优化留到第二版

第一版每条消息都先调用意图模型，方便理解和排错。

第二版可以优化：

### 规则优先

```ts
if (/转人工|人工客服/.test(message)) {
  return 'human_handoff';
}
```

### 使用小模型分类

意图识别不一定需要和最终回答使用同一个大模型。

可以配置：

```env
OPENAI_INTENT_MODEL=更快更便宜的模型
OPENAI_MODEL=负责最终回答的模型
```

### 缓存重复问题

只缓存不含个人隐私、且确实重复的标准问题。

### 合并模型调用

后期可以探索 Agent 的 `responseFormat`，让一次 Agent 流程同时返回 reply 和结构化元数据。

但必须先验证供应商能否同时支持 Tool Calling 和 Structured Output。

---

## 二十八、为什么这里还不需要 LangGraph

当前流程是一次请求内顺序完成：

```text
识别意图
→ 查询商品
→ 返回回答
```

普通 TypeScript 的 `if`、`switch` 和 Service 调用已经足够。

只有当流程出现下面情况时，才需要认真考虑 LangGraph：

```text
用户申请退款
→ 缺少订单号，暂停等待下一轮
→ 用户补充订单号
→ 查询订单
→ 等待用户二次确认
→ 等待人工审核
→ 审核通过后执行退款
→ 失败后从指定节点恢复
```

所以这一章不引入 LangGraph。现在强行使用只会增加：

- State Schema。
- Node。
- Edge。
- Checkpointer。
- 状态恢复。
- 调试难度。

先把单请求商品客服做好，更符合你的学习阶段。

---

## 二十九、推荐的实际操作顺序

第一天：

- [ ] 创建 `agent.intent.ts`。
- [ ] 写三条 Schema 测试。
- [ ] 确认测试通过。

第二天：

- [ ] 创建 `AgentIntentService`。
- [ ] 在 Module 注册。
- [ ] 增加 `/api/agent/intent`。
- [ ] 测试至少十句话。

第三天：

- [ ] 只接入 `inventory_query`。
- [ ] 验证有库存、无库存、缺商品名称、不存在商品。

第四天：

- [ ] 接入 `price_query`。
- [ ] 接入 `product_search`。
- [ ] 增加分类名称转 categoryId。

第五天：

- [ ] 接入 `/api/agent/chat`。
- [ ] 确认 calculator 和时间 Tool 没有被破坏。
- [ ] 补路由单元测试。
- [ ] 记录本周遇到的问题。

---

## 三十、最终验收清单

### Schema

- [ ] intent 使用有限枚举。
- [ ] 所有未提供的关键字段返回 null。
- [ ] confidence 限制在 0 到 1。
- [ ] Schema 测试不调用模型也能运行。

### 意图识别

- [ ] `/api/agent/intent` 可以独立调用。
- [ ] “库存”不会被提取成商品名称。
- [ ] 不编造订单号、金额和商品。
- [ ] 模型不支持 Structured Output 时能看到明确错误。

### 商品业务

- [ ] 商品名称来自 `entities.productName`。
- [ ] 分类名称能转换为 categoryId。
- [ ] 商品查询复用 ProductService。
- [ ] 只返回 status=1 的上架商品。
- [ ] 库存回答使用具体 stock。
- [ ] 商品为空时不得编造。

### Agent

- [ ] 商品意图走 intent_router。
- [ ] 普通聊天仍然走 Agent。
- [ ] calculator Tool 仍然可以调用。
- [ ] currentTime Tool 仍然可以调用。

### 安全

- [ ] API Key 只在后端。
- [ ] 模型输出不决定用户身份和权限。
- [ ] 不记录敏感 Token。
- [ ] 没有增加任何自动写数据库 Tool。

---

## 三十一、本章一句话总结

第三章教你“让模型填写固定表格”，第四章教你“代码拿到表格以后应该怎么做”。

完整关系是：

```text
用户说人话
→ Structured Output 填表
→ Zod 检查表格
→ 代码根据 intent 分流
→ ProductService 查询真实数据
→ 确定性代码回答价格和库存
→ 不属于明确商品业务时继续交给 Agent
```

请牢记：

> Structured Output 不是为了让 JSON 看起来漂亮，而是为了让后端能够安全、稳定地做下一步决定。

本章完成后，你就拥有了智能客服第一条真正可控的业务链路：

```text
商品搜索 + 库存查询 + 价格查询 + 缺参追问
```

下一阶段请继续阅读：[第 5 课：多轮客服会话、缺失字段补全与短期状态](./LESSON_05_MULTI_TURN_STATE_AND_SLOT_FILLING.md)。你会实现：用户第一次只说“查库存”，客服追问商品名，用户下一句回答“无线蓝牙耳机”后，系统如何记住上一轮仍在处理库存查询。
