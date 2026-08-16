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
| 客服任务状态 | 第 0～4 天用 Map，第 5 天迁移 Redis | `activeTask/recentReferences/version` |

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
| 第 5 天 | 生产级会话引用上下文 | Redis 恢复、按实体 ID 引用、多候选追问、并发不丢状态 |
| 第 6 天 | 生产安全与 Long-term Store | 通过鉴权、幂等、持久化、记忆隔离、删除和故障演练门槛 |

第 1～5 天完成主体实现；第 6 天完成上线门槛。对不准备上线的学习环境，可先把第 6 天作为检查清单；
只要声称“生产级”，则第 5、6 天的自动化测试和故障演练都必须完成。

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

# 第 5 天：生产级会话引用上下文

> 本节从这一版开始不再推荐 `lastReferencedProductName + 正则 + 进程内 Map`。
> 那种写法只能用于解释问题，不能作为上线方案。

## 第 5 天怎样学：一次只过一关

不要先把后面所有代码一次粘贴进项目。每一关固定按下面四个动作进行：

```text
1. 先说清本关只解决什么问题
2. 只修改本关列出的文件
3. 立即运行本关测试
4. 看到预期结果后才进入下一关
```

开工前先检查环境：

```bash
node --version
pnpm --version
docker --version
cd server
pnpm exec tsc --noEmit --incremental false
```

当前 `server/package.json` 要求 Node.js `>=20.19.0`。如果 `node --version` 还是 18，先切换到
Node.js 20.19.0 或更新的兼容版本。第 1～4、6 关不需要 Docker；第 5 关的真实 Redis
集成测试需要 Docker 或 CI 提供的独立 Redis。

全部实现拆成八关：

| 关卡 | 先理解什么 | 修改哪些代码 | 当关怎样验收 |
| --- | --- | --- | --- |
| 1 | 模型只识别“它”，不猜 ID | `agent.intent.ts` 和意图测试 | Zod 能区分显式实体、代词和序号选择 |
| 2 | 当前任务和已验证引用是两类状态 | `context/conversation-context.ts` 及测试 | 引用去重、限制 20 条、新引用在前 |
| 3 | Resolver 只做唯一/缺失/歧义判断 | `reference-resolver.ts` 及测试 | 单候选解析，多候选追问，不同实体不串 |
| 4 | 只有业务 Service 能产生可信 ID | `product.service.ts`、`product-customer.service.ts` 及测试 | 按 productId 查询，未找到时不保存引用 |
| 5 | Redis 是 Context Repository，不是聊天消息表 | Redis Provider、Repository 及集成测试 | 跨实例读取、TTL、CAS 并发通过 |
| 6 | Coordinator 按固定顺序编排 | `agent-customer.coordinator.ts` 及测试 | “它”使用 ID，“第二个”能继续澄清 |
| 7 | 幂等、锁和 CAS 解决不同问题 | Application Service、Controller、Module | 重试不重复调模型，同会话不乱序 |
| 8 | 页面、重启和多实例联调 | 完整链路 | 刷新、重启、多实例、清空对话均正常 |

下面先给出每一关的实际执行方法。后面 5.1～5.14 是对各个类的完整代码和
生产边界解释，在当关引用时再阅读，不用一次全读完。

### 第 1 关：让系统先看懂“它”是什么语言现象

这一关先不保存上下文，也不解析 `productId`。只解决一个更基础的问题：**第二句话到底是在说一个
新商品，还是在引用前面说过的商品？**

#### 1.1 先从你的失败案例理解数据为什么会丢

两句话分别送进意图识别器时，模型看到的输入是：

| 当前消息 | 当前消息明确出现的 `productName` | 它表达的引用 |
| --- | --- | --- |
| `Apple iPhone 15 Pro Max 库存多少？` | `Apple iPhone 15 Pro Max` | 没有引用 |
| `它库存多少？` | `null` | 代词 `它`，指向商品 |

所以第二轮 `productName: null` **本身是正确的**。如果强迫模型把它还原成
`Apple iPhone 15 Pro Max`，模型就同时承担了“语言识别”和“查找会话状态”两种职责：

```text
错误的数据流
当前消息 → 模型猜 productName/productId → 直接查业务数据

生产级数据流
当前消息 → 模型只标记 reference → Resolver 读取可信 Context
        → 得到 productId → ProductService 重新校验并查询
```

第一关只实现上图中的 `当前消息 → reference`，Resolver 是第三关，Redis 是第五关。

#### 1.2 先认识 `reference` 的四个字段

不要急着写代码，先看每个字段负责什么：

| 字段 | 示例 | 作用 | 明确不能做什么 |
| --- | --- | --- | --- |
| `kind` | `pronoun` | 说明是代词、指示词、省略还是没有引用 | 不能代表具体商品 |
| `entityType` | `product` | 限制到商品、分类或订单这一类实体 | 不能保存数据库 ID |
| `mention` | `它` | 保存用户本轮实际使用的表达，便于日志和排错 | 不能改写成历史商品名 |
| `selectionIndex` | `2` | 表示用户在澄清时选“第二个”，从 1 开始 | 不能当数组下标直接使用 |

四种 `kind` 的含义：

```text
none           Apple iPhone 15 Pro Max 库存多少
pronoun        它库存多少
demonstrative  这个商品多少钱 / 第二个多少钱
ellipsis       多少钱（在已有商品话题下省略了对象）
```

注意：`reference` 只是语言层的“指针描述”，此时系统仍然不知道它最终指向哪个 `productId`。

#### 1.3 第一个实现动作：给 Schema 增加引用契约

打开 `server/src/agent/agent.intent.ts`。在 `MissingFieldSchema` 后、
`CustomerIntentSchema` 前增加：

```ts
export const ReferenceEntityTypeSchema = z.enum([
  'product',
  'category',
  'order',
]);

export const ReferenceMentionSchema = z
  .object({
    kind: z.enum([
      'none',
      'pronoun',
      'demonstrative',
      'ellipsis',
    ]),
    entityType: ReferenceEntityTypeSchema.nullable(),
    mention: z.string().min(1).nullable(),
    // “第一个/第二个”从 1 开始；不是序号选择时必须为 null。
    selectionIndex: z.number().int().positive().nullable(),
  })
  .superRefine((value, context) => {
    if (value.kind === 'none') {
      if (
        value.entityType !== null ||
        value.mention !== null ||
        value.selectionIndex !== null
      ) {
        context.addIssue({
          code: 'custom',
          message: 'kind=none 时其他引用字段必须为 null',
        });
      }
      return;
    }

    if (value.mention === null) {
      context.addIssue({
        code: 'custom',
        path: ['mention'],
        message: '存在引用表达时 mention 不能为空',
      });
    }

    if (
      value.selectionIndex !== null &&
      value.kind !== 'demonstrative'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['selectionIndex'],
        message: '只有 demonstrative 可以携带 selectionIndex',
      });
    }
  });

export type ReferenceEntityType = z.infer<
  typeof ReferenceEntityTypeSchema
>;

export type ReferenceMention = z.infer<
  typeof ReferenceMentionSchema
>;
```

这里不只是声明 TypeScript 类型。Zod Schema 同时承担两件事：

1. `withStructuredOutput` 用它约束模型输出的形状；
2. `CustomerIntentSchema.parse()` 在运行时拒绝矛盾数据。

例如 `kind: 'none'` 却又返回 `mention: '它'` 就是矛盾的，`superRefine` 会拒绝它。

然后在现有 `CustomerIntentSchema` 的 `normalizedQuery` 后面增加：

```ts
reference: ReferenceMentionSchema.describe(
  '当前消息中的引用表达，只描述语言现象，不包含业务数据库 ID',
),
```

修改后的尾部类型仍然是：

```ts
export type CustomerIntent = z.infer<typeof CustomerIntentSchema>;
```

因此不用手写第二份 `CustomerIntent` interface。以后 Schema 增减字段，TypeScript 类型会自动跟着变化。

#### 1.4 第二个实现动作：教意图模型怎样填写新字段

Schema 只说明“格式是什么”，不会完整表达“业务上应该怎样判断”。打开
`server/src/agent/agent.intent.service.ts`，在 system message 数组中补充：

```ts
'只提取用户当前消息明确出现的信息，不得用历史猜测填写 entities。',
'“它”属于 pronoun，“这个商品”属于 demonstrative。',
'在已有语言上下文中省略对象，例如只说“多少钱”，可标记 ellipsis。',
'用户说“第一个/第二个”时填写 selectionIndex，否则为 null。',
'当前消息明确写出商品名或订单号时，reference.kind 返回 none。',
'reference 只描述语言现象，不得生成 productId、orderId。',
```

为什么提示词和 Schema 都要写？

```text
提示词：尽量让模型第一次就填对
Schema：模型仍然填错时，阻止错误数据进入后面的业务层
```

第一关调用模型时只传当前 `message`，所以对 `它库存多少`，正确结果是：

```json
{
  "intent": "inventory_query",
  "entities": {
    "productName": null
  },
  "missingFields": ["productName"],
  "reference": {
    "kind": "pronoun",
    "entityType": "product",
    "mention": "它",
    "selectionIndex": null
  }
}
```

这里的 `missingFields` 暂时仍可包含 `productName`。第三关 Resolver 成功解析引用后才会补出可用实体；
第一关不要提前假装这个字段已经满足。

#### 1.5 第三个实现动作：迁移旧 Fixture，先理解编译错误

一旦 `reference` 成为必填字段，旧测试里的 `CustomerIntent` 对象会报错。这不是新功能坏了，
而是编译器在列出“哪些调用方还在使用旧契约”。当前项目至少要检查：

```text
server/src/agent/agent.intent.spec.ts
server/src/agent/agent.service.spec.ts
server/src/agent/product-customer.service.spec.ts
```

在测试文件顶部放一个默认对象，可减少重复：

```ts
const noReference = {
  kind: 'none' as const,
  entityType: null,
  mention: null,
  selectionIndex: null,
};
```

所有代表“本轮明确说出实体”的旧 Fixture 增加：

