# 第 5 课：多轮客服会话、缺失字段补全与短期状态

这一课解决第四课没有处理的问题：用户没有在一句话里把信息说完整，客服怎样在下一轮继续处理同一个任务。

先只跟踪这一个例子：

```text
用户：帮我查库存
客服：请问你想查询什么商品？
用户：无线蓝牙耳机
客服：无线蓝牙耳机当前库存 35 件。
```

这里真正困难的地方不是“让模型多说一句话”，而是让后端明确知道：

```text
上一轮正在处理 inventory_query
上一轮缺少 productName
这一轮的“无线蓝牙耳机”是在补 productName
字段已经齐全，现在才可以调用 ProductService
```

这就是本章要学习的“多轮业务状态”和“缺失字段补全”。缺失字段也经常被叫作“槽位”，补全缺失字段也叫作“槽位填充（slot filling）”。名称听起来复杂，实际就是客服登记表有一格没填，下一句话把这一格补上。

> 现代版路线采用“两种状态分工”：`createAgent + checkpointer + thread_id` 保存 Agent 的线程级短期记忆；NestJS 状态仓库保存 `pendingIntent`、`entities` 和 `missingFields` 等确定性业务状态。内存 `Map` 只用于看懂状态仓库原理，生产环境换成 Redis。这个阶段仍不需要自己定义 `StateGraph`。

---

## 零、2026 现代版学习路线：不是只做一个 Map

这一节是第五章的技术更新。先读完这一节，再继续后面的基础实现。

当前 LangChain.js v1 的多轮能力分成三层：

```text
第一层：Agent 线程短期记忆
createAgent + checkpointer + thread_id

第二层：确定性客服业务状态
pendingIntent + entities + missingFields + status

第三层：长期聊天记录
MySQL conversation + message 表（下一章）
```

三层不是互相替代，而是解决不同问题。

### 第一层解决什么

```text
用户：我叫小明
用户：我刚才说我叫什么？
```

Checkpointer 可以让同一个 `thread_id` 下的 Agent 重新读到线程状态和消息。

### 第二层解决什么

```text
用户：帮我查库存
客服：请提供商品名
用户：无线蓝牙耳机
```

代码必须可靠地知道：

```ts
pendingIntent = 'inventory_query';
missingFields = ['productName'];
```

不能只依赖模型看历史消息后重新猜。

### 第三层解决什么

```text
用户刷新页面
→ 仍然看到一周前的消息
→ 客服后台可以查看完整服务记录
```

这是应用数据库持久化，不应该只依赖 Agent Checkpoint。

### 现代版总关系

| 数据 | 本地学习 | 生产建议 |
| --- | --- | --- |
| Agent 消息与线程状态 | `MemorySaver` | 数据库支持的 Checkpointer |
| `pendingIntent` 等业务状态 | NestJS `Map` | Redis + TTL |
| 长期聊天记录 | 暂不实现 | MySQL 会话表和消息表 |
| 用户长期偏好 | 暂不实现 | LangGraph Store 或业务数据库 |

官方参考：

