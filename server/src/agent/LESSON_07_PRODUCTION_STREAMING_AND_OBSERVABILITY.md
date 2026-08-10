# 第 7 课：生产级流式客服与可观测执行

> 本章基于当前项目中的 React、NestJS、LangChain.js v1 Agent 和 Nginx 编写。
>
> 本章目标不是简单地把文字一个字一个字显示出来，而是建立一套真正能上线的流式执行协议：用户能及时看到反馈，工具执行过程可理解，请求可以取消，断线可以恢复，服务端可以定位问题，同时不泄露模型内部推理和敏感数据。

---

## 一、先用白话理解：这一章到底解决什么问题

你现在的调用过程大致是：

```text
用户点击发送
  ↓
前端 POST /api/agent/chat
  ↓
后端 agent.invoke()
  ↓
模型可能调用一个或多个 Tool
  ↓
Agent 全部执行完成
  ↓
后端一次性返回 JSON
  ↓
前端显示完整答案
```

这套方式能工作，但用户在等待期间只能看到一个 loading。

假设一次客服请求需要：

```text
意图识别：0.6 秒
商品查询：1.2 秒
模型整理答案：3 秒
```

用户会连续等待接近 5 秒，而且不知道系统是否卡住。

本章要把体验改成：

```text
0.1 秒：已收到问题
0.5 秒：正在识别你的需求
1.0 秒：正在查询商品库存
2.0 秒：商品查询完成
2.2 秒开始：逐步显示最终回答
5.0 秒：本轮完成
```

这背后不只是“流式输出”四个字，而是五件事：

1. Agent 怎样把执行过程逐步交给后端。
2. 后端怎样把过程稳定地传给浏览器。
3. 浏览器怎样把事件还原成聊天界面状态。
4. 用户停止、断网、刷新时怎样处理。
5. 线上出问题时怎样知道慢在哪里、错在哪里。

---

## 二、本章完成后你应该具备的能力

完成本章后，你应该能独立解释并实现：

- `invoke()`、`stream()` 和 `streamEvents()` 的区别。
- LangChain 的 `messages`、`updates`、`custom` 等流模式分别表示什么。
- 为什么不应该把 LangChain 原始事件直接暴露给前端。
- 怎样设计自己的、带版本号的客服事件协议。
- 为什么当前项目优先使用 `POST + fetch + SSE 格式`。
- 为什么原生 `EventSource` 不适合直接替换当前 POST 请求。
- NestJS 如何正确写入 SSE 数据、处理背压和关闭连接。
- React 如何解析被任意切片的流，而不是假设一个网络块就是一个事件。
- Tool 进度与模型“思维过程”有什么本质区别。
- 怎样取消一次 Agent 运行，以及取消后哪些副作用无法自动撤销。
- 怎样做到断线续传、事件去重和最终消息只保存一次。
- Nginx 为什么可能缓冲流，以及如何为流式接口单独配置。
- 怎样使用 LangSmith 和结构化日志定位慢调用。
- 怎样测试中文 UTF-8 分片、网络断开、慢客户端和重复事件。
- 什么情况下继续用 LangChain Agent，什么情况下需要自定义 LangGraph。

---

## 三、本章使用的技术基线

本项目当前已经使用：

```text
React 19
Vite 7
NestJS 10
LangChain.js 1.x
@langchain/openai 1.x
createAgent()
Nginx
```

本章采用当前 LangChain.js v1 的两层 Streaming API：

```text
基础层：agent.stream()
事件层：agent.streamEvents(..., { version: "v3" })
```

需要特别注意：

- 当前官方文档把 Event Streaming v3 作为构建前端事件流的推荐方式。
- 你项目当前安装版本的类型声明仍将 v3 标记为实验性能力。
- “最新”不等于“可以把内部结构直接写死在全项目里”。
- 生产环境应该用一个 Adapter 隔离它，并锁定依赖版本、增加契约测试。

本章会同时讲解：

```text
最新方案：streamEvents v3 typed projections
稳定退路：stream() + messages / updates / custom
```

这样以后 LangChain 调整内部事件时，只修改一处适配器，不需要重写前端协议。

---

## 四、先看清三个完全不同的“流”

初学者最容易把下面三件事混在一起。

### 4.1 模型 Token 流

模型不是等完整答案生成完再返回，而是持续返回文本片段：

```text
“这”
“款”
“手机”
“目前”
“有货”
```

它解决的是“尽快显示回答”。

### 4.2 Agent 执行事件流

Agent 不只是生成文字，它还可能：

```text
调用模型
决定使用 search_product
开始执行 Tool
Tool 返回结果
再次调用模型
生成最终回答
```

这些步骤不是 Token，而是运行事件。

### 4.3 HTTP 传输流

即使 Agent 能产生事件，NestJS 也要通过 HTTP 把事件逐段发送给浏览器。

这层可能受到以下因素影响：

- Node.js 响应缓冲。
- Nginx 代理缓冲。
- gzip 压缩缓冲。
- CDN 或负载均衡器超时。
- 浏览器断开连接。
- 慢客户端导致背压。

所以完整链路是：

```text
模型 / Tool
  ↓ LangChain Stream
AgentStreamAdapter
  ↓ 业务事件
NestJS Streaming Controller
  ↓ SSE frames over HTTP
Nginx
  ↓
fetch() + ReadableStream
  ↓
React Reducer
  ↓
聊天页面
```

只完成其中一层，并不代表生产级流式客服已经完成。

---

## 五、invoke、stream 和 streamEvents 的区别

### 5.1 `invoke()`：等待最终状态

你当前使用的是：

```ts
const result = await agent.invoke({
  messages: [{ role: "user", content: message }],
});
```

它最适合：

- 初学阶段。
- 后台任务不需要实时反馈。
- 单元测试最终结果。
- 只关心最终 Agent State。

它的缺点是页面必须等全部步骤完成。

### 5.2 `stream()`：按模式读取执行过程

概念示例：

```ts
const stream = await agent.stream(
  {
    messages: [{ role: "user", content: message }],
  },
  {
    streamMode: "messages",
    signal,
  },
);

for await (const chunk of stream) {
  // 将 LangChain chunk 转换为自己的业务事件
}
```

常用模式：

| 模式 | 含义 | 客服中的用途 |
| --- | --- | --- |
| `messages` | 模型消息片段和元数据 | 最终回答逐步显示 |
| `updates` | 每一步完成后的状态更新 | 显示 Agent 当前执行到哪一步 |
| `custom` | Tool 或节点主动写出的自定义信息 | “正在查询库存”等安全进度 |

部分 LangGraph 版本还提供更专门的 Tool 生命周期流模式。不要让前端直接依赖这些内部类型，应统一通过后端适配器转换。

### 5.3 `streamEvents()` v3：面向应用的类型化事件投影

当前 LangChain.js 的 v3 Event Streaming 可以把一次运行投影成不同的可消费流：

```ts
const run = await agent.streamEvents(
  {
    messages: [{ role: "user", content: message }],
  },
  {
    version: "v3",
    signal,
  },
);

for await (const message of run.messages) {
  for await (const token of message.text) {
    process.stdout.write(token);
  }
}
```

还可以观察 Tool：

```ts
for await (const toolCall of run.toolCalls) {
  console.log(toolCall.name, toolCall.input);
  const output = await toolCall.output;
  console.log(output);
}
```

以及等待最终输出：

```ts
const finalState = await run.output;
```

它适合在一个后端 Adapter 中消费多个投影，再转换为你自己的事件。

### 5.4 本项目怎样选择

学习顺序建议：

```text
第一步：用 stream() + messages 理解 Token 流
第二步：加入 custom / updates 理解 Agent 进度
第三步：用 streamEvents v3 封装 AgentStreamAdapter
第四步：前端只认识自己的 CustomerServiceEvent
```

生产选择：

```text
LangChain 内部：可以使用最新 v3
业务边界：必须使用自己定义的稳定协议
```

---

## 六、最重要的架构原则：不要把 LangChain 原始事件发给前端

下面这种做法看起来省事，但不建议：

```ts
for await (const event of rawLangChainEvents) {
  response.write(JSON.stringify(event));
}
```

原因有五个：

