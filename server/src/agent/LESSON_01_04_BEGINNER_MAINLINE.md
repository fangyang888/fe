# 第 1～4 章小白主线版：先把你的客服 Agent 看懂

> 这是你现在应该先读的版本。
>
> 一次不要同时学习 LangChain 的全部功能。前四章只需要弄懂四件事：
>
> 1. 模型怎样接收一句话并返回一句话。
> 2. 模型怎样选择并调用 Tool。
> 3. 模型怎样把一句话整理成固定对象。
> 4. 业务代码怎样根据这个对象执行商品查询。

详细原理和生产级改造放在：

- `LESSON_01_04_LANGCHAIN_V1_MODERN_REVIEW.md`

现在不要从头读详细版。遇到具体问题时，再把它当字典查询。

---

## 0. 先建立唯一一张地图

你的客服系统里有四个角色：

```text
用户说话
   ↓
模型理解用户想做什么
   ↓
业务代码决定执行哪一种查询
   ↓
ProductService 查询真实数据库
   ↓
业务代码组织答案
```

在你的代码中，对应关系是：

| 角色 | 当前文件 | 白话解释 |
| --- | --- | --- |
| HTTP 入口 | `agent.controller.ts` | 接收前端发来的消息 |
| 总调度 | `agent.service.ts` | 决定下一步做什么 |
| 模型工厂 | `agent-model.factory.ts` | 统一创建和复用 ChatOpenAI |
| 理解意图 | `agent.intent.service.ts` | 把用户的话变成固定对象 |
| 对象规则 | `agent.intent.ts` | 规定固定对象有哪些字段 |
| Agent 工具 | `agent.tools.ts` | 给 Agent 提供可调用能力 |
| 商品客服 | `product-customer.service.ts` | 校验商品条件、查询并组织回答 |
| 真实商品查询 | `product.service.ts` | 查询数据库，结果才是事实 |

最重要的一句话：

```text
模型负责理解语言，不负责决定业务事实。
ProductService 返回的数据库结果才是事实。
```

例如用户说：

```text
苹果耳机还有货吗？
```

模型可以理解出：

```ts
{
  intent: 'inventory_query',
  entities: {
    productName: '苹果耳机',
  },
}
```

但是模型不能自己回答“有 20 件”。库存数量必须来自数据库。

---

# 第一章：ChatOpenAI 和 model.invoke()

## 1.1 ChatOpenAI 是什么

`ChatOpenAI` 是模型客户端。

你可以先把它理解成一个“电话”：

```text
你的代码 → ChatOpenAI → 模型服务
```

它需要三类配置：

```ts
const model = new ChatOpenAI({
  apiKey,
  model: modelName,
  temperature: 0,
  configuration: {
    baseURL,
  },
});
```

| 配置 | 作用 |
| --- | --- |
| `apiKey` | 证明你有权调用模型 |
| `model` | 指定调用哪个模型 |
| `baseURL` | 指定模型接口地址 |
| `temperature: 0` | 尽量让结果稳定，适合客服提取 |

重构前项目在两个地方重复创建 `ChatOpenAI`。现在统一为：

```text
AgentService ──────────┐
                      ├→ AgentModelFactory → ChatOpenAI
AgentIntentService ───┘
```

这样模型配置只有一个入口。你修改模型名、API Key 或 Base URL 时，不需要在两个
Service 里重复修改。

## 1.2 model.invoke() 是什么

`invoke()` 就是“调用一次模型”。

```ts
const result = await model.invoke([
  {
    role: 'system',
    content: '你是商城客服。',
  },
  {
    role: 'user',
    content: '苹果耳机还有货吗？',
  },
]);
```

你传入消息，模型返回一条 AI 消息。

### 消息角色

| role | 含义 |
| --- | --- |
| `system` | 给模型规定身份和规则 |
| `user` | 用户说的话 |
| `assistant` | 模型以前的回答 |
| `tool` | Tool 的执行结果 |

## 1.3 这一章你只需要掌握什么

你能回答下面三个问题就可以进入第二章：

1. `ChatOpenAI` 为什么需要 API Key、模型名和 Base URL？
2. `invoke()` 的输入是什么？
3. 模型回答和数据库事实有什么区别？

这一章暂时不要学习：

- Middleware
- Streaming
- Memory
- LangGraph
- 多 Agent

---

# 第二章：Tool 是什么

## 2.1 Tool 的本质

Tool 是“允许模型申请调用的函数”。

