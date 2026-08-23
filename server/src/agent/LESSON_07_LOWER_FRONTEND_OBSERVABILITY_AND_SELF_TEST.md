# 第 7 课跟敲版（下）：前端流式页面、取消、可观测性与线上验收

> 开始本篇前，先完成：[后端事件协议、Agent Streaming 与 SSE 自测](./LESSON_07_UPPER_BACKEND_STREAMING_CODE_AND_SELF_TEST.md)
>
> 完整原理：[生产级流式客服与可观测执行](./LESSON_07_PRODUCTION_STREAMING_AND_OBSERVABILITY.md)

上篇结束时，`curl -N` 已经能看到 SSE。本篇把它接进当前 `src/AgentChat.tsx`，并完成以下闭环：

```text
fetch POST
  → ReadableStream<Uint8Array>
  → TextDecoder(stream: true)
  → SSE frame parser
  → 事件校验和 seq 去重
  → assistant 草稿逐步更新
  → assistant_final 校正
  → Stop / Abort
  → 日志、LangSmith、Nginx 与线上自测
```

---

## 1. 第一步：先把网络解析从 React 组件拆出去

当前 `src/AgentChat.tsx` 直接：

```ts
const data = await response.json();
```

流式响应不能这样读。新建：

```text
src/agent-stream.ts
```

### 1.1 定义前端只需要的事件类型

```ts
type BaseStreamEvent = {
  version: 1;
  runId: string;
  conversationId: string;
  turnId: string;
  seq: number;
  timestamp: string;
};

export type CustomerServiceEvent =
  | (BaseStreamEvent & { type: 'run_started' })
  | (BaseStreamEvent & {
      type: 'status';
      stage: 'understanding' | 'tool' | 'answering';
      message: string;
    })
  | (BaseStreamEvent & { type: 'assistant_delta'; delta: string })
  | (BaseStreamEvent & {
      type: 'tool_started';
      toolCallId: string;
      toolName: string;
      displayName: string;
    })
  | (BaseStreamEvent & {
      type: 'tool_finished';
      toolCallId: string;
      toolName: string;
      summary: string;
      durationMs: number;
    })
  | (BaseStreamEvent & {
      type: 'assistant_final';
      messageId: string;
      content: string;
      model: string;
      source: 'intent_router' | 'agent';
    })
  | (BaseStreamEvent & {
      type: 'run_failed';
      code: string;
      message: string;
      retryable: boolean;
    })
  | (BaseStreamEvent & { type: 'run_cancelled'; message: string })
  | (BaseStreamEvent & { type: 'done' });
```

不要从 NestJS 源码跨目录 import 类型。前后端真正共享协议时，再建立独立 workspace package；第一遍保持构建边界简单。

### 1.2 对网络事件做运行时校验

根前端目前没有安装 Zod，所以先写一个小型守卫：

```ts
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasBaseFields(value: Record<string, unknown>): boolean {
  return (
    value.version === 1 &&
    typeof value.runId === 'string' &&
    typeof value.conversationId === 'string' &&
    typeof value.turnId === 'string' &&
    Number.isInteger(value.seq) &&
    Number(value.seq) > 0 &&
    typeof value.timestamp === 'string'
  );
}

export function parseCustomerServiceEvent(
  value: unknown,
): CustomerServiceEvent {
  if (!isRecord(value) || !hasBaseFields(value) || typeof value.type !== 'string') {
    throw new Error('收到无效的流事件');
  }

  switch (value.type) {
    case 'run_started':
    case 'done':
      break;
    case 'status':
      if (
        !['understanding', 'tool', 'answering'].includes(String(value.stage)) ||
        typeof value.message !== 'string'
      ) {
        throw new Error('status 事件格式错误');
      }
      break;
    case 'assistant_delta':
      if (typeof value.delta !== 'string') {
        throw new Error('assistant_delta 事件格式错误');
      }
      break;
    case 'tool_started':
      if (
        typeof value.toolCallId !== 'string' ||
        typeof value.toolName !== 'string' ||
        typeof value.displayName !== 'string'
      ) {
        throw new Error('tool_started 事件格式错误');
      }
      break;
    case 'tool_finished':
      if (
        typeof value.toolCallId !== 'string' ||
        typeof value.toolName !== 'string' ||
        typeof value.summary !== 'string' ||
        !Number.isFinite(value.durationMs)
      ) {
        throw new Error('tool_finished 事件格式错误');
      }
      break;
    case 'assistant_final':
      if (
        typeof value.messageId !== 'string' ||
        typeof value.content !== 'string' ||
        typeof value.model !== 'string' ||
        !['intent_router', 'agent'].includes(String(value.source))
      ) {
        throw new Error('assistant_final 事件格式错误');
      }
      break;
    case 'run_failed':
      if (
        typeof value.code !== 'string' ||
        typeof value.message !== 'string' ||
        typeof value.retryable !== 'boolean'
      ) {
        throw new Error('run_failed 事件格式错误');
      }
      break;
    case 'run_cancelled':
      if (typeof value.message !== 'string') {
        throw new Error('run_cancelled 事件格式错误');
      }
      break;
    default:
      throw new Error(`未知流事件：${value.type}`);
  }

  return value as CustomerServiceEvent;
}
```