1. LangChain 升级可能改变事件字段。
2. 原始事件可能非常大。
3. 原始 Tool 参数和结果可能包含用户隐私。
4. 内部节点名、Prompt、模型元数据不应该成为前端协议。
5. 前端会被迫理解 Agent 的内部执行模型。

正确的边界：

```text
LangChain raw stream
  ↓
AgentStreamAdapter
  ↓ 过滤、脱敏、归一化
CustomerServiceEvent v1
  ↓
Controller / SSE
  ↓
React
```

将来从 LangChain 换成自定义 LangGraph，甚至换成别的运行时，前端协议仍然可以不变。

---

## 七、设计自己的客服事件协议

### 7.1 所有事件共用的字段

```ts
type BaseStreamEvent = {
  version: 1;
  runId: string;
  conversationId: string;
  turnId: string;
  seq: number;
  timestamp: string;
};
```

字段含义：

| 字段 | 用途 |
| --- | --- |
| `version` | 协议升级时兼容旧客户端 |
| `runId` | 一次 Agent 执行的唯一 ID |
| `conversationId` | 属于哪个会话 |
| `turnId` | 属于哪一轮用户问答 |
| `seq` | 事件序号，用于排序、去重和续传 |
| `timestamp` | 服务端产生事件的时间 |

不要用数组下标代替这些 ID。

### 7.2 推荐的业务事件

```ts
type CustomerServiceEvent =
  | (BaseStreamEvent & {
      type: "run_started";
    })
  | (BaseStreamEvent & {
      type: "status";
      stage: "understanding" | "tool" | "answering";
      message: string;
    })
  | (BaseStreamEvent & {
      type: "assistant_delta";
      delta: string;
    })
  | (BaseStreamEvent & {
      type: "tool_started";
      toolCallId: string;
      toolName: string;
      displayName: string;
    })
  | (BaseStreamEvent & {
      type: "tool_finished";
      toolCallId: string;
      toolName: string;
      summary: string;
      durationMs: number;
    })
  | (BaseStreamEvent & {
      type: "assistant_final";
      messageId: string;
      content: string;
      model: string;
      source?: string;
    })
  | (BaseStreamEvent & {
      type: "run_failed";
      code: string;
      message: string;
      retryable: boolean;
    })
  | (BaseStreamEvent & {
      type: "run_cancelled";
      message: string;
    })
  | (BaseStreamEvent & {
      type: "done";
    });
```

### 7.3 为什么同时需要 `assistant_delta` 和 `assistant_final`

`assistant_delta` 是临时显示用的：

```text
这
款
商品
有货
```

`assistant_final` 是最终权威结果：

```text
这款商品当前有 18 件库存，可以购买。
```

最终事件可以：

- 校正临时片段。
- 携带最终 `messageId`。
- 告诉前端哪一段可以持久显示。
- 避免网络分片或重连导致字符重复。

前端收到 `assistant_final` 后，应以它的 `content` 覆盖当前草稿，而不是假设所有 delta 一定完整。

### 7.4 终态规则

每次 run 必须且只能产生一个业务终态：

```text
assistant_final
或 run_failed
或 run_cancelled
```

之后再发送一个传输结束事件：

```text
done
```

可以把它理解为：

```text
assistant_final / run_failed / run_cancelled
→ 业务结果是什么

done
→ 这条 HTTP 流不会再有业务数据
```

契约测试必须验证“终态最多一个”。

---

## 八、使用 Zod 验证流事件

第 3 章已经学习过 Zod。流式协议更应该使用 Zod，因为错误事件一旦进入前端 Reducer，通常比普通 JSON 错误更难定位。

示例：

```ts
import { z } from "zod";

const baseEventSchema = z.object({
  version: z.literal(1),
  runId: z.string().uuid(),
  conversationId: z.string().min(1),
  turnId: z.string().uuid(),
  seq: z.number().int().positive(),
  timestamp: z.string().datetime(),
});

const streamEventSchema = z.discriminatedUnion("type", [
  baseEventSchema.extend({
    type: z.literal("run_started"),
  }),
  baseEventSchema.extend({
    type: z.literal("status"),
    stage: z.enum(["understanding", "tool", "answering"]),
    message: z.string().max(200),
  }),
  baseEventSchema.extend({
    type: z.literal("assistant_delta"),
    delta: z.string(),
  }),
  baseEventSchema.extend({
    type: z.literal("assistant_final"),
    messageId: z.string().min(1),
    content: z.string(),
    model: z.string(),
    source: z.string().optional(),
  }),
  baseEventSchema.extend({
    type: z.literal("run_failed"),
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
  }),
  baseEventSchema.extend({
    type: z.literal("run_cancelled"),
    message: z.string(),
  }),
  baseEventSchema.extend({
    type: z.literal("done"),
  }),
]);

export type CustomerServiceEvent = z.infer<typeof streamEventSchema>;
```

正式实现时，再补充 `tool_started` 和 `tool_finished`。

服务端在开发和测试环境中可以对发出的事件执行 `parse()`；生产环境可以根据性能要求选择：

```text
在 Adapter 边界验证一次
而不是每经过一层都重复验证
```

前端必须把网络输入视为不可信数据，至少对关键字段验证。

---

## 九、SSE 到底是什么

SSE 全名 Server-Sent Events，本质上是一种文本事件格式。

一个事件长这样：

```text
id: 4
event: assistant_delta
data: {"version":1,"seq":4,"delta":"您好"}

```

最后的空行表示这个事件结束。

常用字段：

| 字段 | 含义 |
| --- | --- |
| `id` | 事件 ID，可用于重连位置 |
| `event` | 事件类型 |
| `data` | 数据，可以出现多行 |
| `retry` | 建议浏览器多久后重连 |
| `: comment` | 注释，可用作心跳 |

心跳示例：

```text
: ping

```

心跳不是业务事件，不应该增加业务 `seq`，也不应该出现在聊天记录里。

---

## 十、为什么本项目用 POST + fetch，而不是直接用 EventSource

浏览器原生 `EventSource` 很方便，但它天然更适合 GET：

```ts
new EventSource("/api/events");
```

当前聊天请求需要：

- POST 请求。
- JSON body。
- 可能携带 Authorization Header。
- 携带 `conversationId`、`clientMessageId` 和用户消息。

因此本项目的第一版推荐：

```text
POST /api/agent/conversations/:conversationId/messages/stream
Content-Type: application/json
Accept: text/event-stream

使用 fetch() 获取流式 Response
```

注意：

> SSE 既可以指浏览器 EventSource API，也可以指 `text/event-stream` 数据格式。这里使用 fetch 读取 SSE 格式，不使用原生 EventSource 建立请求。

---

## 十一、SSE、WebSocket 和 NDJSON 怎样选

| 方案 | 特点 | 适合场景 |
| --- | --- | --- |
| fetch + SSE 格式 | 基于普通 HTTP，事件语义清晰，服务端到浏览器流式 | 当前客服回答、Tool 进度 |
| 原生 EventSource | 自带 GET 重连机制，但请求能力受限 | 已创建 run 后订阅事件 |
| WebSocket | 真正双向、长连接、协议更复杂 | 坐席实时接管、在线状态、频繁双向事件 |
| NDJSON | 每行一个 JSON，简单 | 内部服务或不需要 SSE 语义的流 |

不要因为“WebSocket 听起来更实时”就默认选择它。

对于当前单用户发一条消息、服务端持续回答的场景：

```text
首选 fetch + SSE
```

以后加入这些能力时再认真评估 WebSocket：

- 人工客服实时接管。
- 多坐席共同观察。
- 在线状态和正在输入状态。
- 服务端频繁主动推送新会话。

---

## 十二、第一版接口与生产版接口

### 12.1 学习阶段：一个 POST 完成所有事情

```http
POST /api/agent/conversations/:conversationId/messages/stream
```

请求：

```json
{
  "message": "这款手机还有库存吗？",
  "clientMessageId": "01J..."
}
```

响应是一条持续写入的 SSE 流。

优点：简单，容易在当前项目中实现。

缺点：浏览器刷新后，不容易继续订阅同一个执行。

### 12.2 生产阶段：创建 run 和订阅事件分开

第一步创建运行：

```http
POST /api/agent/conversations/:conversationId/runs
```