```ts
reference: noReference,
```

现在先运行一次类型检查：

```bash
cd server
pnpm exec tsc --noEmit --incremental false
```

这一小步的目的不是测试模型，而是利用编译器找出漏迁移的 Fixture。逐个修完，直到 0 errors；
不要用 `as CustomerIntent` 或 `as any` 把错误压掉，否则新字段在测试里仍然没有被真正覆盖。

#### 1.6 现在才写 Schema 单元测试：每条测试证明什么

修改 `server/src/agent/agent.intent.spec.ts`。先把原有三个测试对象都补上
`reference: noReference`，再增加下面四类测试。

测试 A：明确商品名不是历史引用。

```ts
it('显式商品名不标记历史引用', () => {
  const parsed = CustomerIntentSchema.parse({
    intent: 'inventory_query',
    confidence: 0.95,
    entities: {
      ...emptyEntities,
      productName: 'Apple iPhone 15 Pro Max',
    },
    missingFields: [],
    normalizedQuery: 'Apple iPhone 15 Pro Max 库存多少',
    reference: noReference,
  });

  expect(parsed.entities.productName).toBe(
    'Apple iPhone 15 Pro Max',
  );
  expect(parsed.reference.kind).toBe('none');
});
```

它证明“显式新实体优先”，不证明模型真的能识别所有品牌名。

测试 B：代词和实体名保持分离。

```ts
it('“它”只标记为 product 引用，不伪造商品名或 ID', () => {
  const parsed = CustomerIntentSchema.parse({
    intent: 'inventory_query',
    confidence: 0.95,
    entities: emptyEntities,
    missingFields: ['productName'],
    normalizedQuery: '它库存多少',
    reference: {
      kind: 'pronoun',
      entityType: 'product',
      mention: '它',
      selectionIndex: null,
    },
  });

  expect(parsed.entities.productName).toBeNull();
  expect(parsed.reference.entityType).toBe('product');
  expect('productId' in parsed.reference).toBe(false);
});
```

它证明输出契约里没有让模型创建 `productId` 的入口。

测试 C：序号采用人类习惯的 1-based 数字。

```ts
it('“第二个”保存为从 1 开始的序号', () => {
  const parsed = CustomerIntentSchema.parse({
    intent: 'price_query',
    confidence: 0.9,
    entities: emptyEntities,
    missingFields: ['productName'],
    normalizedQuery: '第二个多少钱',
    reference: {
      kind: 'demonstrative',
      entityType: 'product',
      mention: '第二个',
      selectionIndex: 2,
    },
  });

  expect(parsed.reference.selectionIndex).toBe(2);
});
```

第三关真正访问数组时才做 `selectionIndex - 1`，不要在意图层偷偷转换。

测试 D：矛盾的引用必须被拒绝。

```ts
it('拒绝 kind=none 却携带 mention 的矛盾结果', () => {
  const parsed = CustomerIntentSchema.safeParse({
    intent: 'general_chat',
    confidence: 0.9,
    entities: emptyEntities,
    missingFields: [],
    normalizedQuery: '你好',
    reference: {
      ...noReference,
      mention: '它',
    },
  });

  expect(parsed.success).toBe(false);
});
```

现在运行确定性测试：

```bash
cd server
pnpm test -- --runInBand agent/agent.intent.spec.ts
pnpm exec tsc --noEmit --incremental false
```

预期看到原有 3 个测试加新增 4 个测试全部通过，并且 TypeScript 为 0 errors。

#### 1.7 最后做模型接口测试，它和单元测试验证的不是一件事

Schema 单测没有调用 LLM，所以还要启动后端：

```bash
cd server
pnpm start:dev
```

另开终端分别请求 `/api/agent/intent`。DTO 当前要求三个字段，所以不能只发 `message`：

```bash
curl -X POST http://localhost:3000/api/agent/intent \
  -H 'Content-Type: application/json' \
  -d '{
    "message":"Apple iPhone 15 Pro Max库存多少？",
    "conversationId":"11111111-1111-4111-8111-111111111111",
    "clientMessageId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  }'

curl -X POST http://localhost:3000/api/agent/intent \
  -H 'Content-Type: application/json' \
  -d '{
    "message":"它库存多少？",
    "conversationId":"11111111-1111-4111-8111-111111111111",
    "clientMessageId":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
  }'
```

这一步只检查：第一条有 `productName + reference.kind=none`；第二条有
`productName=null + reference.kind=pronoun`。此时第二条**还不能回答 Apple 库存**，因为 Context 和
Resolver 尚未实现。这不是失败，而是第一关刻意划定的边界。

第一关完成标准：

```text
[ ] Schema 能表达 none/pronoun/demonstrative/ellipsis
[ ] Schema 会拒绝自相矛盾的引用
[ ] 所有旧 CustomerIntent Fixture 已迁移
[ ] 单测通过且 TypeScript 0 errors
[ ] 接口实测中“它”不会被伪造成 productName 或 productId
```

### 第 2 关：建立 Context 的状态规则，但暂时不连接 Redis

第一关只能得出“这句话在引用某个商品”。第二关要定义系统可以拿什么历史状态来解析这个引用。
这一关仍然不接 Redis，先把状态的数据结构和变化规则写成纯函数。

#### 2.1 先区分聊天消息、当前任务和已验证引用

这三个概念很容易混在一起：

| 数据 | 例子 | 生命周期 | 最终存放位置 |
| --- | --- | --- | --- |
| 聊天消息 | 用户原话、助手回复 | 长期审计/页面历史 | MySQL `agent_message` |
| `activeTask` | 正在等订单号、正在等用户选第二个 | 任务完成就清空 | Redis Context |
| `recentReferences` | 真实商品 ID 1001 + 标准名称 | 会话内继续保留，受 TTL 和数量限制 | Redis Context |

用你的对话看状态变化：

```text
Turn 1 用户：Apple iPhone 15 Pro Max库存多少？
       ProductService 查到真实商品 id=1001
       recentReferences = [product:1001]
       activeTask = null（库存查询已经完成）

Turn 2 用户：它库存多少？
       第一关得到 reference=pronoun/product
       Resolver 从 recentReferences 找到 product:1001
       再由 ProductService.findOne(1001) 查询
```

旧代码的问题是任务完成时把整个 conversation state 删除了。生产方案只能清空
`activeTask`，不能顺手删除 `recentReferences`，否则第二轮永远没有解析来源。

#### 2.2 理解 Context 每个字段为什么存在

一个 Context 大致长这样：

```json
{
  "schemaVersion": 1,
  "userId": 7,
  "conversationId": "11111111-1111-4111-8111-111111111111",
  "activeTask": null,
  "recentReferences": [
    {
      "entityType": "product",
      "entityId": "1001",
      "displayName": "Apple iPhone 15 Pro Max",
      "sourceTurnId": "22222222-2222-4222-8222-222222222222",
      "verifiedBy": "product_service",
      "verifiedAt": "2026-08-13T02:00:00.000Z"
    }
  ],
  "version": 3,
  "updatedAt": "2026-08-13T02:00:00.000Z"
}
```

字段职责：

| 字段 | 为什么必须有 |
| --- | --- |
| `schemaVersion` | 以后字段升级时识别 Redis 中的旧数据 |
| `userId + conversationId` | 防止只凭会话 UUID 读到其他用户的 Context |
| `activeTask` | 保存未完成任务和澄清候选，不和历史引用混用 |
| `recentReferences` | 保存业务 Service 已验证过的实体 |
| `sourceTurnId` | 多候选时知道哪些实体来自同一轮回答 |
| `verifiedBy` | 证明 ID 来自哪个可信业务 Service，而不是模型 |
| `version` | 第五关用 CAS 阻止两个请求互相覆盖 |
| `updatedAt` | TTL、排错和观测需要知道最后更新时间 |

`entityId` 统一用字符串，是为了同时容纳数字商品主键、订单号式主键和将来的 UUID；但它只有和
`entityType` 组合才唯一，所以去重键必须是 `product:1001`，不能只用 `1001`。

#### 2.3 第一个实现动作：新建 Context Schema

先创建目录：

```bash
cd server
mkdir -p src/agent/context
```

再新建 `server/src/agent/context/conversation-context.ts`。先写 import 和四层 Schema：

```ts
import { z } from 'zod';
import {
  CustomerEntitiesSchema,
  CustomerIntentNameSchema,
  MissingFieldSchema,
  ReferenceEntityTypeSchema,
} from '../agent.intent';

// 第 1 层：澄清任务只需固定候选的类型和主键。
export const ReferencePointerSchema = z.object({
  entityType: ReferenceEntityTypeSchema,
  entityId: z.string().min(1),
});

// 第 2 层：尚未完成的任务。
export const ActiveTaskSchema = z.object({
  intent: CustomerIntentNameSchema,
  status: z.enum(['collecting_fields', 'processing']),
  entities: CustomerEntitiesSchema,
  missingFields: z.array(MissingFieldSchema),
  referenceCandidates: z.array(ReferencePointerSchema).max(20),
  startedAt: z.string().datetime(),
});

// 第 3 层：只能由业务 Service 创建的可信实体引用。
export const VerifiedReferenceSchema = z.object({
  entityType: ReferenceEntityTypeSchema,
  entityId: z.string().min(1),
  displayName: z.string().min(1).max(200),
  sourceTurnId: z.string().uuid(),
  verifiedBy: z.enum([
    'product_service',
    'category_service',
    'order_service',
  ]),
  verifiedAt: z.string().datetime(),
});

export type ConversationScope = {
  userId: number;
  conversationId: string;
};

// 第 4 层：一个用户的一条会话所拥有的完整短期业务 Context。
export const ConversationContextSchema = z.object({
  schemaVersion: z.literal(1),
  userId: z.number().int().positive(),
  conversationId: z.string().uuid(),
  activeTask: ActiveTaskSchema.nullable(),
  recentReferences: z.array(VerifiedReferenceSchema).max(20),
  version: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
});

export type ActiveTask = z.infer<typeof ActiveTaskSchema>;
export type VerifiedReference = z.infer<
  typeof VerifiedReferenceSchema
>;
export type ConversationContext = z.infer<
  typeof ConversationContextSchema
>;
```