以后前后端建立共享 package 时，把两端统一为同一份 Zod schema。不要长期维护两份手写协议而没有契约测试。

---

## 2. 第二步：写能处理任意网络分片的 SSE parser

继续在 `src/agent-stream.ts` 写：

```ts
function findFrameBoundary(buffer: string): {
  index: number;
  length: number;
} | null {
  const match = /\r?\n\r?\n/.exec(buffer);
  return match ? { index: match.index, length: match[0].length } : null;
}

function parseSseFrame(frame: string): CustomerServiceEvent | null {
  const dataLines: string[] = [];

  for (const line of frame.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue;

    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    if (field === 'data') dataLines.push(value);
  }

  // 心跳只有 ": ping"，没有 data。
  if (dataLines.length === 0) return null;

  return parseCustomerServiceEvent(JSON.parse(dataLines.join('\n')));
}

export function createSseParser(
  onEvent: (event: CustomerServiceEvent) => void,
) {
  let buffer = '';

  return {
    push(text: string) {
      buffer += text;

      while (true) {
        const boundary = findFrameBoundary(buffer);
        if (!boundary) return;

        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary.length);

        const event = parseSseFrame(frame);
        if (event) onEvent(event);
      }
    },
    finish() {
      if (buffer.trim()) {
        throw new Error('SSE 流在一个未完成事件中断开');
      }
    },
  };
}
```

关键事实：

```text
一次 reader.read()
≠
一个 SSE event
```

parser 必须允许半个事件、多个事件、心跳和 CRLF。

---

## 3. 第三步：用 TextDecoder 正确处理中文 UTF-8

继续写读取函数：

```ts
export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: CustomerServiceEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  const parser = createSseParser(onEvent);

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        parser.push(decoder.decode());
        parser.finish();
        return;
      }

      parser.push(decoder.decode(value, { stream: true }));
    }
  } finally {
    reader.releaseLock();
  }
}
```

必须有 `{ stream: true }`。网络可以从一个中文字符的三个 UTF-8 字节中间切开。

### 3.1 写 fetch 入口

```ts
type StreamAgentMessageInput = {
  message: string;
  conversationId: string;
  clientMessageId: string;
  signal: AbortSignal;
  onEvent(event: CustomerServiceEvent): void;
};

export async function streamAgentMessage(
  input: StreamAgentMessageInput,
): Promise<void> {
  const response = await fetch('/api/agent/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      message: input.message,
      conversationId: input.conversationId,
      clientMessageId: input.clientMessageId,
    }),
    signal: input.signal,
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const detail = Array.isArray(data?.message)
      ? data.message.join('；')
      : data?.message;
    throw new Error(detail || `请求失败（HTTP ${response.status}）`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream')) {
    throw new Error('服务端没有返回事件流');
  }

  if (!response.body) {
    throw new Error('当前响应不支持流式读取');
  }

  await readSseStream(response.body, input.onEvent);
}
```

这里把两类错误分开了：

