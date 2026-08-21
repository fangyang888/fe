# 第 6 课跟敲版：从现有项目一步一步实现持久会话与上下文

> 这不是另一份“大而全”的原理文档。
>
> 本文只围绕当前仓库里的真实代码展开。每次只理解一个概念、只改一小处、立即验证。不要一次把全文代码都复制完。
>
> 如果某段代码已经存在，先不要重复粘贴。对照、读懂、运行验收，再进入下一步。

相关文档：

- 完整原理：[LESSON_06_PERSISTENT_CONVERSATIONS_AND_CONTEXT_ENGINEERING.md](./LESSON_06_PERSISTENT_CONVERSATIONS_AND_CONTEXT_ENGINEERING.md)
- 原六天实验：[LESSON_06_SIX_DAY_CODE_AND_PAGE_TEST.md](./LESSON_06_SIX_DAY_CODE_AND_PAGE_TEST.md)
- 第五课状态管理：[LESSON_05_MULTI_TURN_STATE_AND_SLOT_FILLING.md](./LESSON_05_MULTI_TURN_STATE_AND_SLOT_FILLING.md)

---

## 一、先说结论：你现在不是“什么都没写”

当前项目已经有下面这些代码：

| 能力 | 当前文件 | 当前状态 |
| --- | --- | --- |
| 浏览器记住会话 ID | `src/AgentChat.tsx` | 已实现 |
| 校验三个输入字段 | `server/src/agent/agent.dto.ts` | 已实现 |
| MySQL 会话表 | `persistence/agent-conversation.entity.ts` | 已实现 |
| MySQL 消息表 | `persistence/agent-message.entity.ts` | 已实现 |
| 保存用户和助手消息 | `persistence/agent-history.service.ts` | 已实现第一版 |
| 编排一次聊天请求 | `persistence/agent-chat-application.service.ts` | 已实现第一版 |
| 查询历史消息 | `persistence/agent-history.controller.ts` | 已实现第一版 |
| 页面刷新后恢复消息 | `src/AgentChat.tsx` | 已实现第一版 |
| 通用 Agent 的短期上下文 | `agent.service.ts` 中的 `MemorySaver` | 只在当前 NestJS 进程内有效 |
| 商品补字段状态 | `AgentConversationService` 中的 `Map` | 只在当前 NestJS 进程内有效 |
| Redis Checkpointer | 尚未接入 | 重启后模型上下文会丢 |
| 长对话裁剪或摘要 | 尚未接入 | 消息可能不断增长 |
| 会话归属鉴权 | `userId` 仍允许 `null` | 不能按生产标准上线 |

所以你的正确学习路线不是重新建一个空项目，而是：

```text
先顺着现有代码走通一次
→ 分清每种状态保存在哪里
→ 用实验观察它何时会丢
→ 再从当前项目继续升级
```

---

## 二、先把最乱的原理压缩成五个盒子

先不要记 LangChain 的名词，只记下面五个盒子。

```text
┌──────────────────────────────────────────────┐
│ 1. React messages                            │
│ 只负责当前页面显示，刷新就会丢               │
└──────────────────────────────────────────────┘
                     ↑ GET 历史
┌──────────────────────────────────────────────┐
│ 2. MySQL agent_message                       │
│ 保存可展示、可审计的原始聊天记录             │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ 3. LangGraph Checkpointer                    │
│ 保存 Agent 运行状态和模型短期消息上下文       │
│ 当前是 MemorySaver，重启 NestJS 就丢          │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ 4. AgentConversationService 的 Map           │
│ 保存“正在查库存，还缺商品名”这类业务任务状态 │
│ 当前重启 NestJS 也会丢                       │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ 5. 模型本次真正看到的 Context                │
│ system prompt + 选中的历史 + 本轮消息 + Tool  │
└──────────────────────────────────────────────┘
```

最重要的一句话：

> 数据库有聊天记录，不代表模型自动看到了聊天记录；模型记得上文，也不代表页面刷新后能显示旧消息。

### 2.1 用一个具体例子理解

用户连续说：

```text
第一轮：请记住验证码是 orange-731
第二轮：我刚才的验证码是什么？
```

此时：

- React `messages` 决定页面上画出哪些气泡。
- MySQL 决定刷新页面后能否重新取得这些气泡。
- Checkpointer 决定第二轮调用模型时，模型能否看到第一轮。
- 如果这是“查库存 → 补商品名”，`Map` 还要记住未完成的业务任务。
- 上下文工程决定旧消息很多时，究竟选哪些交给模型。

它们不是同一份数据，也不应该由同一个类全包。

---

## 三、三个 ID 分别是什么

当前请求体是：