阅读时按下面四层理解，不要把它当成一大坨类型：

```text
第 1 层 ReferencePointerSchema
→ 只保存“类型 + ID”，用于 activeTask 固定澄清候选

第 2 层 ActiveTaskSchema
→ 保存未完成意图、已收集字段、缺失字段、候选

第 3 层 VerifiedReferenceSchema
→ 保存业务 Service 验证后的实体及来源

第 4 层 ConversationContextSchema
→ 把用户、会话、任务、引用、版本组合起来
```

把 5.5 中 `createConversationContext` 调整为可注入时间，测试才不依赖当前时钟：

```ts
export function createConversationContext(
  scope: ConversationScope,
  now = new Date().toISOString(),
): ConversationContext {
  return {
    schemaVersion: 1,
    userId: scope.userId,
    conversationId: scope.conversationId,
    activeTask: null,
    recentReferences: [],
    version: 0,
    updatedAt: now,
  };
}
```

这个函数只建立默认值，不访问 Redis，也不修改传入参数。`now` 在生产中可以省略；单测传固定时间，
就不会出现“偶尔差 1 毫秒”的测试。

#### 2.4 第二个实现动作：写清引用合并规则

同一个商品可能在多轮被反复提到，不能无限追加。`prependVerifiedReferences` 的规则顺序是：

```text
新引用放前面 → 按 entityType:entityId 去重 → 最多取前 20 条
```

代码：

```ts
export function prependVerifiedReferences(
  current: VerifiedReference[],
  incoming: VerifiedReference[],
): VerifiedReference[] {
  const next = [...incoming, ...current];
  const seen = new Set<string>();

  return next
    .filter((reference) => {
      const key = `${reference.entityType}:${reference.entityId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);
}
```

为什么是 `[...incoming, ...current]`？因为 `filter` 保留第一次出现的值。新查询得到的名称、
验证时间和来源 Turn 应覆盖旧快照，所以新值必须排在旧值前面。

为什么返回新数组？这是纯函数：输入数组不被修改。第五关 Repository 重试 CAS 时，纯函数可以安全地
用同一输入重新计算，不会因为上一次尝试已经 `push` 过而产生重复数据。

#### 2.5 第三个实现动作：明确“任务完成”不是“清空会话”

在同一个文件增加一个非常小的纯函数：

```ts
export function clearActiveTask(
  current: ConversationContext,
): ConversationContext {
  return {
    ...current,
    activeTask: null,
  };
}
```

它故意不清空 `recentReferences`，也不自己增加 `version`。原因是：

```text
状态变化规则由纯函数负责
version + updatedAt + 原子写入由第五关 Repository 负责
```

如果每个业务纯函数都自己改版本号，CAS 重试时很容易多加一次。

#### 2.6 先做一次静态检查，再进入测试

```bash
cd server
pnpm exec tsc --noEmit --incremental false
```

这里检查的是：Zod 推导类型是否正确、import 路径是否正确、`ActiveTask` 使用的字段是否和第一关一致。
它还没有证明去重顺序和数量上限，所以接下来才需要单元测试。

#### 2.7 建立测试数据工厂，避免每条测试复制十个字段

新建 `server/src/agent/context/conversation-context.spec.ts`：

```ts
import { describe, expect, it } from '@jest/globals';
import {
  ConversationContextSchema,
  clearActiveTask,
  createConversationContext,
  prependVerifiedReferences,
  type VerifiedReference,
} from './conversation-context';

const conversationId =
  '11111111-1111-4111-8111-111111111111';
const turnA = '22222222-2222-4222-8222-222222222222';
const turnB = '33333333-3333-4333-8333-333333333333';
const fixedNow = '2026-08-13T02:00:00.000Z';

function productReference(
  entityId: string,
  displayName: string,
  sourceTurnId = turnA,
): VerifiedReference {
  return {
    entityType: 'product',
    entityId,
    displayName,
    sourceTurnId,
    verifiedBy: 'product_service',
    verifiedAt: fixedNow,
  };
}
```

工厂的意义不是少写代码而已。它让每条测试只突出自己关心的变量，例如“同 ID 不同名称”，
其他合法字段统一由工厂提供。

#### 2.8 按状态规则逐条测试，而不是只看覆盖率

测试 A：新会话的身份和默认值正确。

```ts
it('创建属于当前用户和会话的初始 Context', () => {
  const context = createConversationContext(
    { userId: 7, conversationId },
    fixedNow,
  );

  expect(context).toMatchObject({
    schemaVersion: 1,
    userId: 7,
    conversationId,
    activeTask: null,
    recentReferences: [],
    version: 0,
    updatedAt: fixedNow,
  });
  expect(() => ConversationContextSchema.parse(context)).not.toThrow();
});
```

这条测试证明默认对象能通过运行时 Schema，不证明 Redis 能保存它。

测试 B：新快照覆盖相同实体的旧快照。

```ts
it('新引用排在前面并覆盖相同实体的旧快照', () => {
  const oldApple = productReference('1001', 'Apple 旧名', turnA);
  const newApple = productReference(
    '1001',
    'Apple iPhone 15 Pro Max',
    turnB,
  );

  const result = prependVerifiedReferences(
    [oldApple],
    [newApple],
  );

  expect(result).toHaveLength(1);
  expect(result[0]).toEqual(newApple);
});
```

测试 C：相同 ID、不同实体类型不能误删。这个测试防止以后订单 `1001` 把商品 `1001` 覆盖掉。

```ts
it('去重键同时包含 entityType 和 entityId', () => {
  const product = productReference('1001', 'iPhone');
  const order: VerifiedReference = {
    entityType: 'order',
    entityId: '1001',
    displayName: '订单 1001',
    sourceTurnId: turnB,
    verifiedBy: 'order_service',
    verifiedAt: fixedNow,
  };

  const result = prependVerifiedReferences([], [product, order]);

  expect(result).toHaveLength(2);
});
```

测试 D：只保留最新 20 条，并验证保留的是哪 20 条，不要只测长度。

```ts
it('最多保留最靠前的 20 个已验证引用', () => {
  const incoming = Array.from({ length: 25 }, (_, index) =>
    productReference(String(index), `product-${index}`),
  );

  const result = prependVerifiedReferences([], incoming);

  expect(result).toHaveLength(20);
  expect(result.map((item) => item.entityId)).toEqual(
    Array.from({ length: 20 }, (_, index) => String(index)),
  );
});
```

如果只断言 length=20，即使函数错误地保留了最旧 20 条也会通过，所以要同时断言 ID 顺序。

测试 E：清空任务时引用必须继续存在。

```ts
it('完成任务只清空 activeTask，不删除 recentReferences', () => {
  const reference = productReference('1001', 'iPhone');
  const context = createConversationContext(
    { userId: 7, conversationId },
    fixedNow,
  );
  const withTask = {
    ...context,
    activeTask: {
      intent: 'inventory_query' as const,
      status: 'processing' as const,
      entities: {
        productName: 'iPhone',
        categoryName: null,
        orderNo: null,
        budgetMax: null,
        quantity: null,
        reason: null,
      },
      missingFields: [],
      referenceCandidates: [],
      startedAt: fixedNow,
    },
    recentReferences: [reference],
  };

  const result = clearActiveTask(withTask);

  expect(result.activeTask).toBeNull();
  expect(result.recentReferences).toEqual([reference]);
});
```

测试 F：纯函数不能偷偷修改输入数组。

```ts
it('合并引用时不修改输入数组', () => {
  const current = [productReference('1001', 'iPhone')];
  const snapshot = structuredClone(current);

  prependVerifiedReferences(
    current,
    [productReference('1002', 'MacBook')],
  );

  expect(current).toEqual(snapshot);
});
```

#### 2.9 运行第二关测试，并理解它没有测什么

```bash
cd server
pnpm test -- --runInBand agent/context/conversation-context.spec.ts
pnpm exec tsc --noEmit --incremental false
```

预期 6 个 Context 测试全部通过。它们已经证明：

```text
✓ 初始状态合法
✓ 新引用优先且同实体去重
✓ 不同实体类型不会串
✓ 引用最多 20 条且顺序正确
✓ 任务完成不丢引用
✓ 合并函数不修改输入
```

它们还**没有**证明：

```text
✗ “它”最终能找到唯一商品（第三关 Resolver）
✗ productId 来自真实数据库（第四关业务 Service）
✗ 重启后 Context 还存在（第五关 Redis 集成测试）
✗ 两个并发请求不会覆盖（第五、七关 CAS/锁测试）
```

第二关完成标准：

```text
[ ] 能用自己的话区分 activeTask 和 recentReferences
[ ] Context Schema 四层结构已经建立
[ ] create/merge/clear 都是无网络的纯函数
[ ] 6 个状态规则测试通过
[ ] TypeScript 0 errors
```

### 第 3 关：实现 Resolver，先用内存对象测试

先讲清三个点：

1. Resolver 不查数据库，也不保存 Redis。
2. 它只把“当前意图 + 引用表达 + 候选引用”转成确定结果。
3. 无法唯一确定时必须返回 `ambiguous`，不能随便取第一个。

实现：按 5.8 新建 `reference-resolver.ts`、`task-continuation-resolver.ts`，
然后先写下列六个测试：

```text
1. 明确 productName → not_needed
2. “它” + 最近 Turn 只有一个 product → resolved
3. “它” + 最近 Turn 有两个 product → ambiguous
4. 库存问题 + 只有 order 引用 → missing product
5. 没有任何引用 → missing
6. activeTask 有两个候选 + selectionIndex=2 → 选中第二个
```

测试命令：

```bash
cd server
pnpm test -- --runInBand agent/context/reference-resolver.spec.ts
pnpm test -- --runInBand agent/context/task-continuation-resolver.spec.ts
```

预期：六种分支都不调用模型、ProductService 或 Redis，结果可以完全重复。

### 第 4 关：让 ProductCustomerService 返回结构化结果

先讲清四个点：

1. 查询词“Apple”不等于数据库商品实体。
2. 只有 `ProductService` 真正返回的商品才能建立 `VerifiedReference`。
3. 第二轮已有 productId 时应按主键查询，不再用商品名模糊搜索。
4. 每次按 ID 查仍要验证上架状态；Redis 中的旧 ID 不能绕过业务规则。

当前 `ProductService.findOne(id)` 已经校验 `status === 1`，可以直接作为按已验证 ID 重查的入口，
无需再虚构一个功能重复的方法。按 5.9 把 `reply()` 改为返回：

```ts
{
  reply: string;
  references: VerifiedReference[];
}
```

并修改 `product-customer.service.spec.ts`，至少测试：

```text
1. 名称查询成功→ references 包含真实 product.id/name/turnId
2. resolvedReference 存在→调用 ProductService.findOne(id)
3. ProductService.findOne 返回下架/不存在错误→不创建新引用
4. 模糊搜索返回多商品→每个引用使用相同 sourceTurnId
```

测试：

```bash
cd server
pnpm test -- --runInBand agent/product-customer.service.spec.ts
```

预期：断言的是结构化 `references`，不只是对一段中文回复做字符串匹配。

### 第 5～8 关：已拆到独立实施文档

从 Redis Repository 开始的生产落地步骤已经独立出来：

[第 5～8 关：生产级会话 Context 落地与验收](./LESSON_06_GATE_05_TO_08_PRODUCTION_CONTEXT.md)

先完成当前文档的第 1～4 关，再进入新文档。后面的 5.6～5.14 保留为完整代码参考，
新文档会按实现顺序指向这些章节。

## 八关全部完成后的结果

今天完成的不是“记住一个商品名”，而是一套可扩展的会话引用机制：

```text
明确商品查询
→ 业务 Service 返回数据库验证过的 productId/canonicalName
→ Redis 保存当前 conversation 的已验证引用