返回：

```json
{
  "runId": "run_123",
  "turnId": "turn_456",
  "status": "queued"
}
```

第二步订阅：

```http
GET /api/agent/runs/run_123/events?after=18
Accept: text/event-stream
```

第三步主动取消：

```http
POST /api/agent/runs/run_123/cancel
```

这种方案允许：

- 页面刷新后继续订阅。
- 手机网络切换后从 `after=18` 继续。
- 一个 run 独立于某一条 HTTP 连接执行。
- 服务端保存和重放事件。
- 清楚区分“浏览器断开”和“用户点击停止”。

推荐路线：

```text
本章练习先完成单 POST 流
→ 理解所有机制
→ 再升级为 run resource
```

---

## 十三、NestJS Controller 应该做什么

Controller 的职责：

1. 验证身份、会话归属和 DTO。
2. 在写响应头之前完成所有可返回普通 HTTP 错误的检查。
3. 设置流式响应头。
4. 把业务事件编码为 SSE。
5. 处理心跳、背压、取消和关闭。
6. 不在 Controller 中编写 Agent 业务逻辑。

概念代码：

```ts
import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";

@Post("conversations/:conversationId/messages/stream")
async streamMessage(
  @Param("conversationId") conversationId: string,
  @Body() dto: StreamMessageDto,
  @Req() request: Request,
  @Res() response: Response,
): Promise<void> {
  // 1. 先验证用户和会话；失败时仍能返回普通 401/403/404
  const prepared = await this.agentRunService.prepare({
    conversationId,
    message: dto.message,
    clientMessageId: dto.clientMessageId,
  });

  // 2. 从这里开始，HTTP 状态码已经不能随便修改
  response.status(200);
  response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.setHeader("X-Accel-Buffering", "no");
  response.flushHeaders();

  const controller = new AbortController();

  const onConnectionClosed = () => {
    if (!response.writableEnded) {
      controller.abort("client_disconnected");
    }
  };

  request.once("aborted", onConnectionClosed);
  response.once("close", onConnectionClosed);

  const heartbeat = setInterval(() => {
    if (!response.writableEnded) {
      response.write(": ping\n\n");
    }
  }, 20_000);

  try {
    await this.agentRunService.executeStream({
      prepared,
      signal: controller.signal,
      emit: async (event) => {
        await writeSse(response, event);
      },
    });
  } finally {
    clearInterval(heartbeat);
    request.off("aborted", onConnectionClosed);
    response.off("close", onConnectionClosed);

    if (!response.writableEnded) {
      response.end();
    }
  }
}
```

这段代码是架构示例，不要整段复制后立刻上线。实际项目还需要补齐认证、异常分类、日志、幂等和测试。

---

## 十四、正确编码 SSE 事件

推荐每个 `data` 都放完整 JSON：

```ts
function encodeSse(event: CustomerServiceEvent): string {
  return [
    `id: ${event.seq}`,
    `event: ${event.type}`,
    `data: ${JSON.stringify(event)}`,
    "",
    "",
  ].join("\n");
}
```

不能只写：

```ts
response.write(JSON.stringify(event));
```

因为前端不知道两个 JSON 的边界在哪里。

也不要假设：

```text
一次 response.write
=
前端一次 reader.read
```

TCP、代理和浏览器都可以重新切分数据。

---

## 十五、背压：为什么 response.write() 会返回 false

如果服务端产生数据的速度比浏览器读取速度快，Node.js 会先把数据放进内存缓冲区。

当缓冲区满到一定程度：

```ts
response.write(data) === false
```

它并不表示写入报错，而是表示：

```text
请暂停产生更多数据，等 drain 事件
```

示例：

```ts
import { once } from "node:events";
import type { Response } from "express";

async function writeSse(
  response: Response,
  event: CustomerServiceEvent,
): Promise<void> {
  if (response.writableEnded || response.destroyed) {
    throw new Error("stream_closed");
  }

  const canContinue = response.write(encodeSse(event));

  if (!canContinue) {
    await once(response, "drain");
  }
}
```

生产代码还需要在等待 `drain` 时同时监听 `close`，否则客户端已经断开时可能一直等待。

为什么这很重要：

- 避免慢客户端无限占用内存。
- 避免高并发时一个进程被大量缓冲数据拖垮。
- 为限流和断开策略提供依据。

应该记录一个指标：

```text
stream_backpressure_wait_ms
```

---

## 十六、HTTP Header 写出后，错误处理规则发生了变化

普通接口可以：

```ts
throw new BadGatewayException("模型调用失败");
```

NestJS 会返回 HTTP 502 JSON。

但 SSE Header 一旦发送，HTTP 200 已经开始，后面不能再可靠地改成 502。

所以要分成两个阶段：

### 阶段 A：流开始前

可以使用正常 HTTP 状态：

```text
400 参数错误
401 未登录
403 无会话权限
404 会话不存在
409 同一会话已有运行
429 请求过多
```

### 阶段 B：流开始后

必须发送业务错误事件：

```json
{
  "type": "run_failed",
  "code": "MODEL_TIMEOUT",
  "message": "回答生成超时，请稍后重试。",
  "retryable": true
}
```

然后：

```text
发送 done
关闭响应
```

不要在流开始后再调用：

```ts
response.json(...)
```

否则常见错误是：

```text
Cannot set headers after they are sent to the client
```

---

## 十七、AgentStreamAdapter：隔离 LangChain 版本变化

建议新建一个单独职责的适配器：

```text
agent.stream-adapter.ts
```

接口可以先设计为：

```ts
type StreamSink = {
  emit(event: CustomerServiceEvent): Promise<void>;
};

type StreamRunInput = {
  message: string;
  conversationId: string;
  turnId: string;
  runId: string;
  userId: string;
  signal: AbortSignal;
};

interface AgentStreamAdapter {
  run(input: StreamRunInput, sink: StreamSink): Promise<FinalAnswer>;
}
```

Adapter 内部才允许认识：

```text
run.messages
run.toolCalls
run.output
LangChain message chunk
LangGraph metadata
```

Controller、React、数据库都不应该认识这些内部结构。

### 17.1 v3 的概念实现

```ts
const run = await agent.streamEvents(
  {
    messages: [{ role: "user", content: input.message }],
  },
  {
    version: "v3",
    signal: input.signal,
    configurable: {
      thread_id: input.conversationId,
    },
    context: {
      userId: input.userId,
      conversationId: input.conversationId,
    },
  },
);

const consumeMessages = consumeMessageProjection(run.messages, sink);
const consumeTools = consumeToolProjection(run.toolCalls, sink);

await Promise.all([consumeMessages, consumeTools]);

const finalState = await run.output;
```

注意：不同投影可以并发读取，但所有业务事件必须经过同一个安全的序号分配器：

```ts
let sequence = 0;

function nextBase(): BaseStreamEvent {
  sequence += 1;
  return {
    version: 1,
    runId,
    conversationId,
    turnId,
    seq: sequence,
    timestamp: new Date().toISOString(),
  };
}
```

如果多个异步消费者都能发事件，还要用串行队列保证：

```text
seq 分配顺序
=
真正写入顺序
```

仅靠 `sequence += 1` 并不能自动保证异步 `emit()` 完成顺序。

---

## 十八、一个容易忽略的问题：Agent 的每段模型文字都能直接显示吗

不能简单地认为所有模型 Token 都是最终答案。

Agent 可能发生：

```text
第一次模型调用：决定调用商品工具
第二次模型调用：根据工具结果生成最终回答
```

第一次模型调用产生的消息可能包含 Tool Call，甚至带有不适合展示的中间文本。

如果不加判断就把所有 `messages` Token 发给前端，可能出现：

- 页面先显示一段，之后又出现完全不同的最终答案。
- 暴露内部工具选择信息。
- 中间回答与最终工具结果冲突。

### 18.1 生产级保守策略

对每一次模型消息先在服务端缓冲：

```text
消息完成后存在 Tool Call
→ 不作为最终客服文字发出

消息完成后没有 Tool Call
→ 这是候选最终回答，再交给前端
```

代价是：Agent 场景中最终回答可能无法从第一个 Token 就显示。

### 18.2 更进一步的策略

如果你能明确区分节点：