一个 Tool 有三部分：

```ts
const calculatorTool = tool(
  // 1. 真正执行的函数
  ({ left, right }) => String(left + right),
  {
    // 2. 给模型看的名字和说明
    name: 'calculator',
    description: '计算两个数字的和。',

    // 3. 参数规则
    schema: z.object({
      left: z.number().describe('左边的数字'),
      right: z.number().describe('右边的数字'),
    }),
  },
);
```

模型看到的是：

```text
有一个叫 calculator 的能力。
它用来计算两个数字的和。
调用时必须提供 left 和 right。
```

## 2.2 模型为什么知道返回字段的意思

它不是自动知道的。模型主要通过下面的信息理解：

1. Tool 的 `name`。
2. Tool 的 `description`。
3. Zod 字段的 `.describe()`。
4. Tool 执行结果中的字段名。
5. `systemPrompt` 中的规则。

例如商品 Tool 返回：

```ts
return {
  products: [
    {
      name: product.name,
      price: product.price,
      stock: product.stock,
      inStock: product.stock > 0,
    },
  ],
};
```

这些名字很直观，但最好仍然在 Tool 描述中写清楚：

```text
stock 是准确库存数量。
inStock 表示是否有货。
商品信息必须以 Tool 返回结果为准。
```

## 2.3 为什么现在没有注册商品 Tool

重构前，商品查询同时有两个入口：

```text
意图路由 → ProductService
Agent → search_product Tool → ProductService
```

这会让你无法判断一条商品请求究竟走了哪条路。现在已经统一为：

```text
商品搜索、价格、库存
→ ProductCustomerService
→ ProductService
```

所以 `agent.tools.ts` 暂时只保留三个通用 Tool：

```text
calculator
get_current_time
transform_text
```

为什么这样改：

```text
一种业务能力先保留一个主要入口，
学习调用链和排查问题都会更清楚。
```

## 2.4 createAgentTools() 是什么

你现在的代码：

```ts
export function createAgentTools() {
  return [
    calculatorTool,
    currentTimeTool,
    transformTextTool,
  ];
}
```

白话解释：

```text
创建一张“Agent 能力清单”，然后交给 createAgent。
```

商品能力暂时不在这个清单里，因为它已经由 `ProductCustomerService` 负责。

## 2.5 这一章你只需要掌握什么

1. Tool 不是模型，它是普通函数。
2. Zod 规定 Tool 参数的结构。
3. `description` 是模型选择 Tool 的重要说明书。
4. Tool 返回数据库事实，模型负责把事实组织成人话。

---

# 第三章：Structured Output 是什么

## 3.1 为什么需要它

普通模型输出的是一段文字：

```text
用户可能是想问苹果耳机的库存。
```

程序很难稳定地根据这句话写 `if`。

Structured Output 要求模型返回固定结构：

```ts
{
  intent: 'inventory_query',
  confidence: 0.9,
  entities: {
    productName: '苹果耳机',
    categoryName: null,
    orderNo: null,
    budgetMax: null,
    quantity: null,
    reason: null,
  },
  missingFields: [],
  normalizedQuery: '查询苹果耳机库存',
}
```

这样业务代码就可以写：

```ts
if (analysis.intent === 'inventory_query') {
  // 查询库存
}
```

## 3.2 Zod 在这里做什么

`CustomerIntentSchema` 是一张“登记表模板”。

```ts
const CustomerIntentSchema = z.object({
  intent: CustomerIntentNameSchema,
  confidence: z.number().min(0).max(1),
  entities: CustomerEntitiesSchema,
  missingFields: z.array(MissingFieldSchema),
  normalizedQuery: z.string(),
});
```

Zod 的作用：

- 规定对象必须有哪些字段。
- 规定字段是什么类型。
- 在运行时检查模型返回值。
- 从 Schema 自动推导 TypeScript 类型。

## 3.3 withStructuredOutput() 在做什么

你的代码：

```ts
const structuredModel = this.getModel().withStructuredOutput(
  CustomerIntentSchema,
  { name: 'customer_intent' },
);

const result = await structuredModel.invoke(messages);
```

白话解释：

```text
先给普通模型套上一张 Zod 登记表，
再调用模型，最终希望获得登记表对象，而不是随意文字。
```

## 3.4 confidence 是不是概率

不是严格概率。

你让模型返回 `0.9`，它只是表达“我比较有把握”。它没有经过统计校准，不能理解成“判断正确率一定是 90%”。