- `response.ok === false`：流开始前的 HTTP 错误。
- `run_failed`：HTTP 200 已经开始后的业务错误。

---

## 4. 第四步：给 parser 配置 Vitest 自测

前端根目录当前没有测试框架。安装一次：

```bash
cd /Users/yang/fe/fe
pnpm add -D vitest
```

在根 `package.json` scripts 增加：

```json
"test": "vitest run"
```

新建：

```text
src/agent-stream.spec.ts
```

先准备合法事件：

```ts
import { describe, expect, it } from 'vitest';
import {
  createSseParser,
  readSseStream,
  type CustomerServiceEvent,
} from './agent-stream';

const event: CustomerServiceEvent = {
  version: 1,
  runId: '11111111-1111-4111-8111-111111111111',
  conversationId: '22222222-2222-4222-8222-222222222222',
  turnId: '33333333-3333-4333-8333-333333333333',
  seq: 1,
  timestamp: '2026-08-21T00:00:00.000Z',
  type: 'assistant_delta',
  delta: '你好',
};

function frame(value: CustomerServiceEvent): string {
  return `id: ${value.seq}\nevent: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`;
}
```

### 4.1 半个事件和多个事件

```ts
describe('SSE parser', () => {
  it('一个事件拆成多个字符串 chunk 仍能解析', () => {
    const received: CustomerServiceEvent[] = [];
    const parser = createSseParser((value) => received.push(value));
    const source = frame(event);

    for (const character of source) parser.push(character);
    parser.finish();

    expect(received).toEqual([event]);
  });

  it('一个 chunk 中的两个事件都能解析', () => {
    const received: CustomerServiceEvent[] = [];
    const parser = createSseParser((value) => received.push(value));
    const second = { ...event, seq: 2, delta: '世界' };

    parser.push(frame(event) + frame(second));
    parser.finish();

    expect(received).toEqual([event, second]);
  });

  it('忽略心跳 comment', () => {
    const received: CustomerServiceEvent[] = [];
    const parser = createSseParser((value) => received.push(value));

    parser.push(': ping\n\n');
    parser.push(frame(event));
    parser.finish();

    expect(received).toEqual([event]);
  });
});
```

### 4.2 从中文字符字节中间切开

```ts
it('中文 UTF-8 字节被切开时不产生乱码', async () => {
  const received: CustomerServiceEvent[] = [];
  const bytes = new TextEncoder().encode(frame(event));
  const chineseStart = bytes.findIndex((byte) => byte === 0xe4);
  expect(chineseStart).toBeGreaterThan(0);

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.slice(0, chineseStart + 1));
      controller.enqueue(bytes.slice(chineseStart + 1));
      controller.close();
    },
  });

  await readSseStream(body, (value) => received.push(value));

  expect(received).toEqual([event]);
  expect((received[0] as { delta: string }).delta).toBe('你好');
});
```

运行：

```bash
pnpm test -- src/agent-stream.spec.ts
pnpm run build
```

这组测试比“浏览器看起来能逐字显示”更重要，因为本地网络经常刚好按完整块返回，掩盖 parser 错误。

---

## 5. 第五步：把 AgentChat.tsx 改成事件驱动

在 `src/AgentChat.tsx` import：

```ts
import {
  streamAgentMessage,
  type CustomerServiceEvent,
} from './agent-stream';
```

删除旧的 `AgentResponse` 类型。保留历史消息类型。

### 5.1 增加运行状态

在组件内增加：

```ts
const [stageText, setStageText] = useState('');
const activeRunRef = useRef<{
  runId: string | null;
  lastSeq: number;
  assistantMessageId: string;
  terminal: 'none' | 'completed' | 'failed' | 'cancelled';
} | null>(null);
```

增加更新草稿的辅助函数：

```ts
const appendAssistantDelta = (messageId: string, delta: string) => {
  setMessages((current) =>
    current.map((message) =>
      message.id === messageId
        ? { ...message, content: message.content + delta }
        : message,
    ),
  );
};

const replaceAssistantFinal = (
  messageId: string,
  content: string,
  model: string,
) => {
  setMessages((current) =>
    current.map((message) =>
      message.id === messageId ? { ...message, content, model } : message,
    ),
  );
};
```