```text
planner 节点
tool 节点
final_answer 节点
```

那么只流 `final_answer` 节点的 Token。

这正是以后自定义 LangGraph 可能更清晰的地方。

### 18.3 当前项目的建议

第一版采用：

```text
Tool 之前和执行中：显示代码定义的安全 status
最终回答阶段：流式显示用户可见文本
```

不要为了追求“马上出现第一个字”而牺牲正确性和隐私。

---

## 十九、Tool 进度怎样设计才安全

### 19.1 Tool 名称不能直接等于用户提示

内部名称：

```text
search_products_by_category_v2
```

用户提示：

```text
正在查询商品
```

建立白名单映射：

```ts
const TOOL_PRESENTATION = {
  search_product: {
    displayName: "商品查询",
    started: "正在查询商品信息",
    finished: "商品信息查询完成",
  },
  calculator: {
    displayName: "计算器",
    started: "正在计算",
    finished: "计算完成",
  },
} as const;
```

未知 Tool 不要把原始名称直接显示给用户：

```text
正在处理你的请求
```

### 19.2 不要把原始 Tool 输入输出发给浏览器

危险示例：

```json
{
  "tool": "query_order",
  "input": {
    "userId": 93812,
    "phone": "138..."
  },
  "output": {
    "address": "...",
    "internalCost": 88
  }
}
```

正确做法是只发送经过白名单处理的展示信息：

```json
{
  "type": "tool_finished",
  "toolName": "query_order",
  "displayName": "订单查询",
  "summary": "已找到你的订单信息",
  "durationMs": 183
}
```

### 19.3 Tool 主动报告进度

长时间 Tool 可以通过 LangChain/LangGraph 提供的 writer 写入安全进度。概念示例：

```ts
tool(
  async ({ keyword }, runtime) => {
    runtime.writer?.({
      kind: "progress",
      code: "SEARCHING_PRODUCT",
    });

    const result = await productService.findAll({ keyword });

    runtime.writer?.({
      kind: "progress",
      code: "PRODUCT_FOUND",
      count: result.total,
    });

    return result;
  },
  {
    name: "search_product",
    schema: searchProductSchema,
  },
);
```

Adapter 再把 code 翻译成用户文案。

不要允许 Tool 自由生成任意 HTML 或把数据库记录直接当作进度发送。

---

## 二十、绝对不要向用户展示模型隐藏推理

流式客服可以展示：

```text
正在理解问题
正在查询商品
正在核对库存
正在整理回答
```

这些是系统根据明确执行阶段生成的状态。

不应该展示或记录：

- 模型隐藏的 chain-of-thought。
- 完整内部推理过程。
- 系统 Prompt。
- Tool 原始参数与敏感结果。
- 安全策略的内部判定细节。

白话区别：

```text
“正在查询库存”
→ 真实、可验证的系统动作

“我先假设用户可能想买 A，然后在心里比较……”
→ 模型内部推理，不应提供
```

不要为了界面看起来聪明而伪造“思考过程”。

---

## 二十一、取消机制：AbortController 不是一个按钮那么简单

前端已经有 `AbortController`：

```ts
const controller = new AbortController();

fetch(url, {
  signal: controller.signal,
});

controller.abort();
```

后端也要创建 `AbortController`，再把 signal 传入 Agent：

```ts
await agent.streamEvents(input, {
  version: "v3",
  signal: controller.signal,
});
```

### 21.1 取消的传播链

```text
用户点击停止
→ 浏览器终止读取
→ HTTP 连接关闭或调用 cancel endpoint
→ NestJS AbortController.abort()
→ LangChain run 收到 signal
→ 模型请求尽快停止
→ Tool 尝试停止
→ run 状态标记 cancelled
```

### 21.2 Abort 不等于回滚

非常重要：

```text
取消模型等待
≠
撤销已经执行的数据库写操作
```

假设退款 Tool 已经调用支付系统成功，用户随后点击停止，不能把它当作“退款没有发生”。

所有有副作用的 Tool 必须考虑：

- 幂等键。
- 执行前确认。
- 审批。
- 事务边界。
- 补偿操作。
- 最终状态查询。

这类需求通常是开始自定义 LangGraph 和 Human-in-the-loop 的信号。

### 21.3 并非所有依赖都会响应 AbortSignal

模型 SDK可能支持 signal，但某个数据库驱动或第三方 SDK 可能不支持。

所以取消后还要做到：

- 不再向已关闭连接写数据。
- 不把不完整回答保存为最终消息。
- 记录后台操作是否仍在运行。
- 对写操作使用幂等键。

---

## 二十二、浏览器断开是否应该取消 Agent

有两种合理模式。

### 模式 A：连接断开就取消

适合学习版或短任务：

```text
HTTP 连接 = Agent 生命周期
```

优点：实现简单、节约模型费用。

缺点：用户刷新页面就丢失执行结果。

### 模式 B：Agent 独立运行，连接只负责订阅

适合生产级长任务：

```text
run 生命周期独立
HTTP 连接只是事件订阅者
```

用户断网后，run 可以继续；恢复连接后从 `seq` 继续读取。

这时“断开连接”和“用户取消”必须分开：

```text
断开：停止订阅，不一定停止 run
取消：调用明确的 cancel endpoint
```

当前学习建议先完成模式 A，再升级模式 B。

---

## 二十三、流式消息怎样持久化

不要每来一个 Token 就写一次 MySQL：

```text
“这” 写一次
“款” 再写一次
“商” 再写一次
……
```

这样会导致：

- 数据库写放大。
- 锁竞争。
- 大量无意义的历史版本。
- 中断时难以判断哪一版是最终内容。

推荐规则：

```text
用户消息：运行开始前保存一次
assistant_delta：只存在进程内存或短期 Redis
assistant_final：成功后事务性保存一次
run_failed：保存状态，不伪造 assistant final
run_cancelled：保存取消状态，可选保存明确标记的 partial draft
```

### 23.1 运行记录

生产环境建议增加运行记录：

```ts
type AgentRunRecord = {
  id: string;
  conversationId: string;
  turnId: string;
  clientMessageId: string;
  status:
    | "queued"
    | "running"
    | "completed"
    | "failed"
    | "cancelled";
  lastSeq: number;
  errorCode?: string;
  startedAt: Date;
  completedAt?: Date;
};
```

状态转换：

```text
queued → running → completed
                 → failed
                 → cancelled
```

禁止：

```text
completed → running
cancelled → completed
```

通过数据库约束或带条件的 update 防止重复终态。

---

## 二十四、幂等：网络重试不能生成两份回答

前端发送：

```json
{
  "message": "查一下 iPhone 库存",
  "clientMessageId": "01JABC..."
}
```

服务端建立唯一约束：

```text
(userId, conversationId, clientMessageId) UNIQUE
```

如果相同请求再次到达：

- 已完成：返回已有 run 和最终消息。
- 运行中：返回已有 run，让前端重新订阅。
- 已失败且允许重试：根据明确策略创建 retry attempt。
- 内容不同但 clientMessageId 相同：返回冲突错误。

不要仅根据消息文字去重，因为用户完全可能连续问两次同一句话。

---

## 二十五、断线续传与事件重放

要实现真正的恢复，服务端必须暂存或持久化事件。

### 25.1 最小方案：Redis List / Stream + TTL

每个 run 保存：

```text
key: agent:run:{runId}:events
value: 按 seq 排序的事件
TTL: 例如 30 分钟或按业务要求
```

更适合有序事件的方案是 Redis Streams。

订阅接口收到：

```http
GET /api/agent/runs/run_123/events?after=18
```

服务端先重放：

```text
seq > 18 的已保存事件
```

再切换到实时事件。

### 25.2 必须解决“重放到实时”之间的竞态

危险过程：

```text
读取历史到 seq=20
此时实时产生 seq=21
然后才开始订阅
```

如果实现不正确，21 会丢失。

Redis Streams 的阻塞读取或统一消息流可以降低这类竞态。不要自己用两个毫无协调的数组和 EventEmitter 拼接生产级恢复。

### 25.3 前端去重

前端保存：

```ts
let lastSeq = 0;

if (event.seq <= lastSeq) {
  return;
}

lastSeq = event.seq;
applyEvent(event);
```

