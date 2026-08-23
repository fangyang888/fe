# 第 7 课跟敲版（上）：后端事件协议、Agent Streaming 与 SSE 自测

> 配套原理：[生产级流式客服与可观测执行](./LESSON_07_PRODUCTION_STREAMING_AND_OBSERVABILITY.md)
>
> 下篇：[前端流式页面、取消、可观测性与线上验收](./LESSON_07_LOWER_FRONTEND_OBSERVABILITY_AND_SELF_TEST.md)

这不是另一篇原理课。它只做一件事：以你当前仓库为起点，按顺序把后端流式链路写出来，并且每完成一小段就自测。

本篇最终链路：

```text
POST /api/agent/chat/stream
  → AgentStreamApplicationService.stream()
  → AgentService.chat(..., streaming callbacks)
  → createAgent().streamEvents({ version: "v3" })
  → CustomerServiceEvent v1
  → SSE encoder
  → curl -N 逐帧看到事件
```

第一遍刻意不做 Redis 事件重放、独立 run 资源和 WebSocket。先把单条 POST 流做正确。

---

## 0. 先认清当前仓库，不要从空项目思考

你当前真正的调用链是：

```text
src/AgentChat.tsx
  → POST /api/agent/chat
  → server/src/agent/agent.controller.ts
  → AgentChatApplicationService.chat()
  → 保存 user message
  → AgentService.chat()
      ├─ AgentIntentService：先识别意图
      ├─ ProductCustomerService：商品类确定性查询
      └─ createAgent().invoke()：通用问题和 Tool
  → 保存 assistant message
  → 一次性 JSON 返回
```

已有能力不要推倒重写：

- `AgentChatDto` 已经有 `conversationId` 与 `clientMessageId`。
- MySQL 已经只保存一次用户消息和一次最终回答。
- `agent_message` 已经有幂等唯一索引。
- `MemorySaver / RedisSaver` 已经统一藏在 `AgentCheckpointerService`。
- `calculator`、`get_current_time`、`transform_text` 已经是真实 Tool。

本课新增文件：

```text
server/src/agent/
├── agent.stream-protocol.ts
├── agent.stream-sse.ts
├── agent.stream-application.service.ts
├── agent.stream-protocol.spec.ts
└── agent.stream-sse.spec.ts
```

并修改：

```text
agent.service.ts
agent.controller.ts
agent.module.ts
agent.service.spec.ts
```

### 0.1 先运行基线检查

```bash
cd server
pnpm exec tsc --noEmit --incremental false
```

当前仓库会先出现三处同类错误：

```text
agent.service.spec.ts: Expected 5 arguments, but got 4
```

原因是 `AgentService` 已经增加了 `AgentCheckpointerService`，旧测试仍只传四个构造参数。

在 `agent.service.spec.ts` 增加 import：

```ts
import { AgentCheckpointerService } from './persistence/agent-checkpointer.service';
```

在文件顶层、`describe('AgentService', ...)` 之前创建 stub（当前第三个测试写在 describe 外，放进 describe 会导致它访问不到）：

```ts
const checkpointerService = {
  get: jest.fn(),
} as unknown as AgentCheckpointerService;
```

三处 `new AgentService(...)` 都把它放在最后：

```ts
const service = new AgentService(
  modelFactory,
  intentService,
  productCustomerService,
  conversationService,
  checkpointerService,
);
```

重新运行：

```bash
pnpm exec tsc --noEmit --incremental false
```

这一小关先只确认 TypeScript 通过；下一小关再修正模型工厂的实际调用语义。

### 0.2 让通用 Agent 真正使用 AgentModelFactory

当前 `AgentService.getAgent()` 只取了 `getModelName()` 字符串，通用 Agent 没有使用 `AgentModelFactory.getModel()` 创建的 `ChatOpenAI` 实例。这会让 `OPENAI_BASE_URL` 等统一配置只作用于意图识别，不一定作用于通用 Agent，也让“缺少 API Key”的旧测试失去原本语义。

把 `getAgent()` 中：

```ts
const model = this.modelFactory.getModelName();
```

改为：

```ts
const model = this.modelFactory.getModel();
```

`createAgent({ model })` 和 `summarizationMiddleware({ model })` 都可以接收这个模型实例。对外响应仍继续使用 `chat()` 开头的：

```ts
const modelName = this.modelFactory.getModelName();
```