```json
{
  "message": "你好",
  "conversationId": "11111111-1111-4111-8111-111111111111",
  "clientMessageId": "22222222-2222-4222-8222-222222222222"
}
```

后端还会生成一个 `turnId`。

| ID | 生命周期 | 回答的问题 |
| --- | --- | --- |
| `conversationId` | 多轮会话 | 这些消息属于哪一个对话？ |
| `clientMessageId` | 一次前端发送动作 | 浏览器重试的是不是同一条请求？ |
| `turnId` | 一次服务端处理过程 | 这一条 user 和哪一条 assistant 属于同一轮？ |

不要把三者合并成一个 ID。

一个会话会有很多次发送；一次发送通常对应一个 user 消息和一个 assistant 消息。

---

# 第一阶段：不改架构，先把现有链路走通

## 四、第 0 步：确认基线

在项目根目录执行：

```bash
git status --short
cd server
npm test -- --runInBand agent
npm run build
```

你要看到：

- `git status --short` 没有意外改动，或者你知道每个改动是谁做的。
- Agent 相关的 5 个测试套件、19 条测试通过。
- TypeScript 可以编译。

当前仓库全量执行 `npm test -- --runInBand` 时，另有一个与本课无关的旧失败：`crawler.controller.spec.ts` 没有在测试模块中提供 `CrawlerService`。因此本课每一步先使用 `agent` 路径定向测试；全量失败要单独记录，不要误判成持久化改动造成的错误。

如果 Agent 定向测试或 build 失败，先记录错误，不要同时开始 Redis 或摘要代码。否则后面无法判断错误来自哪里。

### 本步验收

请先用自己的话回答：

```text
我现在验证的是旧代码能运行，不是在验证持久化已经完整。
```

能说清楚再进入下一步。

---

## 五、第 1 步：从前端找到 conversationId

打开 `src/AgentChat.tsx`，找到：

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

这段代码只做两件事：

1. 浏览器以前有 ID，就继续使用。
2. 没有 ID，才生成 UUID 并保存。

组件中还有：

```ts
const conversationIdRef = useRef(getOrCreateConversationId());
const clientMessageIdRef = useRef(crypto.randomUUID());
```

这里使用 `useRef`，因为 ID 需要跨组件渲染保持不变，但 ID 改变本身不需要触发页面重绘。

发送成功后才生成下一个 `clientMessageId`：

```ts
clientMessageIdRef.current = crypto.randomUUID();
```

这意味着请求失败时可以继续沿用旧 ID 重试。这个思路是幂等的基础，但后端当前还没有完成“重复请求直接返回旧结果”的完整闭环。

### 动手观察

1. 打开聊天页面。
2. 打开浏览器开发者工具。
3. 在 Application → Local Storage 中找到 `agent.activeConversationId`。
4. 刷新页面。
5. 确认值没有变化。
6. 点击当前页面的“清空对话”。
7. 再确认它变成了新的 UUID。

注意：当前“清空对话”实际上只是切换到新 `conversationId`，并没有删除 MySQL 中的旧记录。它更准确的产品名称应是“新建对话”。

### 本步验收

你应该能回答：

```text
为什么 conversationId 不能每次发送前都重新生成？
```

答案：如果每次都生成，后端会把每句话当成不同会话，模型状态和数据库历史都无法串起来。

---

## 六、第 2 步：看 DTO 怎样挡住错误 ID

打开 `server/src/agent/agent.dto.ts`：

```ts
export class AgentChatDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'message 必须是字符串' })
  @IsNotEmpty({ message: 'message 不能为空' })
  @MaxLength(8000, { message: 'message 不能超过 8000 个字符' })
  message: string;

  @IsUUID('4', { message: 'conversationId 必须是 UUID v4' })
  conversationId: string;

  @IsUUID('4', { message: 'clientMessageId 必须是 UUID v4' })
  clientMessageId: string;
}
```

DTO 负责的是“输入形状”，不是“权限”。

- `IsUUID` 只能证明它像 UUID。
- 它不能证明当前用户拥有这个会话。
- 当前项目的 `userId` 还是 `null`，因此这里只能用于本地学习，不能当成生产鉴权。

### 用错误请求验证

服务启动后执行：

```bash
curl -i -X POST http://localhost:3000/api/agent/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"你好","conversationId":"随便写的字符串","clientMessageId":"也不是UUID"}'
```

预期是 HTTP 400，而不是进入 Agent。

### 本步验收

```text
格式校验 ≠ 对象归属校验。
```

---

## 七、第 3 步：看 MySQL 为什么需要两张表

### 7.1 会话表

文件：`server/src/agent/persistence/agent-conversation.entity.ts`

