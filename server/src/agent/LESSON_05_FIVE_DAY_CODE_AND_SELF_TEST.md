# 第 5 章五天代码实验：每天加什么代码、怎样测试

> 这份文档不是第五章的知识大全，而是一份动手实验手册。
>
> 每天只完成一个可以验证的结果。当天测试没有通过，就不要进入下一天。
>
> 不要一次读完 5 天。今天开始时只打开“第一天”，测试通过后再看第二天。

配套原理文档：`LESSON_05_MULTI_TURN_STATE_AND_SLOT_FILLING.md`

---

## 开始前：这五天最终要做出什么

现在的代码只能处理用户一次说完整的问题：

```text
用户：无线耳机库存还有多少？
→ inventory_query
→ ProductCustomerService
→ ProductService
→ 返回库存
```

第五章要让它支持用户分两次说：

```text
第一轮：帮我查库存
→ 知道 intent=inventory_query
→ 缺 productName
→ 保存状态
→ 追问“请问要查询什么商品？”

第二轮：无线耳机
→ 找回第一轮状态
→ 合并 productName=无线耳机
→ missingFields=[]
→ ProductCustomerService
→ 返回真实库存
```

五天只围绕这一条主线：

```text
状态定义
→ 状态存储
→ conversationId
→ 库存多轮补参
→ 价格、取消、过期和 Redis 边界
```

### 当前代码中的角色

```text
AgentService                  总调度
AgentIntentService            提取 intent 和 entities
ProductCustomerService        执行商品查询并组织回答
AgentConversationService      第五章新增：保存临时业务状态
MemorySaver                   第五章接入：保存 Agent 消息线程
```

注意两个“记忆”不是一回事：

| 组件 | 保存什么 | 示例 |
| --- | --- | --- |
| `AgentConversationService` | 业务任务状态 | 正在查库存、还缺商品名 |
| `MemorySaver` | Agent 消息和运行状态 | user/assistant/tool 消息 |

商品补参主要依赖第一个。`MemorySaver` 是为了让通用 Agent 在相同 `thread_id` 下拥有短期消息上下文。

---

# 第一天：只写状态和纯函数

## 今天目标

今天不改 Controller、不调用模型、不查询数据库。

只完成：

```text
定义状态
计算 missingFields
合并两轮 entities
使用 Jest 测试纯函数
```

## 第一步：理解三个字段

```ts
pendingIntent: 'inventory_query'
entities: { productName: null, ... }
missingFields: ['productName']
```

白话解释：

```text
pendingIntent：正在办什么
entities：已经知道什么
missingFields：完成这件事还缺什么
```

`missingFields` 不是所有值为 `null` 的字段。

例如查库存时，`orderNo` 和 `reason` 虽然也是 `null`，但库存查询不需要它们，因此它们不属于 `missingFields`。

## 第二步：修改 agent.conversation.ts

文件：`server/src/agent/agent.conversation.ts`

你已经有状态骨架。保留原有内容，再加入下面的规则和函数。最终可以整理成：

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

export const CONVERSATION_TTL_MS = 30 * 60 * 1000;

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

/**
 * 业务规则才是 missingFields 的权威来源。
 * 第一遍只开放库存和价格，避免同时处理过多意图。
 */
const REQUIRED_FIELDS: Partial<
  Record<CustomerIntentName, MissingField[]>
> = {
  inventory_query: ['productName'],
  price_query: ['productName'],
};

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

export function createConversationState(
  conversationId: string,
  now = Date.now(),
): AgentConversationState {
  return {
    conversationId,
    status: 'idle',
    pendingIntent: null,
    entities: createEmptyEntities(),
    missingFields: [],
    createdAt: now,
    updatedAt: now,
    expiresAt: now + CONVERSATION_TTL_MS,
  };
}

function isMissing(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim().length === 0;
  }

  return value === null || value === undefined;
}

export function calculateMissingFields(
  intent: CustomerIntentName,
  entities: CustomerEntities,
): MissingField[] {
  const requiredFields = REQUIRED_FIELDS[intent] ?? [];

  return requiredFields.filter((field) => isMissing(entities[field]));
}

function preferNewValue<T>(current: T | null, incoming: T | null): T | null {
  if (typeof incoming === 'string') {
    return incoming.trim().length > 0 ? incoming : current;
  }

  return incoming ?? current;
}

/**
 * 第二轮的 null 不能覆盖第一轮已经收集到的值；
 * 但第二轮提供的新非空值可以纠正第一轮。
 */
