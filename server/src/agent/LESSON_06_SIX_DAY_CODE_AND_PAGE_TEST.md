# 第 6 章六天代码实验：持久化会话与页面自测

> 这是一份第六章的第一遍动手手册，不是生产知识大全。
>
> 一天只完成一个结果。不要一次读完六天，也不要第一天就接 Redis、摘要和 Long-term Store。

完整原理和生产边界仍然查阅：[第 6 章完整原理](./LESSON_06_PERSISTENT_CONVERSATIONS_AND_CONTEXT_ENGINEERING.md)。

---

## 一、先说清楚第六章到底要解决什么

第五章已经能做到：

```text
同一个 Node.js 进程内
→ 记住正在查询库存
→ 下一句话补充商品名称
```

但是当前状态都在内存：

```text
MemorySaver
+
AgentConversationService 中的 Map
```

重启 NestJS 后都会丢失。

第六章第一遍只完成一个产品结果：

```text
用户与 Agent 的可见消息保存到 MySQL
→ 刷新页面后重新加载
→ NestJS 重启后页面历史仍然存在
```

这里有三个不同事实：

| 数据 | 第一遍放哪里 | 用途 |
| --- | --- | --- |
| 页面可见聊天记录 | MySQL | 刷新页面后恢复 |
| Agent 消息状态 | MemorySaver | 通用 Agent 短期上下文 |
| 客服任务状态 | Map | `pendingIntent/entities/missingFields` |

第一遍不要把 MySQL 历史再次完整传入已经使用 Checkpointer 的 Agent，否则会重复消息。

---

## 二、六天路线图

| 天数 | 只完成什么 | 怎样验收 |
| --- | --- | --- |
| 第 0 天 | 修好第五章基线 | 类型检查、计算 Tool、库存两轮都正常 |
| 第 1 天 | 建立 MySQL 会话表和消息表 | 数据库出现两张空表 |
| 第 2 天 | 建历史 Service 和查询接口 | 浏览器能创建会话并读取空消息 |
| 第 3 天 | 聊天时保存 user/assistant | Network 查询到两条消息 |
| 第 4 天 | 页面刷新恢复历史 | 刷新后聊天气泡仍在 |
| 第 5 天 | 搞清上下文来源和预算 | 请求不重复发送完整历史 |
| 第 6 天 | 生产安全升级清单 | 知道上线前还缺什么 |

第 1～4 天是第一遍必须实现；第 5～6 天先理解边界，不要求一次把生产能力全部写完。

---

# 第 0 天：先修好第五章基线

## 为什么必须先做

我对照了你当前代码，发现 conversation 文件已经移动到：

```text
server/src/agent/conversation/
```

但部分 import 仍然指向旧位置。此外，`AgentService.chat()` 当前商品分支之后缺少普通 Agent 分支。

如果不先修复：

- TypeScript 编译失败；
- “你好”“计算 1+2”等非商品消息可能返回 `undefined`；
- 第六章持久化时无法判断问题来自新代码还是旧基线。

## 0.1 修正 import 路径

`agent.dto.ts`：

```ts
import {
  ConversationStatus,
  MissingField,
} from './conversation/agent.conversation';
```

`agent.module.ts`：

```ts
import { AgentConversationService } from './conversation/agent.conversation.service';
```

`agent.service.spec.ts`：

```ts
import { AgentConversationService } from './conversation/agent.conversation.service';
import { createEmptyEntities } from './conversation/agent.conversation';
```

## 0.2 Module 注册顺序不重要，路径必须正确

```ts
providers: [
  AgentModelFactory,
  AgentIntentService,
  ProductCustomerService,
  AgentConversationService,
  AgentService,
],
```

## 0.3 恢复非商品 Agent 分支

在 `AgentService.chat()` 的商品分支之后、`catch` 之前，必须还有：

```ts
this.conversationService.clear(conversationId);

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

const lastMessage = result.messages.at(-1);

return {
  conversationId,
  reply: this.extractText(lastMessage?.content),
  model: modelName,
  source: 'agent',
  intent: activeIntent,
  entities: mergedEntities,
  status: 'completed',
  missingFields: [],
};
```