去重前还要验证：

```text
event.runId 是否为当前 run
event.conversationId 是否匹配当前页面
```

---

## 二十六、React 端怎样读取 fetch 流

概念入口：

```ts
const response = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  },
  body: JSON.stringify({ message, clientMessageId }),
  signal: controller.signal,
});

if (!response.ok) {
  // 流开始前的普通 HTTP 错误
  throw new Error(`HTTP ${response.status}`);
}

const contentType = response.headers.get("content-type") ?? "";

if (!contentType.includes("text/event-stream")) {
  throw new Error("服务端没有返回事件流");
}

if (!response.body) {
  throw new Error("当前响应不支持流式读取");
}
```

接下来读取字节：

```ts
const reader = response.body.getReader();
const decoder = new TextDecoder("utf-8");
let buffer = "";

while (true) {
  const { value, done } = await reader.read();

  if (done) {
    buffer += decoder.decode();
    break;
  }

  buffer += decoder.decode(value, { stream: true });
  // 从 buffer 中解析零个、一个或多个完整 SSE event
}
```

### 26.1 为什么 `TextDecoder` 要使用 `{ stream: true }`

一个中文字符在 UTF-8 中通常占多个字节。

网络可能这样切：

```text
chunk 1：中文字符的前两个字节
chunk 2：中文字符的最后一个字节
```

如果每个 chunk 单独 decode，可能产生乱码 `�`。

`stream: true` 会保留未完成字节，等下一个 chunk 拼完整。

### 26.2 为什么不能按 chunk 直接 JSON.parse

一次 `reader.read()` 可能得到：

- 半个事件。
- 一个事件。
- 三个事件。
- 上一个事件尾部和下一个事件头部。

所以必须维护 `buffer`，按 SSE 空行边界解析。

生产代码可以使用维护良好的 SSE parser 库，或者为自己的小型 parser 编写完整分片测试。不要依靠本地网络“刚好一次一个事件”的现象。

---

## 二十七、前端 Reducer：把网络事件转换成 UI 状态

推荐状态：

```ts
type ActiveRun = {
  runId: string;
  turnId: string;
  status: "connecting" | "running" | "completed" | "failed" | "cancelled";
  stageText?: string;
  draftMessageId: string;
  draftContent: string;
  lastSeq: number;
  activeTools: Record<string, {
    displayName: string;
    startedAt: string;
  }>;
};
```

事件处理规则：

| 事件 | UI 操作 |
| --- | --- |
| `run_started` | 建立 active run |
| `status` | 更新状态提示 |
| `assistant_delta` | 追加到 assistant 草稿 |
| `tool_started` | 显示安全 Tool 进度 |
| `tool_finished` | 标记 Tool 已完成 |
| `assistant_final` | 用最终内容覆盖草稿并完成 |
| `run_failed` | 保留用户消息，显示可重试错误 |
| `run_cancelled` | 标记已停止，不冒充完整回答 |
| `done` | 释放 reader 和 loading 状态 |

Reducer 必须是幂等或至少能基于 `seq` 拒绝重复事件。

---

## 二十八、不要每个 Token 都触发一次 React 重渲染

如果每个很小的 delta 都调用：

```ts
setMessages(...)
```

高频流可能造成：

- 重渲染太频繁。
- Markdown 反复完整解析。
- 页面滚动抖动。
- 低端手机卡顿。

建议把小片段暂存在 `ref`，再按帧或 30～50ms 批量刷新：

```ts
pendingTextRef.current += event.delta;

if (flushHandleRef.current === null) {
  flushHandleRef.current = requestAnimationFrame(() => {
    const batch = pendingTextRef.current;
    pendingTextRef.current = "";
    flushHandleRef.current = null;
    appendAssistantDraft(batch);
  });
}
```

最终事件到达前必须先 flush 剩余片段，然后用 `assistant_final.content` 校正。

---

## 二十九、流式聊天页面的体验细节

### 29.1 自动滚动

只有用户原本接近底部时才自动滚动。

如果用户向上阅读历史消息，不要每个 Token 都把页面强行拉回底部。

### 29.2 无障碍

不要让 `aria-live` 每个 Token 都朗读一次。

可以：

- 状态变化时播报简短提示。
- 最终回答完成后再播报完整内容。
- 停止按钮有明确的 aria-label。

### 29.3 Markdown 安全

如果以后渲染 Markdown：

- 默认不允许任意 HTML。
- 对链接协议做白名单。
- 防止 `javascript:` URL。
- 不直接使用未清洗的 `dangerouslySetInnerHTML`。
- 流式阶段可先显示纯文本，完成后再完整渲染 Markdown。

### 29.4 状态文案

好的文案：

```text
正在查询商品信息
正在核对库存
正在整理回答
```

不好的文案：

```text
模型正在执行 node_3
正在调用 searchProductDemoTool({ ... })
系统正在进行 chain-of-thought
```

---

## 三十、Nginx 配置：为什么本地流式，线上却一次性出现

最常见原因之一是代理缓冲。

你当前的通用 `/api` 配置包含：

```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection 'upgrade';
```

这是 WebSocket 常见配置，SSE 不需要 HTTP Upgrade。

建议给流式接口建立更具体的 location，并放在通用 `/api` 规则之前：

```nginx
location /api/agent/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";

    proxy_buffering off;
    proxy_cache off;
    gzip off;

    proxy_read_timeout 300s;
    proxy_send_timeout 300s;

    add_header X-Accel-Buffering no;
}
```

实际路由较多时，可以只对 `/stream` 接口关闭缓冲，普通 JSON 接口继续使用常规配置。

注意：

- `proxy_buffering off` 是关键点之一。
- 应用响应也设置 `X-Accel-Buffering: no`。
- gzip 可能让小块数据积累后再输出，流式路由通常关闭。
- 心跳间隔必须短于代理、CDN 和负载均衡器的空闲超时。
- 不能只把 timeout 改成 900 秒就认为问题解决。

修改后必须通过真正的线上 Nginx 路径验证，而不只是直连 `localhost:3000`。

---

## 三十一、超时应该分层，而不是只有一个 15 分钟超时

建议区分：

```text
连接模型超时
等待首个事件超时
单个 Tool 超时
整次 run 最大时间
客户端空闲超时
Nginx read timeout
```

示例策略不是固定答案：

| 类型 | 示例 | 超时后的动作 |
| --- | --- | --- |
| 模型连接 | 10 秒 | 可重试或切换供应商 |
| 首事件 | 15 秒 | 发送安全状态或失败 |
| 商品只读查询 | 3 秒 | Tool 失败，提示稍后重试 |
| 整体 run | 60 秒 | Abort 并进入 failed |
| 心跳 | 每 20 秒 | 保持代理连接活跃 |
| Nginx read | 300 秒 | 必须大于正常心跳间隔 |

避免无限等待。

同样也不要对所有错误自动重试：

- 401/403：不重试。
- 参数错误：不重试。
- 模型 429：读取 Retry-After，有限退避。
- 短暂 5xx：可有限重试。
- 有副作用 Tool：没有幂等保证时绝不盲目重试。

---

## 三十二、同一会话并发运行怎样处理

第 6 章已经学习会话状态。如果用户在上一个回答未结束时又发一条消息，会发生：

```text
两个 run 同时读取相同历史
两个 run 同时写入回答
消息顺序和 checkpointer 状态冲突
```

初期最安全策略：

```text
同一 conversation 同时只允许一个 running run
不同 conversation 可以并发
```

实现方式可以是：

- 数据库唯一约束和状态条件。
- Redis 分布式锁。
- 每会话队列。

不要只依赖前端 `loading` 禁用按钮，因为用户可能：

- 打开两个浏览器标签。
- 重复提交 HTTP 请求。
- 绕过前端直接调用 API。

以后如果支持“用户打断上一轮并提出新问题”，必须明确：

```text
取消旧 run
→ 确认旧 run 进入终态
→ 再启动新 run
```

---

## 三十三、可观测性到底要观察什么

“打印 error”不是完整可观测性。

生产客服至少要回答：