export function mergeEntities(
  current: CustomerEntities,
  incoming: CustomerEntities,
): CustomerEntities {
  return {
    productName: preferNewValue(current.productName, incoming.productName),
    categoryName: preferNewValue(current.categoryName, incoming.categoryName),
    orderNo: preferNewValue(current.orderNo, incoming.orderNo),
    budgetMax: preferNewValue(current.budgetMax, incoming.budgetMax),
    quantity: preferNewValue(current.quantity, incoming.quantity),
    reason: preferNewValue(current.reason, incoming.reason),
  };
}

export function isCancelMessage(message: string): boolean {
  return /^(取消|算了|不用了|停止)$/.test(message.trim());
}
```

## 第三步：逐段理解

### REQUIRED_FIELDS

```ts
inventory_query: ['productName']
```

不是说 `inventory_query` 对象只能有 `productName`，而是说：

```text
要执行库存查询，productName 是必须资料。
```

### calculateMissingFields

```ts
const requiredFields = REQUIRED_FIELDS[intent] ?? [];
return requiredFields.filter((field) => isMissing(entities[field]));
```

执行过程：

```text
找到当前意图要求的字段
→ 检查字段有没有有效值
→ 没值的字段留下
→ 得到 missingFields
```

### mergeEntities

第一轮：

```ts
{ productName: '无线耳机', budgetMax: null }
```

第二轮：

```ts
{ productName: null, budgetMax: 300 }
```

不能直接使用第二轮覆盖第一轮，否则商品名称会丢失。正确合并后：

```ts
{ productName: '无线耳机', budgetMax: 300 }
```

## 第四步：新增纯函数测试

新建：`server/src/agent/agent.conversation.spec.ts`

```ts
import {
  calculateMissingFields,
  createEmptyEntities,
  isCancelMessage,
  mergeEntities,
} from './agent.conversation';

describe('agent conversation rules', () => {
  it('库存查询没有商品名时缺少 productName', () => {
    const missingFields = calculateMissingFields(
      'inventory_query',
      createEmptyEntities(),
    );

    expect(missingFields).toEqual(['productName']);
  });

  it('库存查询有商品名时不再缺字段', () => {
    const entities = {
      ...createEmptyEntities(),
      productName: '无线耳机',
    };

    expect(calculateMissingFields('inventory_query', entities)).toEqual([]);
  });

  it('第二轮 null 不覆盖第一轮已经收集的值', () => {
    const current = {
      ...createEmptyEntities(),
      productName: '无线耳机',
    };
    const incoming = {
      ...createEmptyEntities(),
      budgetMax: 300,
    };

    expect(mergeEntities(current, incoming)).toEqual({
      ...createEmptyEntities(),
      productName: '无线耳机',
      budgetMax: 300,
    });
  });

  it('新的非空值可以纠正旧值', () => {
    const current = {
      ...createEmptyEntities(),
      productName: '蓝牙音箱',
    };
    const incoming = {
      ...createEmptyEntities(),
      productName: '无线耳机',
    };

    expect(mergeEntities(current, incoming).productName).toBe('无线耳机');
  });

  it.each(['取消', '算了', '不用了', '停止'])(
    '识别取消消息：%s',
    (message) => {
      expect(isCancelMessage(message)).toBe(true);
    },
  );
});
```

## 第五步：运行测试

在 `server` 目录执行：

```bash
pnpm test -- --runInBand src/agent/agent.conversation.spec.ts
```

然后执行类型检查：

```bash
pnpm exec tsc --noEmit --incremental false
```

## 第一天验收

必须能自己回答：

1. `entities` 和 `missingFields` 有什么区别？
2. 为什么模型已经返回 `missingFields`，代码还要重新计算？
3. 为什么第二轮的 `null` 不能覆盖第一轮数据？
4. 查库存时 `orderNo=null`，为什么 `orderNo` 不属于缺失字段？

动手自测：

```ts
const entities = {
  ...createEmptyEntities(),
  productName: '机械键盘',
};

calculateMissingFields('price_query', entities);
```

先在脑中写出结果，再运行：

```ts
[]
```

---

# 第二天：用 Map 保存业务会话状态

## 今天目标

今天解决：

```text
第一轮请求结束后，pendingIntent 和 entities 放在哪里？
```

答案是学习版的 `AgentConversationService`。

今天暂时不把 `MemorySaver` 接进 Agent。原因是 Checkpointer 必须和稳定的 `thread_id` 一起使用，第三天加入 `conversationId` 时再一次接通，避免半成品。

## 第一步：新建状态 Service

新建：`server/src/agent/agent.conversation.service.ts`

```ts
import { Injectable } from '@nestjs/common';
import {
  AgentConversationState,
  CONVERSATION_TTL_MS,
  createConversationState,
} from './agent.conversation';

function cloneState(state: AgentConversationState): AgentConversationState {
  return {
    ...state,
    entities: { ...state.entities },
    missingFields: [...state.missingFields],
  };
}