为什么要清理业务 Map：当前消息已经切换到非商品任务，不能继续保留旧的待补商品字段。

## 0.4 使用真正的 UUID

当前页面使用：

```ts
'v-' + Date.now() + '-' + Math.random()
```

它能作为 Map key，但不是真正 UUID。第六章要把 ID 保存到数据库，统一改成：

```ts
const conversationIdRef = useRef(crypto.randomUUID());
```

清空对话：

```ts
conversationIdRef.current = crypto.randomUUID();
```

DTO 改成：

```ts
import { IsUUID } from 'class-validator';

@IsUUID('4', { message: 'conversationId 必须是 UUID v4' })
conversationId: string;
```

## 0.5 更新旧测试的构造参数

`AgentService` 现在有四个依赖，旧测试仍然只传三个。所有测试都要补：

```ts
const conversationService = new AgentConversationService();

const service = new AgentService(
  modelFactory,
  intentService,
  productCustomerService,
  conversationService,
);
```

调用也要带 ID：

```ts
await service.chat(
  '你好',
  '11111111-1111-4111-8111-111111111111',
);
```

即使你第四天主要使用页面自测，也要修正这些测试文件，因为 `tsc` 会编译 `.spec.ts`。

## 第 0 天验证

```bash
cd server
pnpm exec tsc --noEmit --incremental false
pnpm run build
```

页面验证三条：

```text
1. “请计算 1+2”能够返回 3
2. “帮我查库存”会追问商品名
3. 接着输入真实商品名会返回库存
```

三条有任何一条失败，都不要开始第 1 天。

---

# 第 1 天：建立 MySQL 会话表和消息表

## 今天目标

今天只建表，不改聊天流程。

```text
agent_conversation：一段对话
agent_message：对话中的一条可见消息
```

## 1.1 新建 persistence 文件夹

```text
server/src/agent/persistence/
├── agent-conversation.entity.ts
└── agent-message.entity.ts
```

注意：数据库 Entity 使用 `Record` 后缀，避免和第五章的 `AgentConversationState` 混淆。

## 1.2 会话 Entity

`agent-conversation.entity.ts`：

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('agent_conversation')
export class AgentConversationRecord {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  // 第一遍页面还没有接 JWT，暂时允许为空；上线前必须改成必填并校验归属。
  @Index()
  @Column({ type: 'int', nullable: true, name: 'user_id' })
  userId: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  title: string | null;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: 'active' | 'closed' | 'deleted';

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

`userId` 暂时允许空只是为了先让现有无登录页面完成学习实验。这个版本不能直接部署为多人生产系统。

## 1.3 消息 Entity

`agent-message.entity.ts`：

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AgentConversationRecord } from './agent-conversation.entity';

export type AgentMessageRole = 'user' | 'assistant';
export type AgentMessageStatus = 'pending' | 'completed' | 'failed';

@Entity('agent_message')
@Index(['conversationId', 'clientMessageId', 'role'], { unique: true })
@Index(['conversationId', 'id'])
export class AgentMessageRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 36, name: 'conversation_id' })
  conversationId: string;

  @Column({ type: 'varchar', length: 36, name: 'client_message_id' })
  clientMessageId: string;

  @Column({ type: 'varchar', length: 36, name: 'turn_id' })
  turnId: string;

  @Column({ type: 'varchar', length: 20 })
  role: AgentMessageRole;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', length: 20, default: 'completed' })
  status: AgentMessageStatus;

  @Column({ type: 'varchar', length: 100, nullable: true })
  model: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => AgentConversationRecord, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: AgentConversationRecord;
}
```

为什么保存 `clientMessageId`：用户双击、超时重试时，同一条前端消息不能写入两次。

为什么保存 `turnId`：把这一轮 user 和 assistant 消息关联起来。

## 1.4 注册 Entity

`agent.module.ts`：

```ts
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentConversationRecord } from './persistence/agent-conversation.entity';
import { AgentMessageRecord } from './persistence/agent-message.entity';