它保存的是会话级信息：

```text
id
userId
title
status
createdAt
updatedAt
```

一条会话记录下面可以有很多消息。

### 7.2 消息表

文件：`server/src/agent/persistence/agent-message.entity.ts`

关键字段是：

```ts
@Column({ type: 'varchar', length: 36, name: 'conversation_id' })
conversationId: string;

@Column({ type: 'varchar', length: 36, name: 'client_message_id' })
clientMessageId: string;

@Column({ type: 'varchar', length: 36, name: 'turn_id' })
turnId: string;

@Column({ type: 'varchar', length: 20 })
role: 'user' | 'assistant';

@Column({ type: 'text' })
content: string;

@Column({ type: 'varchar', length: 20, default: 'completed' })
status: 'pending' | 'completed' | 'failed';
```

这一行尤其重要：

```ts
@Index(['conversationId', 'clientMessageId', 'role'], { unique: true })
```

它表达的规则是：

```text
同一个会话 + 同一次前端请求 + 同一种角色
最多只能保存一条消息
```

为什么索引里还要有 `role`？因为同一个 `clientMessageId` 下需要允许一条 user 和一条 assistant。

### 7.3 关系图

```text
agent_conversation
  id = conversationId
       │
       ├── agent_message(user)
       ├── agent_message(assistant)
       ├── agent_message(user)
       └── agent_message(assistant)
```

### 7.4 检查是否建表

本地开发使用 `synchronize: true` 时，启动 NestJS 后 TypeORM 会创建表。然后在 MySQL 中执行：

```sql
SHOW TABLES LIKE 'agent_%';

SHOW CREATE TABLE agent_conversation;
SHOW CREATE TABLE agent_message;
```

生产环境不要依赖 `synchronize`，应使用 Migration。现在先把本地学习链路走通。

### 本步验收

你应该能回答：

```text
为什么不能只在 agent_conversation 里放一个超长 messages JSON？
```

因为消息需要独立排序、分页、标记失败、做唯一约束和审计；全部塞进一个 JSON 会让并发更新和查询越来越困难。

---

## 八、第 4 步：逐个读懂 HistoryService

文件：`server/src/agent/persistence/agent-history.service.ts`

不要一次读完整个类。按一次请求发生的时间顺序读。

### 8.1 先确保会话存在

```ts
await this.history.ensureConversation(dto.conversationId);
```

`ensureConversation` 的含义不是“每轮创建一次”，而是“有就复用，没有才创建”。

### 8.2 模型调用前先记 user pending

```ts
await this.history.startUserTurn({
  conversationId: dto.conversationId,
  clientMessageId: dto.clientMessageId,
  turnId,
  content: dto.message,
});
```

为什么在调用模型前保存？

如果模型超时，系统仍然知道用户确实发过这条消息，而且状态可以标成 `failed`。

### 8.3 模型成功后写 assistant

```ts
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
```

它同时完成两件事：

1. 把 user 从 `pending` 改为 `completed`。
2. 保存一条 assistant 消息。

### 8.4 模型失败后标记 failed

```ts
await this.history.markUserTurnFailed(
  dto.conversationId,
  dto.clientMessageId,
);
```

不要在 catch 中删除用户消息。失败记录对重试、排障和产品提示都有价值。

### 8.5 第一处实际改动：查询“最近 100 条”而不是“最早 100 条”

当前代码是：

```ts
listMessages(conversationId: string) {
  return this.messages.find({
    where: { conversationId },
    order: { id: 'ASC' },
    take: 100,
  });
}
```

`ASC + take: 100` 取得的是最早 100 条。会话超过 100 条后，刷新页面看不到最新消息。

把它改成：

```ts
async listMessages(conversationId: string) {
  const records = await this.messages.find({
    where: { conversationId },
    order: { id: 'DESC' },
    take: 100,
  });

  return records.reverse();
}
```

逻辑是：

```text
数据库先倒序取最新 100 条
→ 返回页面前再反转
→ 页面仍按从旧到新显示
```

先运行：

```bash
cd server
npm run build
```

编译通过再继续。

### 本步验收

你应该能画出：

```text
pending user
  → 模型成功 → completed user + completed assistant
  → 模型失败 → failed user
```

---

## 九、第 5 步：看 ApplicationService 为什么是总编排层

文件：`server/src/agent/persistence/agent-chat-application.service.ts`

完整顺序是：

```text
ensureConversation
→ 生成 turnId
→ startUserTurn
→ AgentService.chat
→ completeAssistantTurn
→ 返回响应
```

发生异常时：

```text
AgentService.chat 抛错
→ markUserTurnFailed
→ 原错误继续抛给 Controller
```