@Injectable()
export class AgentConversationService {
  private readonly states = new Map<string, AgentConversationState>();

  getOrCreate(
    conversationId: string,
    now = Date.now(),
  ): AgentConversationState {
    const existing = this.states.get(conversationId);

    if (!existing || existing.expiresAt <= now) {
      const created = createConversationState(conversationId, now);
      this.states.set(conversationId, created);
      return cloneState(created);
    }

    return cloneState(existing);
  }

  save(
    state: AgentConversationState,
    now = Date.now(),
  ): AgentConversationState {
    const saved: AgentConversationState = {
      ...cloneState(state),
      updatedAt: now,
      expiresAt: now + CONVERSATION_TTL_MS,
    };

    this.states.set(saved.conversationId, saved);
    return cloneState(saved);
  }

  clear(conversationId: string): void {
    this.states.delete(conversationId);
  }
}
```

## 第二步：为什么要返回副本

错误方式：

```ts
return this.states.get(conversationId);
```

调用方拿到的就是 Map 内部原对象，可以绕过 `save()` 直接修改。

返回副本后：

```text
读取 → 修改副本 → 显式 save
```

状态变化更容易跟踪。

## 第三步：注册 Service

修改 `agent.module.ts`：

```ts
import { AgentConversationService } from './agent.conversation.service';

@Module({
  // imports/controllers 保持原样
  providers: [
    AgentModelFactory,
    AgentIntentService,
    ProductCustomerService,
    AgentConversationService,
    AgentService,
  ],
  exports: [AgentService],
})
export class AgentModule {}
```

## 第四步：新增状态仓库测试

新建：`server/src/agent/agent.conversation.service.spec.ts`

```ts
import { CONVERSATION_TTL_MS } from './agent.conversation';
import { AgentConversationService } from './agent.conversation.service';

describe('AgentConversationService', () => {
  it('同一个 conversationId 能读取已保存状态', () => {
    const service = new AgentConversationService();
    const state = service.getOrCreate('conversation-a', 1_000);

    service.save(
      {
        ...state,
        status: 'collecting_fields',
        pendingIntent: 'inventory_query',
        entities: {
          ...state.entities,
          productName: '无线耳机',
        },
      },
      2_000,
    );

    const loaded = service.getOrCreate('conversation-a', 3_000);
    expect(loaded.pendingIntent).toBe('inventory_query');
    expect(loaded.entities.productName).toBe('无线耳机');
  });

  it('不同 conversationId 不会串数据', () => {
    const service = new AgentConversationService();
    const stateA = service.getOrCreate('conversation-a', 1_000);

    service.save(
      {
        ...stateA,
        entities: { ...stateA.entities, productName: '无线耳机' },
      },
      2_000,
    );

    const stateB = service.getOrCreate('conversation-b', 3_000);
    expect(stateB.entities.productName).toBeNull();
  });

  it('过期状态不会继续旧任务', () => {
    const service = new AgentConversationService();
    const state = service.getOrCreate('conversation-a', 1_000);

    service.save(
      {
        ...state,
        status: 'collecting_fields',
        pendingIntent: 'inventory_query',
      },
      2_000,
    );

    const expiredAt = 2_000 + CONVERSATION_TTL_MS + 1;
    const fresh = service.getOrCreate('conversation-a', expiredAt);

    expect(fresh.status).toBe('idle');
    expect(fresh.pendingIntent).toBeNull();
  });

  it('clear 后重新创建空状态', () => {
    const service = new AgentConversationService();
    const state = service.getOrCreate('conversation-a');
    service.save({ ...state, pendingIntent: 'price_query' });

    service.clear('conversation-a');

    expect(service.getOrCreate('conversation-a').pendingIntent).toBeNull();
  });
});
```

## 第五步：运行测试

```bash
pnpm test -- --runInBand \
  src/agent/agent.conversation.spec.ts \
  src/agent/agent.conversation.service.spec.ts
```

## 第二天验收

必须能回答：

1. Map 的 key 为什么是 `conversationId`？
2. 为什么不同 conversationId 不能共享状态？
3. TTL 到期为什么要创建新状态？
4. 为什么 `Map` 不能直接用于多实例线上部署？
5. 为什么今天还没有接入 `MemorySaver`？

答案主线：

```text
Map 只存在当前 Node.js 进程内；重启会丢，多实例也不共享。
```

---

# 第三天：打通 conversationId 和 Agent thread_id

## 今天目标

今天让同一段浏览器聊天始终携带同一个 ID：

```text
浏览器 conversationId
→ DTO
→ Controller
→ AgentService
→ LangGraph thread_id
```

## 第一步：修改 DTO

修改 `agent.dto.ts`。

增加导入：

```ts
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
```

给请求增加字段：

```ts
export class AgentChatDto {
  @IsUUID('4', { message: 'conversationId 必须是 UUID v4' })
  conversationId: string;