@Module({
  imports: [
    ProductModule,
    CategoryModule,
    TypeOrmModule.forFeature([
      AgentConversationRecord,
      AgentMessageRecord,
    ]),
  ],
  // 其他内容保持不变
})
export class AgentModule {}
```

你的 `AppModule` 当前显式列出所有 Entity，还要加入：

```ts
AgentConversationRecord,
AgentMessageRecord,
```

## 1.5 本地建表与生产 Migration

当前项目开发环境使用：

```ts
synchronize: process.env.NODE_ENV !== 'production'
```

因此本地重启 NestJS 后会自动同步新表。只用于学习和开发。

生产环境必须通过 Migration 建表，不能为了省事打开 `synchronize`。第一遍先把 Entity 跑通，第六天再整理 Migration 清单。

## 第 1 天验证

启动后端：

```bash
pnpm start:dev
```

检查启动日志没有 Entity metadata 或数据库错误。

在数据库工具中确认出现：

```text
agent_conversation
agent_message
```

此时两张表为空是正确的，因为聊天流程还没有调用它们。

验收问题：

```text
AgentConversationState 和 AgentConversationRecord 有什么区别？
```

答案：前者是当前任务的临时业务状态，后者是长期保存的一段产品会话。

---

# 第 2 天：建立历史 Service 和查询接口

## 今天目标

今天不接模型，只验证 MySQL 能够：

```text
创建会话
→ 写入消息
→ 查询消息
```

## 2.1 新建 AgentHistoryService

文件：`persistence/agent-history.service.ts`

核心方法先保持最少：

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentConversationRecord } from './agent-conversation.entity';
import { AgentMessageRecord } from './agent-message.entity';

@Injectable()
export class AgentHistoryService {
  constructor(
    @InjectRepository(AgentConversationRecord)
    private readonly conversations: Repository<AgentConversationRecord>,
    @InjectRepository(AgentMessageRecord)
    private readonly messages: Repository<AgentMessageRecord>,
  ) {}

  async ensureConversation(conversationId: string) {
    const existing = await this.conversations.findOne({
      where: { id: conversationId },
    });

    if (existing) return existing;

    return this.conversations.save(
      this.conversations.create({
        id: conversationId,
        userId: null,
        title: null,
        status: 'active',
      }),
    );
  }

  listMessages(conversationId: string) {
    return this.messages.find({
      where: { conversationId },
      order: { id: 'ASC' },
      take: 100,
    });
  }
}
```

第一遍最多返回 100 条，避免接口无上限读取全部历史。第六章原理文档再学习游标分页。

## 2.2 建调试接口

新建 `persistence/agent-history.controller.ts`：

```ts
import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { AgentHistoryService } from './agent-history.service';

@Controller('api/agent/conversations')
export class AgentHistoryController {
  constructor(private readonly history: AgentHistoryService) {}

  @Post(':conversationId')
  create(@Param('conversationId', new ParseUUIDPipe()) conversationId: string) {
    return this.history.ensureConversation(conversationId);
  }

  @Get(':conversationId/messages')
  listMessages(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
  ) {
    return this.history.listMessages(conversationId);
  }
}
```

注册到 `AgentModule`：

```ts
controllers: [AgentController, AgentHistoryController],
providers: [
  // 原有 providers
  AgentHistoryService,
],
```

这些接口当前没有鉴权，只允许本地学习。第六天必须加入 `JwtAuthGuard + userId` 后才能上线。

## 2.3 使用浏览器控制台测试

打开 `/fe/agent`，F12 → Console：

```js
const id = crypto.randomUUID();

await fetch(`/api/agent/conversations/${id}`, {
  method: 'POST',
}).then((response) => response.json());
```

预期返回一个会话对象。

继续：

```js
await fetch(`/api/agent/conversations/${id}/messages`)
  .then((response) => response.json());
```

预期：

```json
[]
```

同时数据库 `agent_conversation` 应新增一行，`agent_message` 仍然为空。

## 第 2 天失败排查

| 现象 | 检查 |
| --- | --- |
| 404 | Controller 是否注册到 AgentModule |
| 400 | conversationId 是否是真正 UUID |
| 500 metadata 错误 | Entity 是否同时注册到 AgentModule 和 AppModule |
| 表不存在 | 本地 NODE_ENV 是否错误设为 production |
| 返回对象但数据库没有 | 检查连接的是哪个 DB_NAME |

