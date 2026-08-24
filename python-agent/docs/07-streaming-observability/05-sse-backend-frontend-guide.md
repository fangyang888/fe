# SSE全栈实战：后端怎么发送，前端怎么处理

这篇课程从HTTP协议开始，完整说明Python FastAPI后端如何发送Agent事件流，React前端如何可靠读取、解析和更新页面。

配套阅读：

- [SSE事件协议](./01-sse-protocol.md)
- [取消、超时与背压](./02-cancellation-timeout-backpressure.md)
- [流式契约测试](./04-stream-contract-tests.md)
- [当前前端解析实现](../../../src/agent-stream.ts)
- [当前React状态处理](../../../src/AgentChat.tsx)
- [当前NestJS SSE入口](../../../server/src/agent/agent.controller.ts)
- [当前服务端事件协议](../../../server/src/agent/stream/agent.stream-protocol.ts)

官方参考：

- [FastAPI Server-Sent Events](https://fastapi.tiangolo.com/tutorial/server-sent-events/)
- [MDN：Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
- [MDN：ReadableStream](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream)

## 一、先理解SSE解决什么问题

普通HTTP请求通常是：

```text
前端发送一个请求
        ↓
后端完成全部工作
        ↓
一次返回完整JSON
```

Agent回答可能持续数秒甚至更久。如果等待全部结束后再返回，用户只能一直看着空白页面。

SSE把一个HTTP响应保持打开，让服务端持续发送小事件：

```text
前端 POST 用户消息
        ↓
后端立即返回 run_started
        ↓
后端发送 status
        ↓
后端发送 tool_started / tool_finished
        ↓
后端连续发送 assistant_delta
        ↓
后端保存最终回答
        ↓
后端发送 assistant_final
        ↓
后端发送 done 并结束连接
```

SSE是单向通道：在同一个响应中，数据只从服务端流向浏览器。用户下一次发消息会创建新的HTTP请求。

### SSE和WebSocket的区别

| 对比 | SSE | WebSocket |
| --- | --- | --- |
| 方向 | 服务端到客户端 | 双向通信 |
| 底层 | 普通HTTP响应 | 升级为WebSocket协议 |
| 数据 | UTF-8文本事件 | 文本或二进制帧 |
| 适合 | AI文本流、通知、日志 | 实时游戏、语音、双方高频通信 |
| 当前Agent | 足够且更简单 | 暂时没有必要 |

当前Agent主要是“前端发一次问题，后端持续返回回答”，所以优先选择SSE。

## 二、SSE在线路上是什么样子

响应的Content-Type必须是：

```http
Content-Type: text/event-stream
```

一个事件由若干文本字段组成，最后用一个空行结束：

```text
id: 3
event: assistant_delta
data: {"version":1,"runId":"...","seq":3,"type":"assistant_delta","delta":"你好"}

```

字段含义：

- `id`：事件编号，可用于排序或断线恢复。
- `event`：事件名称。
- `data`：事件内容；当前项目使用JSON。
- `retry`：原生EventSource重连等待时间，可选。
- 以冒号开头的行：注释，常用于心跳。
- 空行：当前事件结束。

心跳示例：

```text
: ping

```

心跳没有`data`，前端解析器应该忽略它。

### 网络分块不等于SSE事件

这是前端最容易出错的地方。

后端发送：

```text
data: {"delta":"你好"}\n\n
```

浏览器可能分三次收到：

```text
第一次：data: {"del
第二次：ta":"你
第三次：好"}\n\n
```

也可能一次收到多个事件。因此不能把每个`reader.read()`结果直接当成完整JSON。前端必须维护buffer，直到找到事件空行。

## 三、当前项目的事件契约

所有事件都有公共字段：

```json
{
  "version": 1,
  "runId": "本次执行ID",
  "conversationId": "会话ID",
  "turnId": "本轮消息ID",
  "seq": 1,
  "timestamp": "ISO 8601时间",
  "type": "run_started"
}
```

事件职责：

| 事件 | 后端什么时候发送 | 前端怎么处理 |
| --- | --- | --- |
| `run_started` | 建立运行并完成初始持久化后 | 保存runId，显示已收到问题 |
| `status` | 理解、工具或回答阶段变化 | 更新加载提示，不追加回答 |
| `tool_started` | 工具真正开始执行前 | 显示正在使用哪个工具 |
| `tool_finished` | 工具成功完成后 | 显示工具结果摘要 |
| `assistant_delta` | 模型产生新的文本片段 | 追加到临时回答 |
| `assistant_final` | 最终回答成功保存MySQL后 | 用完整内容替换临时回答 |
| `run_failed` | 执行失败且没有最终回答 | 显示安全错误，标记失败 |
| `run_cancelled` | 用户取消或连接断开 | 标记取消，停止加载状态 |
| `done` | 流准备关闭 | 结束读取，但不能单独代表成功 |

必须记住：

```text
assistant_final = 业务成功终态
run_failed      = 业务失败终态
run_cancelled   = 业务取消终态
done            = 网络流结束标记
```

只收到`done`不代表成功。前端必须检查之前是否收到业务终态。

## 四、Python后端的职责分层

不要把模型调用、数据库写入和SSE编码全部写在路由函数里。推荐分层：

```text
chat route
  └─ 负责HTTP请求和EventSourceResponse
      └─ StreamApplicationService
          ├─ 创建runId和turnId
          ├─ 保存用户消息
          ├─ 调用AgentService
          ├─ 保存最终回答
          └─ 产生业务事件
              └─ Event Factory + Pydantic
                  └─ 校验type、seq和载荷
```

路由只关心“如何把事件发出去”；Application Service关心“业务步骤和事件顺序”。

## 五、后端第一步：用Pydantic定义事件

下面展示核心写法。正式实现时要补齐全部事件类型。

```python
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field, TypeAdapter


class BaseEvent(BaseModel):
    version: Literal[1] = 1
    run_id: UUID = Field(alias="runId")
    conversation_id: UUID = Field(alias="conversationId")
    turn_id: UUID = Field(alias="turnId")
    seq: int = Field(gt=0)
    timestamp: datetime


class RunStartedEvent(BaseEvent):
    type: Literal["run_started"]


class AssistantDeltaEvent(BaseEvent):
    type: Literal["assistant_delta"]
    delta: str = Field(min_length=1)


class AssistantFinalEvent(BaseEvent):
    type: Literal["assistant_final"]
    message_id: str = Field(alias="messageId", min_length=1)
    content: str
    model: str = Field(min_length=1)
    source: Literal["intent_router", "agent"]


CustomerServiceEvent = Annotated[
    RunStartedEvent | AssistantDeltaEvent | AssistantFinalEvent,
    Field(discriminator="type"),
]

event_adapter = TypeAdapter(CustomerServiceEvent)
```

为什么后端发送前还要验证自己创建的事件：

- 防止某个分支漏字段；
- 防止`seq`错误；
- 防止事件type与载荷不匹配；
- 防止协议升级时部分代码仍发送旧结构；
- 让契约问题在后端立即暴露，而不是传到浏览器才失败。

### JSON字段命名

Python习惯使用`snake_case`，当前前端协议使用`camelCase`。通过Pydantic alias保持外部协议不变：

```python
event.model_dump(mode="json", by_alias=True)
```

不要为了Python习惯直接修改前端已经使用的字段名。

## 六、后端第二步：事件工厂管理公共字段和seq

公共字段不应该由每个Service分支重复填写。

```python
from datetime import UTC, datetime
from uuid import UUID


class EventFactory:
    def __init__(self, *, run_id: UUID, conversation_id: UUID, turn_id: UUID) -> None:
        self._run_id = run_id
        self._conversation_id = conversation_id
        self._turn_id = turn_id
        self._seq = 0

    def create(self, payload: dict[str, object]) -> CustomerServiceEvent:
        self._seq += 1
        return event_adapter.validate_python(
            {
                "version": 1,
                "runId": self._run_id,
                "conversationId": self._conversation_id,
                "turnId": self._turn_id,
                "seq": self._seq,
                "timestamp": datetime.now(UTC),
                **payload,
            }
        )
```

事件工厂保证同一次run中：

- runId不变化；
- conversationId不变化；
- turnId不变化；
- seq从1开始严格递增；
- timestamp统一使用UTC。

这里的`dict`只存在于工厂边界。工厂返回后，其他代码使用已经验证的Pydantic事件。

## 七、后端第三步：Application Service控制事件顺序

伪代码：

```python
from collections.abc import AsyncIterator
from uuid import uuid4


async def stream_chat(request: ChatRequest) -> AsyncIterator[CustomerServiceEvent]:
    run_id = uuid4()
    turn_id = uuid4()
    factory = EventFactory(
        run_id=run_id,
        conversation_id=request.conversation_id,
        turn_id=turn_id,
    )
    assistant_persisted = False

    try:
        await history.ensure_conversation(request.conversation_id)
        await history.start_user_turn(request, turn_id=turn_id)

        yield factory.create({"type": "run_started"})
        yield factory.create(
            {
                "type": "status",
                "stage": "understanding",
                "message": "正在理解问题",
            }
        )

        result = await agent_service.run(request)

        for delta in result.deltas:
            yield factory.create({"type": "assistant_delta", "delta": delta})

        message = await history.complete_assistant_turn(result)
        assistant_persisted = True

        yield factory.create(
            {
                "type": "assistant_final",
                "messageId": str(message.id),
                "content": result.reply,
                "model": result.model,
                "source": result.source,
            }
        )
    except asyncio.CancelledError:
        if not assistant_persisted:
            await history.mark_user_turn_failed(request)
        raise
    except Exception:
        if not assistant_persisted:
            await history.mark_user_turn_failed(request)
            yield factory.create(
                {
                    "type": "run_failed",
                    "code": "INTERNAL_ERROR",
                    "message": "AI客服暂时不可用，请稍后重试。",
                    "retryable": True,
                }
            )
    finally:
        yield factory.create({"type": "done"})
```

这段代码表达的是业务顺序，不是最终可直接复制版本。真实实现还要解决：

- 模型delta本身是异步迭代器；
- 客户端断开时`yield`可能失败；
- 取消后不一定还能把`run_cancelled`送到已断开的客户端；
- `finally`中的发送也可能因连接关闭而失败；
- Tool事件与文本事件可能来自并发源，需要单一有序出口；
- 异常要映射成稳定错误码。

### 为什么先保存最终回答，再发送assistant_final

如果先发送final再写数据库，浏览器会显示“回答成功”，但刷新页面后可能找不到记录。

正确顺序：

```text
生成完整回答
    ↓
事务保存用户状态和assistant消息
    ↓
数据库commit成功
    ↓
发送assistant_final
```

如果数据库已经保存成功、但final事件发送失败，不能反过来把数据库消息标记为失败。前端可通过历史接口恢复最终结果。

## 八、后端第四步：FastAPI SSE路由

FastAPI当前提供原生`EventSourceResponse`和`ServerSentEvent`。

```python
import asyncio
from collections.abc import AsyncIterator

from fastapi import APIRouter, Request
from fastapi.sse import EventSourceResponse, ServerSentEvent

router = APIRouter()


@router.post("/chat/stream", response_class=EventSourceResponse)
async def chat_stream(
    body: ChatRequest,
    request: Request,
) -> AsyncIterator[ServerSentEvent]:
    try:
        async for event in stream_service.stream(body):
            if await request.is_disconnected():
                break

            yield ServerSentEvent(
                id=str(event.seq),
                event=event.type,
                data=event.model_dump(mode="json", by_alias=True),
            )
    except asyncio.CancelledError:
        # 必须继续抛出，让上层真正取消模型、工具和数据库等待。
        raise
```

FastAPI的SSE响应会处理事件编码，并提供常用SSE响应头和空闲心跳。仍然要测试实际Nginx和部署环境是否立即转发事件。

### 不要在异步路由中做阻塞工作

下面这些操作会阻塞事件循环：

- 使用同步HTTP客户端等待模型；
- 使用同步MySQL驱动；
- `time.sleep()`；
- 大量CPU计算；
- 在事件循环中同步读取大文件。

对应方案：使用异步客户端、SQLAlchemy AsyncSession、`await asyncio.sleep()`，CPU密集任务放到线程、进程或任务系统。

## 九、为什么当前前端不用原生EventSource

原生EventSource使用简单：

```typescript
const source = new EventSource('/api/events');
```

它适合GET订阅，但当前聊天接口需要：

- 使用POST；
- 发送JSON body；
- 携带conversationId；
- 携带clientMessageId；
- 使用AbortController主动取消；
- 检查HTTP错误响应。

SSE协议本身支持POST，FastAPI也支持POST SSE；但是浏览器的EventSource构造器不能像fetch那样自由设置method和JSON body。因此当前项目选择：

```text
fetch POST
  + Accept: text/event-stream
  + ReadableStream
  + TextDecoder
  + 自己实现SSE parser
  + AbortController
```

这是当前需求下合适的方案。

## 十、前端第一步：发起POST流请求

```typescript
async function streamAgentMessage(input: StreamAgentMessageInput): Promise<void> {
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
    throw new Error(`请求失败：HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream')) {
    throw new Error('后端没有返回SSE事件流');
  }

  if (!response.body) {
    throw new Error('浏览器没有提供ReadableStream');
  }

  await readSseStream(response.body, input.onEvent);
}
```

必须先检查：

1. HTTP状态是不是2xx；
2. Content-Type是不是`text/event-stream`；
3. response.body是否存在。

否则Nginx错误页、登录页或普通JSON错误可能被误当成SSE解析。

## 十一、前端第二步：正确解码UTF-8

```typescript
const reader = body.getReader();
const decoder = new TextDecoder('utf-8');