  // 原来的 message 校验保持不变
}
```

先只给响应增加 `conversationId`：

```ts
export interface AgentChatResponseDto {
  conversationId: string;
  reply: string;
  model: string;
  source: 'intent_router' | 'agent';
  intent: CustomerIntentName;
  entities: CustomerEntities;
}
```

这一天暂时不用导入 `AgentConversationState` 和 `MissingField`；第四天增加响应状态时再导入，避免未使用导入。

## 第二步：Controller 传递 conversationId

```ts
@Post('chat')
chat(@Body() dto: AgentChatDto): Promise<AgentChatResponseDto> {
  return this.agentService.chat(dto.message, dto.conversationId);
}
```

学习接口 `/intent` 也复用 DTO，但它只读取 `message`，这是可以接受的。调用 `/intent` 时同样需要提供合法 UUID。

## 第三步：接入 MemorySaver

当前项目已经直接安装：

```json
"@langchain/langgraph": "^1.4.9"
```

修改 `agent.service.ts`：

```ts
import { MemorySaver } from '@langchain/langgraph';

export class AgentService {
  private readonly checkpointer = new MemorySaver();

  // 其他成员保持不变
}
```

创建 Agent 时增加：

```ts
this.agent = createAgent({
  name: 'fe_assistant',
  model: this.modelFactory.getModel(),
  tools: createAgentTools(),
  checkpointer: this.checkpointer,
  systemPrompt: [/* 保持原内容 */].join('\n'),
});
```

修改 `chat` 参数：

```ts
async chat(
  message: string,
  conversationId: string,
): Promise<AgentChatResponseDto> {
```

Agent 调用增加第二个参数：

```ts
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
```

两个返回对象都增加：

```ts
conversationId,
```

### conversationId 和 thread_id 的关系

```text
conversationId：你的产品和 API 使用的名字
thread_id：LangGraph Checkpointer 识别线程的配置键
```

本章第一版直接使用同一个 UUID：

```ts
thread_id: conversationId
```

## 第四步：修改 React 页面

文件：`src/AgentChat.tsx`

组件内部新增：

```ts
const conversationIdRef = useRef(crypto.randomUUID());
```

发送请求时：

```ts
body: JSON.stringify({
  message,
  conversationId: conversationIdRef.current,
}),
```

清空对话时生成新 ID：

```ts
const clearConversation = () => {
  requestRef.current?.abort();
  requestRef.current = null;
  conversationIdRef.current = crypto.randomUUID();
  setMessages(createInitialMessages());
  // 其他清理保持不变
};
```

当前 `ProductCustomerService` 允许使用商品名称或分类查询。为了让第一次多轮练习只有一个明确槽位，
本实验暂时规定库存和价格必须先补 `productName`。等五天完成后，再扩展“商品名称或分类满足一个即可”的 `anyOf` 规则。

为什么使用 `useRef`：

```text
组件重新渲染不会生成新 ID，
但点击“清空对话”时可以主动替换 ID。
```

## 第五步：更新现有测试调用

原来：

```ts
service.chat('你好')
```

改为：

```ts
service.chat('你好', '11111111-1111-4111-8111-111111111111')
```

所有预期响应增加：

```ts
expect(result.conversationId).toBe(
  '11111111-1111-4111-8111-111111111111',
);
```

## 第六步：手动自测

启动：

```bash
pnpm start:dev
```

浏览器打开 `/fe/agent`，连续发送两次消息，在 Network 面板查看 Request Payload：

```json
{
  "message": "你好",
  "conversationId": "同一个 UUID"
}
```

点击清空后再次发送，应该出现另一个 UUID。

也可以使用 curl：

```bash
curl -X POST http://localhost:3000/api/agent/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "conversationId": "11111111-1111-4111-8111-111111111111",
    "message": "你好"
  }'
```

## 第三天验收

1. 连续两条消息的 `conversationId` 是否相同？
2. 点击清空后 ID 是否改变？
3. 不传 ID 是否返回 400？
4. 随便传 `abc` 是否返回 400？
5. `conversationId` 为什么不能替代 `userId`？

答案：任何人都可以伪造一个 UUID；生产环境仍然必须校验会话属于当前登录用户。

---

# 第四天：打通“查库存 → 追问商品名 → 返回库存”

## 今天目标

今天才真正把前两天的状态用起来。

```text
第一轮：帮我查库存
→ collecting_fields
→ missingFields=['productName']

