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

function findFrameBoundary(buffer: string): {
  index: number;
  length: number;
} | null {
  const match = /\r?\n\r?\n/.exec(buffer);
  return match ? { index: match.index, length: match[0].length } : null;
}

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

export function parseCustomerServiceEvent(value: unknown): CustomerServiceEvent {
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

export function createSseParser(onEvent: (event: CustomerServiceEvent) => void) {
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

type StreamAgentMessageInput = {
  message: string;
  conversationId: string;
  clientMessageId: string;
  signal: AbortSignal;
  onEvent(event: CustomerServiceEvent): void;
};

export async function streamAgentMessage(input: StreamAgentMessageInput): Promise<void> {
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
    const detail = Array.isArray(data?.message) ? data.message.join('；') : data?.message;
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