### 5.2 写事件处理器

```ts
const handleStreamEvent = (event: CustomerServiceEvent) => {
  const active = activeRunRef.current;

  if (!active) return;

  if (event.type === 'run_started' && active.runId === null) {
    active.runId = event.runId;
  }

  if (active.runId !== event.runId) return;
  if (event.seq <= active.lastSeq) return;
  active.lastSeq = event.seq;

  switch (event.type) {
    case 'status':
      setStageText(event.message);
      break;
    case 'tool_started':
      setStageText(`正在使用${event.displayName}`);
      break;
    case 'tool_finished':
      setStageText(event.summary);
      break;
    case 'assistant_delta':
      appendAssistantDelta(active.assistantMessageId, event.delta);
      break;
    case 'assistant_final':
      replaceAssistantFinal(
        active.assistantMessageId,
        event.content,
        event.model,
      );
      setStageText('');
      setConnected(true);
      active.terminal = 'completed';
      break;
    case 'run_failed':
      setError(event.message);
      setStageText('');
      setConnected(false);
      active.terminal = 'failed';
      setMessages((current) =>
        current.filter(
          (item) =>
            item.id !== active.assistantMessageId || item.content.length > 0,
        ),
      );
      break;
    case 'run_cancelled':
      setStageText('已停止');
      active.terminal = 'cancelled';
      break;
    case 'done':
      setStageText('');
      break;
    case 'run_started':
      setStageText('已收到问题');
      break;
  }
};
```

这里的两个保护不能删：

```text
runId 不匹配 → 拒绝
seq <= lastSeq → 拒绝重复事件
```

### 5.3 替换 sendMessage 中的 JSON fetch

在请求开始时，同时创建一个空 assistant 草稿：

```ts
const assistantDraft = createMessage('assistant', '');

activeRunRef.current = {
  runId: null,
  lastSeq: 0,
  assistantMessageId: assistantDraft.id,
  terminal: 'none',
};

setMessages((current) => [
  ...current,
  createMessage('user', message),
  assistantDraft,
]);
```

把原来的 `fetch('/api/agent/chat') + response.json()` 替换成：

```ts
await streamAgentMessage({
  message,
  conversationId: conversationIdRef.current,
  clientMessageId: clientMessageIdRef.current,
  signal: controller.signal,
  onEvent: handleStreamEvent,
});

if (activeRunRef.current?.terminal !== 'none') {
  clientMessageIdRef.current = crypto.randomUUID();
}
```

不要在 `streamAgentMessage()` resolve 后无条件 `setConnected(true)`。`run_failed` 也是一条正常结束的 SSE 流；如果无条件改回 true，会把刚设置的失败状态覆盖掉。

`catch` 继续区分 AbortError：

```ts
if (requestError instanceof DOMException && requestError.name === 'AbortError') {
  setStageText('已停止');
  clientMessageIdRef.current = crypto.randomUUID();
  const assistantMessageId = activeRunRef.current?.assistantMessageId;
  if (assistantMessageId) {
    setMessages((current) =>
      current.filter(
        (item) => item.id !== assistantMessageId || item.content.length > 0,
      ),
    );
  }
  return;
}
```

`finally` 增加：

```ts
activeRunRef.current = null;
```

渲染消息时先过滤仍为空的 assistant 草稿，避免第一个 Token 到来前出现空气泡：

```tsx
{messages
  .slice(1)
  .filter((message) => message.role !== 'assistant' || message.content)
  .map((message) => (
    <MessageRow key={message.id} message={message} />
  ))}
```

### 5.4 不要留下空白气泡

如果流开始前就 HTTP 400，刚创建的 assistant 草稿仍是空的。catch 中删除空草稿：

```ts
const assistantMessageId = activeRunRef.current?.assistantMessageId;

if (assistantMessageId) {
  setMessages((current) =>
    current.filter(
      (item) => item.id !== assistantMessageId || item.content.length > 0,
    ),
  );
}
```

不要删除用户消息。失败后用户需要看到自己刚才问了什么。

---

## 6. 第六步：增加停止按钮