第二轮：无线耳机
→ 合并字段
→ missingFields=[]
→ ProductCustomerService.reply()
```

## 第一步：扩展响应 DTO

在 `agent.dto.ts` 增加：

```ts
import type {
  ConversationStatus,
  MissingField,
} from './agent.conversation';
```

响应增加：

```ts
export interface AgentChatResponseDto {
  conversationId: string;
  reply: string;
  model: string;
  source: 'intent_router' | 'agent';
  intent: CustomerIntentName;
  entities: CustomerEntities;
  status: ConversationStatus;
  missingFields: MissingField[];
}
```

## 第二步：AgentService 注入状态 Service

在 `agent.service.ts` 增加导入：

```ts
import { AgentConversationService } from './agent.conversation.service';
import {
  AgentConversationState,
  MissingField,
  calculateMissingFields,
  isCancelMessage,
  mergeEntities,
} from './agent.conversation';
import {
  CustomerEntities,
  CustomerIntentName,
} from './agent.intent';
```

然后增加构造参数：

```ts
constructor(
  private readonly modelFactory: AgentModelFactory,
  private readonly agentIntentService: AgentIntentService,
  private readonly productCustomerService: ProductCustomerService,
  private readonly conversationService: AgentConversationService,
) {}
```

## 第三步：理解核心编排顺序

不要先复制代码，先用手指着下面每一行解释：

```text
读取旧状态
→ 判断取消
→ 识别当前消息
→ 合并旧 entities 和新 entities
→ 决定继续旧意图还是切换新意图
→ 代码重新计算 missingFields
→ 有缺失：保存并追问
→ 无缺失：执行商品查询
→ 标记完成
```

## 第四步：给 AgentService 增加两个小方法

先增加缺失字段追问：

```ts
private buildMissingFieldReply(missingFields: MissingField[]): string {
  switch (missingFields[0]) {
    case 'productName':
      return '请告诉我你要查询的商品名称。';
    case 'orderNo':
      return '请告诉我订单号。';
    case 'reason':
      return '请告诉我具体原因。';
    default:
      return '请补充完成当前请求所需的信息。';
  }
}
```

再增加旧任务判断：

```ts
private resolveIntent(
  state: AgentConversationState,
  currentIntent: CustomerIntentName,
  mergedEntities: CustomerEntities,
): CustomerIntentName {
  if (
    state.status !== 'collecting_fields' ||
    !state.pendingIntent ||
    currentIntent === 'human_handoff'
  ) {
    return currentIntent;
  }

  const remaining = calculateMissingFields(
    state.pendingIntent,
    mergedEntities,
  );

  // 缺失数量减少，说明当前消息正在补充上一轮资料。
  if (remaining.length < state.missingFields.length) {
    return state.pendingIntent;
  }

  return currentIntent;
}
```

## 第五步：改造 chat() 的商品分支

下面是核心骨架。保留你原有的 `try/catch`、`getAgent()` 和 `extractText()`，把 `try` 内的编排部分调整为：

```ts
let state = this.conversationService.getOrCreate(conversationId);

// completed/cancelled 表示上一件事已经结束，新消息从空状态开始。
if (state.status === 'completed' || state.status === 'cancelled') {
  this.conversationService.clear(conversationId);
  state = this.conversationService.getOrCreate(conversationId);
}

if (isCancelMessage(message)) {
  const cancelledIntent = state.pendingIntent ?? 'unknown';
  const cancelledEntities = state.entities;
  this.conversationService.clear(conversationId);

  return {
    conversationId,
    reply: '已取消当前任务。',
    model: modelName,
    source: 'intent_router',
    intent: cancelledIntent,
    entities: cancelledEntities,
    status: 'cancelled',
    missingFields: [],
  };
}

const analysis = await this.agentIntentService.analyze(message);
const mergedEntities = mergeEntities(state.entities, analysis.entities);
const activeIntent = this.resolveIntent(
  state,
  analysis.intent,
  mergedEntities,
);
const missingFields = calculateMissingFields(
  activeIntent,
  mergedEntities,
);

if (
  this.productCustomerService.canHandle(activeIntent) &&
  missingFields.length > 0
) {
  this.conversationService.save({
    ...state,
    status: 'collecting_fields',
    pendingIntent: activeIntent,
    entities: mergedEntities,
    missingFields,
  });

  return {
    conversationId,
    reply: this.buildMissingFieldReply(missingFields),
    model: modelName,
    source: 'intent_router',
    intent: activeIntent,
    entities: mergedEntities,
    status: 'collecting_fields',
    missingFields,
  };
}