- 哪个用户的哪一轮失败了？
- HTTP 接到了请求吗？
- 模型多久返回第一个 Token？
- 是模型慢、Tool 慢、数据库慢，还是客户端读取慢？
- 调用了哪个 Tool，是否成功，耗时多久？
- 最终回答有没有持久化？
- 用户主动取消，还是网络断开？
- 相同请求是否被重复执行？

---

## 三十四、统一关联 ID

建议贯穿整个链路：

```text
requestId
traceId
runId
turnId
conversationId
clientMessageId
thread_id
```

职责：

| ID | 说明 |
| --- | --- |
| `requestId` | 一次 HTTP 请求 |
| `traceId` | 一条跨服务追踪 |
| `runId` | 一次 Agent 执行 |
| `turnId` | 一轮用户问答 |
| `conversationId` | 整个客服会话 |
| `clientMessageId` | 客户端重试幂等键 |
| `thread_id` | LangGraph Checkpointer 的线程标识 |

这些 ID 有关联但不能全部混成一个值。

日志示例：

```json
{
  "level": "info",
  "event": "agent_tool_finished",
  "requestId": "req_...",
  "traceId": "trace_...",
  "runId": "run_...",
  "conversationId": "conv_...",
  "toolName": "search_product",
  "durationMs": 183,
  "success": true
}
```

不要默认记录：

- 完整用户问题。
- 完整模型回答。
- Tool 原始输入输出。
- 手机号、地址、订单明细。
- API Key 和 Authorization Header。

---

## 三十五、必须记录的指标

### 35.1 用户体验指标

```text
time_to_first_status_ms
time_to_first_token_ms
total_run_duration_ms
```

TTFT 是 Time To First Token。它与总耗时不同：

```text
总耗时 8 秒但 0.8 秒开始输出
通常比
总耗时 6 秒但 6 秒一直白屏
体验更好
```

### 35.2 Agent 和 Tool 指标

```text
model_call_duration_ms
tool_call_duration_ms{tool_name}
tool_call_total{tool_name,status}
agent_step_count
input_tokens
output_tokens
estimated_cost
```

### 35.3 流式系统指标

```text
active_streams
stream_completed_total
stream_failed_total{code}
stream_cancelled_total{reason}
stream_disconnect_total
stream_backpressure_wait_ms
stream_replay_event_total
duplicate_event_total
```

### 35.4 业务质量指标

```text
intent_accuracy
product_result_hit_rate
handoff_rate
user_reask_rate
answer_grounded_rate
customer_satisfaction
```

技术指标正常不代表客服回答一定正确，所以业务质量指标不能省略。

---

## 三十六、LangSmith 在本章中的作用

LangSmith 适合观察：

- 一次 Agent 调用了几次模型。
- 调用了哪些 Tool。
- 每一步耗时。
- Token 使用量。
- 哪一步报错。
- 输入输出之间的执行关系。

`createAgent` 的运行可以接入 tracing。常见环境变量：

```dotenv
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=你的_LangSmith_Key
LANGSMITH_PROJECT=fe-customer-service-production
```

不要把 Key 放到前端，也不要提交真实 Key 到 Git。

生产环境建议给运行增加：

```text
tags：环境、版本、Agent 名称
metadata：runId、匿名化 userId、conversationId、业务入口
```

但需要遵守隐私策略：

- userId 可以哈希或使用内部匿名 ID。
- 评估是否允许上传完整消息内容。
- 设置采样和保留期限。
- 对敏感字段做脱敏。
- 确认供应商数据区域与合规要求。

LangSmith 不是应用日志和基础设施监控的替代品。

推荐组合：

```text
LangSmith
→ 模型、Agent、Tool trace

OpenTelemetry / APM
→ HTTP、NestJS、数据库、Redis、外部服务

结构化日志
→ 业务状态、错误分类、审计

Metrics
→ 趋势、告警、SLO
```

用 `runId` 或 `traceId` 把它们关联起来。

---

## 三十七、错误分类与用户文案必须分开

内部错误：

```text
ECONNRESET from model gateway
OpenAI-compatible endpoint returned malformed chunk
QueryFailedError: connection pool exhausted
```

不能原样发给用户。

定义稳定错误码：

```ts
type PublicRunErrorCode =
  | "MODEL_TIMEOUT"
  | "MODEL_UNAVAILABLE"
  | "TOOL_TIMEOUT"
  | "TOOL_UNAVAILABLE"
  | "RATE_LIMITED"
  | "RUN_CONFLICT"
  | "INTERNAL_ERROR";
```

用户事件：

```json
{
  "type": "run_failed",
  "code": "MODEL_UNAVAILABLE",
  "message": "AI 客服暂时不可用，请稍后重试或联系人工客服。",
  "retryable": true
}
```

服务端日志保存可诊断信息，但仍需脱敏：

```json
{
  "code": "MODEL_UNAVAILABLE",
  "providerStatus": 502,
  "runId": "run_123",
  "causeName": "APIConnectionError"
}
```

不要把 stack、API Key、完整请求 Header 发给前端。

---

## 三十八、生产安全清单

流式接口同样需要完整安全边界：

- 在开始流之前验证登录状态。
- 验证 conversationId 属于当前用户。
- 限制 message 长度。
- 限制同时运行数。
- 限制单次运行最大时间和 Token。
- 限制 Tool 调用次数。
- Tool 参数用 Zod 验证。
- Tool 内部重新做授权，不信任模型传入 userId。
- 不向前端暴露 Prompt、原始 Tool 输出和隐藏推理。
- 日志、Trace、事件缓存都做隐私控制。
- 渲染 Markdown 时防 XSS。
- CORS 线上使用明确域名，不保持全开放。
- 对事件订阅接口也做权限检查。
- 取消接口验证 run 归属。
- 高风险写操作需要审批和幂等。

尤其牢记：

```text
模型说“这个用户有权限”没有任何安全效力
```

权限必须由后端根据已认证身份判断。

---

## 三十九、测试策略：不要只在浏览器看起来能动

### 39.1 事件协议单元测试

测试：

- 每种事件都通过 Zod。
- 缺少 `runId` 时失败。
- `seq` 不是正整数时失败。
- 未知事件类型失败。
- 终态只能出现一次。
- `done` 之后不再允许业务事件。

### 39.2 SSE Encoder 测试

输入一个事件，断言：

```text
id 正确
event 正确
data 是合法 JSON
末尾有两个换行
```

### 39.3 前端 Parser 分片测试

同一个事件分别测试：

```text
一次完整到达
每个字符一个 chunk
两个事件合在一个 chunk
中文字符从 UTF-8 字节中间切开
最后一个 chunk 不完整
包含 : ping 心跳
包含多行 data
```

### 39.4 Adapter 契约测试

使用 Fake Model 和 Fake Tool，不调用真实付费 API。

断言：

- Tool 调用前后产生安全事件。
- 原始 Tool 输入没有泄露。
- 最终文本只产生一个 `assistant_final`。
- Adapter 异常时产生 `run_failed`。
- Abort 后产生 `run_cancelled`。
- `seq` 严格递增。

### 39.5 集成测试

启动 NestJS 测试应用，验证：

- 正确 Content-Type。
- Header 发出后逐步读取。
- 客户端断开会触发预期取消策略。
- 心跳持续发送。
- 普通权限错误在流开始前返回 403。
- 流开始后的模型错误通过事件返回。

### 39.6 线上链路测试

必须经过：

```text
浏览器
→ 公网域名
→ HTTPS / CDN（如有）
→ Nginx
→ NestJS
→ Fake 或真实模型
```

因为直连 NestJS 正常，不能证明 Nginx 没有缓冲。

### 39.7 压力与故障测试

测试：

- 100 个并发 stream 时内存是否持续增长。
- 慢客户端是否触发背压。
- 模型 429。
- Tool 超时。
- Redis 暂时不可用。
- Nginx 重启。
- 浏览器断网后重连。
- 相同 `clientMessageId` 重复提交。

---

## 四十、你当前项目的改造文件地图

建议以后实现时逐个新增，不要把所有逻辑塞进 `agent.service.ts`。