所以现在可以把它用于：

```text
低 confidence 时询问用户更多信息
```

但不能用于：

```text
涉及退款、付款、权限等高风险操作的唯一判断依据
```

## 3.5 模型提取不等于业务校验

模型返回：

```ts
missingFields: []
```

不代表字段一定完整。业务代码仍然要检查：

```ts
if (!productName && !categoryName) {
  return '请告诉我商品名称或分类。';
}
```

原则是：

```text
模型的结果是建议，业务代码做最终裁决。
```

## 3.6 这一章你只需要掌握什么

1. Structured Output 把自然语言变成固定对象。
2. Zod 同时提供结构说明、运行时校验和 TypeScript 类型。
3. 模型提取的字段不能直接当成可信事实。
4. `confidence` 是模型自评，不是准确概率。

---

# 第四章：你的客服请求现在怎样运行

## 4.1 当前真实流程

你现在的 `AgentService.chat()` 先做意图识别：

```ts
const analysis = await this.agentIntentService.analyze(message);
```

如果是商品相关意图：

```ts
product_search
inventory_query
price_query
```

就执行：

```ts
productCustomerService.reply(analysis)
```

然后由 `ProductCustomerService` 调用 `ProductService`。

如果不是这三个意图，才进入：

```ts
this.getAgent().invoke(...)
```

因此你的系统不是“所有问题都交给 Agent”，而是：

```text
用户消息
   ↓
Structured Output 意图识别
   ↓
   ├─ 商品问题 → 普通 TypeScript 业务代码 → ProductService
   │
   └─ 其他问题 → createAgent → Agent 选择 Tool
```

## 4.2 原来为什么容易让你糊涂

重构前商品查询有两个入口：

```text
入口一：AgentService 直接查 ProductService
入口二：Agent 调用 search_product Tool
```

但商品意图已经被入口一提前拦截，所以正常情况下：

```text
“苹果耳机有货吗？”
```

会进入前面的商品路由，不会进入 Agent 的 `search_product`。

现在商品 Tool 已从 Agent 能力清单移除，商品逻辑也从 `AgentService` 拆到了
`ProductCustomerService`，这个重复入口已经消失。

## 4.3 当前阶段怎么选

为了学习清楚，先采用下面的规则：

```text
商品搜索、价格、库存
→ 统一走意图识别 + ProductCustomerService + ProductService

计算、时间、文本转换
→ 走 createAgent + Tools
```

这样每种能力只有一个入口，不会互相抢工作。

等你掌握完第五章的多轮对话，再决定是否把商品能力全部交给 Agent Tool。

## 4.4 createAgent 在这里做什么

你的代码：

```ts
this.agent = createAgent({
  name: 'fe_assistant',
  model,
  tools: createAgentTools(...),
  systemPrompt: '...',
});
```

它把三样东西组合起来：

```text
模型 + Tool 清单 + 系统规则
```

调用 Agent 时，它大致会执行：

```text
读取用户消息
→ 判断是否需要 Tool
→ 需要时生成 Tool 参数
→ 执行 Tool
→ 阅读 Tool 结果
→ 生成最终回答
```

注意：`createAgent` 不等于“创建一个有自己意识的机器人”。它只是帮你组织模型调用、Tool 调用和消息流转。

## 4.5 为什么现在还不需要自己写 LangGraph

你当前流程仍然比较简单：

```text
识别意图 → 查询商品 → 返回答案
```

普通 TypeScript `if/switch` 更容易理解和测试。

以后出现这些需求时，再学习自定义 LangGraph：

- 一个任务要经过多个固定步骤。
- 中途暂停并等待用户补充信息。
- 失败后要回到某一步重试。
- 需要人工审核后继续运行。
- 流程存在多个分支并需要持久化状态。

---

# 五、对照修改后的代码，只按这个顺序阅读

下面这些修改已经完成。你现在的任务不是继续改架构，而是按顺序理解。

## 第一步：看 AgentService 的两个分支

文件：`agent.service.ts`

只找这段判断：

```ts
if (this.productCustomerService.canHandle(analysis.intent)) {
  // 商品通道
}

// Agent 通道
```

目的：先知道请求交给谁，不要马上钻进所有实现细节。

## 第二步：看模型如何变成一个统一依赖

文件：`agent-model.factory.ts`

它统一读取 `OPENAI_API_KEY`、`OPENAI_MODEL` 和 `OPENAI_BASE_URL`，并复用一个
`ChatOpenAI`。这样意图识别与 Agent 不再各写一遍配置。