if (this.productCustomerService.canHandle(activeIntent)) {
  this.conversationService.save({
    ...state,
    status: 'processing',
    pendingIntent: activeIntent,
    entities: mergedEntities,
    missingFields: [],
  });

  const reply = await this.productCustomerService.reply({
    ...analysis,
    intent: activeIntent,
    entities: mergedEntities,
    missingFields: [],
  });

  this.conversationService.save({
    ...state,
    status: 'completed',
    pendingIntent: null,
    entities: mergedEntities,
    missingFields: [],
  });

  return {
    conversationId,
    reply,
    model: modelName,
    source: 'intent_router',
    intent: activeIntent,
    entities: mergedEntities,
    status: 'completed',
    missingFields: [],
  };
}
```

非商品 Agent 分支仍使用原来的 `createAgent`，但返回时补上：

```ts
conversationId,
status: 'completed',
missingFields: [],
```

如果当前消息明确切换到非商品意图，执行 Agent 前调用：

```ts
this.conversationService.clear(conversationId);
```

## 第六步：为什么第二句仍然执行 inventory_query

第二句：

```text
无线耳机
```

单独看可能被模型识别为 `product_search`。但旧状态是：

```ts
{
  status: 'collecting_fields',
  pendingIntent: 'inventory_query',
  missingFields: ['productName'],
}
```

合并后 `productName` 被补上，缺失数量从 1 变成 0。因此 `resolveIntent()` 保留旧的 `inventory_query`。

## 第七步：使用聊天页面完成主验收

第四天不要求编写 `AgentService` 单元测试。使用真实页面、真实模型和本地数据库完成端到端验证。

页面显示的文字只能证明“最终有回答”，还需要配合 Chrome Network 面板观察状态是否正确。

### 7.1 启动前后端

终端一，在 `server` 目录启动 NestJS：

```bash
pnpm start:dev
```

看到 Nest 应用成功启动并监听 `3000` 端口后，再打开终端二，在项目根目录启动 Vite：

```bash
pnpm dev
```

浏览器打开：

```text
http://localhost:5173/fe/agent
```

当前 Vite 会把 `/api` 代理到 `http://127.0.0.1:3000`，所以页面仍然请求：

```text
/api/agent/chat
```

### 7.2 打开 Network 面板

Chrome 中操作：

```text
F12
→ Network
→ Fetch/XHR
→ 过滤 chat
→ 勾选 Preserve log（可选）
```

每次发送消息后点击：

```text
POST /api/agent/chat
```

重点检查两个位置：

```text
Payload：前端发送了什么
Response：后端保存和计算出了什么
```

### 7.3 先检查第三天是否完成

在页面随便发送一句“你好”，查看 Payload，必须包含：

```json
{
  "message": "你好",
  "conversationId": "一个 UUID v4"
}
```

如果没有 `conversationId`，不要继续第四天测试，先回到第三天修改 `AgentChat.tsx`。

### 7.4 场景一：库存两轮补参

先点击页面的“清空对话”，然后发送：

```text
帮我查库存
```

页面预期回答：

```text
请告诉我你要查询的商品名称。
```

第一轮 Response 重点检查：

```json
{
  "source": "intent_router",
  "intent": "inventory_query",
  "status": "collecting_fields",
  "missingFields": ["productName"],
  "entities": {
    "productName": null
  }
}
```

把第一轮 Payload 中的 `conversationId` 复制到临时文本中，记为 ID-A。

不要清空页面，直接发送第二句话：

```text
无线耳机
```

页面预期显示数据库中的真实库存，例如：

```text
无线耳机 当前库存 10 件，可以购买。
```

实际商品名和数量以你的数据库为准。

第二轮 Payload 必须满足：

```text
conversationId 仍然等于 ID-A
```

第二轮 Response 重点检查：

```json
{
  "source": "intent_router",
  "intent": "inventory_query",
  "status": "completed",
  "missingFields": [],
  "entities": {
    "productName": "无线耳机"
  }
}
```

最重要的不是模型第二轮单独识别出了什么，而是最终 `intent` 仍然为第一轮的 `inventory_query`。

### 7.5 场景二：清空后必须隔离

完成场景一后点击“清空对话”，再发送：

```text
无线耳机
```

检查 Payload：

```text
conversationId 必须不等于 ID-A
```

检查 Response：它不能因为上一个会话正在查库存，就自动继承 `inventory_query`。

它可能被识别为 `product_search` 并显示商品信息，这是合理的；重点是新会话不能继承旧会话状态。

### 7.6 场景三：两个浏览器标签隔离

打开两个 `/fe/agent` 页面：

```text
标签 A：发送“帮我查库存”
标签 B：发送“无线耳机”
```

两个标签的 Payload 应该拥有不同 `conversationId`。

标签 B 不能接着标签 A 的 `inventory_query`。

如果两个标签使用了同一个 ID，检查是否错误地把 ID 写成了模块级全局常量或固定字符串。

### 7.7 场景四：刷新页面

记录当前 ID，刷新页面后发送一条消息。

因为当前使用：

```ts
useRef(crypto.randomUUID())
```