这个类非常关键，因为它把两个不同职责连接起来：

- `AgentService` 负责算出答案。
- `AgentHistoryService` 负责保存聊天事实。
- `AgentChatApplicationService` 负责一次请求的先后顺序。

为什么不把保存代码全塞进 `AgentService`？

因为将来商品客服、RAG、流式回答都可能换执行方式，但“先记用户消息、成功后记回答、失败后标失败”的应用生命周期仍然相同。

### 不要这样写

```ts
await dataSource.transaction(async () => {
  await saveUserMessage();
  await callModel();
  await saveAssistantMessage();
});
```

模型可能执行几秒甚至更久。一直占着数据库事务会增加锁等待和连接池压力。

### 本步验收

用一句话复述：

```text
ApplicationService 管顺序，AgentService 管回答，HistoryService 管存储。
```

---

## 十、第 6 步：找到两个 HTTP 入口

发送消息：

```http
POST /api/agent/chat
```

代码在 `server/src/agent/agent.controller.ts`：

```ts
@Post('chat')
chat(@Body() dto: AgentChatDto) {
  return this.chatApplication.chat(dto);
}
```

恢复历史：

```http
GET /api/agent/conversations/:conversationId/messages
```

代码在 `server/src/agent/persistence/agent-history.controller.ts`。

`ParseUUIDPipe` 仍然只做格式校验。以后接 JWT 时，Service 查询必须同时带 `conversationId + userId`。

### 用 curl 分两步测试

先准备两个新的 UUID。可以在浏览器控制台执行两次：

```js
crypto.randomUUID()
```

然后发送：

```bash
curl -X POST http://localhost:3000/api/agent/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "message": "请介绍你的能力",
    "conversationId": "替换成第一个UUID",
    "clientMessageId": "替换成第二个UUID"
  }'
```

再查询：

```bash
curl http://localhost:3000/api/agent/conversations/替换成第一个UUID/messages
```

预期至少能看到一条 user 和一条 assistant，且二者 `turnId` 相同。

---

## 十一、第 7 步：理解页面刷新为什么能恢复

`src/AgentChat.tsx` 中的 `useEffect` 做了这件事：

```text
组件挂载
→ 读取 localStorage 中的 conversationId
→ GET /api/agent/conversations/:id/messages
→ 过滤 completed 消息
→ 转成 ChatMessage
→ setMessages
```

这条链路完全不依赖模型。

### 11.1 第二处实际改动：恢复数据库里的原始时间

当前 `AgentHistoryMessage` 没声明 `createdAt`，恢复历史时 `createMessage` 又使用当前时间，所以刷新以后每条旧消息看起来都像刚刚发送。

先修改类型：

```ts
type AgentHistoryMessage = {
  role: MessageRole;
  content: string;
  status: 'pending' | 'completed' | 'failed';
  model: string | null;
  createdAt: string;
};
```

再把 `createMessage` 改为允许传入时间：

```ts
function createMessage(
  role: MessageRole,
  content: string,
  model?: string,
  createdAt?: string,
): ChatMessage {
  messageSequence += 1;
  const messageTime = createdAt ? new Date(createdAt) : new Date();

  return {
    id: `${Date.now()}-${messageSequence}`,
    role,
    content,
    time: new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(messageTime),
    model,
  };
}
```

最后修改历史映射：

```ts
.map((record) =>
  createMessage(
    record.role,
    record.content,
    record.model ?? undefined,
    record.createdAt,
  ),
)
```

运行：

```bash
npm run build
```

### 页面验收

1. 发送一条消息。
2. 记住气泡显示的时间。
3. 等一分钟后刷新页面。
4. 原消息应保持原来的时间，而不是变成刷新时间。

---

## 十二、第 8 步：完成第一阶段数据库实验

请按顺序验证，不要只看页面“好像能用”。

### 实验 A：刷新浏览器

```text
发送一条消息
→ 刷新浏览器
→ 消息仍出现
```

证明的是：

```text
React state 丢了，但 MySQL 历史可以重新加载。
```

### 实验 B：重启 NestJS

```text
发送一条消息
→ 停止并重启 NestJS
→ 刷新页面
→ 消息仍出现
```

证明的是：

```text
MySQL 消息记录不依赖 NestJS 进程内存。
```

### 实验 C：新建对话

```text
点击“清空对话”
→ localStorage 换成新 conversationId
→ 页面从新会话开始
```

证明的是：

```text
conversationId 是会话隔离键。
```

它没有证明旧消息已经从数据库删除。

---

# 第二阶段：分清“页面历史”和“模型上下文”

## 十三、第 9 步：读懂当前 MemorySaver

打开 `server/src/agent/agent.service.ts`，当前有：