```text
server/src/agent/
├── agent.controller.ts
├── agent.service.ts
├── agent.stream-adapter.ts
├── agent.stream-protocol.ts
├── agent.stream-sse.ts
├── agent.run.service.ts
├── agent.run.entity.ts             # 生产版
├── agent.run.repository.ts         # 生产版
├── agent.stream-adapter.spec.ts
├── agent.stream-protocol.spec.ts
└── agent.stream-sse.spec.ts

src/
├── AgentChat.tsx
├── agent-stream.ts
├── agent-stream.reducer.ts
└── agent-stream.spec.ts

deploy/
└── nginx.conf
```

职责：

| 文件 | 职责 |
| --- | --- |
| `agent.stream-protocol.ts` | Zod 事件协议与 TypeScript 类型 |
| `agent.stream-adapter.ts` | LangChain 原始流转业务事件 |
| `agent.stream-sse.ts` | SSE 编码和背压写入 |
| `agent.run.service.ts` | run 生命周期、取消、持久化 |
| `agent-stream.ts` | 前端 fetch 和 parser |
| `agent-stream.reducer.ts` | UI 状态转换 |

`agent.service.ts` 仍然可以保留原来的非流式 `chat()`，便于回归和降级。

---

## 四十一、分阶段实战路线

不要第一天就做 Redis 重放、LangSmith、WebSocket 和 LangGraph。

### 阶段 1：只理解模型文字流

任务：

1. 新增一个实验性后端接口。
2. 使用 `stream()` 或模型 `.stream()`。
3. 在服务端控制台打印 chunk。
4. 暂时不改前端。

验收：

- 能解释一个 chunk 为什么不一定是一个字。
- 能正确拼成最终文本。
- 中文没有乱码。
- AbortSignal 能停止等待。

### 阶段 2：建立业务事件协议

任务：

1. 新建 `agent.stream-protocol.ts`。
2. 用 Zod 定义核心事件。
3. 编写事件序号器。
4. 编写终态检查测试。

验收：

- 前端协议没有任何 LangChain 类型。
- `seq` 从 1 严格递增。
- 事件有版本号。
- 原始 Tool 内容不会进入协议。

### 阶段 3：NestJS 输出 SSE

任务：

1. 新增 POST stream endpoint。
2. 设置正确 Header。
3. 编写 encoder。
4. 加入心跳。
5. 处理背压和连接关闭。

验收命令示例：

```bash
curl -N \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  -X POST \
  --data '{"message":"查询手机库存","clientMessageId":"lesson-7-001"}' \
  http://localhost:3000/api/agent/conversations/demo/messages/stream
```

`-N` 表示 curl 不缓冲输出。

验收：

- 事件逐步出现，不是最后一次出现。
- 每个事件可单独解析。
- 每 20 秒左右可以看到心跳。
- 中途 Ctrl+C 后服务端能感知断开。

### 阶段 4：React 读取流

任务：

1. 将请求逻辑从组件中拆到 `agent-stream.ts`。
2. 正确处理 TextDecoder 和跨 chunk buffer。
3. 用 reducer 更新草稿。
4. 增加停止按钮。
5. 批量渲染 Token。

验收：

- 回答逐步显示。
- 停止后 loading 结束。
- 新一轮不会混入上一轮事件。
- 页面卸载时释放 reader 和 controller。
- HTTP 错误与流内错误显示不同提示。

### 阶段 5：加入 Tool 生命周期

任务：

1. Adapter 观察 Tool 调用。
2. 使用白名单映射展示名称。
3. 记录 Tool 耗时。
4. 长 Tool 使用 custom progress。

验收：

- 页面能显示“正在查询商品”。
- 浏览器 Network 中看不到完整数据库对象。
- 未知 Tool 使用通用文案。
- Tool 报错时产生安全错误事件。

### 阶段 6：线上代理和可观测性

任务：

1. 为流式路由调整 Nginx。
2. 配置 LangSmith tracing。
3. 增加结构化日志和核心指标。
4. 通过公网域名执行测试。

验收：

- 线上也能逐步显示。
- 能从 runId 找到日志与 Trace。
- 能区分 TTFT 和总耗时。
- 日志与 Trace 不泄露 Key。

### 阶段 7：生产恢复能力

任务：

1. 建立 AgentRun 状态。
2. 将创建 run 与订阅分离。
3. 使用 Redis Stream 暂存事件。
4. 支持 `afterSeq` 重放。
5. 新增明确 cancel endpoint。

验收：

- 刷新页面后能继续显示同一个 run。
- 重放事件不会重复文字。
- 同一 `clientMessageId` 不创建两个 run。
- 一个会话的事件不会被另一个用户读取。

---

## 四十二、建议先写的测试清单

完成一个就打勾：

- [ ] `encodeSse()` 产生正确的空行边界。
- [ ] 一个 SSE 事件被拆成 10 个 chunk 仍能解析。
- [ ] 两个 SSE 事件在同一个 chunk 中仍能解析。
- [ ] 中文字符按字节拆开不会乱码。
- [ ] 心跳注释不会进入业务 reducer。
- [ ] 重复 `seq` 不会重复追加文本。
- [ ] `assistant_final` 会覆盖不完整草稿。
- [ ] `done` 后的事件被拒绝或忽略。
- [ ] 流开始前的 403 是普通 HTTP 错误。
- [ ] 流开始后的模型失败产生 `run_failed`。
- [ ] Abort 后不会保存 assistant final。
- [ ] Tool 原始参数不会发给前端。
- [ ] 同一会话只能有一个 active run。
- [ ] 不同会话可以并发运行。
- [ ] Nginx 公网路径不会把全部输出缓冲到最后。

---

## 四十三、常见错误排查表

### 问题 1：本地一次一个字，线上最后一起出现

检查顺序：

1. `curl -N` 直连 NestJS 是否流式。
2. `curl -N` 经过 Nginx 是否流式。
3. `Content-Type` 是否是 `text/event-stream`。
4. 是否设置 `proxy_buffering off`。
5. 是否设置 `X-Accel-Buffering: no`。
6. 是否被 gzip、CDN 或网关缓冲。

### 问题 2：前端偶尔 JSON.parse 报错

大概率原因：把一次 `reader.read()` 当成一个完整事件。

修复：保留 buffer，按 SSE 帧边界解析。

### 问题 3：中文偶尔出现乱码

大概率原因：`TextDecoder.decode(value)` 没用流模式。

修复：

```ts
decoder.decode(value, { stream: true });
```

结束时再：

```ts
decoder.decode();
```

### 问题 4：取消后服务器还在调用 Tool

原因可能是 Tool 或底层 SDK 不支持 AbortSignal，或者副作用已经发生。

修复方向：

- 将 signal 传到支持它的依赖。
- 使用 Tool 超时。
- 写操作使用幂等键。
- 取消后禁止保存错误终态。
- 高风险操作走审批和状态查询。

### 问题 5：一段回答出现两次

检查：

- 重连后是否按 seq 去重。
- 是否同时消费两个重复投影。
- `assistant_final` 是覆盖还是追加。
- 同一 clientMessageId 是否创建了两个 run。

### 问题 6：出现 `headers already sent`

原因：SSE 开始后又让 NestJS 返回普通 JSON 异常。

修复：流内失败使用 `run_failed`，然后结束流。

### 问题 7：内存持续增长

检查：

- 心跳 interval 是否在 finally 清理。
- reader 和事件监听器是否释放。
- 是否忽略了 response.write 背压。
- 事件缓存是否有 TTL 和大小上限。
- 草稿是否无限保留。

---

## 四十四、什么时候本章需要自定义 LangGraph

仅仅为了 Token Streaming：

```text
不需要自己画 StateGraph
```

`createAgent` 的 Streaming 已经能覆盖第一版。

出现以下需求时，应该认真考虑自定义 LangGraph：

- 必须只从明确的 `final_answer` 节点流文字。
- Tool 前需要暂停等待用户确认。
- 退款、改地址等写操作需要人工审批。
- 网络断开后要从某个业务节点恢复，而不是整轮重跑。
- 有明确的并行检索和汇总节点。
- 不同错误需要从不同节点恢复。
- 一个任务跨小时或跨天。
- 需要清晰控制循环次数和分支。

本章出现的“流式”不是使用自定义 LangGraph 的充分条件；“可暂停、可恢复、有复杂业务状态机”才更接近充分理由。

---

## 四十五、当前项目第一版的推荐决策

结合你现在仍在学习阶段，建议第一版固定以下选择：