刷新后会创建新 ID。这是学习版的预期行为。

第六章做会话持久化时，才考虑刷新后从 URL、数据库或本地安全状态恢复会话。

### 7.8 页面测试失败时怎么定位

| 现象 | 先检查什么 |
| --- | --- |
| HTTP 400 | Payload 是否缺少合法 UUID v4 |
| HTTP 502 | 模型、API Key、Base URL 或 Structured Output |
| 第一轮直接显示 `completed` | 是否调用了代码版 `calculateMissingFields()` |
| 第一轮直接查询商品 | 商品分支是否在缺失字段判断之前执行 |
| 第二轮变成 `product_search` | 两轮 ID 是否相同、旧状态是否成功 `save()` |
| 第二轮仍追问商品名 | 模型是否提取到 `entities.productName`、`mergeEntities()` 是否生效 |
| 返回没有找到商品 | 数据库中是否存在同名且已上架商品 |
| 点击清空后仍继续旧任务 | `clearConversation()` 是否生成新 UUID |
| 页面一直 Pending | 查看 NestJS 终端是否停在模型调用或数据库查询 |

### 7.9 页面测试记录表

每个场景测试后手动填写：

```text
第一轮 conversationId：
第一轮 intent：
第一轮 status：
第一轮 missingFields：

第二轮 conversationId：
第二轮 intent：
第二轮 status：
第二轮 entities.productName：
第二轮 missingFields：

页面最终回答：
是否符合预期：
```

如果这些字段全部正确，第四天的核心流程就算通过。单元测试可以等你熟悉页面流程后再补，不影响当天继续学习。

## 第四天验收

1. 第一轮是否只追问商品名，而没有提前返回库存结果？
2. 第二轮为什么保留 `inventory_query`，而不是改成 `product_search`？
3. 两轮使用不同 ID 时，为什么第二轮不能完成库存查询？
4. 完成后为什么必须把 `pendingIntent` 设为 `null`？

---

# 第五天：价格、取消、人工切换、边界和 Redis

## 今天目标

今天不再改变主架构，只补边界：

```text
price_query
取消任务
切换人工
商品不存在
多候选商品
TTL
Map → Redis 的接口边界
```

## 第一步：价格补参与库存复用同一套流程

第一天已经配置：

```ts
price_query: ['productName']
```

因此不需要再写一套状态机。测试即可：

```text
第一轮：帮我查价格
→ missingFields=['productName']

第二轮：无线耳机
→ activeIntent='price_query'
→ ProductCustomerService.formatPriceReply()
```

新增测试时只需要把第四天的库存测试复制一份，然后修改：

```ts
inventory_query → price_query
库存回答 → 价格回答
```

不要复制一份新的 `PriceConversationService`。

## 第二步：测试取消

```ts
it('用户取消后清理待处理任务', async () => {
  // 第一轮先创建 collecting_fields 状态
  await service.chat('帮我查库存', conversationId);

  const result = await service.chat('取消', conversationId);

  expect(result.status).toBe('cancelled');
  expect(result.missingFields).toEqual([]);

  const fresh = conversationService.getOrCreate(conversationId);
  expect(fresh.pendingIntent).toBeNull();
});
```

取消判断放在模型调用前，因此“取消”不需要浪费一次模型请求。

## 第三步：测试切换人工

当模型识别：

```ts
intent: 'human_handoff'
```

它的优先级应该高于旧的库存任务：

```text
第一轮：帮我查库存
第二轮：算了，给我转人工
→ 不应该继续追问商品名
```

当前项目还没有真正的人工客服系统，因此第一版可以：

```ts
if (analysis.intent === 'human_handoff') {
  this.conversationService.clear(conversationId);

  return {
    conversationId,
    reply: '已记录人工客服请求，当前自动客服任务已停止。',
    model: modelName,
    source: 'intent_router',
    intent: 'human_handoff',
    entities: mergedEntities,
    status: 'completed',
    missingFields: [],
  };
}
```

这只是安全结束自动流程，不是假装已经接入人工坐席。

## 第四步：商品不存在和多个候选

`ProductCustomerService` 已经处理商品不存在：

```text
没有找到与“xxx”相关的已上架商品。
```

测试重点是：

```text
数据库结果为空时不得让模型编造商品。
```

多个候选商品时，当前 `ProductCustomerService` 会把最多五条结果都列出来，不会静默选择第一条。以后涉及订单或退款等写操作时，必须让用户明确选择具体对象。

## 第五步：理解并发覆盖

当前流程是：

```text
读取 Map 状态
→ 异步调用模型
→ 保存 Map 状态
```

如果同一个 conversationId 同时发出两个请求，两次请求可能读取同一个旧状态，后保存的结果覆盖先保存的结果。

学习版最低要求：