增加图标不是重点，先用清楚的文字按钮。

```ts
const stopCurrentRun = () => {
  requestRef.current?.abort();
  setStageText('正在停止…');
};
```

在 composer actions 中：

```tsx
{loading ? (
  <button
    className="agent-stop-button"
    type="button"
    onClick={stopCurrentRun}
    aria-label="停止当前回答"
  >
    停止回答
  </button>
) : (
  <button
    className="agent-send-button"
    type="submit"
    disabled={!draft.trim()}
  >
    <SendIcon />
    <span>发送</span>
  </button>
)}
```

loading 区域改为真实状态：

```tsx
{loading && stageText ? (
  <div className="agent-stream-status" role="status">
    <span className="agent-spinner" aria-hidden="true" />
    <span>{stageText}</span>
  </div>
) : null}
```

CSS 增加：

```css
.agent-stop-button {
  min-height: 44px;
  padding: 0 17px;
  border: 1px solid #d14343;
  border-radius: 8px;
  background: #fff;
  color: #b42318;
  cursor: pointer;
  font-weight: 720;
}

.agent-stream-status {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 14px 0 0 62px;
  color: #667085;
  font-size: 0.84rem;
}
```

停止的含义是：尽快中止当前等待。它不会回滚已经完成的外部副作用。本仓库当前 Tool 都是只读或纯函数，所以风险较低；以后加入退款、改地址等 Tool 必须单独做幂等和审批。

---

## 7. 第七步：避免每个 Token 都让 React 完整重渲染

先确认功能正确，再做这一小步优化。

增加 ref：

```ts
const pendingDeltaRef = useRef('');
const flushFrameRef = useRef<number | null>(null);
```

把 delta 分支改为：

```ts
case 'assistant_delta': {
  pendingDeltaRef.current += event.delta;

  if (flushFrameRef.current === null) {
    flushFrameRef.current = requestAnimationFrame(() => {
      const batch = pendingDeltaRef.current;
      pendingDeltaRef.current = '';
      flushFrameRef.current = null;
      appendAssistantDelta(active.assistantMessageId, batch);
    });
  }
  break;
}
```

收到 `assistant_final` 时，先取消待执行帧并清空临时片段，然后直接用 final 覆盖：

```ts
if (flushFrameRef.current !== null) {
  cancelAnimationFrame(flushFrameRef.current);
  flushFrameRef.current = null;
}
pendingDeltaRef.current = '';
replaceAssistantFinal(active.assistantMessageId, event.content, event.model);
```

组件卸载时也清理：

```ts
useEffect(() => {
  return () => {
    requestRef.current?.abort();
    if (flushFrameRef.current !== null) {
      cancelAnimationFrame(flushFrameRef.current);
    }
  };
}, []);
```

`assistant_final` 必须覆盖草稿，不能追加，否则重连、漏片段或重复片段都会污染最终回答。

### 7.1 调整 aria-live

当前 `.agent-message-list` 整体使用 `aria-live="polite"`。逐 Token 更新时，读屏软件可能被高频打断。把列表上的 `aria-live` 去掉，只让简短的 `agent-stream-status` 使用 `role="status"`；如果要朗读回答，在 `assistant_final` 到达后再更新一个专用的 visually-hidden live region。

---

## 8. 第八步：页面手工自测

分别启动：

```bash
# 终端 1
cd /Users/yang/fe/fe/server
pnpm start:dev

# 终端 2
cd /Users/yang/fe/fe
pnpm dev
```

Vite 当前 `/api` proxy 会把请求转发到 `http://127.0.0.1:3000`，不需要另改 URL。

访问：

```text
http://localhost:5173/fe/agent
```

按顺序测试：

### 用例 A：无 Tool 的普通问题

```text
请用两句话介绍你的能力
```

检查：

- 用户消息立即出现。
- assistant 草稿逐步出现或在模型消息完成后出现。
- 最终内容不重复。
- Network 响应 Content-Type 是 `text/event-stream`。

### 用例 B：真实 Tool

```text
请使用计算器计算 125 乘以 8
```

检查：