---

# 第 3 天：聊天时保存 user 和 assistant 消息

## 今天目标

今天打通：

```text
页面发送消息
→ 先保存 user
→ 调用现有 AgentService
→ 保存 assistant
→ 页面获得回答
```

不要把数据库保存代码塞进 `ProductCustomerService`。商品 Service 只负责商品业务。

## 3.1 DTO 增加 clientMessageId

```ts
@IsUUID('4', { message: 'clientMessageId 必须是 UUID v4' })
clientMessageId: string;
```

每次点击发送生成一个新 ID；网络重试同一条消息时复用它。

## 3.2 给 HistoryService 增加三个方法

在 `AgentHistoryService` 中实现：

```ts
async startUserTurn(input: {
  conversationId: string;
  clientMessageId: string;
  turnId: string;
  content: string;
}): Promise<AgentMessageRecord> {
  const existing = await this.messages.findOne({
    where: {
      conversationId: input.conversationId,
      clientMessageId: input.clientMessageId,
      role: 'user',
    },
  });

  if (existing) return existing;

  return this.messages.save(
    this.messages.create({
      ...input,
      role: 'user',
      status: 'pending',
      model: null,
      metadata: null,
    }),
  );
}

async completeAssistantTurn(input: {
  conversationId: string;
  clientMessageId: string;
  turnId: string;
  reply: string;
  model: string;
  metadata: Record<string, unknown>;
}): Promise<AgentMessageRecord> {
  await this.messages.update(
    {
      conversationId: input.conversationId,
      clientMessageId: input.clientMessageId,
      role: 'user',
    },
    { status: 'completed' },
  );

  const existing = await this.messages.findOne({
    where: {
      conversationId: input.conversationId,
      clientMessageId: input.clientMessageId,
      role: 'assistant',
    },
  });
  if (existing) return existing;

  return this.messages.save(
    this.messages.create({
      conversationId: input.conversationId,
      clientMessageId: input.clientMessageId,
      turnId: input.turnId,
      role: 'assistant',
      content: input.reply,
      status: 'completed',
      model: input.model,
      metadata: input.metadata,
    }),
  );
}

async markUserTurnFailed(
  conversationId: string,
  clientMessageId: string,
): Promise<void> {
  await this.messages.update(
    {
      conversationId,
      clientMessageId,
      role: 'user',
    },
    { status: 'failed' },
  );
}
```

`startUserTurn()` 写入：

```ts
{
  role: 'user',
  content,
  status: 'pending',
  model: null,
  metadata: null,
}
```

模型成功后：

- 把 user 状态改为 `completed`；
- 写入 assistant 消息；
- assistant 的 `metadata` 保存 `intent/source/status/missingFields/entities`。

模型失败后：

- 把 user 状态改为 `failed`；
- 不伪造 assistant 消息。

## 3.3 新建持久化编排 Service

新建 `persistence/agent-chat-application.service.ts`：

```ts
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AgentChatDto, AgentChatResponseDto } from '../agent.dto';
import { AgentService } from '../agent.service';
import { AgentHistoryService } from './agent-history.service';

@Injectable()
export class AgentChatApplicationService {
  constructor(
    private readonly agentService: AgentService,
    private readonly history: AgentHistoryService,
  ) {}

  async chat(dto: AgentChatDto): Promise<AgentChatResponseDto> {
    await this.history.ensureConversation(dto.conversationId);

    const turnId = randomUUID();
    await this.history.startUserTurn({
      conversationId: dto.conversationId,
      clientMessageId: dto.clientMessageId,
      turnId,
      content: dto.message,
    });

    try {
      // 模型调用期间不保持数据库事务。
      const result = await this.agentService.chat(
        dto.message,
        dto.conversationId,
      );

      await this.history.completeAssistantTurn({
        conversationId: dto.conversationId,
        clientMessageId: dto.clientMessageId,
        turnId,
        reply: result.reply,
        model: result.model,
        metadata: {
          source: result.source,
          intent: result.intent,
          entities: result.entities,
          status: result.status,
          missingFields: result.missingFields,
        },
      });

      return result;
    } catch (error) {
      await this.history.markUserTurnFailed(
        dto.conversationId,
        dto.clientMessageId,
      );
      throw error;
    }
  }
}
```