| 问题 | 第一版选择 |
| --- | --- |
| Agent API | 继续使用 `createAgent` |
| Streaming | 先理解 `stream()`，适配器可使用 v3 `streamEvents()` |
| 协议 | 自定义 `CustomerServiceEvent v1` |
| HTTP | POST + fetch + SSE 格式 |
| 页面 | React Reducer + AbortController |
| Tool 进度 | 白名单安全文案 |
| 断开行为 | 第一版断开即取消 |
| 持久化 | 用户消息一次、最终回答一次 |
| Nginx | 流式路由关闭 buffering 和 gzip |
| Trace | LangSmith + runId |
| 基础设施 | 先不引入 WebSocket 和消息队列 |
| LangGraph | 暂时不自定义图 |

等第一版稳定后，再增加：

```text
独立 run resource
Redis Stream 重放
明确 cancel endpoint
断线续传
OpenTelemetry
自定义 LangGraph 审批节点
```

---

## 四十六、本章学习验收题

如果下面问题能用自己的话回答，说明不是只会复制代码。

1. `invoke()` 和 `stream()` 的返回方式有什么不同？
2. Token 流、Agent 事件流和 HTTP 流为什么不是一回事？
3. 为什么不能把 LangChain 原始事件直接发给 React？
4. `seq` 对重连和去重有什么作用？
5. 为什么原生 EventSource 不适合当前 POST JSON 请求？
6. 为什么一次 `reader.read()` 不能直接 `JSON.parse()`？
7. `TextDecoder` 为什么需要 `{ stream: true }`？
8. 为什么必须同时有 `assistant_delta` 和 `assistant_final`？
9. Header 发出后的异常为什么不能再返回 HTTP 502 JSON？
10. `response.write()` 返回 false 表示什么？
11. 心跳为什么建议使用 SSE comment？
12. 为什么 Tool 进度不能包含原始输入输出？
13. Tool 进度和 chain-of-thought 有什么不同？
14. 用户点击取消后，已经发生的退款会自动回滚吗？
15. 浏览器断开和主动取消为什么应在生产版区分？
16. 为什么不能每个 Token 写一次 MySQL？
17. `clientMessageId` 如何避免网络重试造成两次执行？
18. TTFT 和总耗时分别说明什么？
19. 为什么 LangSmith 不能替代应用日志与 APM？
20. 什么需求出现时应该从 `createAgent` 进入自定义 LangGraph？

---

## 四十七、本章作业

### 必做作业 A：画出真实链路

在自己的笔记中画出：

```text
AgentChat.tsx
→ Nginx
→ AgentController
→ AgentRunService
→ AgentStreamAdapter
→ createAgent
→ ChatOpenAI / Tool
```

在每条箭头旁写出传输的数据类型。

### 必做作业 B：实现纯函数

先不碰模型，实现并测试：

```text
encodeSse(event)
parseSseChunk(chunk)
reduceAgentEvent(state, event)
```

### 必做作业 C：Fake Stream

后端每 300ms 发送：

```text
run_started
status
assistant_delta
assistant_delta
assistant_final
done
```

不调用真实模型，先证明网络和页面正确。

### 必做作业 D：接入真实 Agent

用 Adapter 替换 Fake Stream，保证前端协议完全不变。

### 必做作业 E：线上验证

通过正式域名运行 `curl -N`，记录：

- 第一个状态事件耗时。
- 第一个回答片段耗时。
- 总耗时。
- Tool 耗时。
- 停止后的服务端日志。

### 进阶作业

实现 run resource + Redis Stream，刷新页面后继续订阅。

---

## 四十八、上线前检查清单

### 协议

- [ ] 事件有版本号。
- [ ] 每个 run 的 seq 严格递增。
- [ ] 只有一个业务终态。
- [ ] done 后不再发送事件。
- [ ] 最终消息拥有稳定 messageId。

### 服务端

- [ ] 身份和会话权限在 flushHeaders 前验证。
- [ ] 使用正确 SSE Header。
- [ ] 有心跳且 finally 清理。
- [ ] 处理 response.write 背压。
- [ ] 捕获客户端断开。
- [ ] 将 signal 传给 Agent。
- [ ] 流内错误使用安全事件。
- [ ] 不记录或输出敏感数据。

### 前端

- [ ] 使用 TextDecoder 流模式。
- [ ] parser 支持任意网络分片。
- [ ] 事件先验证再进入 reducer。
- [ ] 使用 seq 去重。
- [ ] Token 批量刷新。
- [ ] 支持停止。
- [ ] final 覆盖 draft。
- [ ] Markdown 渲染防 XSS。
- [ ] 不强制打断用户阅读位置。

### Nginx 和部署

- [ ] stream 路由关闭 proxy buffering。
- [ ] stream 路由关闭 gzip。
- [ ] SSE 不使用 WebSocket Upgrade。
- [ ] 心跳小于所有中间层 idle timeout。
- [ ] 通过公网域名验证逐段到达。

### 数据与运行

- [ ] 用户消息只保存一次。
- [ ] 最终 assistant 消息只保存一次。
- [ ] clientMessageId 有唯一约束。
- [ ] 同一会话并发策略明确。
- [ ] 取消不被误认为成功。
- [ ] 高风险 Tool 有幂等和审批。

### 可观测性

- [ ] 日志可以通过 runId 关联。
- [ ] 记录 TTFT 和总耗时。
- [ ] 记录 Tool 耗时和结果状态。
- [ ] 区分失败、取消和断线。
- [ ] LangSmith Trace 有隐私策略。
- [ ] 有模型不可用和错误率告警。

---

## 四十九、官方资料

建议按本章遇到的问题查阅，不需要一次读完：

- LangChain.js Streaming：<https://docs.langchain.com/oss/javascript/langchain/streaming>
- LangChain.js Event Streaming：<https://docs.langchain.com/oss/javascript/langchain/event-streaming>
- LangGraph.js Streaming：<https://docs.langchain.com/oss/javascript/langgraph/streaming>
- LangChain.js Frontend：<https://docs.langchain.com/oss/javascript/langchain/frontend/overview>
- LangChain.js Tools：<https://docs.langchain.com/oss/javascript/langchain/tools>
- LangChain Observability：<https://docs.langchain.com/oss/javascript/langchain/observability>
- LangSmith Observability Quickstart：<https://docs.langchain.com/langsmith/observability-quickstart>
- NestJS Controllers：<https://docs.nestjs.com/controllers>
- Node.js HTTP：<https://nodejs.org/api/http.html>
- MDN Streams API：<https://developer.mozilla.org/docs/Web/API/Streams_API>
- MDN TextDecoder：<https://developer.mozilla.org/docs/Web/API/TextDecoder>
- MDN Server-sent events：<https://developer.mozilla.org/docs/Web/API/Server-sent_events>
- Nginx proxy buffering：<https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_buffering>

版本升级时，优先查看当前安装版本的 TypeScript 类型和官方迁移说明，不要只依赖几年前的博客代码。

---

## 五十、本章一句话总结

第 6 章解决的是：

```text
会话怎样记住、恢复和选择正确上下文
```

第 7 章解决的是：

```text
Agent 执行时怎样持续、安全、可恢复地把结果交给页面
+
线上怎样知道它为什么快、为什么慢、为什么失败
```

最终架构：

```text
LangChain createAgent
  ↓ stream / streamEvents v3
AgentStreamAdapter
  ↓ CustomerServiceEvent v1
NestJS + POST streaming
  ↓ SSE frames
Nginx（关闭流式路由缓冲）
  ↓
fetch + ReadableStream + TextDecoder
  ↓
React Reducer

同时：
runId / traceId
  → LangSmith + Logs + Metrics
```

请牢记：

> 生产级流式客服不是把每个 Token 原样转发，而是用稳定业务协议管理进度、最终结果、错误、取消、重连、隐私和可观测性。

完成本章后，继续学习[第 8 课：生产级客服知识库与 RAG](./LESSON_08_PRODUCTION_RAG_AND_KNOWLEDGE_BASE.md)：使用文档切分、向量检索、关键词检索、混合召回、重排序、引用、权限过滤和离线评估，让客服回答企业自己的知识，同时能够说明答案来自哪里。