这样意图识别、通用 Agent 和摘要中间件才真正共用同一套 API Key、模型名和 Base URL 配置。

基线回归：

```bash
pnpm exec tsc --noEmit --incremental false
pnpm test -- --runInBand agent.service.spec.ts
```

这两条没通过前先不要新增流式文件。

---

## 1. 第一步：先写稳定的业务事件协议

新建：

```text
server/src/agent/agent.stream-protocol.ts
```

写入：

```ts
import { z } from 'zod';

const baseEventSchema = z.object({
  version: z.literal(1),
  runId: z.string().uuid(),
  conversationId: z.string().uuid(),
  turnId: z.string().uuid(),
  seq: z.number().int().positive(),
  timestamp: z.string().datetime(),
});

export const customerServiceEventSchema = z.discriminatedUnion('type', [
  baseEventSchema.extend({
    type: z.literal('run_started'),
  }),
  baseEventSchema.extend({
    type: z.literal('status'),
    stage: z.enum(['understanding', 'tool', 'answering']),
    message: z.string().min(1).max(200),
  }),
  baseEventSchema.extend({
    type: z.literal('assistant_delta'),
    delta: z.string().min(1),
  }),
  baseEventSchema.extend({
    type: z.literal('tool_started'),
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    displayName: z.string().min(1).max(100),
  }),
  baseEventSchema.extend({
    type: z.literal('tool_finished'),
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    summary: z.string().min(1).max(200),
    durationMs: z.number().int().nonnegative(),
  }),
  baseEventSchema.extend({
    type: z.literal('assistant_final'),
    messageId: z.string().min(1),
    content: z.string(),
    model: z.string().min(1),
    source: z.enum(['intent_router', 'agent']),
  }),
  baseEventSchema.extend({
    type: z.literal('run_failed'),
    code: z.enum([
      'MODEL_TIMEOUT',
      'MODEL_UNAVAILABLE',
      'TOOL_TIMEOUT',
      'TOOL_UNAVAILABLE',
      'RATE_LIMITED',
      'INTERNAL_ERROR',
    ]),
    message: z.string().min(1).max(300),
    retryable: z.boolean(),
  }),
  baseEventSchema.extend({
    type: z.literal('run_cancelled'),
    message: z.string().min(1).max(200),
  }),
  baseEventSchema.extend({
    type: z.literal('done'),
  }),
]);

export type CustomerServiceEvent = z.infer<
  typeof customerServiceEventSchema
>;

export type EventPayload = CustomerServiceEvent extends infer Event
  ? Event extends CustomerServiceEvent
    ? Omit<
        Event,
        | 'version'
        | 'runId'
        | 'conversationId'
        | 'turnId'
        | 'seq'
        | 'timestamp'
      >
    : never
  : never;

export function createEventFactory(input: {
  runId: string;
  conversationId: string;
  turnId: string;
}) {
  let seq = 0;

  return (payload: EventPayload): CustomerServiceEvent => {
    seq += 1;

    return customerServiceEventSchema.parse({
      version: 1,
      ...input,
      seq,
      timestamp: new Date().toISOString(),
      ...payload,
    });
  };
}
```

这里故意让网络边界只认识业务事件，不认识 LangChain 的内部 message、node、namespace 或 raw Tool output。

### 1.1 写协议测试

新建：

```text
server/src/agent/agent.stream-protocol.spec.ts
```

```ts
import { createEventFactory, customerServiceEventSchema } from './agent.stream-protocol';

describe('CustomerServiceEvent protocol', () => {
  const runId = '11111111-1111-4111-8111-111111111111';
  const conversationId = '22222222-2222-4222-8222-222222222222';
  const turnId = '33333333-3333-4333-8333-333333333333';

  it('按创建顺序分配严格递增的 seq', () => {
    const event = createEventFactory({ runId, conversationId, turnId });

    expect(event({ type: 'run_started' }).seq).toBe(1);
    expect(
      event({
        type: 'status',
        stage: 'understanding',
        message: '正在理解问题',
      }).seq,
    ).toBe(2);
    expect(event({ type: 'assistant_delta', delta: '你' }).seq).toBe(3);
  });

  it('拒绝 seq=0', () => {
    expect(() =>
      customerServiceEventSchema.parse({
        version: 1,
        runId,
        conversationId,
        turnId,
        seq: 0,
        timestamp: new Date().toISOString(),
        type: 'done',
      }),
    ).toThrow();
  });

  it('拒绝未知事件', () => {
    expect(() =>
      customerServiceEventSchema.parse({
        version: 1,
        runId,
        conversationId,
        turnId,
        seq: 1,
        timestamp: new Date().toISOString(),
        type: 'langchain_raw_event',
      }),
    ).toThrow();
  });
});
```