- 页面显示“正在使用计算器”。
- 最终结果包含 1000。
- Network 中没有 `left/right` 原始 Tool 参数和 Tool 原始 output。
- 页面没有出现 planner、node 名或隐藏推理。

### 用例 C：确定性商品分支

```text
帮我查库存
```

然后补充真实商品名。

检查：

- 第一轮追问仍然工作。
- 第二轮读取真实 `ProductService` 数据。
- 普通业务回答可以只产生一个较大的 delta，这不是错误。

### 用例 D：停止

发送一个较长问题，出现文字后点击“停止回答”。

检查：

- loading 很快结束。
- 输入框恢复。
- 半截回答不带模型名，不伪装成完整成功回答。
- 刷新历史后不会加载出一条 completed 半截 assistant 消息。

### 用例 E：快速切换会话

回答过程中点击“清空对话”。

检查：

- 旧请求被 abort。
- 旧 run 的事件不会进入新会话。
- 新会话 ID 和新 clientMessageId 都已生成。

---

## 9. 第九步：补充可观测关联 ID

上篇已经在结构化日志中记录：

```text
runId
conversationId
durationMs
timeToFirstDeltaMs
```

现在把同一个 `runId` 传入 LangChain trace。

在上篇的 `AgentChatStreamCallbacks` 增加：

```ts
runId: string;
```

`AgentStreamApplicationService` 调用 `agentService.chat()` 时传：

```ts
{
  runId,
  signal,
  // 其余 callbacks
}
```

`streamEvents` config 增加：

```ts
{
  version: 'v3',
  runId: stream.runId,
  signal: stream.signal,
  configurable: { thread_id: conversationId },
  tags: ['fe-assistant', process.env.NODE_ENV ?? 'development'],
  metadata: {
    runId: stream.runId,
    conversationId,
    entry: 'agent_chat_stream',
  },
}
```

不要把完整 message、Tool input、Authorization header 放入 metadata。

### 9.1 配置 LangSmith

在 `server/.env` 本地配置，真实 Key 不提交 Git：

```dotenv
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=你的Key
LANGSMITH_PROJECT=fe-customer-service-development
```

验证一条计算请求后，应该能用 `runId` 关联：

```text
NestJS 结构化日志
↔ LangSmith Agent trace
↔ Tool 调用耗时
```

LangSmith 负责 Agent/模型/Tool trace，不替代 HTTP 日志、MySQL/Redis 监控和业务指标。

### 9.2 第一版必须能算出的指标

先用结构化日志记录，不急着引入新监控库：

```text
time_to_first_status_ms
time_to_first_delta_ms
total_run_duration_ms
tool_call_duration_ms
stream_completed_total（由日志聚合）
stream_failed_total（由日志聚合）
stream_cancelled_total（由日志聚合）
```

日志里不要默认记录用户完整问题和模型完整回答。

---

## 10. 第十步：为 Nginx 单独关闭流式缓冲

你当前 `deploy/nginx.conf` 的通用 `/api` location 使用：

```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection 'upgrade';
```

它适合 WebSocket，不是 SSE 所需配置。

在通用 `location /api` 之前增加更具体规则：