while (true) {
  const { value, done } = await reader.read();

  if (done) {
    parser.push(decoder.decode());
    parser.finish();
    break;
  }

  parser.push(decoder.decode(value, { stream: true }));
}
```

`{ stream: true }`非常重要。一个中文字符的UTF-8字节可能被分到两个网络chunk中；流式TextDecoder会保留未完成字节，等下一块到达后正确组合。

读取完成时再调用一次不带参数的`decoder.decode()`，把内部剩余字节刷新出来。

最后在`finally`释放reader锁：

```typescript
finally {
  reader.releaseLock();
}
```

## 十二、前端第三步：维护buffer并识别完整事件

```typescript
function findFrameBoundary(buffer: string) {
  const match = /\r?\n\r?\n/.exec(buffer);
  return match
    ? { index: match.index, length: match[0].length }
    : null;
}

function createSseParser(onEvent: (event: CustomerServiceEvent) => void) {
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
        throw new Error('SSE流在未完成事件中断开');
      }
    },
  };
}
```

必须兼容`\n\n`和`\r\n\r\n`。代理或不同服务器可能使用不同换行格式。

## 十三、前端第四步：解析SSE字段

```typescript
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

  if (dataLines.length === 0) return null;

  const raw: unknown = JSON.parse(dataLines.join('\n'));
  return parseCustomerServiceEvent(raw);
}
```

同一个SSE事件可以包含多行`data:`，规范要求使用换行拼接。心跳注释没有data，返回`null`即可。

### JSON.parse之后仍然是不可信数据

`JSON.parse()`只证明它是合法JSON，不证明字段符合业务协议。前端仍要检查：

- version；
- type；
- runId；
- conversationId；
- turnId；
- seq；
- 每种事件自己的字段。

后续可以把前端协议改成共享JSON Schema生成类型，或者使用Zod运行时验证；不能只使用TypeScript类型断言。

## 十四、前端第五步：用状态机处理事件

一次运行至少需要保存：

```typescript
type ActiveRun = {
  runId: string | null;
  lastSeq: number;
  assistantMessageId: string;
  terminal: 'none' | 'completed' | 'failed' | 'cancelled';
};
```

处理顺序：

```typescript
function handleStreamEvent(event: CustomerServiceEvent) {
  const active = activeRunRef.current;
  if (!active) return;

  if (event.type === 'run_started' && active.runId === null) {
    active.runId = event.runId;
  }

  // 旧连接或其他run的事件不能更新当前页面。
  if (active.runId !== event.runId) return;

  // 重复或乱序事件不能重复追加文字。
  if (event.seq <= active.lastSeq) return;
  active.lastSeq = event.seq;

  switch (event.type) {
    case 'assistant_delta':
      appendAssistantDelta(active.assistantMessageId, event.delta);
      break;
    case 'assistant_final':
      replaceAssistantFinal(active.assistantMessageId, event.content, event.model);
      active.terminal = 'completed';
      break;
    case 'run_failed':
      active.terminal = 'failed';
      showError(event.message);
      break;
    case 'run_cancelled':
      active.terminal = 'cancelled';
      break;
  }
}
```

### 为什么assistant_final要替换，而不是继续追加

delta只是页面草稿，可能出现：

- 某个chunk丢失；
- 重连后重复；
- 模型中途修正文本；
- 工具路径没有逐字delta；
- 后端最终过滤或格式化。

所以：

```text
assistant_delta → append草稿
assistant_final → replace最终事实
```

## 十五、前端第六步：取消请求

发送请求时创建AbortController：

```typescript
const controller = new AbortController();
requestRef.current = controller;