运行：

```bash
cd server
pnpm test -- --runInBand agent.stream-protocol.spec.ts
```

验收：3 个测试通过。

---

## 2. 第二步：写 SSE encoder 和背压处理

新建：

```text
server/src/agent/agent.stream-sse.ts
```

```ts
import type { Response } from 'express';
import type { CustomerServiceEvent } from './agent.stream-protocol';

export function encodeSse(event: CustomerServiceEvent): string {
  return [
    `id: ${event.seq}`,
    `event: ${event.type}`,
    `data: ${JSON.stringify(event)}`,
    '',
    '',
  ].join('\n');
}

export async function writeSse(
  response: Response,
  event: CustomerServiceEvent,
): Promise<void> {
  if (response.destroyed || response.writableEnded) {
    throw new Error('stream_closed');
  }

  const canContinue = response.write(encodeSse(event));
  if (canContinue) return;

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      response.off('drain', onDrain);
      response.off('close', onClose);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      reject(new Error('stream_closed'));
    };

    response.once('drain', onDrain);
    response.once('close', onClose);
  });
}
```

为什么有两个空字符串：`join('\n')` 后形成结尾的 `\n\n`，一个 SSE frame 才真正结束。

### 2.1 写 encoder 测试

新建：

```text
server/src/agent/agent.stream-sse.spec.ts
```

```ts
import { createEventFactory } from './agent.stream-protocol';
import { encodeSse } from './agent.stream-sse';

describe('encodeSse', () => {
  it('输出 id、event、data 和空行边界', () => {
    const createEvent = createEventFactory({
      runId: '11111111-1111-4111-8111-111111111111',
      conversationId: '22222222-2222-4222-8222-222222222222',
      turnId: '33333333-3333-4333-8333-333333333333',
    });
    const event = createEvent({
      type: 'assistant_delta',
      delta: '你好',
    });

    const frame = encodeSse(event);

    expect(frame).toContain('id: 1\n');
    expect(frame).toContain('event: assistant_delta\n');
    expect(frame).toContain('"delta":"你好"');
    expect(frame.endsWith('\n\n')).toBe(true);

    const dataLine = frame
      .split('\n')
      .find((line) => line.startsWith('data: '));

    expect(JSON.parse(dataLine!.slice(6))).toEqual(event);
  });
});
```

运行：

```bash
pnpm test -- --runInBand agent.stream-sse.spec.ts
```

不要用 `response.write(JSON.stringify(event))` 代替 encoder。那样前端没有可靠边界。

---

## 3. 第三步：给 AgentService 增加可选流式回调

目标：保留现在的 `chat()` JSON 接口，同时让新接口能接收真实模型片段和 Tool 生命周期。

在 `agent.service.ts` 的 `SingleAgent` 类型后面增加：

```ts
type AgentChatStreamCallbacks = {
  signal: AbortSignal;
  onStatus(stage: 'understanding' | 'tool' | 'answering', message: string): Promise<void>;
  onDelta(delta: string): Promise<void>;
  onToolStarted(input: {
    toolCallId: string;
    toolName: string;
    displayName: string;
  }): Promise<void>;
  onToolFinished(input: {
    toolCallId: string;
    toolName: string;
    summary: string;
    durationMs: number;
  }): Promise<void>;
};

const TOOL_PRESENTATION: Record<
  string,
  { displayName: string; finished: string }
> = {
  calculator: { displayName: '计算器', finished: '计算完成' },
  get_current_time: { displayName: '时间查询', finished: '时间查询完成' },
  transform_text: { displayName: '文本转换', finished: '文本处理完成' },
};
```

把 `chat()` 签名改成：

```ts
async chat(
  message: string,
  conversationId: string,
  stream?: AgentChatStreamCallbacks,
): Promise<AgentChatResponseDto> {
```

在意图识别前增加：

```ts
await stream?.onStatus('understanding', '正在理解你的问题');
```

商品分支得到 `reply` 后，可以只发一个 delta。商品回答来自数据库，本身不是模型 Token 流：