```ts
private readonly checkpointer = new MemorySaver();
```

创建 Agent 时：

```ts
this.agent = createAgent({
  model: this.modelFactory.getModel(),
  checkpointer: this.checkpointer,
  tools: createAgentTools(),
  systemPrompt: '...',
});
```

调用时：

```ts
const result = await this.getAgent().invoke(
  {
    messages: [{ role: 'user', content: message }],
  },
  {
    configurable: { thread_id: conversationId },
  },
);
```

关键不是“每次手动传全部历史”，而是相同 `thread_id` 让 Checkpointer 找到上一次 Agent 状态。

### 13.1 当前千万不要加的代码

不要在这里又读取 MySQL 全历史：

```ts
// 错误示例：不要照抄
const history = await this.history.listMessages(conversationId);

await agent.invoke({
  messages: [
    ...history,
    { role: 'user', content: message },
  ],
});
```

因为 Checkpointer 已经保存消息状态。这样会把旧消息再追加一次，造成重复上下文。

### 13.2 用重启实验看见区别

只使用会进入通用 Agent 的问题，不要使用库存、价格等确定性业务路由。

1. 发送：“请记住临时代码是 orange-731。”
2. 不重启 NestJS，继续问：“临时代码是什么？”
3. 记录结果。
4. 停止并重启 NestJS。
5. 页面刷新后，旧消息仍然能显示。
6. 再问：“临时代码是什么？”

你会观察到两个独立事实：

```text
MySQL：旧气泡仍能恢复。
MemorySaver：重启后模型短期状态已经丢失。
```

模型回答存在随机性，所以不要只凭一句自然语言断言。真正的集成测试还需要直接检查 Checkpointer；这里的目的只是建立直觉。

---

## 十四、第 10 步：别把商品任务状态和模型消息混在一起

当前还有另一个内存状态：

```ts
private readonly states = new Map<string, AgentConversationState>();
```

它在 `AgentConversationService` 中，保存：

```text
pendingIntent
entities
missingFields
status
expiresAt
```

例如：

```text
用户：帮我查库存
系统：请告诉我商品名称
```

这时可靠的业务事实是：

```json
{
  "pendingIntent": "inventory_query",
  "missingFields": ["productName"]
}
```

不要只让模型从聊天文字猜“现在缺什么字段”。业务状态要结构化保存、由代码计算。

当前这个 `Map` 重启后也会丢，但它和 `MemorySaver` 丢失的是两种不同数据：

- `Map` 丢的是业务任务状态。
- `MemorySaver` 丢的是 Agent checkpoint/消息状态。

后面可以分别升级到 Redis Repository 和 Redis Checkpointer，不能因为它们都用 Redis 就合成一个不分职责的 JSON。

---

# 第三阶段：从当前代码继续改成持久 Checkpointer

## 十五、第 11 步：先准备兼容的 Redis

当前依赖已经安装：

```text
@langchain/langgraph-checkpoint-redis
```

但这个包需要 RedisJSON 和 RediSearch。Redis 8 已内置；较旧版本通常需要 Redis Stack。普通 Redis 能连接，不代表 Checkpointer 所需能力可用。

为了避免和预测模块缓存混淆，新增独立配置名：

```dotenv
AGENT_CHECKPOINT_REDIS_URL=redis://localhost:6379
```

不要在教程、Git 提交或截图中放真实密码、API Key。

本步只确认 Redis 环境，不改 `AgentService`。Redis 没准备好时继续使用 `MemorySaver` 完成前两阶段。

---

## 十六、第 12 步：新建 Checkpointer 生命周期服务

新建文件：

```text
server/src/agent/persistence/agent-checkpointer.service.ts
```

写入：

```ts
import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MemorySaver } from '@langchain/langgraph';
import { RedisSaver } from '@langchain/langgraph-checkpoint-redis';

type AgentCheckpointer = MemorySaver | RedisSaver;

@Injectable()
export class AgentCheckpointerService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(AgentCheckpointerService.name);
  private checkpointer: AgentCheckpointer = new MemorySaver();

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = this.config
      .get<string>('AGENT_CHECKPOINT_REDIS_URL')
      ?.trim();

    if (!redisUrl) {
      this.logger.warn(
        '未配置 AGENT_CHECKPOINT_REDIS_URL，Agent 使用 MemorySaver',
      );
      return;
    }

    this.checkpointer = await RedisSaver.fromUrl(redisUrl, {
      defaultTTL: 24 * 60,
      refreshOnRead: true,
    });

    this.logger.log('Agent 已启用 Redis Checkpointer');
  }

  get(): AgentCheckpointer {
    return this.checkpointer;
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.checkpointer instanceof RedisSaver) {
      await this.checkpointer.end();
    }
  }
}
```