await streamAgentMessage({
  ...input,
  signal: controller.signal,
});
```

用户点击停止、清空会话或组件卸载时：

```typescript
requestRef.current?.abort();
```

捕获异常时要单独识别AbortError：

```typescript
if (error instanceof DOMException && error.name === 'AbortError') {
  return;
}
```

取消有两个层次：

1. 浏览器停止读取并关闭连接；
2. 后端检测断开，取消模型和工具任务。

只做第一层会导致后端继续消耗Token和连接，所以Python端必须正确传播取消。

## 十六、断线、重试和幂等

原生EventSource具有重连行为；fetch读取SSE不会自动帮我们恢复POST任务。

不能在任意网络错误后直接再次POST，否则可能重复执行工具或重复写消息。

当前设计使用：

- `clientMessageId`：同一个用户提交的幂等ID；
- MySQL唯一约束：最终防止重复消息；
- runId：区分每次执行；
- seq：去重和排序；
- 历史接口：断线后恢复最终回答。

推荐恢复策略：

```text
连接断开
  ├─ 后端尚未持久化 → 页面提示可重试，复用原clientMessageId
  └─ 后端可能已持久化 → 先查询会话历史
                            ├─ 找到assistant最终消息 → 恢复页面
                            └─ 未找到 → 再决定是否重试