```ts
await stream?.onStatus('answering', '正在整理商品信息');
await stream?.onDelta(reply);
```

缺字段、取消、转人工这些提前返回的分支，也在 return 前调用一次 `onDelta(reply)`。第一遍不要为了“像流”而使用定时器把普通字符串伪装成 Token。

### 3.1 替换通用 Agent 的 invoke 分支

把原来的：

```ts
const result = await this.getAgent().invoke(...);
const lastMessage = result.messages.at(-1);
```

改成分支：

```ts
let result: Awaited<ReturnType<SingleAgent['invoke']>>;

if (!stream) {
  result = await this.getAgent().invoke(
    {
      messages: [{ role: 'user', content: message }],
    },
    {
      configurable: { thread_id: conversationId },
    },
  );
} else {
  result = await this.streamGeneralAgent(
    message,
    conversationId,
    stream,
  );
}

const lastMessage = result.messages.at(-1);
```

在类中增加私有方法：

```ts
private async streamGeneralAgent(
  message: string,
  conversationId: string,
  stream: AgentChatStreamCallbacks,
): Promise<Awaited<ReturnType<SingleAgent['invoke']>>> {
  const run = await this.getAgent().streamEvents(
    {
      messages: [{ role: 'user', content: message }],
    },
    {
      version: 'v3',
      signal: stream.signal,
      configurable: { thread_id: conversationId },
    },
  );

  await stream.onStatus('answering', '正在生成回答');

  const consumeMessages = (async () => {
    for await (const modelMessage of run.messages) {
      for await (const delta of modelMessage.text) {
        if (delta) await stream.onDelta(delta);
      }
    }
  })();

  const consumeTools = (async () => {
    for await (const toolCall of run.toolCalls) {
      const startedAt = Date.now();
      const presentation = TOOL_PRESENTATION[toolCall.name] ?? {
        displayName: '业务处理',
        finished: '处理完成',
      };

      await stream.onToolStarted({
        toolCallId: toolCall.callId,
        toolName: toolCall.name,
        displayName: presentation.displayName,
      });

      await toolCall.output;

      await stream.onToolFinished({
        toolCallId: toolCall.callId,
        toolName: toolCall.name,
        summary: presentation.finished,
        durationMs: Date.now() - startedAt,
      });
    }
  })();

  await Promise.all([consumeMessages, consumeTools]);
  return run.output;
}
```

两个重要边界：

1. 只读 `modelMessage.text`，绝对不要读或发送 `reasoning`。
2. 只发送 Tool 白名单文案，不发送 `toolCall.input` 和 `toolCall.output`。

### 3.2 这一版关于“最终文字”的诚实说明

预构建 Agent 的一次运行可能有多次模型调用。上面的第一遍代码会消费所有 `modelMessage.text`。多数 OpenAI Tool Call 消息没有展示文本，因此学习阶段通常正常；但它不能从架构上证明每个文本片段都属于最终回答。

上线前必须二选一：

- 保守方案：每条模型消息先缓冲，确认没有 Tool Call 后再发送；安全，但首字更晚。
- 明确方案：第 10 课自定义 LangGraph，只流 `final_answer` 节点。

本课自测必须包含一个 Tool 问题，确认当前模型没有把 planner 中间文本展示出来。若出现中间文字，立刻采用缓冲方案，不要上线。

---

## 4. 第四步：编写流式应用服务，保证只保存最终回答一次

新建：

```text
server/src/agent/agent.stream-application.service.ts
```