逐段理解：

- 字段默认是 `MemorySaver`，方便本地没有 Redis 时学习。
- `onModuleInit` 在 NestJS 模块初始化时连接 Redis。
- `defaultTTL` 的单位是分钟，这里是 24 小时。
- `refreshOnRead` 表示活跃会话读取时刷新过期时间。
- `onApplicationShutdown` 关闭 Redis 连接。
- 不要每次请求都 `RedisSaver.fromUrl()`，否则会重复创建连接和索引检查。

如果配置了 Redis 但连接失败，让应用启动失败通常比静默退回内存更安全。否则你会以为已持久化，实际仍在丢状态。

---

## 十七、第 13 步：注册 Service

打开 `server/src/agent/agent.module.ts`。

增加 import：

```ts
import { AgentCheckpointerService } from './persistence/agent-checkpointer.service';
```

然后加到 `providers`：

```ts
providers: [
  AgentModelFactory,
  AgentIntentService,
  ProductCustomerService,
  AgentService,
  AgentConversationService,
  AgentHistoryService,
  AgentChatApplicationService,
  AgentCheckpointerService,
],
```

运行：

```bash
cd server
npm run build
```

此时只是让 NestJS 创建它，`AgentService` 还没有使用它。

---

## 十八、第 14 步：让 AgentService 使用新 Checkpointer

打开 `server/src/agent/agent.service.ts`。

### 18.1 删除旧字段

删除：

```ts
private readonly checkpointer = new MemorySaver();
```

同时删除不再需要的 `MemorySaver` import。

### 18.2 注入生命周期服务

增加 import：

```ts
import { AgentCheckpointerService } from './persistence/agent-checkpointer.service';
```

在构造函数最后增加参数：

```ts
constructor(
  private readonly modelFactory: AgentModelFactory,
  private readonly agentIntentService: AgentIntentService,
  private readonly productCustomerService: ProductCustomerService,
  private readonly conversationService: AgentConversationService,
  private readonly checkpointerService: AgentCheckpointerService,
) {}
```

### 18.3 创建 Agent 时取得单例 Checkpointer

把：

```ts
checkpointer: this.checkpointer,
```

改成：

```ts
checkpointer: this.checkpointerService.get(),
```

`thread_id` 的调用代码保持不变：

```ts
configurable: { thread_id: conversationId }
```

这一点非常重要：

```text
Saver 的存储介质变了
conversationId/thread_id 的会话隔离规则没变
```

---

## 十九、第 15 步：修正单元测试构造参数

`AgentService` 多了一个构造参数，旧测试会立即编译失败。这是好事，TypeScript 正在提醒你更新依赖。

在 `server/src/agent/agent.service.spec.ts` 增加：

```ts
import { MemorySaver } from '@langchain/langgraph';
import { AgentCheckpointerService } from './persistence/agent-checkpointer.service';
```

建立一个最小替身：

```ts
const checkpointerService = {
  get: () => new MemorySaver(),
} as unknown as AgentCheckpointerService;
```

每个 `new AgentService(...)` 的最后增加：

```ts
checkpointerService,
```

然后运行：

```bash
npm test -- --runInBand agent
npm run build
```

单元测试继续使用内存替身，它只能证明业务代码没有被破坏。它不能证明 Redis 重启恢复成功。

---

## 二十、第 16 步：做真正的重启验收

### 20.1 无 Redis 配置

不配置 `AGENT_CHECKPOINT_REDIS_URL` 启动服务，应看到警告：

```text
未配置 AGENT_CHECKPOINT_REDIS_URL，Agent 使用 MemorySaver
```

这时行为应与改动前相同。

### 20.2 有 Redis 配置

配置兼容 Redis 后启动，应看到：

```text
Agent 已启用 Redis Checkpointer
```

然后：

1. 使用通用 Agent 发送：“请记住临时代码是 orange-731。”
2. 继续问一次，确认同进程内能回答。
3. 重启 NestJS，不要清理 Redis，也不要点击新建对话。
4. 用相同页面继续问：“临时代码是什么？”
5. 检查模型能否延续同一 `thread_id`。

同时再测一个新的 `conversationId`，它不应该知道旧会话的代码。

验收矩阵：

| 场景 | 预期 |
| --- | --- |
| 同 ID，不重启 | 记得 |
| 同 ID，重启 NestJS | Redis Checkpointer 能恢复 |
| 新 ID | 不知道旧会话信息 |
| 刷新页面 | MySQL 恢复可见消息 |

至此你才同时证明了 MySQL 历史和模型短期状态持久化。