“它库存多少？”
→ ReferenceResolver 解析最近引用
→ 唯一候选时使用 productId 查询
→ 多个候选时追问，不允许猜测

NestJS 重启或切换实例
→ 相同 conversationId 仍可从 Redis 恢复任务和引用上下文
```

至少支持：

- 商品、分类、订单等不同实体类型；
- 一个回答中出现多个候选实体；
- 明确新实体覆盖旧引用；
- 代词、指示词和省略表达；
- Redis TTL、Schema 校验和乐观并发控制；
- 幂等重试及同会话并发保护；
- 只保存业务 Service 验证过的实体 ID。

## 5.1 先定义生产不变量

后面的代码必须始终满足：

```text
1. 模型只负责识别意图、显式实体和引用表达，不产生可信业务 ID。
2. ProductService/OrderService 等业务 Service 才能产生 verified reference。
3. 明确输入的新实体永远优先于历史引用。
4. 多个引用候选无法唯一确定时必须追问。
5. 当前任务和最近引用是两种状态，完成任务不能删除最近引用。
6. conversation context 放 Redis；用户跨会话偏好才放 Long-term Store。
7. 原始聊天消息放 MySQL，不重复塞进已经使用 Checkpointer 的 Agent。
8. 同一 conversation 的并发更新不能互相覆盖。
```

## 5.2 为什么不再使用单字段方案

不要继续扩展成：

```ts
lastReferencedProductName: string | null;
lastReferencedOrderNo: string | null;
lastReferencedCategoryName: string | null;
```

也不要把下面的正则当成唯一解析器：

```ts
/(它|这个商品|那个商品|刚才的商品)/
```

它存在这些生产问题：

- 保存的是模型提取词，不是数据库验证过的实体；
- 每增加一种实体就要修改整个状态对象和路由；
- 一个回答返回多个商品时无法表达歧义；
- 不能记录引用来自哪个 Turn；
- 不能区分“明确输入”“历史引用”和“模型猜测”；
- Map 在重启、多实例和滚动发布时会丢失；
- 并发请求可能覆盖彼此的状态。

正确方向是“类型化引用列表 + 可插拔解析器 + Redis Context Repository”。

## 5.3 建议的文件结构

```text
server/src/agent/
├── context/
│   ├── conversation-context.ts
│   ├── conversation-context.repository.ts
│   ├── redis-conversation-context.repository.ts
│   ├── task-continuation-resolver.ts
│   ├── reference-resolver.ts
│   └── reference-resolver.spec.ts
├── conversation/
│   └── agent.conversation.ts
├── persistence/
│   └── agent-chat-application.service.ts
├── agent.intent.ts
├── agent.intent.service.ts
├── agent.service.ts
└── product-customer.service.ts
```

职责：

```text
agent.intent
→ 识别当前消息表达了什么，不读取 Redis，不查询数据库

ReferenceResolver
→ 根据结构化引用表达和已验证引用列表做唯一性判断

ProductCustomerService
→ 查询数据库，返回回复和 verified references

ConversationContextRepository
→ 原子保存 activeTask/recentReferences/version

AgentChatApplicationService
→ 幂等、同会话串行化、历史生命周期和总编排
```

## 5.4 让意图结果显式描述引用表达

修改 `agent.intent.ts`：

```ts
export const ReferenceEntityTypeSchema = z.enum([
  'product',
  'category',
  'order',
]);

export const ReferenceMentionSchema = z
  .object({
    kind: z.enum([
      'none',
      'pronoun',
      'demonstrative',
      'ellipsis',
    ]),
    entityType: ReferenceEntityTypeSchema.nullable(),
    mention: z.string().min(1).nullable(),
    // “第一个/第二个”这类澄清回复，从 1 开始。
    selectionIndex: z.number().int().positive().nullable(),
  })
  .superRefine((value, context) => {
    if (value.kind === 'none') {
      if (
        value.entityType !== null ||
        value.mention !== null ||
        value.selectionIndex !== null
      ) {
        context.addIssue({
          code: 'custom',
          message: 'kind=none 时其他引用字段必须为 null',
        });
      }
      return;
    }

    if (value.mention === null) {
      context.addIssue({
        code: 'custom',
        path: ['mention'],
        message: '存在引用表达时 mention 不能为空',
      });
    }

    if (
      value.selectionIndex !== null &&
      value.kind !== 'demonstrative'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['selectionIndex'],
        message: '只有 demonstrative 可以携带 selectionIndex',
      });
    }
  });

export type ReferenceEntityType = z.infer<
  typeof ReferenceEntityTypeSchema
>;

export type ReferenceMention = z.infer<
  typeof ReferenceMentionSchema
>;

export const CustomerIntentSchema = z.object({
  intent: CustomerIntentNameSchema,
  confidence: z.number().min(0).max(1),
  entities: CustomerEntitiesSchema,
  missingFields: z.array(MissingFieldSchema),
  normalizedQuery: z.string(),

  // 只描述当前消息是否在引用旧对象，不负责决定具体 ID。
  reference: ReferenceMentionSchema,
});
```

`AgentIntentService` 的 system message 补充：

```ts
[
  '只提取用户当前消息明确出现的信息，不得从猜测中填写实体。',
  '“它”属于 pronoun，“这个商品”属于 demonstrative。',
  '在已有语言上下文中省略对象，例如只说“多少钱”，可标记 ellipsis。',
  '用户说“第一个/第二个”时填写 selectionIndex，否则为 null。',
  '当前消息明确写出商品名或订单号时 reference.kind 返回 none。',
  'reference 只描述语言现象，不得生成 productId、orderId。',
]
```

所有测试 Fixture 都必须增加 `reference`：

```ts
reference: {
  kind: 'none',
  entityType: null,
  mention: null,
  selectionIndex: null,
}
```

“它库存多少”的 Fixture：

```ts
reference: {
  kind: 'pronoun',
  entityType: 'product',
  mention: '它',
  selectionIndex: null,
}
```

不要让模型直接返回 `resolvedProductId`。模型没有资格创建可信数据库主键。

## 5.5 定义任务状态和已验证引用

新建 `context/conversation-context.ts`：

```ts
import { z } from 'zod';
import {
  CustomerEntitiesSchema,
  CustomerIntentNameSchema,
  MissingFieldSchema,
  ReferenceEntityTypeSchema,
} from '../agent.intent';

export const ReferencePointerSchema = z.object({
  entityType: ReferenceEntityTypeSchema,
  entityId: z.string().min(1),
});

export const ActiveTaskSchema = z.object({
  intent: CustomerIntentNameSchema,
  status: z.enum(['collecting_fields', 'processing']),
  entities: CustomerEntitiesSchema,
  missingFields: z.array(MissingFieldSchema),
  // 正在等待用户从多个已验证候选中澄清时使用。
  referenceCandidates: z.array(ReferencePointerSchema).max(20),
  startedAt: z.string().datetime(),
});

export const VerifiedReferenceSchema = z.object({
  entityType: ReferenceEntityTypeSchema,
  entityId: z.string().min(1),
  displayName: z.string().min(1).max(200),
  sourceTurnId: z.string().uuid(),
  verifiedBy: z.enum([
    'product_service',
    'category_service',
    'order_service',
  ]),
  verifiedAt: z.string().datetime(),
});

export type ConversationScope = {
  userId: number;
  conversationId: string;
};

export const ConversationContextSchema = z.object({
  schemaVersion: z.literal(1),
  userId: z.number().int().positive(),
  conversationId: z.string().uuid(),
  activeTask: ActiveTaskSchema.nullable(),
  recentReferences: z.array(VerifiedReferenceSchema).max(20),
  version: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
});

export type ActiveTask = z.infer<typeof ActiveTaskSchema>;
export type VerifiedReference = z.infer<
  typeof VerifiedReferenceSchema
>;
export type ConversationContext = z.infer<
  typeof ConversationContextSchema
>;

export function createConversationContext(
  scope: ConversationScope,
  now = new Date().toISOString(),
): ConversationContext {
  return {
    schemaVersion: 1,
    userId: scope.userId,
    conversationId: scope.conversationId,
    activeTask: null,
    recentReferences: [],
    version: 0,
    updatedAt: now,
  };
}