```ts
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AgentChatDto } from './agent.dto';
import { AgentService } from './agent.service';
import {
  createEventFactory,
  type CustomerServiceEvent,
} from './agent.stream-protocol';
import { AgentHistoryService } from './persistence/agent-history.service';

type StreamSink = (event: CustomerServiceEvent) => Promise<void>;

@Injectable()
export class AgentStreamApplicationService {
  private readonly logger = new Logger(AgentStreamApplicationService.name);

  constructor(
    private readonly agentService: AgentService,
    private readonly history: AgentHistoryService,
  ) {}

  async stream(input: {
    dto: AgentChatDto;
    signal: AbortSignal;
    emit: StreamSink;
  }): Promise<void> {
    const { dto, signal, emit } = input;
    const runId = randomUUID();
    const turnId = randomUUID();
    const startedAt = Date.now();
    const event = createEventFactory({
      runId,
      conversationId: dto.conversationId,
      turnId,
    });
    let emitQueue = Promise.resolve();
    let assistantPersisted = false;
    const orderedEmit = (nextEvent: CustomerServiceEvent): Promise<void> => {
      const write = emitQueue.then(() => emit(nextEvent));
      // 某次写入失败后仍允许 finally 尝试清理；调用者仍会收到本次 write 的失败。
      emitQueue = write.catch(() => undefined);
      return write;
    };

    try {
      await this.history.ensureConversation(dto.conversationId);
      await this.history.startUserTurn({
        conversationId: dto.conversationId,
        clientMessageId: dto.clientMessageId,
        turnId,
        content: dto.message,
      });

      await orderedEmit(event({ type: 'run_started' }));

      let firstDeltaAt: number | null = null;

      const result = await this.agentService.chat(
        dto.message,
        dto.conversationId,
        {
          signal,
          onStatus: async (stage, message) => {
            await orderedEmit(event({ type: 'status', stage, message }));
          },
          onDelta: async (delta) => {
            firstDeltaAt ??= Date.now();
            await orderedEmit(event({ type: 'assistant_delta', delta }));
          },
          onToolStarted: async (tool) => {
            await orderedEmit(event({ type: 'tool_started', ...tool }));
          },
          onToolFinished: async (tool) => {
            await orderedEmit(event({ type: 'tool_finished', ...tool }));
          },
        },
      );

      // delta 只负责页面草稿；数据库仍然只写最终 result.reply。
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
          runId,
        },
      });
      assistantPersisted = true;

      await orderedEmit(
        event({
          type: 'assistant_final',
          messageId: dto.clientMessageId,
          content: result.reply,
          model: result.model,
          source: result.source,
        }),
      );

      this.logger.log(
        JSON.stringify({
          event: 'agent_stream_completed',
          runId,
          conversationId: dto.conversationId,
          durationMs: Date.now() - startedAt,
          timeToFirstDeltaMs:
            firstDeltaAt === null ? null : firstDeltaAt - startedAt,
        }),
      );
    } catch (error) {
      if (assistantPersisted) {
        // 最终回答已经成为数据库事实；此时只是订阅连接没收到 final，
        // 不能再把已完成的用户消息反向标记为 failed。
        this.logger.warn(
          JSON.stringify({
            event: 'agent_stream_delivery_closed_after_persist',
            runId,
            conversationId: dto.conversationId,
          }),
        );
      } else {
        await this.history.markUserTurnFailed(
          dto.conversationId,
          dto.clientMessageId,
        );

        if (signal.aborted) {
          await this.safeEmit(
            orderedEmit,
            event({ type: 'run_cancelled', message: '本次回答已停止。' }),
          );
        } else {
          this.logger.error(
            JSON.stringify({
              event: 'agent_stream_failed',
              runId,
              conversationId: dto.conversationId,
              errorName: error instanceof Error ? error.name : 'UnknownError',
            }),
          );
          await this.safeEmit(
            orderedEmit,
            event({
              type: 'run_failed',
              code: 'INTERNAL_ERROR',
              message: 'AI 客服暂时不可用，请稍后重试。',
              retryable: true,
            }),
          );
        }
      }
    } finally {
      await this.safeEmit(orderedEmit, event({ type: 'done' }));
    }
  }

  private async safeEmit(
    emit: StreamSink,
    event: CustomerServiceEvent,
  ): Promise<void> {
    try {
      await emit(event);
    } catch {
      // 客户端已经关闭时，终态可能无法再通过同一条连接送达。
    }
  }
}
```

`run.messages` 和 `run.toolCalls` 会并发回调，因此这里不能只做 `seq += 1`；`orderedEmit` 还要保证事件按同一队列真正写入 response。

注意：客户端主动断开后，`run_cancelled` 很可能发不回已经关闭的连接，这是正常的。服务端日志和运行状态仍应记录取消。第一遍数据库只有 user message 的 `failed`，下篇会解释怎样继续扩展为独立 run 状态。

---

## 5. 第五步：Controller 输出真正的事件流

在 `agent.controller.ts` import 中增加：

```ts
import { Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AgentStreamApplicationService } from './agent.stream-application.service';
import { writeSse } from './agent.stream-sse';
```

构造函数增加依赖：