- 前端 `loading=true` 时禁止再次发送。
- 测试时不要并发请求同一 conversationId。
- 知道这不等于生产级并发安全。

生产版需要按 `conversationId` 加锁，或者使用带版本号的 Redis 原子更新。

## 第六步：画出 Map 换 Redis 的边界

现在业务层只应该依赖这些行为：

```ts
getOrCreate(conversationId)
save(state)
clear(conversationId)
```

未来换 Redis：

```text
Map.get    → Redis GET
Map.set    → Redis SET EX
Map.delete → Redis DEL
```

`AgentService` 的多轮处理顺序不应该因此重写。

Redis Key 示例：

```text
agent:conversation:{conversationId}
```

TTL：

```text
30 分钟
```

Redis 中存储的 JSON 读回来后，必须再次用 Zod 校验；外部存储里的数据不能天然视为合法 TypeScript 对象。

## 第七步：第五天测试清单

至少补齐：

| 测试 | 必须断言 |
| --- | --- |
| 价格第一轮 | `missingFields=['productName']` |
| 价格第二轮 | 保持 `price_query` 并调用商品 Service |
| 取消 | 清理 pending 状态，不调用模型 |
| 转人工 | 不继续库存追问 |
| 商品不存在 | 返回明确的未找到提示 |
| 两个 conversationId | 状态完全隔离 |
| 状态过期 | 不接着旧任务 |

运行 Agent 相关测试：

```bash
pnpm test -- --runInBand src/agent
```

类型检查：

```bash
pnpm exec tsc --noEmit --incremental false
```

构建：

```bash
pnpm run build
```

## 第五天验收

必须能回答：

1. Redis 为什么适合临时任务状态？
2. MySQL 为什么更适合长期聊天记录？
3. `MemorySaver` 为什么不能替代业务状态？
4. 为什么取消判断要放在模型调用前？
5. 为什么同一 conversationId 的并发请求可能覆盖状态？

---

# 每天结束时的固定检查流程

每天都按相同顺序执行：

```text
1. Prettier 格式化当天修改的文件
2. 运行当天新增的单元测试
3. 运行 TypeScript 类型检查
4. 启动 NestJS 手动测试
5. 在纸上画出本次请求的数据变化
```

命令模板：

```bash
pnpm exec prettier --write src/agent/当天修改的文件.ts
pnpm test -- --runInBand src/agent/当天测试.spec.ts
pnpm exec tsc --noEmit --incremental false
pnpm start:dev
```

不要只看接口最终文字。每次自测至少记录：

```text
conversationId = ?
旧 pendingIntent = ?
本轮 analysis.intent = ?
合并后 entities = ?
重新计算 missingFields = ?
最终 status = ?
是否调用 ProductCustomerService = ?
```

---

# 五天完成后的最终验收场景

## 场景一：库存两轮补参

```text
用户：帮我查库存
系统：请告诉我你要查询的商品名称。
用户：无线耳机
系统：无线耳机 当前库存 10 件，可以购买。
```

必须满足：

- 两轮 ID 相同。
- 第一轮不查询数据库。
- 第二轮保持 `inventory_query`。
- 第二轮完成后 `pendingIntent=null`。

## 场景二：不同会话隔离

```text
会话 A：帮我查库存
会话 B：无线耳机
```

会话 B 不能继承会话 A 的库存任务。

## 场景三：取消

```text
用户：帮我查库存
系统：请告诉我商品名称。
用户：取消
系统：已取消当前任务。
```

下一句话不能继续旧任务。

## 场景四：切换人工

```text
用户：帮我查库存
系统：请告诉我商品名称。
用户：我要找人工
```

系统不能继续追问商品名，也不能假装已经存在真实人工坐席。

## 场景五：过期

状态超过 30 分钟后：

```text
用户：无线耳机
```

不能继续半小时前未完成的库存任务。

---

# 什么时候可以进入第六章

下面全部做到后再进入第六章：

- [ ] 能自己解释 `pendingIntent/entities/missingFields`。
- [ ] 纯函数测试全部通过。
- [ ] Map 状态仓库测试全部通过。
- [ ] 同一 conversationId 可以完成库存两轮查询。
- [ ] 不同 conversationId 不会串状态。
- [ ] 取消能够清理状态。
- [ ] 知道 MemorySaver 和业务 Map 的区别。
- [ ] 知道 Map 不能直接用于线上多实例。
- [ ] 类型检查和 Nest 构建通过。

第五章真正的完成标准不是“文档看完”，而是你能够拿一张纸写出：

```text
旧状态
  + 本轮模型提取结果
  = 合并后的状态
  → 代码重新计算 missingFields
  → 追问或执行业务
```

做到这一点，你就真正掌握了多轮客服的基础。