```nginx
location = /api/agent/chat/stream {
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

在服务器验证配置：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

先直连 NestJS：

```bash
curl -N http://127.0.0.1:3000/api/agent/chat/stream ...
```

再经过 Nginx：

```bash
curl -N http://你的域名/api/agent/chat/stream ...
```

只有第二条也逐步出现，才能证明线上代理没有缓冲。

---

## 11. 故障与边界自测

### 11.1 模型 Key 缺失

临时使用没有 `OPENAI_API_KEY` 的测试环境启动，发送普通问题。

预期：

- 如果错误发生在 header 前，普通 HTTP 503。
- 如果 run 已开始，收到 `run_failed → done`。
- 前端显示安全文案，不显示 stack 和 Key 名值。

### 11.2 Tool 失败

给一个 fake Tool 让它抛错。

预期：

- 不发送伪造的 `tool_finished success`。
- 最终进入 `run_failed`。
- 日志包含 `runId/toolName/errorName`，不含原始敏感参数。

### 11.3 重复事件

在 parser 单测中把同一个 `seq` 事件传两次，并对页面 reducer/handler 做测试。

预期：草稿只追加一次。

### 11.4 done 后事件

当前 parser 只负责语法，业务层要记录 `done` 状态。测试 `done` 后再到达 delta 时拒绝或忽略。

可以把 active run 增加：

```ts
done: boolean;
```

处理事件前：

```ts
if (active.done) return;
if (event.type === 'done') active.done = true;
```

### 11.5 慢客户端与背压

单元测试 mock `response.write()` 第一次返回 false，随后发出 `drain`，断言 `writeSse()` 在 drain 前没有 resolve。

再测试等待 drain 时触发 close，断言它抛 `stream_closed`，而不是永远挂起。

### 11.6 并发提交

两个浏览器标签使用同一个 conversation 同时提交。当前 `agent_message` 唯一索引只能防相同 `clientMessageId` 重复写消息，不能完整保证同一会话只有一个 active run。

第一版 UI 会禁止当前页面重复发送；上线前仍应增加服务端 run 记录或分布式锁：

```text
同一 conversation 最多一个 running run
```

不要把前端 `loading` 当作并发控制。

---

## 12. 本课第一版与真正断线续传的边界

当前实现是：

```text
一个 POST HTTP 连接
=
一个 Agent run 的生命周期
```

刷新或断网会取消 run。它还不支持：

- 页面刷新后继续同一个 run。
- `afterSeq` 重放。
- 明确区分“断开订阅”和“用户取消”。
- 多实例 NestJS 下的事件恢复。

需要这些能力时，再升级为：

```text
POST /api/agent/conversations/:id/runs
  → 创建独立 run

GET /api/agent/runs/:runId/events?after=18
  → Redis Stream 重放 + 实时订阅

POST /api/agent/runs/:runId/cancel
  → 明确取消
```

不要在当前第一遍里用一个进程内 `EventEmitter + Array` 假装完成生产级重放；多实例、重启和“历史切实时”的竞态都会出问题。

---

## 13. 最终自动检查命令

```bash
# 后端
cd /Users/yang/fe/fe/server
pnpm exec tsc --noEmit --incremental false
pnpm test -- --runInBand \
  agent.stream-protocol.spec.ts \
  agent.stream-sse.spec.ts \
  agent.stream-application.service.spec.ts
pnpm run build

# 前端
cd /Users/yang/fe/fe
pnpm test -- src/agent-stream.spec.ts
pnpm run build
```

最终页面回归：

```text
普通聊天
计算 Tool
时间 Tool
文本 Tool
商品缺字段追问
商品真实库存
停止回答
清空会话
刷新恢复 completed 历史
HTTP 400
流内 run_failed
```

---

## 14. 下篇完成检查单

- [ ] `reader.read()` 的 chunk 没有被当作 event。
- [ ] `TextDecoder` 使用 `{ stream: true }`。
- [ ] 心跳不会进入业务状态。
- [ ] 网络事件经过运行时校验。
- [ ] `runId` 不匹配的事件被忽略。
- [ ] 重复 `seq` 不会重复追加。
- [ ] `assistant_final` 覆盖草稿。
- [ ] 流开始前 HTTP 错误与流内错误分开处理。
- [ ] 页面有停止按钮，组件卸载会 abort。
- [ ] 空 assistant 草稿不会残留。
- [ ] Tool 页面文案来自白名单。
- [ ] Network、日志与 Trace 不含 reasoning 和 Tool 原始输入输出。
- [ ] 小 delta 已按 animation frame 批量刷新。
- [ ] 中文 UTF-8 字节切分测试通过。
- [ ] Nginx 流式 location 关闭 buffering 和 gzip。
- [ ] 公网域名的 `curl -N` 仍然逐步输出。
- [ ] 可以用同一个 runId 找到 NestJS 日志和 LangSmith trace。
- [ ] 前后端 build 和新增测试全部通过。

完成这两篇后，你得到的是一个可学习、可运行、可测试的单 POST 流式客服第一版。下一次升级的优先级应是服务端并发约束和独立 run 记录，而不是先换 WebSocket。