Controller 改成注入 `AgentChatApplicationService`，`/chat` 调用。原来的
`AgentIntentService` 仍然保留给 `/intent-preview`：

```ts
constructor(
  private readonly chatApplication: AgentChatApplicationService,
  private readonly agentIntentService: AgentIntentService,
) {}

@Post('chat')
chat(@Body() dto: AgentChatDto): Promise<AgentChatResponseDto> {
  return this.chatApplication.chat(dto);
}
```

同时注册到 `AgentModule`：

```ts
providers: [
  // 原有 providers
  AgentHistoryService,
  AgentChatApplicationService,
],
```

为什么单独加一层：

```text
AgentService：负责 AI 和业务路由
AgentChatApplicationService：负责一次请求的持久化生命周期
```

## 3.4 前端生成 clientMessageId

在 `sendMessage()` 一开始：

```ts
const clientMessageId = crypto.randomUUID();
```

请求：

```ts
body: JSON.stringify({
  message,
  conversationId: conversationIdRef.current,
  clientMessageId,
}),
```

## 3.5 使用页面和 Network 测试

发送：

```text
帮我查无线耳机库存
```

`POST /api/agent/chat` Payload 必须有：

```json
{
  "message": "帮我查无线耳机库存",
  "conversationId": "UUID-A",
  "clientMessageId": "UUID-B"
}
```

然后在 Console 查询：

```js
const conversationId = '把 Network 中的 conversationId 粘贴到这里';

await fetch(`/api/agent/conversations/${conversationId}/messages`)
  .then((response) => response.json());
```

预期数据库消息顺序：

```text
1. role=user      content=帮我查无线耳机库存
2. role=assistant content=无线耳机当前库存……
```

## 第 3 天验收

- 页面正常显示回答。
- MySQL 有一条会话。
- MySQL 有两条消息。
- user 和 assistant 的 `turnId` 相同。
- 两条消息的 `clientMessageId` 相同。
- 没有把 Tool 原始结果保存为页面消息。

---

# 第 4 天：刷新页面后恢复聊天记录

## 今天目标

```text
发送两轮聊天
→ 刷新浏览器
→ 从 MySQL 查询消息
→ 恢复聊天气泡
```

## 4.1 让 conversationId 在刷新后保持

增加函数：

```ts
const ACTIVE_CONVERSATION_KEY = 'agent.activeConversationId';

function getOrCreateConversationId(): string {
  const existing = localStorage.getItem(ACTIVE_CONVERSATION_KEY);
  if (existing) return existing;

  const created = crypto.randomUUID();
  localStorage.setItem(ACTIVE_CONVERSATION_KEY, created);
  return created;
}
```

组件：

```ts
const conversationIdRef = useRef(getOrCreateConversationId());
```

清空聊天：

```ts
const nextId = crypto.randomUUID();
conversationIdRef.current = nextId;
localStorage.setItem(ACTIVE_CONVERSATION_KEY, nextId);
setMessages(createInitialMessages());
```

注意：`localStorage` 不是鉴权，只是让当前浏览器记住正在打开哪段会话。

## 4.2 页面加载时查询历史

```ts
useEffect(() => {
  const controller = new AbortController();

  void fetch(
    `/api/agent/conversations/${conversationIdRef.current}/messages`,
    { signal: controller.signal },
  )
    .then((response) => {
      if (response.status === 404) return [];
      if (!response.ok) throw new Error('加载聊天历史失败');
      return response.json();
    })
    .then((records) => {
      if (!Array.isArray(records) || records.length === 0) return;

      setMessages([
        createInitialMessages()[0],
        ...records
          .filter((record) => record.status === 'completed')
          .map((record) =>
            createMessage(record.role, record.content, record.model),
          ),
      ]);
    })
    .catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setError(error instanceof Error ? error.message : '加载历史失败');
    });

  return () => controller.abort();
}, []);
```