- [LangChain.js Short-term memory](https://docs.langchain.com/oss/javascript/langchain/short-term-memory)
- [LangGraph Persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)
- [LangChain.js Context Engineering](https://docs.langchain.com/oss/javascript/langchain/context-engineering)

---

## 零点一、为什么还要学习 Map

看到官方已经有 Checkpointer 后，你可能会问：

```text
为什么还要写 Map？是不是重复学习？
```

不是。两者负责的对象不同。

### Checkpointer 保存 Agent State

`createAgent()` 的内置 State 主要包含消息，还可以通过 State Schema 扩展字段。Checkpointer 在 Agent 或 Graph 每一步后保存 State，使相同线程可以恢复。

### Map/Redis 保存应用业务状态

本章的编排流程在 NestJS Service 中：

```text
AgentIntentService
→ 代码计算 missingFields
→ ProductService
```

其中一些步骤发生在自由 Agent 循环外部。Checkpointer 不会自动保存所有 NestJS 局部变量，也不会自动知道你的 `REQUIRED_FIELDS` 业务规则。

因此第一版使用：

```text
MemorySaver
→ 学习 Agent 消息线程

Map
→ 学习确定性业务状态仓库接口
```

生产时替换实现：

```text
MemorySaver
→ 数据库 Checkpointer

Map
→ Redis Repository
```

Controller 和编排 Service 不应该因为底层存储变化而全部重写。

### 什么时候可以把业务状态也放进 Agent State

当后面开始使用：

- 自定义 Agent State Schema；
- Middleware 写入 State；
- 自定义 LangGraph；
- Checkpoint 暂停与恢复；

可以把 `pendingIntent` 等字段纳入统一 Graph State。

但是如果现在为了省一个 Map 直接引入复杂 StateGraph，你会同时学习太多概念。现代技术不等于一步使用最复杂的框架。

---

## 零点二、安装直接依赖

当前 `langchain` 内部依赖 `@langchain/langgraph`，但你的 `server/package.json` 还没有把它声明成直接依赖。

如果自己的代码要直接导入 `MemorySaver`，应该显式安装：

```bash
cd server
pnpm add @langchain/langgraph
```

然后：

```ts
import { MemorySaver } from '@langchain/langgraph';
```

不要依赖 pnpm 当前目录结构“刚好能找到”一个间接依赖。间接依赖版本和可见性都可能随上游包变化。

安装后确认：

```bash
pnpm list langchain @langchain/core @langchain/openai @langchain/langgraph
pnpm run build
```

版本原则：

- 使用兼容的同一代 v1 包；
- 不在没有看迁移说明时一次升级多个大版本；
- 提交 lockfile；
- 升级后运行 Tool、Structured Output 和多轮测试集。

---

## 零点三、给现有 createAgent 增加 MemorySaver

当前 `AgentService` 每次只传一条当前消息：

```ts
await this.getAgent().invoke({
  messages: [{ role: 'user', content: message }],
});
```

现代本地学习版可以增加 Checkpointer。

### 第一步：创建一个长期复用的 MemorySaver

```ts
import { MemorySaver } from '@langchain/langgraph';

@Injectable()
export class AgentService {
  private readonly checkpointer = new MemorySaver();
  private agent?: SingleAgent;

  // ...
}
```

不能在每次 `chat()` 中重新创建：

```ts
async chat() {
  const checkpointer = new MemorySaver(); // 错误位置
}
```

因为每次请求都新建，上一轮状态就找不到了。

### 第二步：传给 createAgent

```ts
this.agent = createAgent({
  name: 'fe_assistant',
  model,
  tools: createAgentTools(
    this.productService,
    this.categoryService,
  ),
  systemPrompt: [
    '你是 FE 项目的中文商城客服。',
    '商品价格和库存必须来自工具结果，不得编造。',
  ].join('\n'),
  checkpointer: this.checkpointer,
});
```

### 第三步：chat 接受 conversationId

```ts
async chat(
  conversationId: string,
  message: string,
): Promise<AgentChatResponseDto> {
  const result = await this.getAgent().invoke(
    {
      messages: [{ role: 'user', content: message }],
    },
    {
      configurable: {
        thread_id: conversationId,
      },
    },
  );

  // 提取最终消息……
}
```

### 为什么参数叫 thread_id

LangGraph Checkpointer 使用线程 ID 对状态进行分组：

```text
thread_id = A
→ A 的消息和状态

thread_id = B
→ B 的消息和状态
```

你的 HTTP 字段可以叫 `conversationId`，后端调用 LangChain 时映射为：

```ts
configurable: {
  thread_id: conversationId,
}
```

不要要求前端理解 LangGraph 内部命名。

---

## 零点四、thread_id 和 Runtime Context 不要混淆

现代 v1 调用可能同时有：

```ts
await agent.invoke(
  input,
  {
    configurable: {
      thread_id: conversationId,
    },
    context: {
      userId,
      role,
      conversationId,
    },
  },
);
```

二者用途不同：

| 位置 | 作用 |
| --- | --- |
| `configurable.thread_id` | 告诉 Checkpointer 读写哪个线程 |
| `context.userId` | 给 Tool/Middleware 使用的可信当前用户 |
| `context.role` | 当前用户权限角色 |
| `context.conversationId` | 业务日志和权限校验使用 |

`thread_id` 不是登录鉴权。

即使用户提交了别人的 `conversationId`，后端也必须检查该会话是否属于当前登录用户，然后才能映射到 `thread_id`。

---

## 零点五、用最小测试验证 Checkpointer

准备固定线程：

```ts
const config = {
  configurable: {
    thread_id: 'test-thread-1',
  },
};
```

第一轮：

```ts
await agent.invoke(
  {
    messages: [
      { role: 'user', content: '请记住测试代号是蓝鲸。' },
    ],
  },
  config,
);
```

第二轮使用相同配置：

```ts
const result = await agent.invoke(
  {
    messages: [
      { role: 'user', content: '刚才的测试代号是什么？' },
    ],
  },
  config,
);
```

再换一个线程：

```ts
const otherConfig = {
  configurable: {
    thread_id: 'test-thread-2',
  },
};
```

第二个线程不应该继承第一个线程的代号。

### 这个测试能证明什么

- 同一 `thread_id` 可以恢复 Agent 消息 State；
- 不同线程隔离；
- MemorySaver 实例确实被复用。

### 不能证明什么

- NestJS 重启后还能恢复；
- 多进程之间能共享；
- 会话属于正确用户；
- `pendingIntent` 业务规则正确；
- 完整聊天记录已写入 MySQL。

MemorySaver 只适合本地学习和测试。

---

## 零点六、第五章最终采用的混合调用流程

现代版第五章推荐把流程理解成：

```text
React
发送 conversationId + message
        ↓
NestJS Controller
校验 DTO + 校验会话归属
        ↓
AgentCustomerChatService
读取 Redis/Map 业务状态
        ↓
AgentIntentService.withStructuredOutput
提取当前 intent/entities
        ↓
确定性代码
合并实体 + 复算 missingFields
        ├── 缺字段
        │   → 保存业务状态
        │   → 模板追问
        │
        ├── 明确商品业务且字段齐全
        │   → ProductService
        │   → 保存完成状态
        │
        └── 普通开放式问题
            → createAgent.invoke
            → configurable.thread_id = conversationId
            → Checkpointer 恢复 Agent 线程消息
```

这样学习不会反复推翻：

- DTO 的 `conversationId` 以后继续使用；
- Map Repository 接口以后换 Redis，调用方不变；
- MemorySaver 以后换生产 Checkpointer，Agent 调用方式基本不变；
- MySQL 消息表以后增加，不破坏当前业务状态；
- 真正进入复杂审批时，再把部分编排迁入 LangGraph。

---

## 一、本章边界：先学短期业务状态

### 本章要完成什么

本章只完成下面这一条主线：

```text
第一次请求缺商品名
→ 保存待处理意图
→ 返回追问
→ 第二次请求携带同一个 conversationId
→ 合并新字段
→ 重新检查缺失字段
→ 查询 ProductService
→ 清理待处理任务
```

第一遍只支持两个意图就够了：

- `inventory_query`：查询库存，必须有 `productName`。
- `price_query`：查询价格，必须有 `productName`。

### 本章暂时不完成什么

- 不把全部聊天记录写入数据库。
- 不做客服会话列表页面。
- 不做向量知识库和 RAG。
- 不做退款审批和真实退款操作。
- 不让多个 Agent 协作。
- 不实现自定义 LangGraph 工作流。

这些不是不重要，而是现在一起做会把“会话状态”这个核心概念淹没。

### 第一遍验收结果

完成本章第一遍后，下面的对话必须成功：

```text
请求 1：{ conversationId: "A", message: "帮我查库存" }
响应 1：请问你想查询什么商品？

请求 2：{ conversationId: "A", message: "无线蓝牙耳机" }
响应 2：无线蓝牙耳机当前库存 35 件。
```

同时，另一个会话不能串线：

```text
会话 A 正在等待商品名
会话 B 询问价格
会话 B 的内容不能写入会话 A
```

---

## 二、先看懂当前项目为什么不是真正的多轮

当前前端 `AgentChat.tsx` 有一个 `messages` 数组：

```ts
const [messages, setMessages] = useState<ChatMessage[]>(
  createInitialMessages,
);
```

它会把用户和客服消息画在页面上，所以视觉上像多轮聊天。

但是当前请求只发送：

```ts
body: JSON.stringify({ message })
```

当前后端也只调用：

```ts
this.getAgent().invoke({
  messages: [{ role: 'user', content: message }],
});
```

因此每一次后端收到的都只有当前一句。页面上的旧消息没有传给后端，后端也没有保存它们。

例如：

```text
第一轮：帮我查库存
第二轮：无线蓝牙耳机
```

第二轮到达后端时，后端实际上只看见：

```text
无线蓝牙耳机
```

它不知道上一句是“帮我查库存”，所以无法稳定判断用户是在查库存、查价格，还是仅仅搜索商品。

### 页面看得到，不代表模型记得

请牢牢记住：

> React 中显示了历史消息，只代表浏览器记得；只有发送给后端或保存在后端的数据，业务程序才能使用。

---

## 三、三个“记忆”不要混在一起

多轮客服至少有三类数据。它们看起来都叫“聊天记录”，但用途完全不同。

| 类型 | 示例 | 保存在哪里 | 主要用途 |
| --- | --- | --- | --- |
| 页面显示记录 | 气泡中的用户和客服文本 | React state | 让用户看到聊天界面 |
| 模型上下文 | `user`、`assistant` 消息数组 | 发给模型的请求 | 让模型理解代词和语言上下文 |
| 业务会话状态 | `pendingIntent`、`entities`、`missingFields` | 后端 Map/Redis | 决定下一步业务动作 |

### 1. 页面显示记录

```ts
const messages = [
  { role: 'user', content: '帮我查库存' },
  { role: 'assistant', content: '请问什么商品？' },
];
```

刷新页面后，如果没有 localStorage 或后端数据库，这些内容就消失了。

### 2. 模型上下文

```ts
await model.invoke([
  { role: 'user', content: '帮我查库存' },
  { role: 'assistant', content: '请问什么商品？' },
  { role: 'user', content: '无线蓝牙耳机' },
]);
```

它帮助模型理解语言，但它不是可靠的业务状态机。模型可能误解，也可能遗漏。

### 3. 业务会话状态

```ts
{
  conversationId: 'A',
  status: 'collecting_fields',
  pendingIntent: 'inventory_query',
  entities: {
    productName: null,
  },
  missingFields: ['productName']
}
```

这个对象是后端可以直接判断、验证和测试的数据。本章重点就是它。

### 为什么不能只把全部历史消息交给模型

只传历史消息有几个问题：

1. 模型每次都需要重新猜“当前任务进行到哪一步”。
2. 消息越多，Token 成本和延迟越高。
3. 历史中可能同时出现多个话题，模型容易混淆。
4. 代码难以判断是否已经满足调用业务 Service 的条件。
5. 权限和审批不能依赖模型自己记住。

正确思路是：

```text
自然语言历史帮助模型理解
+
结构化状态帮助代码做决定
```

---

## 四、conversationId 是什么

`conversationId` 是一次客服会话的编号。

可以把它想成医院的排队号：客服必须知道当前消息属于哪一位用户的哪一次咨询。

```text
conversationId = A
  帮我查库存
  请问什么商品？
  无线蓝牙耳机

conversationId = B
  某商品多少钱？
```

如果没有 `conversationId`，后端看到“无线蓝牙耳机”时，不知道应该接在哪一段对话后面。

### conversationId 不等于 userId

| 字段 | 表示什么 |
| --- | --- |
| `userId` | 是哪一个用户 |
| `conversationId` | 这个用户的哪一次会话 |

同一个用户可以创建多个会话：

```text
用户 1001
├── 会话 A：查询商品
└── 会话 B：咨询退款
```

生产环境中，后端还必须校验 `conversationId` 属于当前登录用户。不能因为用户传来了一个会话 ID，就允许他读取该会话。

### 学习版由谁生成 conversationId

本章可以先由浏览器生成 UUID：

```ts
crypto.randomUUID()
```

生产版更推荐后端创建会话并返回 ID，因为后端还要绑定登录用户、创建时间和状态。

---

## 五、先设计会话状态，不要急着调用模型

建议新建：

```text
server/src/agent/agent.conversation.ts
```

学习版状态可以设计成：

```ts
import type {
  CustomerEntities,
  CustomerIntentName,
} from './agent.intent';

export type ConversationStatus =
  | 'idle'
  | 'collecting_fields'
  | 'processing'
  | 'completed'
  | 'cancelled';

export type MissingField = keyof CustomerEntities;

export interface AgentConversationState {
  conversationId: string;
  status: ConversationStatus;
  pendingIntent: CustomerIntentName | null;
  entities: CustomerEntities;
  missingFields: MissingField[];
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}
```

### 每个字段的白话解释

| 字段 | 白话意思 |
| --- | --- |
| `conversationId` | 这是哪一段对话 |
| `status` | 这件客服任务做到哪一步 |
| `pendingIntent` | 当前还没办完的事情是什么 |
| `entities` | 用户已经提供了哪些关键资料 |
| `missingFields` | 现在还缺哪些资料 |
| `createdAt` | 会话什么时候创建 |
| `updatedAt` | 最近什么时候说过话 |
| `expiresAt` | 什么时候自动失效 |

### entities 的空对象

不要到处手写一份可能漏字段的空对象，创建一个函数：

```ts
export function createEmptyEntities(): CustomerEntities {
  return {
    productName: null,
    categoryName: null,
    orderNo: null,
    budgetMax: null,
    quantity: null,
    reason: null,
  };
}
```

使用函数而不是共享常量，是为了每个会话都拿到一个新的对象，避免修改 A 会话时意外影响 B 会话。

### 初始状态

```ts
export function createConversationState(
  conversationId: string,
  now = Date.now(),
): AgentConversationState {
  const ttlMs = 30 * 60 * 1000;

  return {
    conversationId,
    status: 'idle',
    pendingIntent: null,
    entities: createEmptyEntities(),
    missingFields: [],
    createdAt: now,
    updatedAt: now,
    expiresAt: now + ttlMs,
  };
}
```

这里的 TTL 是 30 分钟。它表示用户长时间不继续，临时任务就自动失效，避免第二天的一句话错误接到昨天的库存查询上。

---

## 六、状态如何变化

同一个会话会经历几个状态：

```text
idle
  ↓ 用户提出任务
collecting_fields
  ↓ 字段补齐
processing
  ↓ ProductService 成功
completed
```

用户中途说“取消”时：

```text
collecting_fields
  ↓ 用户取消
cancelled
```

下一次新任务开始时，`completed` 或 `cancelled` 都可以重新进入处理流程。

### 状态含义

- `idle`：当前没有待处理任务。
- `collecting_fields`：已经知道用户要做什么，但还缺资料。
- `processing`：资料齐了，正在调用真实业务 Service。
- `completed`：这一件事已经处理完。
- `cancelled`：用户明确取消了这一件事。

### 状态不是为了展示好看

代码可以根据状态限制动作：

```ts
if (state.status === 'collecting_fields') {
  // 优先判断当前消息是否在补字段
}

if (state.status === 'processing') {
  // 防止同一会话重复提交
}
```

这比在 Prompt 中写“请记住不要重复操作”更可靠。

---

## 七、哪些意图需要哪些字段

第三课让模型返回了 `missingFields`。但是业务规则应该由代码掌握，不能完全相信模型。

先写一张确定的规则表：

```ts
import type {
  CustomerEntities,
  CustomerIntentName,
} from './agent.intent';

type EntityField = keyof CustomerEntities;

const REQUIRED_FIELDS: Partial<
  Record<CustomerIntentName, EntityField[]>
> = {
  inventory_query: ['productName'],
  price_query: ['productName'],
  order_status: ['orderNo'],
  refund_request: ['orderNo', 'reason'],
  complaint: ['reason'],
};
```

本章第一遍只实际处理 `inventory_query` 和 `price_query`。后面的规则先看懂，不要急着开放真实退款。

### 重新计算 missingFields

```ts
export function calculateMissingFields(
  intent: CustomerIntentName,
  entities: CustomerEntities,
): EntityField[] {
  const required = REQUIRED_FIELDS[intent] ?? [];

  return required.filter((field) => {
    const value = entities[field];

    if (typeof value === 'string') {
      return value.trim().length === 0;
    }

    return value === null || value === undefined;
  });
}
```

### 为什么模型已经给 missingFields，代码还要再算一次

因为两者职责不同：

```text
模型的 missingFields：模型根据自然语言做出的判断
代码的 REQUIRED_FIELDS：你的业务系统规定的硬规则
```

例如模型偶尔忘记把 `productName` 放进 `missingFields`，代码依然能阻止无商品名的库存查询。

> 模型负责提取，代码负责裁决。

---

## 八、怎样合并两轮提取出的字段

第一轮：

```ts
const oldEntities = {
  productName: null,
  categoryName: null,
  orderNo: null,
  budgetMax: null,
  quantity: null,
  reason: null,
};
```

第二轮模型提取：

```ts
const newEntities = {
  productName: '无线蓝牙耳机',
  categoryName: null,
  orderNo: null,
  budgetMax: null,
  quantity: null,
  reason: null,
};
```

期望的合并结果是：

```ts
{
  productName: '无线蓝牙耳机',
  // 其他字段仍保持原值
}
```

### 错误写法

```ts
const merged = {
  ...oldEntities,
  ...newEntities,
};
```

这会让新一轮中的 `null` 覆盖旧一轮已经收集到的值。

例如第一轮已经有 `orderNo`，第二轮没有再次说订单号，模型返回 `orderNo: null`，简单展开就会把原订单号清空。

### 正确思路：只合并非空值

```ts
export function mergeEntities(
  previous: CustomerEntities,
  incoming: CustomerEntities,
): CustomerEntities {
  return {
    productName: incoming.productName ?? previous.productName,
    categoryName: incoming.categoryName ?? previous.categoryName,
    orderNo: incoming.orderNo ?? previous.orderNo,
    budgetMax: incoming.budgetMax ?? previous.budgetMax,
    quantity: incoming.quantity ?? previous.quantity,
    reason: incoming.reason ?? previous.reason,
  };
}
```

### 用户纠正信息怎么办

用户可能说：

```text
用户：查无线蓝牙耳机库存
用户：不对，我要查有线耳机
```

第二轮非空的 `productName` 应该覆盖第一轮，所以 `incoming.productName ?? previous.productName` 正好符合要求。

需要注意：空字符串应该先在 Zod 或合并前标准化成 `null`，否则 `''` 会被当成有效的新值。

---

## 九、怎样生成追问

学习版不需要让模型自由发挥追问，可以用代码生成稳定的问题。

```ts
const FIELD_QUESTIONS: Record<keyof CustomerEntities, string> = {
  productName: '请问你想查询什么商品？',
  categoryName: '请问你想查看哪个商品分类？',
  orderNo: '请提供订单号。',
  budgetMax: '请问你的最高预算是多少？',
  quantity: '请问你需要多少件？',
  reason: '请简单说明原因。',
};

export function buildMissingFieldQuestion(
  missingFields: (keyof CustomerEntities)[],
): string {
  const firstField = missingFields[0];
  return firstField
    ? FIELD_QUESTIONS[firstField]
    : '请补充完成该请求所需的信息。';
}
```

### 一次问一个，还是一次问全部

初学阶段建议一次只问一个：

```text
请提供订单号。
```

而不是：

```text
请提供订单号、退款原因、购买时间、支付方式和图片。
```

一次只问一个更容易理解状态变化，也更方便测试。生产环境可以根据体验再决定是否合并追问。

### 为什么追问也可以不用模型

固定业务问题使用模板有三个好处：

- 回答稳定。
- 不会编造要求。
- 不增加一次模型调用和延迟。

模型擅长理解用户，代码擅长执行固定规则。

---

## 十、用 Map 写第一个业务 ConversationStateService

这里的 `Map` 只保存确定性业务状态，不代替前面讲过的 Agent Checkpointer。请把两者分开：

```text
MemorySaver / Checkpointer
→ createAgent 的线程消息和 Agent State

下面的 Map
→ pendingIntent、entities、missingFields 等 NestJS 业务状态
```

建议新建：

```text
server/src/agent/agent.conversation.service.ts
```

学习版示例：

```ts
import { Injectable } from '@nestjs/common';
import {
  AgentConversationState,
  createConversationState,
} from './agent.conversation';

@Injectable()
export class AgentConversationService {
  private readonly conversations = new Map<
    string,
    AgentConversationState
  >();

  getOrCreate(conversationId: string): AgentConversationState {
    const existing = this.conversations.get(conversationId);
    const now = Date.now();

    if (existing && existing.expiresAt > now) {
      return structuredClone(existing);
    }

    if (existing) {
      this.conversations.delete(conversationId);
    }

    const created = createConversationState(conversationId, now);
    this.conversations.set(conversationId, created);
    return structuredClone(created);
  }

  save(state: AgentConversationState): AgentConversationState {
    const now = Date.now();
    const next = {
      ...state,
      entities: { ...state.entities },
      missingFields: [...state.missingFields],
      updatedAt: now,
      expiresAt: now + 30 * 60 * 1000,
    };

    this.conversations.set(next.conversationId, next);
    return structuredClone(next);
  }

  clear(conversationId: string): void {
    this.conversations.delete(conversationId);
  }
}
```

### 为什么返回副本

如果直接返回 Map 中的对象，外部代码可以在没有调用 `save()` 的情况下修改它。返回 `structuredClone()` 能让状态读写边界更清楚。

学习时如果 Node/TypeScript 环境对 `structuredClone` 类型有问题，也可以手动复制：

```ts
return {
  ...state,
  entities: { ...state.entities },
  missingFields: [...state.missingFields],
};
```

### Map 版有什么限制

`Map` 只适合本地学习：

1. NestJS 重启后全部丢失。
2. 如果线上运行两个 Node 进程，每个进程的 Map 不一样。
3. 无法跨服务器共享。
4. 大量过期会话如果不访问，可能继续占内存。
5. 并发写入同一个会话可能相互覆盖。

所以 Map 是为了先看懂业务状态仓库，不是最终线上方案。它也不是 LangChain `MemorySaver` 的替代品。

---

## 十一、修改 DTO：让每次请求知道属于哪个会话

当前 DTO 只有 `message`。学习版可以增加 `conversationId`：

```ts
import {
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class AgentChatDto {
  @IsUUID('4', { message: 'conversationId 必须是 UUID' })
  conversationId: string;

  @IsString({ message: 'message 必须是字符串' })
  @IsNotEmpty({ message: 'message 不能为空' })
  @MaxLength(8000, { message: 'message 不能超过 8000 个字符' })
  message: string;
}
```

请求变成：

```json
{
  "conversationId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "帮我查库存"
}
```

### 是否必须限制 UUID v4

学习版可以限制 v4，因为浏览器 `crypto.randomUUID()` 生成的是 UUID v4。

如果以后后端使用其他格式的 UUID，就改为：

```ts
@IsUUID(undefined, { message: 'conversationId 必须是 UUID' })
```

### 响应也返回 conversationId 和状态

学习阶段建议响应多返回几个非敏感调试字段：

```ts
export interface AgentChatResponseDto {
  conversationId: string;
  reply: string;
  model: string;
  status?: ConversationStatus;
  missingFields?: (keyof CustomerEntities)[];
}
```

线上是否向用户暴露 `missingFields` 可以再决定。学习时保留它能明显提高排错效率。

---

## 十二、修改前端：同一段对话复用同一个 ID

在 `AgentChat.tsx` 中创建会话 ID：

```ts
const [conversationId, setConversationId] = useState(
  () => crypto.randomUUID(),
);
```

发送请求时：

```ts
body: JSON.stringify({
  conversationId,
  message,
}),
```

点击“清空对话”时，不只是清空页面气泡，还应该创建一个新会话：

```ts
const clearConversation = () => {
  requestRef.current?.abort();
  requestRef.current = null;
  setConversationId(crypto.randomUUID());
  setMessages(createInitialMessages());
  setDraft('');
  setError('');
  setLoading(false);
  inputRef.current?.focus();
};
```

### 为什么清空时要换 ID

如果只清空 React 数组但继续使用旧 ID：

```text
页面：看起来已经是新聊天
后端：仍然保留旧 pendingIntent
```

用户下一句可能错误地继续旧任务。

### 刷新页面要不要保留 ID

第一遍可以不保留。刷新就创建新会话，逻辑最简单。

第二遍可以使用 `sessionStorage`：

```ts
function getOrCreateConversationId(): string {
  const stored = sessionStorage.getItem('agentConversationId');
  if (stored) {
    return stored;
  }

  const created = crypto.randomUUID();
  sessionStorage.setItem('agentConversationId', created);
  return created;
}
```

不要把“浏览器保存了 ID”误认为“后端保存了消息”。它只是在刷新后还能指向同一个后端会话。

---

## 十三、多轮请求的核心处理顺序

这是本章最重要的一段。先理解顺序，再写代码。

```text
1. 校验 conversationId 和 message
2. 读取该 conversationId 的旧状态
3. 检查用户是否取消
4. 用 Structured Output 提取当前消息
5. 判断是在补旧任务，还是开始新任务
6. 合并非空 entities
7. 用代码重新计算 missingFields
8. 有缺失字段：保存 collecting_fields，返回追问
9. 字段齐全：标记 processing，调用 ProductService
10. 成功后标记 completed，清理 pendingIntent
11. 返回真实业务结果
```

不要把顺序改成：

```text
先调用 ProductService
→ 后来才发现 productName 为空
```

业务 Service 只能在字段通过检查以后调用。

---

## 十四、第二句话到底是在补字段，还是新话题

这是多轮系统最容易出错的地方。

假设状态是：

```ts
{
  pendingIntent: 'inventory_query',
  missingFields: ['productName']
}
```

用户下一句可能是：

```text
无线蓝牙耳机
```

也可能是：

```text
算了，我要找人工客服
```

不能把所有下一句话都强行塞进 `productName`。

### 推荐的学习版判断顺序

1. 明确取消语句优先取消。
2. `human_handoff` 等强意图优先切换。
3. 新消息提供了当前缺失字段，就继续旧任务。
4. 新消息明确表达另一个完整意图，就切换任务。
5. 仍无法判断时，继续追问或请求用户确认。

### 判断“是否补到了当前缺失字段”

```ts
function fillsCurrentMissingField(
  state: AgentConversationState,
  incoming: CustomerEntities,
): boolean {
  return state.missingFields.some((field) => {
    const value = incoming[field];
    return value !== null && value !== undefined && value !== '';
  });
}
```

例如模型把“无线蓝牙耳机”识别为 `product_search` 也没关系。只要它成功提取出 `productName`，而当前正缺 `productName`，代码就可以保留旧的 `inventory_query`。

### 强制切换意图示例

```ts
const INTERRUPTING_INTENTS: CustomerIntentName[] = [
  'human_handoff',
  'complaint',
  'refund_request',
];
```

这只是第一版规则。以后可以让一个专门的 Structured Output 判断：

```ts
action: z.enum([
  'continue_current',
  'start_new',
  'cancel_current',
  'unclear',
])
```

但第一次实现不需要同时引入第二套复杂 Schema。

---

## 十五、取消任务

用户可能说：

```text
算了
不用查了
取消
先不看了
```

学习版可以先用一个非常小的显式规则：

```ts
const CANCEL_MESSAGES = new Set([
  '算了',
  '取消',
  '不用了',
  '不用查了',
  '先不看了',
]);

function isCancelMessage(message: string): boolean {
  return CANCEL_MESSAGES.has(message.trim());
}
```

取消时：

```ts
state.status = 'cancelled';
state.pendingIntent = null;
state.entities = createEmptyEntities();
state.missingFields = [];
conversationService.save(state);
```

回答：

```text
好的，已经取消当前查询。你还可以继续问其他问题。
```

### 为什么先用显式规则

“取消”是会改变业务状态的指令。学习版先用可测试的规则，避免模型把“这个商品不是我想要的，别取消订单”错误识别为取消。

以后支持更丰富表达时，可以让模型提取动作，但代码仍要结合当前状态和权限确认。

---

## 十六、一个可读的编排 Service 结构

不要把所有逻辑继续塞进 `AgentService.chat()`。建议增加一个专门编排客服流程的 Service，例如：

```text
agent.customer-chat.service.ts
```

职责关系：

```text
AgentController
  ↓
AgentCustomerChatService（控制多轮流程）
  ├── AgentConversationService（读写状态）
  ├── AgentIntentService（理解当前消息）
  ├── ProductService（查真实商品）
  └── AgentService（普通闲聊和其他 Tool）
```

### 为什么需要编排层

- `AgentIntentService` 只负责提取，不应保存会话。
- `ProductService` 只负责商品数据，不应理解聊天状态。
- `AgentConversationService` 只负责状态，不应调用模型。
- 编排 Service 把它们按照业务顺序连接起来。

### 方法骨架

下面是帮助理解流程的示例，不建议一次性全部复制：

```ts
@Injectable()
export class AgentCustomerChatService {
  constructor(
    private readonly conversations: AgentConversationService,
    private readonly intentService: AgentIntentService,
    private readonly productService: ProductService,
    private readonly fallbackAgent: AgentService,
  ) {}

  async chat(dto: AgentChatDto): Promise<AgentChatResponseDto> {
    let state = this.conversations.getOrCreate(dto.conversationId);

    if (isCancelMessage(dto.message) && state.pendingIntent) {
      return this.cancelCurrentTask(state);
    }

    const current = await this.intentService.analyze(dto.message);
    const intent = this.resolveIntent(state, current);
    const entities = mergeEntities(state.entities, current.entities);
    const missingFields = calculateMissingFields(intent, entities);

    state = {
      ...state,
      pendingIntent: intent,
      entities,
      missingFields,
    };

    if (missingFields.length > 0) {
      state.status = 'collecting_fields';
      this.conversations.save(state);

      return {
        conversationId: dto.conversationId,
        reply: buildMissingFieldQuestion(missingFields),
        model: 'rule',
        status: state.status,
        missingFields,
      };
    }

    state.status = 'processing';
    this.conversations.save(state);

    return this.executeIntent(state, dto.message);
  }
}
```

这里最关键的不是类名，而是每一步都有单独职责，可以单独测试。

---

## 十七、resolveIntent 的第一版规则

`resolveIntent()` 决定当前应该继续旧任务还是使用新意图。

```ts
private resolveIntent(
  state: AgentConversationState,
  current: CustomerIntent,
): CustomerIntentName {
  if (!state.pendingIntent || state.status !== 'collecting_fields') {
    return current.intent;
  }

  if (current.intent === 'human_handoff') {
    return current.intent;
  }

  if (fillsCurrentMissingField(state, current.entities)) {
    return state.pendingIntent;
  }

  if (
    current.intent !== 'unknown' &&
    current.intent !== 'general_chat' &&
    current.intent !== state.pendingIntent
  ) {
    return current.intent;
  }

  return state.pendingIntent;
}
```

### 用例 1：继续旧任务

旧状态：

```ts
pendingIntent = 'inventory_query';
missingFields = ['productName'];
```

当前提取：

```ts
current.intent = 'product_search';
current.entities.productName = '无线蓝牙耳机';
```

因为补到了当前缺失的 `productName`，最终意图仍然是：

```ts
inventory_query
```

### 用例 2：切换到人工

```text
用户：算了，找人工
```

`human_handoff` 优先，不继续询问商品名。

### 用例 3：不清楚

```text
用户：我不知道
```

没有补到商品名，也没有明确新意图，继续保留 `inventory_query`，可以回答：

```text
没关系，你可以提供商品名称或商品页面中的标题。
```

### 这套规则不是万能的

自然语言里总有模糊情况。正确做法不是幻想一条规则覆盖全部表达，而是：

1. 先覆盖最常见路径。
2. 为误判样本写测试。
3. 再逐步扩展动作分类或确认步骤。

---

## 十八、字段齐全后调用 ProductService

以库存意图为例：

```ts
private async executeInventory(
  state: AgentConversationState,
): Promise<AgentChatResponseDto> {
  const productName = state.entities.productName;

  if (!productName) {
    throw new Error('进入库存查询前 productName 必须已经补齐');
  }

  const result = await this.productService.findAll({
    keyword: productName,
    page: 1,
    pageSize: 5,
  });

  if (result.list.length === 0) {
    return this.complete(state, `没有找到“${productName}”相关商品。`);
  }

  if (result.list.length > 1) {
    // 第一版可以列出候选商品让用户重新选择。
    // 不要擅自把第一条当成用户想要的商品。
  }

  const product = result.list[0];
  return this.complete(
    state,
    `${product.name} 当前库存 ${product.stock} 件。`,
  );
}
```

### 查到多个商品怎么办

例如“耳机”匹配五个商品。不能直接返回第一条的库存，因为第一条未必是用户想问的。

更合理的状态可以增加候选项：

```ts
candidateProductIds: number[];
```

然后回答：

```text
找到了多个商品：
1. 无线蓝牙耳机
2. 运动蓝牙耳机
请回复商品名称或序号。
```

这是本章第二遍的扩展。第一遍测试时可以选择一个能唯一匹配的完整商品名。

### 完成后清理什么

```ts
private complete(
  state: AgentConversationState,
  reply: string,
): AgentChatResponseDto {
  state.status = 'completed';
  state.pendingIntent = null;
  state.missingFields = [];

  // 第一版处理完任务后清空实体，避免污染下一件事。
  state.entities = createEmptyEntities();

  this.conversations.save(state);

  return {
    conversationId: state.conversationId,
    reply,
    model: 'business-rule',
    status: state.status,
    missingFields: [],
  };
}
```

如果以后要支持“它多少钱”这种完成后的追问，可以保留一个独立的 `lastReferencedProductId`。不要为了代词引用而继续把已完成任务标记成 pending。

---

## 十九、普通聊天如何处理

如果当前没有待处理任务，并且意图是：

```ts
general_chat
```

可以继续交给现有 `AgentService`：

```ts
if (
  !state.pendingIntent &&
  ['general_chat', 'unknown'].includes(current.intent)
) {
  const response = await this.fallbackAgent.chat(dto.message);

  return {
    ...response,
    conversationId: dto.conversationId,
    status: 'completed',
  };
}
```

但是现有 `AgentService.chat()` 仍是单轮的，所以它只能根据当前一句回答。商品业务的多轮补参由新的编排层负责。

以后学习“模型消息历史”时，可以给 fallback Agent 传最近几条对话；不要在本章第一遍同时修改。

---

## 二十、Controller 和 Module 怎样连接

Controller 从直接调用 `AgentService` 改成调用编排 Service：

```ts
@Controller('api/agent')
export class AgentController {
  constructor(
    private readonly customerChatService: AgentCustomerChatService,
    private readonly agentIntentService: AgentIntentService,
  ) {}

  @Post('chat')
  chat(@Body() dto: AgentChatDto): Promise<AgentChatResponseDto> {
    return this.customerChatService.chat(dto);
  }
}
```

Module 注册：

```ts
@Module({
  imports: [ProductModule, CategoryModule],
  controllers: [AgentController],
  providers: [
    AgentService,
    AgentIntentService,
    AgentConversationService,
    AgentCustomerChatService,
  ],
  exports: [AgentService, AgentIntentService],
})
export class AgentModule {}
```

不要同时保留两个 `@Post('chat')`。同一路径只能有一个明确入口。

---

## 二十一、完整示例走一遍

### 第一轮请求

```json
{
  "conversationId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "帮我查库存"
}
```

### 第一步：读取状态

第一次访问，创建：

```ts
{
  status: 'idle',
  pendingIntent: null,
  entities: {
    productName: null,
    categoryName: null,
    orderNo: null,
    budgetMax: null,
    quantity: null,
    reason: null,
  },
  missingFields: []
}
```

### 第二步：Structured Output

```ts
{
  intent: 'inventory_query',
  entities: {
    productName: null,
    // 其他字段为 null
  }
}
```

### 第三步：代码计算缺失字段

```ts
calculateMissingFields('inventory_query', entities);
// ['productName']
```

### 第四步：保存状态

```ts
{
  status: 'collecting_fields',
  pendingIntent: 'inventory_query',
  missingFields: ['productName']
}
```

### 第五步：响应

```json
{
  "conversationId": "550e8400-e29b-41d4-a716-446655440000",
  "reply": "请问你想查询什么商品？",
  "model": "rule",
  "status": "collecting_fields",
  "missingFields": ["productName"]
}
```

### 第二轮请求

必须使用相同的 `conversationId`：

```json
{
  "conversationId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "无线蓝牙耳机"
}
```

### 第六步：读取旧状态

```ts
pendingIntent = 'inventory_query';
missingFields = ['productName'];
```

### 第七步：提取并合并

```ts
incoming.productName = '无线蓝牙耳机';

merged.productName = '无线蓝牙耳机';
```

即使模型把当前孤立短语识别成 `product_search`，代码发现它补到了旧任务缺少的 `productName`，因此继续 `inventory_query`。

### 第八步：重新计算缺失字段

```ts
calculateMissingFields('inventory_query', merged);
// []
```

### 第九步：查询真实数据

```ts
await productService.findAll({
  keyword: '无线蓝牙耳机',
  page: 1,
  pageSize: 5,
});
```

### 第十步：完成

```json
{
  "reply": "无线蓝牙耳机当前库存 35 件。",
  "status": "completed",
  "missingFields": []
}
```

这十步就是本章的完整主线。

---

## 二十二、先写纯函数测试

不要第一条测试就调用真实模型。先测试不依赖网络的规则。

建议新建：

```text
agent.conversation.spec.ts
```

### 测试缺失字段

```ts
describe('calculateMissingFields', () => {
  it('库存查询缺商品名时返回 productName', () => {
    const entities = createEmptyEntities();

    expect(
      calculateMissingFields('inventory_query', entities),
    ).toEqual(['productName']);
  });

  it('库存查询有商品名时不缺字段', () => {
    const entities = {
      ...createEmptyEntities(),
      productName: '无线蓝牙耳机',
    };

    expect(
      calculateMissingFields('inventory_query', entities),
    ).toEqual([]);
  });
});
```

### 测试合并不会被 null 覆盖

```ts
it('新一轮的 null 不覆盖旧值', () => {
  const previous = {
    ...createEmptyEntities(),
    orderNo: 'ORDER-001',
  };

  const incoming = {
    ...createEmptyEntities(),
    reason: '商品损坏',
  };

  expect(mergeEntities(previous, incoming)).toMatchObject({
    orderNo: 'ORDER-001',
    reason: '商品损坏',
  });
});
```

### 测试新非空值可以纠正旧值

```ts
it('用户纠正商品名时使用新值', () => {
  const previous = {
    ...createEmptyEntities(),
    productName: '无线耳机',
  };

  const incoming = {
    ...createEmptyEntities(),
    productName: '有线耳机',
  };

  expect(mergeEntities(previous, incoming).productName)
    .toBe('有线耳机');
});
```

这些测试完全不需要 API Key。

---

## 二十三、再写 ConversationStateService 测试

### 同一个 ID 能读到同一状态

```ts
it('保存后可以通过同一个 conversationId 读取', () => {
  const service = new AgentConversationService();
  const state = service.getOrCreate('conversation-a');

  state.pendingIntent = 'inventory_query';
  state.status = 'collecting_fields';
  service.save(state);

  expect(service.getOrCreate('conversation-a')).toMatchObject({
    pendingIntent: 'inventory_query',
    status: 'collecting_fields',
  });
});
```

如果 DTO 强制 UUID，Service 单元测试仍然可以用普通字符串，因为 Service 的职责不是验证 HTTP 格式。也可以统一使用固定合法 UUID。

### 不同会话互不影响

```ts
it('两个会话不会串状态', () => {
  const service = new AgentConversationService();
  const stateA = service.getOrCreate('conversation-a');

  stateA.pendingIntent = 'inventory_query';
  service.save(stateA);

  const stateB = service.getOrCreate('conversation-b');

  expect(stateB.pendingIntent).toBeNull();
});
```

### 过期状态不会继续使用

为便于测试，最好把“当前时间”或 TTL 作为参数，而不是在所有方法中写死 `Date.now()`。

```ts
it('过期后创建新状态', () => {
  // 使用可控时钟进行测试，避免真实等待 30 分钟。
});
```

测试中不要使用 `setTimeout(30分钟)`。

---

## 二十四、编排 Service 必测场景

至少准备下面这些用例：

| 场景 | 第一句 | 第二句 | 期望 |
| --- | --- | --- | --- |
| 补商品名 | 帮我查库存 | 无线蓝牙耳机 | 查询库存 |
| 查询价格 | 这个多少钱 | 无线蓝牙耳机 | 查询价格 |
| 中途取消 | 帮我查库存 | 算了 | 清空待处理任务 |
| 切换人工 | 帮我查库存 | 我要找人工 | 不再追问商品名 |
| 纠正商品 | 查 A 库存 | 不对，是 B | 查询 B |
| 商品不存在 | 查库存 | 完全不存在的名称 | 明确说未找到 |
| 多个候选 | 查耳机库存 | — | 追问具体商品 |
| 会话隔离 | A 等商品名 | B 发商品名 | B 不能补到 A |
| 状态过期 | 查库存 | 31 分钟后发商品名 | 不继续旧任务 |
| Service 异常 | 查具体商品库存 | — | 返回受控错误，不伪造库存 |

### Mock 原则

编排测试中：

- Mock `AgentIntentService.analyze()`。
- Mock `ProductService.findAll()`。
- 不调用真实模型。
- 不连接真实数据库。

这样测试才快、稳定，并且能精确模拟每一个分支。

---

## 二十五、用 curl 手动验证多轮

先固定一个 UUID，两次请求都复用：

```bash
curl -X POST http://127.0.0.1:3000/api/agent/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "conversationId":"550e8400-e29b-41d4-a716-446655440000",
    "message":"帮我查库存"
  }'
```

第二次：

```bash
curl -X POST http://127.0.0.1:3000/api/agent/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "conversationId":"550e8400-e29b-41d4-a716-446655440000",
    "message":"无线蓝牙耳机"
  }'
```

然后换一个 UUID，只发“无线蓝牙耳机”。如果它也错误继承了第一个会话的库存任务，就说明状态隔离有问题。

### 浏览器 Network 面板检查

每次请求都检查：

- `conversationId` 是否存在。
- 同一聊天中 ID 是否保持不变。
- 点击清空后 ID 是否改变。
- 响应 `status` 是否从 `collecting_fields` 变成 `completed`。
- 第二次请求是否真的调用了 ProductService。

---

## 二十六、并发请求问题

前端已经用 `loading` 禁止连续发送，但后端不能完全相信前端。用户可以用 curl、脚本或两个浏览器标签同时请求。

假设两个请求同时读取旧状态：

```text
请求 A 读到 version 1
请求 B 也读到 version 1
请求 A 保存 version 2
请求 B 保存自己的 version 2，覆盖 A
```

这叫“丢失更新”。

### 学习版最低处理

可以给同一个 `conversationId` 设置处理中标记，并对重复请求返回 409：

```ts
private readonly inFlight = new Set<string>();
```

流程：

```text
请求开始 → ID 放入 inFlight
同 ID 再来 → 返回“当前会话正在处理”
finally → 从 inFlight 删除
```

一定在 `finally` 中释放，否则异常后会话会永久锁住。

### Redis 生产版

生产环境可以考虑：

- Redis 分布式锁。
- Redis Lua 脚本原子更新。
- `WATCH` / `MULTI` 乐观锁。
- 状态增加 `version`，保存时比较版本。

这些属于第二遍优化。第一遍先确保页面单请求路径正确。

---

## 二十七、把业务状态从 Map 换成 Redis

你的项目已经安装了 `redis` 包，并在其他模块使用 `REDIS_URL`。因此理解 Map 版后，可以把 `pendingIntent` 等业务状态放入 Redis。

这一节迁移的是：

```text
AgentConversationService 内部的 Map
→ Redis
```

不是把 Agent Checkpointer 删除。生产版 Agent 线程仍应使用数据库支持的 Checkpointer；两者可以共用同一个 `conversationId/thread_id` 作为关联标识，但 Redis Key 必须加业务前缀。

### Redis Key 设计

```text
agent:conversation:<conversationId>
```

例如：

```text
agent:conversation:550e8400-e29b-41d4-a716-446655440000
```

不要只使用：

```text
550e8400-e29b-41d4-a716-446655440000
```

加前缀可以避免和其他业务 Key 冲突。

### 保存 JSON 并设置 TTL

```ts
await redis.set(key, JSON.stringify(state), {
  EX: 30 * 60,
});
```

`EX` 的单位是秒，这里是 30 分钟。

### 读取

```ts
const raw = await redis.get(key);

if (!raw) {
  return createConversationState(conversationId);
}

const state = AgentConversationStateSchema.parse(JSON.parse(raw));
```

### 为什么从 Redis 读出来还要 Zod parse

Redis 里的 JSON 可能来自旧版本代码，也可能字段缺失或格式损坏。TypeScript 类型只在编译期存在，运行时必须重新校验。

建议为状态再写一个 Zod Schema：

```ts
const AgentConversationStateSchema = z.object({
  conversationId: z.string().uuid(),
  status: z.enum([
    'idle',
    'collecting_fields',
    'processing',
    'completed',
    'cancelled',
  ]),
  pendingIntent: CustomerIntentNameSchema.nullable(),
  entities: CustomerEntitiesSchema,
  missingFields: z.array(MissingFieldSchema),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  expiresAt: z.number().int(),
});
```

### Redis 连接失败怎么办

生产环境有两种策略：

1. 严格模式：Redis 失败就返回服务暂不可用，避免状态错乱。
2. 降级模式：临时退回单轮客服，但明确不继续旧任务。

不要静默退回某一个 Node 进程的 Map。线上多实例时，这会造成随机串状态或丢状态，问题很难排查。

---

## 二十八、Redis、数据库和模型历史各自放什么

推荐的职责划分：

| 数据 | 推荐位置 | 原因 |
| --- | --- | --- |
| Agent 当前线程消息 State | 数据库 Checkpointer | createAgent 按 thread_id 恢复 |
| 当前待处理意图 | Redis | 短期、访问频繁、需要 TTL |
| 当前已收集字段 | Redis | 下一轮立即使用 |
| 当前缺失字段 | Redis | 决定下一句追问 |
| 完整聊天记录 | MySQL | 长期查询、审计和客服查看 |
| 最近几条模型上下文 | MySQL 读取后裁剪，或短期缓存 | 帮助模型理解语言 |
| React 气泡列表 | 浏览器 + 后端历史接口 | 页面展示 |

### 不要把 Redis 当永久聊天数据库

Redis Key 过期后数据会消失，适合临时状态。真正需要长期保留的消息、人工客服记录和审计信息应存 MySQL。

### 不要把完整消息都塞进一个 Redis JSON

会话越聊越长时，每次读写整个巨大 JSON 成本会越来越高。学习版只保存结构化短状态，消息历史在后续章节单独设计。

---

## 二十九、什么时候加入模型消息历史

短期业务状态已经能解决：

```text
查库存 → 补商品名
```

但下面的问题还需要自然语言上下文：

```text
用户：无线蓝牙耳机库存 35 件
用户：它多少钱？
```

“它”指哪个商品，属于引用上下文。

可以在后续增加：

```ts
lastReferencedProductId: number | null;
lastReferencedProductName: string | null;
```

对于业务对象引用，结构化保存 ID 通常比让模型重新猜全部历史更可靠。

普通聊天则可以传最近若干条消息：

```ts
messages: [
  ...recentMessages,
  { role: 'user', content: currentMessage },
]
```

必须限制：

- 最多消息数。
- 最大 Token 预算。
- 敏感信息处理。
- 会话所属用户校验。

不能无限传全部历史。

---

## 三十、安全边界

### conversationId 不是授权凭证

生产环境必须做：

```text
从登录 Token 得到 userId
→ 查询 conversationId
→ 确认 conversation.userId === 当前 userId
→ 才允许读写
```

绝不能：

```text
前端传 userId=1001
→ 后端直接相信
```

### 敏感数据不要全部放模型上下文

订单查询时，不要把身份证、完整手机号、支付信息和地址全部发送给模型。只给生成回答所需的最少字段，并对展示内容脱敏。

### 写操作必须二次确认

本章可以识别 `refund_request`，但不要直接执行退款。

未来流程应是：

```text
收集资料
→ 校验订单属于当前用户
→ 展示退款摘要
→ 用户明确确认
→ 权限/人工审批
→ 执行一次
→ 保存审计记录
```

此时才开始明显适合 LangGraph。

### 日志不要记录什么

- API Key。
- 登录 Token。
- 完整身份证号、手机号和地址。
- 支付凭证。
- 未脱敏的完整模型输入输出。

可以记录：

```text
conversationId
intent
statusBefore
statusAfter
missingFieldNames
durationMs
success/failure
```

---

## 三十一、异常处理

### 模型提取失败

不要清空旧状态。可以保留待处理任务并回答：

```text
我暂时没能理解这条消息，请重新描述，或输入“取消”结束当前查询。
```

### ProductService 查询失败

不要编造库存，也不要直接标记 `completed`。可以把状态恢复为可重试状态：

```ts
state.status = 'collecting_fields';
```

更准确的做法是以后增加：

```ts
'failed'
```

并记录可重试错误。

### 商品不存在

商品不存在不是系统异常。应该正常回答：

```text
没有找到“XX”相关的上架商品。请检查商品名称，或换一个关键词。
```

可以继续保留 `inventory_query` 并重新把 `productName` 设为 null，让用户补另一个名称。

### 请求超时

超时后要明确状态是否已经写入。尤其是未来写操作中，不能因为前端超时就简单重试，可能导致重复执行。

---

## 三十二、什么时候需要 LangGraph

### 本章为什么还不需要自定义 LangGraph

当前流程是：

```text
识别意图
→ 缺字段就追问
→ 字段齐了就查一次 ProductService
→ 完成
```

分支少、步骤短、没有审批，用 `createAgent + Checkpointer` 处理 Agent 线程记忆，再用普通 NestJS Service + Map/Redis 处理确定性业务状态，更容易学习、调试和测试。

虽然 `createAgent()` 和 Checkpointer 已经使用 LangGraph 的预构建运行机制，但这不等于你现在必须自己定义 `StateGraph`、节点和边。

### 出现这些需求时，我会明确告诉你开始学 LangGraph

- 退款流程跨多次请求暂停和恢复。
- 执行前必须等待用户确认。
- 高金额退款必须等待人工审批。
- 某一步失败后要从失败节点恢复，而不是从头开始。
- 同一流程包含多个明确分支和循环。
- 任务持续很久，需要保存每一个节点的状态。
- 多个 Agent 分工，并需要控制它们的交接顺序。

例如：

```text
识别退款意图
→ 收集订单号
→ 校验订单
→ 收集退款原因
→ 生成退款摘要
→ 暂停等待用户确认
→ 金额判断
   ├── 小额：自动审批
   └── 大额：暂停等待人工审批
→ 执行退款
→ 失败重试或人工处理
→ 通知用户
```

这种流程有暂停、恢复、审批、分支和重试，LangGraph 的价值就很明显。

> 简单补字段先用明确的业务代码；流程开始像一张真正的业务流程图时，再使用 LangGraph。

---

## 三十三、常见错误

### 错误 1：只在 React 保存 messages

结果：页面看起来连续，后端每次仍是单轮。

### 错误 2：每次发送都生成新 conversationId

结果：后端永远读不到上一轮状态。

正确做法：同一聊天复用，点击“新对话”时才更换。

### 错误 3：不同用户共用一个固定 ID

结果：严重串话和数据泄露。

### 错误 4：用新 entities 整体覆盖旧 entities

结果：新一轮的 `null` 清掉之前已经收集的字段。

### 错误 5：完全相信模型的 missingFields

结果：模型偶尔漏判时，代码可能用空参数调用业务 Service。

### 错误 6：商品查到多条时直接取第一条

结果：可能回答错误商品的价格或库存。

### 错误 7：完成任务后仍保留 pendingIntent

结果：下一条新问题被错误当作旧任务补充。

### 错误 8：线上多实例仍使用 Map

结果：请求落到不同进程时，会话时有时无。

### 错误 9：把 conversationId 当权限

结果：猜到或拿到别人的 ID 就能访问别人的会话。

### 错误 10：为了“智能”把所有判断交给模型

结果：业务行为不可控、难测试、难审计。

---

## 三十四、推荐的五天学习顺序

### 第一天：只理解状态

- [ ] 解释三种“记忆”的区别。
- [ ] 写出 `AgentConversationState`。
- [ ] 写 `createEmptyEntities()`。
- [ ] 写 `REQUIRED_FIELDS`。
- [ ] 写并测试 `calculateMissingFields()`。
- [ ] 暂时不改 Controller。

验收问题：

```text
为什么模型返回 missingFields 后，代码还要重新计算？
```

### 第二天：完成 Checkpointer 和 Map 业务状态仓库

- [ ] 把 `@langchain/langgraph` 声明为直接依赖。
- [ ] 给 `createAgent` 增加一个长期复用的 `MemorySaver`。
- [ ] 使用相同 `thread_id` 验证 Agent 线程记忆。
- [ ] 使用不同 `thread_id` 验证线程隔离。
- [ ] 创建 `AgentConversationService`。
- [ ] 实现 `getOrCreate()`、`save()`、`clear()`。
- [ ] 测试两个会话互不影响。
- [ ] 测试过期状态。
- [ ] 理解 Map 不能直接用于多实例线上部署。

验收问题：

```text
MemorySaver 和业务 Map 分别保存什么？为什么 NestJS 重启后两者都会消失？
```

### 第三天：打通 conversationId

- [ ] DTO 增加 `conversationId`。
- [ ] 前端同一聊天复用 UUID。
- [ ] 清空聊天时更换 UUID。
- [ ] Network 面板确认两次请求 ID 相同。
- [ ] 用两个不同 UUID 验证隔离。

验收问题：

```text
为什么 conversationId 不能代替 userId 和登录鉴权？
```

### 第四天：只打通库存补参

- [ ] 创建编排 Service。
- [ ] 第一轮识别 `inventory_query`。
- [ ] 缺 `productName` 时保存状态并追问。
- [ ] 第二轮合并 `productName`。
- [ ] 调用 ProductService。
- [ ] 完成后清理 `pendingIntent`。
- [ ] 测试取消当前任务。

验收问题：

```text
第二句“无线蓝牙耳机”为什么仍然执行 inventory_query？
```

### 第五天：补边界和 Redis 认知

- [ ] 增加 `price_query`。
- [ ] 处理商品不存在。
- [ ] 处理多个候选商品。
- [ ] 测试切换人工意图。
- [ ] 理解 TTL 和并发覆盖。
- [ ] 阅读项目已有 Redis 使用方式。
- [ ] 画出 Map 换 Redis 后哪些接口保持不变。

验收问题：

```text
Redis 为什么适合当前临时状态，而 MySQL 更适合长期聊天记录？
```

---

## 三十五、第一遍最小文件清单

建议最终增加或修改：

```text
server/src/agent/
├── agent.conversation.ts
├── agent.conversation.service.ts
├── agent.conversation.spec.ts
├── agent.customer-chat.service.ts
├── agent.customer-chat.service.spec.ts
├── agent.dto.ts                    # 增加 conversationId
├── agent.controller.ts             # 调用编排 Service
└── agent.module.ts                 # 注册新 Service

server/package.json                 # 直接声明 @langchain/langgraph

server/src/agent/agent.service.ts   # checkpointer + thread_id

src/
└── AgentChat.tsx                   # 创建并发送 conversationId
```

第一次不要同时创建数据库 Entity、Redis Repository、LangGraph Graph 和十种意图。先让库存两轮对话成功。

---

## 三十六、最终验收清单

### 概念

- [ ] 能解释页面消息、模型上下文、业务状态的区别。
- [ ] 能解释 `conversationId` 与 `userId` 的区别。
- [ ] 能解释 `pendingIntent` 和 `missingFields`。
- [ ] 能解释为什么完成后要清理 pending 状态。

### 状态

- [ ] 同一会话可以保存并恢复待处理任务。
- [ ] 不同会话不会串数据。
- [ ] 新一轮的 null 不会覆盖旧实体。
- [ ] 用户纠正实体时，新非空值可以覆盖旧值。
- [ ] 过期状态不会继续旧任务。

### 请求

- [ ] DTO 会验证 `conversationId`。
- [ ] 同一聊天的请求复用同一个 ID。
- [ ] 点击清空对话会创建新 ID。
- [ ] 响应能显示当前 status 和 missingFields。

### 业务

- [ ] “帮我查库存”会追问商品名。
- [ ] 下一句商品名能补到原库存意图。
- [ ] 字段补齐前不会调用 ProductService。
- [ ] 数据库无商品时不会编造。
- [ ] 多个候选商品不会擅自选第一条。
- [ ] “取消”会清理当前任务。
- [ ] “找人工”不会继续追问商品名。

### 测试和线上边界

- [ ] 纯规则测试不调用真实模型。
- [ ] 编排测试 Mock 模型和 ProductService。
- [ ] 知道 Map 重启会丢失且不支持多实例。
- [ ] 知道 MemorySaver 也只适合本地学习和测试。
- [ ] createAgent 已配置 Checkpointer。
- [ ] 同一会话映射到稳定的 `thread_id`。
- [ ] 能解释 Checkpointer 与业务 Redis 状态的区别。
- [ ] 知道 Redis 状态必须设置 TTL。
- [ ] 知道 conversationId 不能作为授权凭证。
- [ ] 知道何时才需要 LangGraph。

---

## 三十七、本章一句话总结

第四章处理的是：

```text
用户一次把问题说完整
→ 识别意图
→ 查询业务
```

第五章处理的是：

```text
用户没有一次说完整
→ 后端保存“正在办什么、已经知道什么、还缺什么”
→ 下一轮继续补资料
→ 资料齐全后再查询业务
```

请牢记本章最核心的对象：

```ts
{
  conversationId,
  status,
  pendingIntent,
  entities,
  missingFields,
}
```

以及最核心的原则：

> 不要只让模型“记得聊天”，要让后端明确知道当前客服业务处理到了哪一步。

本章完成以后，你已经拥有智能客服的第一种真正多轮能力。下一阶段请继续阅读：[第 6 课：生产级会话持久化与上下文工程](./LESSON_06_PERSISTENT_CONVERSATIONS_AND_CONTEXT_ENGINEERING.md)。你会把消息安全地保存到数据库，刷新页面后恢复历史，并通过 Checkpointer、裁剪和摘要只把必要上下文交给模型。