```ts
constructor(
  private readonly chatApplication: AgentChatApplicationService,
  private readonly agentIntentService: AgentIntentService,
  private readonly streamApplication: AgentStreamApplicationService,
) {}
```

在 `chat` 路由旁增加：

```ts
@Post('chat/stream')
async streamChat(
  @Body() dto: AgentChatDto,
  @Req() request: Request,
  @Res() response: Response,
): Promise<void> {
  response.status(200);
  response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  response.setHeader('Cache-Control', 'no-cache, no-transform');
  response.setHeader('Connection', 'keep-alive');
  response.setHeader('X-Accel-Buffering', 'no');
  response.flushHeaders();

  const abortController = new AbortController();

  const close = () => {
    if (!response.writableEnded) {
      abortController.abort('client_disconnected');
    }
  };

  request.once('aborted', close);
  response.once('close', close);

  const heartbeat = setInterval(() => {
    if (!response.destroyed && !response.writableEnded) {
      response.write(': ping\n\n');
    }
  }, 20_000);

  try {
    await this.streamApplication.stream({
      dto,
      signal: abortController.signal,
      emit: (event) => writeSse(response, event),
    });
  } finally {
    clearInterval(heartbeat);
    request.off('aborted', close);
    response.off('close', close);

    if (!response.writableEnded) response.end();
  }
}
```

DTO 校验发生在方法执行之前，所以非法 UUID 仍能得到普通 HTTP 400。进入方法并 `flushHeaders()` 以后，模型错误只能变成 `run_failed` 事件，不能再抛 502 JSON。

### 5.1 注册 Provider

在 `agent.module.ts` import：

```ts
import { AgentStreamApplicationService } from './agent.stream-application.service';
```

加入 providers：

```ts
AgentStreamApplicationService,
```

---

## 6. 第六步：先做静态检查

```bash
cd server
pnpm exec prettier --write \
  src/agent/agent.stream-protocol.ts \
  src/agent/agent.stream-sse.ts \
  src/agent/agent.stream-application.service.ts \
  src/agent/agent.stream-protocol.spec.ts \
  src/agent/agent.stream-sse.spec.ts \
  src/agent/agent.service.ts \
  src/agent/agent.controller.ts \
  src/agent/agent.module.ts

pnpm exec tsc --noEmit --incremental false
pnpm test -- --runInBand agent.stream-protocol.spec.ts agent.stream-sse.spec.ts
pnpm run build
```

如果 v3 API 类型报错，先核对当前安装版本：

```bash
pnpm list langchain @langchain/core @langchain/langgraph @langchain/openai
```

本仓库检查时的版本是：

```text
langchain 1.5.x
@langchain/core 1.2.x
@langchain/langgraph 1.4.x
@langchain/openai 1.5.x
```

不要在旧版 LangChain 中硬抄 `streamEvents(..., { version: 'v3' })`。

---

## 7. 第七步：用 curl 验证 HTTP 层

启动后端：

```bash
cd server
pnpm start:dev
```

另开终端，先用错误 UUID 验证“流开始前错误”：

```bash
curl -i -X POST http://127.0.0.1:3000/api/agent/chat/stream \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  --data '{"message":"你好","conversationId":"bad-id","clientMessageId":"bad-id"}'
```

预期：HTTP 400 JSON，而不是 SSE。

再生成两个合法 UUID：

```bash
node -e "console.log(crypto.randomUUID()); console.log(crypto.randomUUID())"
```

填入下面命令：

```bash
curl -N -X POST http://127.0.0.1:3000/api/agent/chat/stream \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  --data '{
    "message":"请使用计算器计算 125 乘以 8",
    "conversationId":"替换为第一个UUID",
    "clientMessageId":"替换为第二个UUID"
  }'
```

预期顺序大致是：

```text
run_started
status: understanding
status: answering
tool_started: calculator
tool_finished: calculator
assistant_delta: ...
assistant_final: ...1000...
done
```

事件顺序可能因为 Tool 和模型投影并发而略有变化，但必须满足：

- `seq` 严格递增。
- 只有一个业务终态。
- `done` 最后出现。
- 浏览器可见事件不含 Tool input/output。
- `assistant_final.content` 是完整权威回答。

### 7.1 验证持久化没有 Token 写放大

请求完成后：

```bash
curl http://127.0.0.1:3000/api/agent/conversations/替换为会话UUID/messages
```

预期只有：