---

# 第四阶段：上下文工程，不让历史无限增长

## 二十一、第 17 步：先写预算，再写摘要代码

上下文不只是历史消息：

```text
system prompt
+ 最近对话
+ 旧对话摘要
+ Tool 定义
+ Tool 返回值
+ 本轮用户消息
+ 给模型预留的回答空间
```

第一版不要追求精确到每个 Token。先写一个明确规则：

```text
达到 20 条消息时触发摘要
保留最近 8 条原始消息
更早内容压成摘要
MySQL 原始聊天记录不删除
```

这里有两个存储视角：

- MySQL 仍保存原始展示记录。
- Checkpointer 中的 Agent 状态可以包含摘要和最近消息。

摘要是派生数据，不应替代原始审计记录，也不应替代 `pendingIntent` 等结构化业务状态。

---

## 二十二、第 18 步：给 createAgent 增加摘要 Middleware

当前安装的 LangChain 版本已经提供 `summarizationMiddleware`。

在 `agent.service.ts` 把 import 改为：

```ts
import { createAgent, summarizationMiddleware } from 'langchain';
```

在 `getAgent()` 中先复用同一个模型实例：

```ts
const model = this.modelFactory.getModel();

this.agent = createAgent({
  name: 'fe_assistant',
  model,
  checkpointer: this.checkpointerService.get(),
  tools: createAgentTools(),
  middleware: [
    summarizationMiddleware({
      model,
      trigger: { messages: 20 },
      keep: { messages: 8 },
    }),
  ],
  systemPrompt: [
    '你是 FE 商城项目的中文 AI 助手。',
    '回答要准确、简洁；不知道时明确说明，不得编造事实。',
    '需要计算、获取当前时间或转换文本时，应调用提供的工具。',
    '商品、订单、退款等业务数据必须来自后端服务；没有对应能力时明确说明。',
    '当前 Agent 没有数据库写权限，也没有长期记忆。',
  ].join('\n'),
});
```

先用较小的消息阈值学习，生产值必须根据所用模型、Tool 返回长度、成本和评测数据调整。

运行：

```bash
npm test -- --runInBand agent
npm run build
```

### 22.1 摘要测试不能只问“你还记得吗”

准备一个至少 25 轮的测试脚本，混合以下情况：

- 早期给出一个不敏感事实，摘要后追问。
- 中途纠正这个事实，验证新值优先。
- 中途切换话题，验证不会一直被旧主题干扰。
- 调用一次 Tool，验证 Tool 消息对没有被错误截断。
- 新 conversationId 不能读到旧摘要。

自然语言结果要多次观察。还应在日志或 Checkpointer 集成测试中验证摘要确实触发，而不是模型碰巧猜对。

---

## 二十三、现在先不要做的事

在前面四个阶段没有全部验收前，先不要同时加入：

- Long-term Store 用户偏好。
- 向量检索全部聊天历史。
- 多 Agent。
- 自定义 LangGraph 大流程。
- 流式输出和断点续传。
- 自动从模型回答中提取并永久保存用户偏好。

它们都可能有价值，但会掩盖本章最核心的四条线：

```text
原始消息怎样保存
页面怎样恢复
模型状态怎样恢复
上下文怎样受控增长
```

---

## 二十四、当前项目仍然存在的生产缺口

完成本文也不等于可以直接上线。至少还缺：

### 24.1 对象级权限

当前 `userId` 可为空，查询只按 `conversationId`。生产必须从 JWT 获取可信 `userId`，并按下面的条件读写：

```text
conversationId = 请求中的会话 ID
AND userId = 当前登录用户 ID
```

### 24.2 完整幂等闭环

唯一索引能防止重复行，但重复请求仍可能再次调用模型。完整做法是：

```text
收到 clientMessageId
→ 已有 completed assistant：直接返回旧结果
→ 已有 pending：返回处理中或等待同一结果
→ 没有：创建本轮并调用模型
```

### 24.3 会话并发控制

同一个会话同时发送两条消息时，状态可能交错。多实例生产需要基于会话的分布式锁、队列或带版本号的 CAS。

### 24.4 删除语义

当前页面“清空”只是换 ID。真正删除会话时要统一处理：

```text
MySQL conversation/messages
Redis checkpoint
Redis 业务状态
审计与保留策略
```

### 24.5 Migration

生产环境必须关闭 `synchronize`，使用可审查、可回滚的数据库 Migration。

---

## 二十五、最容易混淆的十个问题

### 1. MySQL 有历史，为什么模型还忘了？

因为当前模型从 Checkpointer 恢复上下文，MySQL 历史只用于页面展示。系统没有自动把两者连接起来。