需要给历史响应定义 TypeScript 类型，不要把 `records` 永久留成 `any`。

## 4.3 页面测试

1. 点击清空，开始新会话。
2. 连续发送两轮库存查询。
3. 在 Network 记录 conversationId。
4. 刷新页面。
5. 页面应该重新显示 user 和 assistant 消息。
6. Network 应出现 `GET /api/agent/conversations/:id/messages`。
7. 再发送一条消息，conversationId 应保持不变。

## 4.4 重启 NestJS 测试

1. 页面完成两轮聊天。
2. 停止后端。
3. 重新执行 `pnpm start:dev`。
4. 刷新页面。

预期：页面历史仍然存在，因为它来自 MySQL。

但要知道：

```text
MemorySaver 已丢失
Map 业务状态也已丢失
```

所以“可见历史恢复”不等于“未完成任务可以从原节点继续”。后者属于后续持久化 Checkpointer 和 Redis 状态升级。

---

# 第 5 天：上下文工程先做减法

## 今天目标

今天不急着加摘要 Middleware，先保证没有重复上下文。

## 5.1 当前唯一规则

```text
MySQL 历史：给页面展示
MemorySaver Checkpoint：给 Agent 继续对话
Map：给商品缺失字段补全
```

不要这样做：

```ts
const history = await historyService.listMessages(conversationId);

await agent.invoke({
  messages: [
    ...history,
    { role: 'user', content: currentMessage },
  ],
});
```

因为相同 `thread_id` 的 Checkpointer 已经包含旧消息，再传 MySQL 全历史会产生重复。

## 5.2 页面怎样验证没有重复发送历史

连续聊天十轮，然后查看第十轮 `POST /api/agent/chat` Payload。

前端只应该发送：

```json
{
  "message": "当前这一句话",
  "conversationId": "同一个 ID",
  "clientMessageId": "本轮新 ID"
}
```

Payload 不应该带完整 `messages` 数组。

## 5.3 第一版上下文预算

先写成设计约束，不需要今天全部实现：

```text
页面历史：MySQL 分页，每页 50 条
业务状态：只保存结构化 entities/missingFields
Agent State：Checkpointer 管理
单次 Tool 结果：限制商品数量和字段
长对话：超过阈值后再实验摘要
```

## 5.4 什么时候再加 summarizationMiddleware

满足下面条件再加：

- 已经能观测实际消息数量或 Token；
- 长对话确实接近上下文限制或成本明显上升；
- 已有回归问题集验证摘要不会改变订单号、商品名等事实；
- 明白摘要只影响模型工作上下文，不删除 MySQL 原始消息。

现在直接添加摘要会让你无法判断错误来自多轮状态、持久化还是摘要内容。

## 第 5 天验收

你必须能解释：

```text
为什么页面刷新后能看到历史，模型却不一定能在服务重启后记得历史？
```

答案：页面读取 MySQL；模型状态还在 MemorySaver，重启后会丢失。

---

# 第 6 天：上线前必须补的生产边界

## 今天目标

今天先列清楚，不要求一天全部实现。

第一遍做出的版本仍然不能直接上线，因为历史接口只依赖 conversationId，没有验证用户归属。

## 6.1 JWT 与对象级权限

你的项目已经有：

```ts
JwtAuthGuard
CurrentUser('userId')
```

生产接口应该是：

```ts
@UseGuards(JwtAuthGuard)
@Get(':conversationId/messages')
listMessages(
  @CurrentUser('userId') userId: number,
  @Param('conversationId', ParseUUIDPipe) conversationId: string,
) {
  return this.history.listMessages(userId, conversationId);
}
```

Service 查询必须同时包含：

```ts
where: {
  id: conversationId,
  userId,
}
```

只校验 UUID 不等于权限校验。

当前 React Agent 页面还没有接入登录 Token，因此不要在没有登录流程时直接打开 Guard，否则页面会全部返回 401。正确顺序是：先接页面登录，再启用 Guard，再把 `userId` 改成数据库必填。

## 6.2 幂等

数据库唯一索引：

```text
conversationId + clientMessageId + role
```

重试时先查询是否已经存在完成的 assistant 消息：