## 第三步：看商品业务从总调度器中拆出

文件：`product-customer.service.ts`

按照下面顺序看方法：

```text
canHandle()
→ reply()
→ findCategoryId()
→ format...Reply()
```

目的：理解“路由、数据库查询、答案格式化”为什么不应该全堆在 `AgentService`。

## 第四步：看 Tool 清单为什么变短

文件：`agent.tools.ts`

现在只返回：

```ts
return [calculatorTool, currentTimeTool, transformTextTool];
```

目的：让 Agent 通道和商品通道的职责不再重复。

## 第五步：观察响应的 source

商品分支现在返回：

```ts
source: 'intent_router'
```

Agent 分支现在返回：

```ts
source: 'agent'
```

目的：前端和日志能看出答案来自哪个通道。

## 第六步：给每条路径写一个测试

至少覆盖：

| 输入 | 预期路径 |
| --- | --- |
| `苹果耳机还有货吗` | `inventory_query` |
| `苹果耳机多少钱` | `price_query` |
| `推荐苹果耳机` | `product_search` |
| `1 + 2 等于多少` | Agent + calculator |
| `现在几点` | Agent + current time |

当前已经补了意图 Schema、路由选择和商品库存回答测试。读懂这些测试后，
再尝试自己增加“价格查询”的测试。到这里为止，先不要引入更多生产级抽象。

---

# 六、现在先不要修改什么

下面的概念有用，但不是你当前最短学习路径：

- 自定义 LangGraph。
- 多 Agent。
- MCP。
- RAG 知识库。
- Checkpointer。
- Runtime Context。
- Human-in-the-loop。
- 动态模型选择。
- Middleware 重试体系。
- 完整可观测平台。

不是永远不学，而是先完成：

```text
模型调用
→ Tool 调用
→ Structured Output
→ 业务路由
→ 单元测试
```

---

# 七、用一个完整例子串起来

用户输入：

```text
手机数码分类下有什么有货的商品？
```

第一步，Controller 收到消息：

```ts
{ message: '手机数码分类下有什么有货的商品？' }
```

第二步，意图模型提取：

```ts
{
  intent: 'product_search',
  entities: {
    productName: null,
    categoryName: '手机数码',
    // 其他字段省略
  },
}
```

第三步，`AgentService` 判断它属于商品意图：

```ts
PRODUCT_INTENTS.has('product_search') === true
```

第四步，`findCategoryId()` 把“手机数码”转换成分类 ID。

第五步，`ProductService.findAll()` 查询数据库：

```ts
{
  categoryId,
  page: 1,
  pageSize: 5,
  sort: 'sales',
}
```

第六步，`formatProductSearchReply()` 生成回答。

这次请求不会调用 `createAgent`，商品数据由 `ProductCustomerService` 查询。

把这一点看懂，你目前前四章最容易混淆的地方就解决了一大半。

---

# 八、学完自测

如果下面十题能用自己的话回答，就可以继续第五章：

1. `ChatOpenAI` 和 `createAgent` 有什么区别？
2. `model.invoke()` 做了什么？
3. 一个 Tool 包含哪三部分？
4. Zod 在 Tool 中有什么作用？
5. Structured Output 为什么比让模型随意返回 JSON 更稳定？
6. `confidence: 0.9` 为什么不等于正确率 90%？
7. 商品库存为什么必须以 `ProductService` 结果为准？
8. 当前商品问题为什么由 `ProductCustomerService` 处理？
9. `ProductCustomerService` 和 `createAgent` 分别处理什么？
10. 什么情况下才需要开始学习自定义 LangGraph？

如果某一道答不上来，只回看对应小节，不要重新从头阅读所有文档。

---

# 九、你现在的学习顺序

```text
今天：只读第 0 章和第一章
  ↓
能解释 model.invoke()
  ↓
明天：读第二章，并调试 calculatorTool
  ↓
能解释 Tool 的 name / description / schema / result
  ↓
第三天：读第三章，打印一次意图识别结果
  ↓
能解释 intent / entities / missingFields
  ↓
第四天：读第四章，单步跟踪 AgentService.chat()
  ↓
能判断一个问题走意图路由还是 createAgent
  ↓
最后：按第五节逐项修改和测试
```

学习目标不是记住全部 API，而是能够拿一条用户消息，亲口说清楚它经过了哪些代码、数据从哪里来、最终由谁生成回答。