```text
1 条 user completed
1 条 assistant completed
```

不会因为 30 个 delta 而出现 30 条 assistant 记录。

### 7.2 验证断开

重新发一个请求，在输出中途按 `Ctrl+C`。

检查服务端：

- 没有持续向已关闭 response 写数据。
- 没有保存一条伪装成 completed 的半截 assistant 回答。
- 没有 `Cannot set headers after they are sent`。

如果模型或 Tool 的底层 SDK 不响应 AbortSignal，它可能仍短暂运行；这不等于可以继续写流或保存最终消息。

---

## 8. 给流式应用服务补一个 Fake Agent 单测

真实模型测试花钱、慢、容易受网络影响。应用服务的状态机要用 fake 测。

新建：

```text
server/src/agent/agent.stream-application.service.spec.ts
```

核心测试结构：

```ts
import { AgentStreamApplicationService } from './agent.stream-application.service';
import type { AgentService } from './agent.service';
import type { AgentHistoryService } from './persistence/agent-history.service';

describe('AgentStreamApplicationService', () => {
  it('按序发送 delta/final/done，最终回答只保存一次', async () => {
    const agentService = {
      chat: jest.fn(async (_message, _conversationId, stream) => {
        await stream.onStatus('answering', '正在生成回答');
        await stream.onDelta('你');
        await stream.onDelta('好');
        return {
          conversationId: '22222222-2222-4222-8222-222222222222',
          reply: '你好',
          model: 'fake-model',
          source: 'agent',
          intent: 'general_chat',
          entities: {},
          status: 'completed',
          missingFields: [],
        };
      }),
    } as unknown as AgentService;

    const history = {
      ensureConversation: jest.fn(),
      startUserTurn: jest.fn(),
      completeAssistantTurn: jest.fn(),
      markUserTurnFailed: jest.fn(),
    } as unknown as AgentHistoryService;

    const service = new AgentStreamApplicationService(agentService, history);
    const events: Array<{ type: string; seq: number }> = [];

    await service.stream({
      dto: {
        message: '你好',
        conversationId: '22222222-2222-4222-8222-222222222222',
        clientMessageId: '44444444-4444-4444-8444-444444444444',
      },
      signal: new AbortController().signal,
      emit: async (event) => {
        events.push(event);
      },
    });

    expect(events.map((event) => event.type)).toEqual([
      'run_started',
      'status',
      'assistant_delta',
      'assistant_delta',
      'assistant_final',
      'done',
    ]);
    expect(events.map((event) => event.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(history.completeAssistantTurn).toHaveBeenCalledTimes(1);
    expect(history.completeAssistantTurn).toHaveBeenCalledWith(
      expect.objectContaining({ reply: '你好' }),
    );
  });
});
```

实际写入时，给 fake response 补齐 `CustomerEntities` 的完整字段，避免用 `{}` 逃避类型检查。

再补三组测试：

- `agentService.chat()` 抛错：出现 `run_failed → done`，不出现 `assistant_final`。
- signal 已 abort：出现 `run_cancelled → done`。
- emit 在连接关闭后抛错：方法能清理退出，不出现未处理 Promise rejection。
- 最终回答已保存、随后 final 投递失败：不能把 user 从 completed 反向改成 failed。

---

## 9. 上篇完成检查单

- [ ] 当前旧测试的 5 参数构造问题已经修复。
- [ ] 事件协议使用 Zod，并有 `version/runId/turnId/seq`。
- [ ] 前端协议没有 LangChain 原始类型。
- [ ] SSE frame 以 `\n\n` 结束。
- [ ] `response.write() === false` 时等待 `drain`。
- [ ] 客户端断开会 abort 后端 Agent。
- [ ] 心跳使用 `: ping`，不增加业务 seq。
- [ ] Tool 只输出白名单展示文案。
- [ ] 不读取、不发送 reasoning。
- [ ] delta 不写 MySQL，final 只保存一次。
- [ ] 普通 400 发生在 stream 开始前。
- [ ] stream 开始后的错误使用 `run_failed`。
- [ ] `curl -N` 能逐步看到事件。
- [ ] `pnpm exec tsc --noEmit --incremental false` 通过。
- [ ] 新增 Jest 测试通过。

完成后进入下篇，把这条 SSE 流接入当前 `src/AgentChat.tsx`，并补齐 parser 分片测试、停止按钮、日志、Nginx 和线上验收。