- 存在：直接返回已保存结果；
- 只有 failed user：允许按同一 clientMessageId 重试；
- 正在 pending：返回“请求处理中”，不要并发调用两次模型。

前端 `loading` 只能改善体验，不能替代数据库幂等。

## 6.3 Map 换 Redis

第五章的接口保持：

```ts
getOrCreate()
save()
clear()
```

内部实现替换为 Redis，并设置 TTL。这样多台 NestJS 实例可以共享 `pendingIntent/entities/missingFields`。

## 6.4 MemorySaver 换持久化 Checkpointer

只有确认当前 Redis/数据库版本和对应 Saver 依赖兼容后再替换。

必须验证：

- NestJS 重启后相同 thread 能恢复；
- 不同 thread 隔离；
- Saver 初始化一次，并在应用关闭时释放连接；
- Saver 故障明确返回 503，不能静默退回本机内存造成状态分叉。

普通 `REDIS_URL` 存在不代表 Checkpointer 所需命令、模块和依赖一定兼容。

## 6.5 Migration

生产 Migration 至少包含：

- 创建会话表；
- 创建消息表；
- 外键和级联策略；
- `(conversation_id, id)` 分页索引；
- 幂等唯一索引；
- `user_id` 索引；
- 从 nullable userId 迁移为非空的方案。

## 6.6 隐私和删除

消息表不要保存：

- API Key、JWT、Cookie；
- 未脱敏密码；
- Tool 原始内部对象；
- 模型隐藏推理；
- 不必要的手机号和地址。

删除会话时需要考虑：

```text
MySQL 消息
MySQL 会话
Redis 业务状态
Checkpointer thread
```

## 第 6 天验收

画出上线前清单并标记：

```text
[ ] 页面已经登录
[ ] 所有历史查询带 userId
[ ] userId 数据库非空
[ ] clientMessageId 幂等
[ ] 同会话并发锁
[ ] Map 已换共享状态存储
[ ] MemorySaver 已换持久化 Saver
[ ] 生产 Migration 已验证
[ ] 日志和消息已脱敏
[ ] 删除流程覆盖所有状态
```

---

# 三、每天固定怎样测试

每天按这个顺序：

```text
1. pnpm exec tsc --noEmit --incremental false
2. pnpm run build
3. pnpm start:dev
4. 打开 /fe/agent
5. Network 检查 Payload 和 Response
6. 查询历史接口
7. 查看数据库行数
8. 写下本次 conversationId/clientMessageId/turnId
```

页面测试记录模板：

```text
conversationId：
clientMessageId：
turnId：

POST /chat 状态码：
GET /messages 返回数量：
user 消息状态：
assistant 消息状态：

刷新页面后是否恢复：
重启后端后是否恢复页面历史：
是否出现重复消息：
```

---

# 四、第一遍明确不做什么

先不做：

- 自定义 LangGraph `StateGraph`；
- Long-term Store 自动记忆用户偏好；
- RAG 检索历史消息；
- 自动把所有聊天做向量化；
- Human-in-the-loop；
- 多 Agent；
- 自动删除或写入真实订单；
- 一开始就接 summarizationMiddleware；
- 一开始就把 Map、MemorySaver、MySQL 全部替换。

这些不是没用，而是会掩盖第六章最核心的持久化主线。

---

# 五、什么时候可以进入第七章

第一遍达到下面条件即可进入第七章：

- [ ] 第 0 天类型检查和三个页面场景通过；
- [ ] MySQL 有会话表和消息表；
- [ ] 每轮聊天保存一条 user 和一条 assistant；
- [ ] 刷新页面可以恢复历史；
- [ ] NestJS 重启后页面历史仍然存在；
- [ ] 知道 MemorySaver 和 Map 重启后仍会丢；
- [ ] 没有把 MySQL 全历史重复传给 Checkpointer；
- [ ] 能说明生产上线前的鉴权、幂等、Redis 和 Migration 缺口。

第六章第一遍真正的完成标准是：

```text
页面历史可恢复
≠
Agent 执行状态已完全持久化
```

你能清楚解释这句话，就不会把 MySQL、Checkpointer 和 Redis 混在一起。