export function prependVerifiedReferences(
  current: VerifiedReference[],
  incoming: VerifiedReference[],
): VerifiedReference[] {
  const next = [...incoming, ...current];
  const seen = new Set<string>();

  return next
    .filter((reference) => {
      const key =
        `${reference.entityType}:${reference.entityId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);
}

export function clearActiveTask(
  current: ConversationContext,
): ConversationContext {
  return {
    ...current,
    activeTask: null,
  };
}
```

关键点：

- `activeTask` 只表示尚未结束的补字段或处理中任务；
- `referenceCandidates` 固定本次澄清的候选集，避免下一 Turn 被其他新引用改变；
- 已完成任务不以 `completed` 长期留在 `activeTask`；
- `recentReferences` 保存业务 Service 验证过的实体；
- `entityId` 用字符串统一承载数字 ID、订单 ID 等不同主键；
- `userId` 必须来自 JWT，并在读写 Redis 前校验会话归属；
- 引用列表有数量上限，不能无限增长；
- `schemaVersion` 用于以后迁移 Redis 中的旧数据；
- `version` 用于防止并发覆盖；
- `clearActiveTask` 不修改 `recentReferences`，版本号和更新时间由 Repository 原子更新。

## 5.6 Repository 接口必须是异步且支持原子更新

新建 `context/conversation-context.repository.ts`：

```ts
import type {
  ConversationContext,
  ConversationScope,
} from './conversation-context';

export type ContextMutator = (
  current: ConversationContext,
) => ConversationContext;

export abstract class ConversationContextRepository {
  abstract get(
    scope: ConversationScope,
  ): Promise<ConversationContext>;

  /**
   * mutator 可能因为 CAS 冲突执行多次，因此必须是纯函数：
   * 不得在里面调用模型、数据库写入、发消息或产生随机 ID。
   */
  abstract update(
    scope: ConversationScope,
    mutator: ContextMutator,
  ): Promise<ConversationContext>;

  abstract delete(scope: ConversationScope): Promise<void>;
}
```

不要保留同步的 `Map.getOrCreate()/save()` 接口。生产 Redis、数据库和远程状态仓库都是异步 I/O，
继续伪装成同步接口会让调用层设计错误。

## 5.7 Redis Repository 使用 TTL、Zod 和 CAS

下面示例使用当前项目已有的 `redis` 包。Redis Client 应由单例 Provider 创建、连接，并在
`onModuleDestroy` 中关闭；不要在 Repository 中每次请求重新连接。

新建 `context/redis-conversation-context.repository.ts`：

```ts
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { RedisClientType } from 'redis';
import {
  ConversationContext,
  ConversationContextSchema,
  ConversationScope,
  createConversationContext,
} from './conversation-context';
import {
  ContextMutator,
  ConversationContextRepository,
} from './conversation-context.repository';

export const AGENT_REDIS = Symbol('AGENT_REDIS');

const CONTEXT_TTL_SECONDS = 30 * 60;
const MAX_CAS_RETRIES = 5;

const COMPARE_AND_SET_CONTEXT = `
local raw = redis.call('GET', KEYS[1])
local currentVersion = 0

if raw then
  local decoded = cjson.decode(raw)
  currentVersion = tonumber(decoded.version)
end

if currentVersion ~= tonumber(ARGV[1]) then
  return 0
end

redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 1
`;

@Injectable()
export class RedisConversationContextRepository
  extends ConversationContextRepository {
  private readonly logger = new Logger(
    RedisConversationContextRepository.name,
  );

  constructor(
    @Inject(AGENT_REDIS)
    private readonly redis: RedisClientType,
  ) {
    super();
  }

  private key(scope: ConversationScope): string {
    return `agent:user:${scope.userId}:conversation-context:${scope.conversationId}`;
  }

  private unavailable(operation: string, error: unknown): never {
    const errorName =
      error instanceof Error ? error.name : 'UnknownError';
    this.logger.error(
      `Redis conversation context ${operation} failed error=${errorName}`,
    );
    throw new ServiceUnavailableException(
      '会话状态存储暂时不可用',
    );
  }

  async get(scope: ConversationScope): Promise<ConversationContext> {
    try {
      const raw = await this.redis.get(this.key(scope));

      if (!raw) {
        return createConversationContext(scope);
      }

      return ConversationContextSchema.parse(JSON.parse(raw));
    } catch (error) {
      return this.unavailable('get', error);
    }
  }

  async update(
    scope: ConversationScope,
    mutator: ContextMutator,
  ): Promise<ConversationContext> {
    for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt += 1) {
      const current = await this.get(scope);
      const draft = mutator(structuredClone(current));

      const next = ConversationContextSchema.parse({
        ...draft,
        schemaVersion: 1,
        userId: scope.userId,
        conversationId: scope.conversationId,
        version: current.version + 1,
        updatedAt: new Date().toISOString(),
      });

      let saved: unknown;
      try {
        saved = await this.redis.eval(
          COMPARE_AND_SET_CONTEXT,
          {
            keys: [this.key(scope)],
            arguments: [
              String(current.version),
              JSON.stringify(next),
              String(CONTEXT_TTL_SECONDS),
            ],
          },
        );
      } catch (error) {
        return this.unavailable('compare-and-set', error);
      }

      if (Number(saved) === 1) {
        return next;
      }
    }

    throw new ConflictException(
      '会话状态并发更新失败，请重试当前请求',
    );
  }

  async delete(scope: ConversationScope): Promise<void> {
    try {
      await this.redis.del(this.key(scope));
    } catch (error) {
      this.unavailable('delete', error);
    }
  }
}
```

这个实现解决的是“状态覆盖”，不是“重复执行模型或 Tool”。生产环境仍需要第 5.12 节的幂等和
同会话串行化。

Redis 数据损坏或 Schema 不兼容时不能静默创建空状态，否则会把真实故障伪装成“用户上下文丢失”。
应记录 key、schemaVersion 和错误类型，并返回明确的 503 或进入受控迁移流程；日志不得输出完整敏感值。

### 5.7.1 Redis Client 的 NestJS 生命周期

新建 `context/agent-redis.provider.ts`：

```ts
import {
  Inject,
  Injectable,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createClient,
  type RedisClientType,
} from 'redis';
import { AGENT_REDIS } from './redis-conversation-context.repository';

export const agentRedisProvider = {
  provide: AGENT_REDIS,
  inject: [ConfigService],
  useFactory: async (
    config: ConfigService,
  ): Promise<RedisClientType> => {
    const url = config.getOrThrow<string>('REDIS_URL');
    const client = createClient({ url });

    client.on('error', (error) => {
      // 使用结构化 Logger 记录错误类型，不记录 URL 和密码。
      console.error('agent redis error', error.name);
    });

    await client.connect();
    return client as RedisClientType;
  },
};

@Injectable()
export class AgentRedisLifecycle
  implements OnApplicationShutdown {
  constructor(
    @Inject(AGENT_REDIS)
    private readonly redis: RedisClientType,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.isOpen) {
      await this.redis.quit();
    }
  }
}
```

`agent.module.ts` 注册抽象仓库到 Redis 实现的映射：

```ts
providers: [
  agentRedisProvider,
  AgentRedisLifecycle,
  RedisConversationContextRepository,
  {
    provide: ConversationContextRepository,
    useExisting: RedisConversationContextRepository,
  },
  ReferenceResolver,
  TaskContinuationResolver,
  AgentCustomerCoordinator,
  // 其他现有 provider
]
```

如果 Redis 还同时用于 Checkpointer、Long-term Store 或其他业务，先确认客户端包版本、
连接池、索引需求和故障域。不要因为环境变量都叫 `REDIS_URL` 就假设它们可以无条件共用
同一个客户端或同一套 Redis 能力。

## 5.8 用通用 ReferenceResolver 处理唯一、缺失和歧义

新建 `context/reference-resolver.ts`：

```ts
import type {
  CustomerEntities,
  CustomerIntent,
  CustomerIntentName,
  ReferenceEntityType,
} from '../agent.intent';
import type {
  ConversationContext,
  VerifiedReference,
} from './conversation-context';

export type ReferenceResolution =
  | { status: 'not_needed' }
  | {
      status: 'resolved';
      reference: VerifiedReference;
    }
  | {
      status: 'missing';
      entityType: ReferenceEntityType;
    }
  | {
      status: 'ambiguous';
      entityType: ReferenceEntityType;
      candidates: VerifiedReference[];
    };

const INTENT_REFERENCE_TYPE: Partial<
  Record<CustomerIntentName, ReferenceEntityType>
> = {
  inventory_query: 'product',
  price_query: 'product',
  product_search: 'product',
  order_status: 'order',
  refund_request: 'order',
};

function hasExplicitEntity(
  entityType: ReferenceEntityType,
  entities: CustomerEntities,
): boolean {
  switch (entityType) {
    case 'product':
      return Boolean(entities.productName || entities.categoryName);
    case 'category':
      return Boolean(entities.categoryName);
    case 'order':
      return Boolean(entities.orderNo);
  }
}

export class ReferenceResolver {
  resolve(
    analysis: CustomerIntent,
    context: ConversationContext,
  ): ReferenceResolution {
    const expectedType = INTENT_REFERENCE_TYPE[analysis.intent];

    if (!expectedType) {
      return { status: 'not_needed' };
    }

    // 当前消息明确提供了实体，新输入永远优先。
    if (hasExplicitEntity(expectedType, analysis.entities)) {
      return { status: 'not_needed' };
    }

    if (analysis.reference.kind === 'none') {
      return { status: 'missing', entityType: expectedType };
    }

    if (
      analysis.reference.entityType &&
      analysis.reference.entityType !== expectedType
    ) {
      return { status: 'missing', entityType: expectedType };
    }

    const references = context.recentReferences.filter(
      (item) => item.entityType === expectedType,
    );

    if (references.length === 0) {
      return { status: 'missing', entityType: expectedType };
    }

    // 只考虑最近一次产生该类型引用的 Turn。
    const latestTurnId = references[0].sourceTurnId;
    const candidates = references.filter(
      (item) => item.sourceTurnId === latestTurnId,
    );

    if (candidates.length === 1) {
      return {
        status: 'resolved',
        reference: candidates[0],
      };
    }

    return {
      status: 'ambiguous',
      entityType: expectedType,
      candidates,
    };
  }
}
```

这不是把正则换成“完全相信模型”。边界仍然是：

- 模型只标记当前话语属于哪类引用表达；
- Resolver 根据意图限制允许引用的实体类型；
- 候选必须来自业务 Service 的 verified references；
- 多候选必须澄清；
- 最终查询使用 `entityId`，不使用模型重新拼出的名字。

歧义回复示例：

```ts
function buildAmbiguousReply(
  candidates: VerifiedReference[],
): string {
  const names = candidates
    .map((item, index) => `${index + 1}. ${item.displayName}`)
    .join('\n');

  return `你指的是下面哪一个？\n${names}`;
}
```

多候选追问后，下一句可能只是“第二个”。这种消息必须先由
`TaskContinuationResolver` 根据 `activeTask.referenceCandidates` 解析，再进入普通
`ReferenceResolver`：

```ts
export class TaskContinuationResolver {
  resolveSelection(
    analysis: CustomerIntent,
    context: ConversationContext,
  ): VerifiedReference | null {
    const index = analysis.reference.selectionIndex;
    const candidates =
      context.activeTask?.referenceCandidates ?? [];

    if (!index || candidates.length === 0) return null;

    const selected = candidates[index - 1];
    if (!selected) return null;

    return (
      context.recentReferences.find(
        (reference) =>
          reference.entityType === selected.entityType &&
          reference.entityId === selected.entityId,
      ) ?? null
    );
  }
}
```

“第二个”越界、候选已过期或已被删除时要重新追问，不能默认选第一个。
正式编排代码需先调用 `resolveSelection()`，成功时直接把结果作为
`resolvedReference`，并在业务请求成功后清空 `activeTask`。

## 5.9 业务 Service 必须返回结构化结果

当前 `ProductCustomerService.reply()` 只返回字符串，调用方不知道数据库最终匹配了哪些商品。
生产接口改成：

```ts
export type BusinessHandlerResult = {
  reply: string;
  references: VerifiedReference[];
};

export type ProductCustomerCommand = {
  intent: 'product_search' | 'inventory_query' | 'price_query';
  entities: CustomerEntities;
  resolvedReference?: VerifiedReference;
  turnId: string;
};
```

核心流程：

```ts
async reply(
  command: ProductCustomerCommand,
): Promise<BusinessHandlerResult> {
  const products = command.resolvedReference
    ? [
        await this.productService.findOne(
          Number(command.resolvedReference.entityId),
        ),
      ]
    : await this.searchProducts(command.entities);

  const existingProducts = products.filter(
    (product): product is Product => Boolean(product),
  );

  const references = existingProducts.map((product) => ({
    entityType: 'product' as const,
    entityId: String(product.id),
    displayName: product.name,
    sourceTurnId: command.turnId,
    verifiedBy: 'product_service' as const,
    verifiedAt: new Date().toISOString(),
  }));

  return {
    reply: this.formatReply(command.intent, existingProducts),
    references,
  };
}
```

当前项目的 `ProductService.findOne()` 已经在按主键查询后验证 `status === 1`，
因此这一版直接复用它。如果以后增加租户、门店或商品可见权限，这个按 ID 查询入口也必须
增加对应条件。不能因为 Redis 中有 productId 就绕过业务权限检查。

只有 `existingProducts` 才能产生引用：

```text
用户输入了一个不存在的商品名
→ 返回“未找到”
→ references = []
→ 不更新 recentReferences
```

如果一次返回五个商品，就保存同一个 `sourceTurnId` 的五个引用。下一轮用户只说“它”时，
Resolver 会得到五个候选并追问；用户明确说出其中一个商品名时，新输入优先。

## 5.10 用 Command 对象编排一次请求

生产代码不要继续给 `AgentService.chat()` 增加位置参数。定义：

```ts
export type AgentChatCommand = {
  userId: number;
  conversationId: string;
  clientMessageId: string;
  turnId: string;
  message: string;
};
```

应用层流程应为：

```ts
async execute(
  command: AgentChatCommand,
): Promise<AgentChatResponseDto> {
  const scope = {
    userId: command.userId,
    conversationId: command.conversationId,
  };
  const context = await this.contextRepository.get(scope);
  const analysis = await this.intentService.analyze(command.message);

  const entities = context.activeTask
    ? mergeEntities(
        context.activeTask.entities,
        analysis.entities,
      )
    : analysis.entities;

  const effectiveAnalysis = {
    ...analysis,
    entities,
  };

  const resolution = this.referenceResolver.resolve(
    effectiveAnalysis,
    context,
  );

  if (resolution.status === 'ambiguous') {
    const referenceCandidates = resolution.candidates.map(
      ({ entityType, entityId }) => ({ entityType, entityId }),
    );

    await this.contextRepository.update(
      scope,
      (current) => ({
        ...current,
        activeTask: this.buildCollectingTask(
          effectiveAnalysis,
          current.activeTask,
          referenceCandidates,
        ),
      }),
    );

    return this.buildClarificationResponse(
      command,
      effectiveAnalysis,
      resolution.candidates,
    );
  }

  if (resolution.status === 'missing') {
    await this.contextRepository.update(
      scope,
      (current) => ({
        ...current,
        activeTask: this.buildCollectingTask(
          effectiveAnalysis,
          current.activeTask,
          [],
        ),
      }),
    );

    return this.buildMissingReferenceResponse(
      command,
      effectiveAnalysis,
      resolution.entityType,
    );
  }

  const result = await this.productCustomerService.reply({
    intent: effectiveAnalysis.intent,
    entities: effectiveAnalysis.entities,
    resolvedReference:
      resolution.status === 'resolved'
        ? resolution.reference
        : undefined,
    turnId: command.turnId,
  });

  await this.contextRepository.update(
    scope,
    (current) => ({
      ...current,
      activeTask: null,
      recentReferences: prependVerifiedReferences(
        current.recentReferences,
        result.references,
      ),
    }),
  );

  return {
    conversationId: command.conversationId,
    reply: result.reply,
    // 其余 DTO 字段按现有类型填写
  };
}
```

这段代码展示的是编排边界，不建议直接全部塞回当前 `AgentService`。更清楚的拆分是：

```text
AgentChatApplicationService
→ 幂等、锁、MySQL 消息生命周期

AgentCustomerCoordinator
→ intent、task、reference resolution、handler dispatch

AgentService
→ 只负责真正需要通用 LLM Agent 的请求
```

商品确定性路由与通用 Agent 的 Checkpointer 是两条不同执行路径，不要假设给 `createAgent()`
配置 MemorySaver 后商品路由就自动获得消息上下文。

## 5.11 明确定义状态生命周期

| 事件 | activeTask | recentReferences |
| --- | --- | --- |
| 缺商品名，正在追问 | 保存 | 保留 |
| 用户补齐字段 | 合并后进入 processing | 保留 |
| 业务查询成功 | 设为 `null` | 加入业务返回的 verified references |
| 未找到实体 | 设为 `null` 或按产品规则保留 | 不新增 |
| 用户取消当前任务 | 设为 `null` | 保留 |
| 转人工 | 按产品规则清理 | 默认保留，交接时显式传递 |
| 点击“清空对话” | 删除整个 Redis context | 删除 |
| TTL 到期 | 删除 | 删除 |
| 用户新建 conversation | 新 key | 不继承；跨会话偏好由 Long-term Store 提供 |

不要再使用：

```ts
if (state.status === 'completed') {
  clear(conversationId);
}
```

完成只表示 `activeTask = null`，不表示删除整个 Conversation Context。

## 5.12 幂等、串行化和 CAS 缺一不可

三者解决不同问题：

| 机制 | 解决什么 |
| --- | --- |
| `conversationId + clientMessageId + role` 唯一索引 | 同一请求重试不重复落消息 |
| 同 conversation 分布式锁或队列 | 两个不同 Turn 不并行乱序执行 |
| Redis CAS `version` | 状态写入发生竞争时不静默覆盖 |

推荐顺序：

```text
收到请求
→ 从 JWT 取 userId，在 MySQL 校验 conversation 归属
→ 查询是否已有 completed assistant，存在则直接返回
→ 获取 agent:user:{userId}:conversation-lock:{conversationId}
→ 再次检查幂等结果
→ 保存 pending user
→ 执行意图识别、业务查询和 context 更新
→ 保存 completed assistant
→ 释放锁
```

锁必须具备：

- 唯一 owner token；
- 有限租约；
- 只允许 owner 使用 Lua 删除；
- 长模型调用需要续租或使用队列；
- 获取失败返回 409/429，而不是绕过锁继续执行。

最小安全释放脚本：

```ts
const RELEASE_LOCK = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

const ownerToken = randomUUID();
const acquired = await redis.set(lockKey, ownerToken, {
  NX: true,
  PX: 30_000,
});

if (acquired !== 'OK') {
  throw new ConflictException('当前会话正在处理另一条消息');
}

try {
  return await executeTurn();
} finally {
  await redis.eval(RELEASE_LOCK, {
    keys: [lockKey],
    arguments: [ownerToken],
  });
}
```

这个 30 秒只是示例，不是通用生产参数。如果最坏情况模型请求可能超过租约，必须实现
只允许 owner 续租的 heartbeat，或把同 conversation Turn 送入具有顺序保证的队列。
不要简单把租约设成无限时间，否则实例崩溃会留下永久死锁。

如果是多租户系统，Redis key、MySQL 查询和唯一索引还必须包含 `tenantId`。
`conversationId` 是资源标识，不是授权凭证。

Redis CAS 的 `mutator` 可能重试，所以其中不能调用模型、ProductService 或生成新的 Turn ID。
外部副作用先执行一次，再把已经得到的确定性结果用于纯状态更新。

## 5.13 上下文来源和预算仍然要做减法

生产规则：

```text
MySQL 历史
→ 页面、审计、客服后台；分页读取

持久化 Checkpointer
→ 通用 Agent 的 thread State

Redis Conversation Context
→ activeTask + 最多 20 个 verified references

Long-term Store
→ 用户确认的跨 conversation 偏好

业务 Service
→ 最新库存、价格、订单状态
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

相同 `thread_id` 的 Checkpointer 已包含旧消息时，再传 MySQL 全历史会产生重复。

前端第十轮请求仍只发送：

```json
{
  "message": "当前这一句话",
  "conversationId": "同一个 UUID",
  "clientMessageId": "本轮唯一 UUID"
}
```

服务端从 JWT 取得 `userId`，生成 `turnId`；不要信任前端传来的 userId。

## 5.14 必须覆盖的自动化测试

### ReferenceResolver 单元测试

```text
[ ] 明确新商品名时不读取旧引用
[ ] 单个最近 product reference 能解析“它”
[ ] 最近 Turn 有多个 product 时返回 ambiguous
[ ] 只有旧 order reference 时不能填充 product
[ ] 没有候选时返回 missing
[ ] 新 Turn 的引用优先于更旧 Turn
```

### Repository 集成测试

使用真实 Redis/Testcontainers，不要只 Mock：

```text
[ ] 写入后另一个 Repository 实例可以读取
[ ] NestJS 实例重建后状态仍存在
[ ] TTL 到期后删除
[ ] 非法 JSON/旧 schemaVersion 明确报错
[ ] 两个相同 version 的并发 CAS 只有一个成功
[ ] update 冲突重试后没有丢失 references
[ ] delete 只删除目标 conversation
```

### Application Service 回归测试

```text
[ ] Apple iPhone 查询后，“它库存多少”按 productId 查询
[ ] 查询结果包含多个商品后，“它多少钱”先追问
[ ] 明确输入 MacBook Pro 时不会继续使用 Apple 引用
[ ] 不存在的商品不会写入 verified references
[ ] 相同 clientMessageId 重试不会再次调用模型或 ProductService
[ ] 同 conversation 两个 Turn 不会乱序
[ ] 不同 conversation 可以并行且不会串状态
```

建议命令：

```bash
cd server
pnpm test -- --runInBand src/agent/context/reference-resolver.spec.ts
pnpm test -- --runInBand src/agent/context/redis-conversation-context.repository.spec.ts
pnpm test -- --runInBand src/agent/persistence/agent-chat-application.service.spec.ts
pnpm exec tsc --noEmit --incremental false
pnpm run build
```

## 第 5 天页面验收

```text
1. 新建会话，查询“Apple iPhone 15 Pro Max 库存多少？”。
2. 检查 Redis：引用包含真实 productId、canonical displayName、sourceTurnId。
3. 询问“它库存多少？”，确认后端按 productId 查询，不是重新模糊搜索名称。
4. 查询一个会返回多个商品的分类，再问“它多少钱？”，页面必须显示候选澄清。
5. 明确输入另一商品，确认新实体优先。
6. 刷新浏览器后继续提问，conversationId 不变且引用仍存在。
7. 重启 NestJS、保持 Redis 运行，再次提问，引用仍存在。
8. 启动两个 NestJS 实例交替请求，不串会话、不丢状态。
9. 并发发送两个 Turn，后端应串行处理或明确拒绝其中一个。
10. 查看第十轮 Payload，确认没有发送完整 MySQL 历史。
```

到这里才可以把第 5 天称为“可上线架构的实现路径”。是否真正上线，还必须完成第 6 天的
JWT 对象级权限、持久化 Checkpointer、Long-term Store 治理、可观测性、删除和故障演练。

---

# 第 6 天：上线前必须补的生产边界

## 今天目标

如果目标是真正上线，今天的清单是发布门槛，不是可选阅读。

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

## 6.3 验证 Redis Conversation Context

第 5 天已经不再使用同步 Map 仓库，上线前必须对 Redis Context 完成以下验证：

- `activeTask/recentReferences/version` 通过 Zod 运行时校验；
- Lua CAS 和冲突重试已通过真实 Redis 并发测试；
- 同 conversation 使用分布式锁或队列保证 Turn 顺序；
- TTL 、删除、Schema 升级和损坏数据处理策略已验证；
- 两台 NestJS 实例可以读写同一 conversation，不会丢引用或串会话；
- Redis 故障明确返回 503，不能静默退回本机 Map。

## 6.4 MemorySaver 换持久化 Checkpointer

只有确认当前 Redis/数据库版本和对应 Saver 依赖兼容后再替换。

必须验证：

- NestJS 重启后相同 thread 能恢复；
- 不同 thread 隔离；
- Saver 初始化一次，并在应用关闭时释放连接；
- Saver 故障明确返回 503，不能静默退回本机内存造成状态分叉。

普通 `REDIS_URL` 存在不代表 Checkpointer 所需命令、模块和依赖一定兼容。

## 6.5 Long-term Store：跨会话的用户记忆

### 6.5.1 它到底是什么

Long-term Store 是 LangGraph 提供的通用 JSON 文档存储抽象。每条记忆由两部分定位：

```text
namespace：类似文件夹，例如 ['users', '42', 'preferences']
key：命名空间内唯一的名称，例如 'replyStyle'
value：JSON 对象，例如 { value: 'concise', confirmedByUser: true }
```

它与前面几种状态的区别：

| 数据 | 关键作用域 | 例子 | 是否跨 conversation |
| --- | --- | --- | --- |
| MySQL 消息表 | `conversationId` | 原始 user/assistant 消息 | 否，用于查看某个会话 |
| Checkpointer | `thread_id` | Agent messages/Tool Call/Graph State | 否，线程级短期记忆 |
| Redis Conversation Context | `conversationId` | `activeTask/recentReferences/version` | 否，任务与会话引用状态 |
| Long-term Store | `userId + namespace + key` | 用户确认的回答风格、偏好分类 | 是，同一用户可跨 thread |

官方定义中，短期记忆属于单个 thread，Long-term Store 用于在不同 conversation/session 之间
保存和召回用户或应用级数据。参考：
[LangChain JavaScript Long-term memory](https://docs.langchain.com/oss/javascript/langchain/long-term-memory)。

`Long-term` 指作用域跨会话，不代表一定永久保存。`InMemoryStore` 在进程重启后照样会丢；
是否持久取决于实际 Store 后端。

### 6.5.2 什么适合存，什么不适合

适合：

- 用户明确说“请记住我喜欢简洁回答”；
- 用户主动设置偏好商品分类；
- 用户确认的语言、单位或时区；
- 允许用户随时查看、修改和删除的窄 Schema 偏好。

不适合：

- 每一条原始聊天消息，这属于 MySQL 消息表；
- “刚才查的 Apple iPhone”，这是当前会话的最近引用；
- 库存、价格、订单状态，这些必须重新查询业务 Service；
- API Key、JWT、Cookie、密码；
- 模型猜测的年龄、性别、健康、政治倾向或其他敏感画像；
- 用户没有明确要求保存的普通聊天结论。

### 6.5.3 先解决 userId，再接 Store

Long-term Store 的 namespace 必须来自服务端验证过的用户身份：

```ts
['users', String(userId), 'preferences']
```

不要使用：

```ts
['users', dto.userId, 'preferences']       // 用户可以伪造
['conversations', conversationId, 'memory'] // 仍然只是单会话，不是跨会话记忆
```

当前 React Agent 页面还没有接 JWT，所以现在可以写 Store 单元测试，但不应先开放多用户
长期记忆接口。正确顺序是：

```text
页面登录
→ JwtAuthGuard
→ CurrentUser('userId')
→ 使用服务端 userId 构造 namespace
→ 读写 Store
```

### 6.5.4 建立可替换的 Store Provider

新建 `memory/agent-long-term-memory.store.ts`：

```ts
import { InMemoryStore } from '@langchain/langgraph';

export const AGENT_LONG_TERM_STORE = Symbol('AGENT_LONG_TERM_STORE');

// 只用于本地学习；NestJS 重启后数据会丢失。
export const agentLongTermStoreProvider = {
  provide: AGENT_LONG_TERM_STORE,
  useFactory: () => new InMemoryStore(),
};
```

使用 DI Token 而不是在每次请求中 `new InMemoryStore()`。整个应用必须共享同一个 Store 实例，
否则一次写入后下一次请求会读不到。

### 6.5.5 用小而明确的 Schema 封装读写

新建 `memory/agent-long-term-memory.service.ts`：

```ts
import { Inject, Injectable } from '@nestjs/common';
import type { BaseStore } from '@langchain/langgraph';
import { AGENT_LONG_TERM_STORE } from './agent-long-term-memory.store';

export type AgentPreferenceKey =
  | 'replyStyle'
  | 'preferredCategory'
  | 'timeZone';

export type AgentPreferenceRecord = {
  key: AgentPreferenceKey;
  value: string;
  confirmedByUser: true;
  updatedAt: string;
};

@Injectable()
export class AgentLongTermMemoryService {
  constructor(
    @Inject(AGENT_LONG_TERM_STORE)
    private readonly store: BaseStore,
  ) {}

  private namespace(userId: number): string[] {
    return ['users', String(userId), 'preferences'];
  }

  async savePreference(
    userId: number,
    key: AgentPreferenceKey,
    value: string,
  ): Promise<AgentPreferenceRecord> {
    const record: AgentPreferenceRecord = {
      key,
      value: value.trim(),
      confirmedByUser: true,
      updatedAt: new Date().toISOString(),
    };

    await this.store.put(this.namespace(userId), key, { ...record });
    return record;
  }

  async getPreference(
    userId: number,
    key: AgentPreferenceKey,
  ): Promise<AgentPreferenceRecord | null> {
    const item = await this.store.get(this.namespace(userId), key);
    return item ? (item.value as AgentPreferenceRecord) : null;
  }

  async listPreferences(userId: number): Promise<AgentPreferenceRecord[]> {
    const items = await this.store.search(this.namespace(userId), {
      limit: 20,
    });

    return items.map((item) => item.value as AgentPreferenceRecord);
  }

  async deletePreference(
    userId: number,
    key: AgentPreferenceKey,
  ): Promise<void> {
    await this.store.delete(this.namespace(userId), key);
  }
}
```

第一遍只用精确 `get/search`，不需要 Embedding 和语义检索。当记忆变多且确实需要按语义
召回时，再为 Store 配置向量索引。

### 6.5.6 注册 Module

`agent.module.ts` 增加：

```ts
import { AgentLongTermMemoryService } from './memory/agent-long-term-memory.service';
import { agentLongTermStoreProvider } from './memory/agent-long-term-memory.store';

@Module({
  // imports/controllers 保持原有内容
  providers: [
    agentLongTermStoreProvider,
    AgentLongTermMemoryService,
    // 其他现有 provider
  ],
  exports: [AgentService, AgentLongTermMemoryService],
})
export class AgentModule {}
```

### 6.5.7 只通过明确的用户操作写入

第一版不让模型自动判断并写入所有“记忆”。先做一个受鉴权保护的显式设置接口：

```ts
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import type { AgentPreferenceKey } from './agent-long-term-memory.service';

export class SaveAgentPreferenceDto {
  @IsIn(['replyStyle', 'preferredCategory', 'timeZone'])
  key: AgentPreferenceKey;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  value: string;
}
```

```ts
@UseGuards(JwtAuthGuard)
@Controller('api/agent/memory')
export class AgentMemoryController {
  constructor(private readonly memory: AgentLongTermMemoryService) {}

  @Get('preferences')
  list(@CurrentUser('userId') userId: number) {
    return this.memory.listPreferences(userId);
  }

  @Post('preferences')
  save(
    @CurrentUser('userId') userId: number,
    @Body() dto: SaveAgentPreferenceDto,
  ) {
    return this.memory.savePreference(userId, dto.key, dto.value);
  }

  @Delete('preferences/:key')
  async remove(
    @CurrentUser('userId') userId: number,
    @Param('key') key: AgentPreferenceKey,
  ) {
    await this.memory.deletePreference(userId, key);
    return { success: true };
  }
}
```

`DELETE` 的 `key` 也应使用 Pipe 或 DTO 校验是否属于白名单，上面为了先展示核心边界而省略了
该 Pipe。

### 6.5.8 让通用 Agent 能读取 Store

官方 `createAgent` 接受 `store` 和 `contextSchema`，Tool 可以通过 `runtime.store` 读取同一个 Store。
新建 `memory/agent-memory.tools.ts`：

```ts
import { tool, type ToolRuntime } from 'langchain';
import { z } from 'zod';

export const agentRuntimeContextSchema = z.object({
  userId: z.string().min(1),
});

type AgentRuntimeContext = z.infer<typeof agentRuntimeContextSchema>;

const getUserPreferencesTool = tool(
  async (
    _input,
    runtime: ToolRuntime<unknown, AgentRuntimeContext>,
  ) => {
    const namespace = [
      'users',
      runtime.context.userId,
      'preferences',
    ];
    const items = await runtime.store.search(namespace, { limit: 20 });

    if (items.length === 0) {
      return '用户还没有保存长期偏好。';
    }

    return JSON.stringify(items.map((item) => item.value));
  },
  {
    name: 'get_user_preferences',
    description:
      '读取当前已登录用户明确保存的长期偏好。回答风格或偏好相关问题时使用。',
    schema: z.object({}),
  },
);

export function createAgentMemoryTools() {
  return [getUserPreferencesTool];
}
```

`AgentService` 注入同一 Store：

```ts
constructor(
  private readonly modelFactory: AgentModelFactory,
  private readonly agentIntentService: AgentIntentService,
  private readonly productCustomerService: ProductCustomerService,
  private readonly conversationService: AgentConversationService,
  @Inject(AGENT_LONG_TERM_STORE)
  private readonly longTermStore: BaseStore,
) {}
```

`createAgent()` 增加：

```ts
this.agent = createAgent({
  name: 'fe_assistant',
  model: this.modelFactory.getModel(),
  checkpointer: this.checkpointer,
  store: this.longTermStore,
  contextSchema: agentRuntimeContextSchema,
  tools: [
    ...createAgentTools(),
    ...createAgentMemoryTools(),
  ],
  systemPrompt: [
    '你是 FE 商城项目的中文 AI 助手。',
    '只有在需要用户已保存偏好时才调用 get_user_preferences。',
    '不得把 Store 内容当成库存、价格或订单实时事实。',
    // 保留其他现有指令
  ].join('\n'),
});
```

调用 Agent 时传入从 JWT 得到的 userId：

```ts
const result = await this.getAgent().invoke(
  {
    messages: [{ role: 'user', content: message }],
  },
  {
    configurable: { thread_id: conversationId },
    context: { userId: String(userId) },
  },
);
```

因此 `AgentService.chat()` 和 `AgentChatApplicationService.chat()` 也要增加服务端 userId 参数，所有测试必须补上该参数。
不要从 `AgentChatDto` 接收可伪造的 userId。

注意：当前商品请求会在进入通用 Agent 前被 `ProductCustomerService` 处理，所以把 Store 传给
`createAgent()` 不会自动影响商品确定性路由。如果“偏好分类”要影响商品推荐，应该在应用服务中
显式读取经验证的偏好，再传给 `ProductCustomerService`。Store 不会“自动让所有代码获得记忆”。

### 6.5.9 先验证跨会话和用户隔离

新建 `memory/agent-long-term-memory.service.spec.ts`：

```ts
import { describe, expect, it } from '@jest/globals';
import { InMemoryStore } from '@langchain/langgraph';
import { AgentLongTermMemoryService } from './agent-long-term-memory.service';

describe('AgentLongTermMemoryService', () => {
  it('同一用户可跨 conversation 读取，不同用户隔离', async () => {
    const service = new AgentLongTermMemoryService(new InMemoryStore());

    await service.savePreference(7, 'replyStyle', 'concise');

    // API 根本不需要 conversationId，因此新 thread 仍能按 userId 读取。
    await expect(service.getPreference(7, 'replyStyle')).resolves.toEqual(
      expect.objectContaining({ value: 'concise' }),
    );
    await expect(service.getPreference(8, 'replyStyle')).resolves.toBeNull();
  });

  it('用户可删除已保存偏好', async () => {
    const service = new AgentLongTermMemoryService(new InMemoryStore());
    await service.savePreference(7, 'timeZone', 'Asia/Shanghai');

    await service.deletePreference(7, 'timeZone');

    await expect(service.getPreference(7, 'timeZone')).resolves.toBeNull();
  });
});
```

执行：

```bash
cd server
pnpm test -- --runInBand src/agent/memory/agent-long-term-memory.service.spec.ts
pnpm exec tsc --noEmit --incremental false
```

### 6.5.10 生产环境不要用 InMemoryStore

当登录、权限、删除和记忆 Schema 已经验证后，再将 Provider 替换为持久后端。当前项目已安装的
`@langchain/langgraph-checkpoint-redis` 包含 `RedisStore`：

```ts
import { RedisStore } from '@langchain/langgraph-checkpoint-redis/store';

const store = await RedisStore.fromConnString(redisUrl);
await store.setup();
```

生产实现还必须：

- 应用启动时只初始化一次；
- 应用关闭时调用 `close()`；
- Store 故障不能静默退回本机内存，否则多实例会产生分叉记忆；
- 为用户提供查看、更正、删除和数据导出能力；
- 设定保留期、数量上限、Schema 版本和审计信息；
- 评测错误记忆、过时记忆和 prompt injection 被长期保存的风险。

## 6.6 Migration

生产 Migration 至少包含：

- 创建会话表；
- 创建消息表；
- 外键和级联策略；
- `(conversation_id, id)` 分页索引；
- 幂等唯一索引；
- `user_id` 索引；
- 从 nullable userId 迁移为非空的方案。

## 6.7 隐私和删除

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
Redis Conversation Context
Checkpointer thread
Long-term Store 用户记忆
```

## 第 6 天验收

画出上线前清单并标记：

```text
[ ] 页面已经登录
[ ] 所有历史查询带 userId
[ ] userId 数据库非空
[ ] clientMessageId 幂等
[ ] 同会话并发锁
[ ] Redis Conversation Context 已通过 CAS、TTL 和多实例测试
[ ] MemorySaver 已换持久化 Saver
[ ] Long-term Store 使用服务端 userId 隔离 namespace
[ ] 用户可查看、修改和删除长期记忆
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
- 未经用户确认的 Long-term Store 自动记忆；
- RAG 检索历史消息；
- 自动把所有聊天做向量化；
- Human-in-the-loop；
- 多 Agent；
- 自动删除或写入真实订单；
- 一开始就接 summarizationMiddleware；
- 在没有并发、隔离和故障测试时一次替换所有状态组件。

这些不是没用，而是会掩盖第六章最核心的持久化主线。

---

# 五、什么时候可以进入第七章

第一遍达到下面条件即可进入第七章：

- [ ] 第 0 天类型检查和三个页面场景通过；
- [ ] MySQL 有会话表和消息表；
- [ ] 每轮聊天保存一条 user 和一条 assistant；
- [ ] 刷新页面可以恢复历史；
- [ ] NestJS 重启后页面历史仍然存在；
- [ ] 知道 MemorySaver 重启后会丢，Redis Conversation Context 可跨实例恢复；
- [ ] 没有把 MySQL 全历史重复传给 Checkpointer；
- [ ] 能说明 Checkpointer、业务 Redis 状态和 Long-term Store 的区别；
- [ ] 能用 `userId + namespace + key` 隔离长期偏好；
- [ ] 能说明生产上线前的鉴权、幂等、Redis 和 Migration 缺口。

第六章第一遍真正的完成标准是：

```text
页面历史可恢复
≠
Agent 执行状态已完全持久化
```

你能清楚解释这句话，就不会把 MySQL、Checkpointer 和 Redis 混在一起。