```

如果将来需要真正从某个事件继续，需要持久化或短期缓存事件，并支持`Last-Event-ID`。当前事件只在连接中发送，不能假装具备断点续传。

## 十七、并发事件必须经过单一有序出口

模型文本和工具状态可能并发产生：

```text
Task A：读取模型delta
Task B：读取tool call状态
```

如果两个Task直接向HTTP响应写入，可能出现：

- seq生成顺序和写入顺序不同；
- frame内容交叉；
- 一个写入失败后另一个仍继续；
- final提前于部分delta。

推荐方式：

```text
多个生产者
    ↓
有界asyncio.Queue
    ↓
单一发送协程
    ↓
EventSourceResponse
```

或者Application Service用锁/有序emit队列保证任何时刻只有一个写入。队列必须有界，防止慢客户端导致内存无限增长。

## 十八、Nginx应该怎么配置

Python Agent上线后，为流接口设置更具体的location，并放在普通`/api`规则之前：

```nginx
location = /api/agent/chat/stream {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";

    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 180s;
    proxy_send_timeout 180s;
}
```

重点：

- `proxy_buffering off`：不要等积累大量文本后才一起发给浏览器。
- `proxy_cache off`：流响应不能缓存。
- HTTP/1.1：支持长连接。
- `Connection ""`：SSE不需要WebSocket的upgrade。
- 合理超时：要长于正常Agent响应，但不能用超长代理超时替代应用层超时。

FastAPI的SSE响应会设置常见的防缓存和防Nginx缓冲Header，但仍应在真实部署链路验证首条事件能立即到达。

## 十九、后端测试应该覆盖什么

### 协议测试

- Content-Type包含`text/event-stream`。
- 每个事件以空行结束。
- id与事件seq一致。
- type与event字段一致。
- JSON通过Pydantic校验。
- 心跳不会被当成业务事件。

### 顺序测试

至少覆盖：

```text
run_started
status*
tool_started?
tool_finished?
assistant_delta*
assistant_final | run_failed | run_cancelled
done
```

### 持久化测试

- 用户消息先进入pending。
- final在数据库commit后发送。
- 失败时pending变为failed。
- 已保存final但连接关闭时不能反向标记failed。
- 相同clientMessageId不会产生重复记录。

### 取消测试

- 客户端断开会取消模型Task。
- 工具Task得到取消。
- AsyncSession正确释放。
- Redis连接和锁正确清理。

## 二十、前端测试应该覆盖什么

### Parser分块测试

同一事件分别测试：

- 一次完整到达；
- 每个字符一个chunk；
- `\n\n`正好跨chunk；
- `\r\n\r\n`跨chunk；
- 中文UTF-8字节跨chunk；
- 一次chunk包含多个事件；
- 心跳夹在业务事件中；
- 多行data；
- 流结束时剩下半个frame。

### 状态测试

- delta按顺序追加。
- final替换草稿。
- 重复seq被忽略。
- 旧runId被忽略。
- failed显示错误。
- cancelled清理加载状态。
- done之前没有业务终态时识别为异常断流。

### 集成测试

使用fake后端依次发送碎片化事件，验证页面能显示工具状态、逐字回答和最终内容；取消后不再更新组件状态。

## 二十一、常见错误清单

### 后端错误

- 忘记`text/event-stream`。
- 每个事件后没有空行。
- 代理缓冲导致前端最后一次性收到全部内容。
- 在异步路由中调用同步模型或数据库。
- 客户端断开后仍继续调用模型。
- 多个Task直接并发写响应。
- final发送早于数据库commit。
- 捕获`CancelledError`后不继续抛出。
- 把内部异常堆栈发送给用户。

### 前端错误

- 把每个网络chunk当成一个事件。
- TextDecoder没有使用`stream: true`。
- 只检查JSON，不验证事件字段。
- 忽略runId和seq，导致重复追加。
- final继续append，造成文字重复。
- 组件卸载时没有abort。
- 把done当成业务成功。
- 网络错误后无条件重复POST。

## 二十二、当前项目已经做对的部分

现有实现已经具备很好的迁移基线：

- 后端设置SSE Content-Type和禁止缓存Header；
- 使用心跳保持连接；
- 客户端断开触发AbortSignal；
- 写入时处理背压；
- 事件有runId、turnId和递增seq；
- 前端兼容CRLF和LF事件边界；
- 前端正确使用流式TextDecoder；
- 前端忽略心跳；
- 前端验证事件基本结构；
- 前端使用runId和seq防止旧事件或重复事件污染页面；
- assistant_final替换delta草稿；
- AbortController负责取消。

Python迁移的目标不是重新发明协议，而是保持这些正确行为，并用FastAPI、Pydantic和asyncio重新实现。

## 二十三、动手练习顺序

不要第一天就连接真实模型。建议分五关：

### 第1关：固定事件

后端依次发送run_started、status、assistant_final和done，前端成功显示。

### 第2关：模拟逐字输出

后端使用短暂异步等待发送多个assistant_delta，前端逐段追加，final最后替换。

### 第3关：取消

前端增加停止按钮，验证后端生成器和模拟任务被取消。

### 第4关：MySQL持久化

保存用户消息和最终回答，断开后从历史接口恢复。

### 第5关：真实Agent

接入模型流和Tool事件，补齐超时、错误码、指标和契约测试。

## 二十四、自测题

1. 为什么`reader.read()`返回的chunk不能直接`JSON.parse()`？
2. 为什么TextDecoder要传`stream: true`？
3. 为什么当前接口使用fetch而不是EventSource？
4. `assistant_final`和`done`分别代表什么？
5. 为什么final必须在数据库commit后发送？
6. 客户端断开后，后端为什么还要处理取消？
7. runId、turnId、clientMessageId和seq分别解决什么问题？
8. 为什么重复POST可能产生严重后果？
9. Nginx缓冲会造成什么现象？
10. 为什么模型delta和Tool事件不能由多个Task直接并发写响应？

## 二十五、验收标准

完成本知识点后，你应该能够：

- 画出一次SSE请求的完整生命周期；
- 手写一个FastAPI POST SSE接口；
- 用Pydantic定义并验证事件协议；
- 解释事件工厂和seq的作用；
- 手写支持任意分块的前端SSE parser；
- 使用AbortController取消请求；
- 正确区分delta、final、failed、cancelled和done；
- 解释持久化与事件发送顺序；
- 配置Nginx禁用流缓冲；
- 为后端、parser和React状态机设计完整测试。