### 2. Checkpointer 有消息，为什么还要 MySQL？

Checkpoint 是 Agent 运行状态，不是面向产品的聊天记录 API。页面查询、审计、删除、分页都应有明确的应用数据库模型。

### 3. 为什么每次 invoke 只传本轮 message？

因为相同 `thread_id` 下的旧 Agent 状态由 Checkpointer 恢复。再手动传一遍 MySQL 历史会重复。

### 4. conversationId 和 thread_id 是两个 ID 吗？

概念不同，但当前项目有意使用同一个 UUID 映射它们，减少串会话风险。

### 5. clientMessageId 为什么成功后才换？

同一次失败重试应继续使用同一幂等键；开始发送下一条新消息时才换新 ID。

### 6. turnId 为什么由后端生成？

它描述服务端处理生命周期，不能依赖不可信客户端决定。

### 7. 摘要后 MySQL 旧消息要删除吗？

不要因为模型摘要就删除原始产品记录。两者生命周期不同。

### 8. Shallow Checkpointer 是否等于裁剪上下文？

不等于。它只保留最新 checkpoint，但最新 checkpoint 内的消息状态仍可能很大。消息裁剪或摘要要单独设计。

### 9. Redis 存了业务状态，还需要 Checkpointer 吗？

需要。业务状态和 Agent 运行状态职责不同，即使底层都在 Redis 也要使用不同 Schema 和组件。

### 10. 页面刷新测试通过，是否证明重启恢复上下文？

没有。它只证明 MySQL 历史恢复。必须单独重启 NestJS 验证持久 Checkpointer。

---

## 二十六、建议你实际按五次练习完成

不要一天硬看完。

### 第一次：只学 ID 和两张表

- 完成第 0～3 步。
- 能解释三个 ID。
- 能解释为什么有两张表。

### 第二次：只学一次请求生命周期

- 完成第 4～6 步。
- 手画 pending → completed/failed。
- 用 curl 查询一轮消息。

### 第三次：只学页面恢复

- 完成第 7～8 步。
- 实现原始消息时间恢复。
- 分别做浏览器刷新和 NestJS 重启实验。

### 第四次：只学模型短期上下文

- 完成第 9～10 步。
- 能区分 MySQL、MemorySaver 和业务 Map。
- 做 orange-731 重启实验。

### 第五次：再接 Redis 和摘要

- 完成第 11～18 步。
- 先验证 Redis 重启恢复，再加摘要。
- 不要把两个改动混在一次调试里。

---

## 二十七、最终自测清单

### 代码

- [ ] `npm test -- --runInBand agent` 通过。
- [ ] `npm run build` 通过。
- [ ] 历史查询返回最近 100 条，并按旧到新显示。
- [ ] 页面恢复消息时使用数据库 `createdAt`。
- [ ] Checkpointer 由 NestJS 单例生命周期管理。
- [ ] 每次调用继续使用相同 `thread_id`。
- [ ] 没有把 MySQL 历史重复塞给 Checkpointer Agent。

### 行为

- [ ] 刷新页面后可见消息恢复。
- [ ] 重启 NestJS 后可见消息恢复。
- [ ] Redis Checkpointer 启用后，重启 NestJS 仍能恢复通用 Agent 状态。
- [ ] 新 conversationId 不会继承旧会话状态。
- [ ] 长对话达到阈值后会摘要，并保留最近消息。

### 原理

- [ ] 能解释 React state、MySQL、Checkpoint、业务状态、模型 Context 的区别。
- [ ] 能解释 conversationId、clientMessageId、turnId 的区别。
- [ ] 能解释为什么模型调用期间不保持数据库事务。
- [ ] 能解释为什么唯一索引还不等于完整幂等。
- [ ] 能解释为什么摘要不能替代结构化业务状态。

---

## 二十八、最后只记这条主线

如果原理又乱了，就回到下面这张图：

```text
浏览器生成并保存 conversationId
        ↓
POST /api/agent/chat
        ↓
DTO 校验格式
        ↓
ApplicationService 先保存 pending user
        ↓
AgentService 用 conversationId 作为 thread_id
        ↓
Checkpointer 恢复模型所需状态
        ↓
模型或业务 Service 生成回答
        ↓
ApplicationService 保存 completed assistant
        ↓
页面显示回答

刷新页面：GET MySQL 历史重新画气泡
重启服务：持久 Checkpointer 恢复模型状态
长对话：Middleware 选择、裁剪或摘要上下文
```

一句话总结：

> MySQL 保存“发生过什么”，Checkpointer 保存“Agent 运行到哪里”，业务状态保存“任务还缺什么”，上下文工程决定“这一次让模型看什么”。
