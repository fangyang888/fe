import { describe, expect, it } from 'vitest';
import {
  createSseParser,
  parseCustomerServiceEvent,
  readSseStream,
  type CustomerServiceEvent,
} from './agent-stream';

const event: CustomerServiceEvent = {
  version: 1,
  runId: '11111111-1111-4111-8111-111111111111',
  conversationId: '22222222-2222-4222-8222-222222222222',
  turnId: '33333333-3333-4333-8333-111111111111',
  seq: 1,
  timestamp: '2026-08-21T00:00:00.000Z',
  type: 'assistant_delta',
  delta: '你好',
};

function frame(value: CustomerServiceEvent): string {
  return `id: ${value.seq}\nevent: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`;
}

describe('SSE parser', () => {
  it('一个事件拆成多个 chunk 仍能解析', () => {
    const received: CustomerServiceEvent[] = [];
    const parser = createSseParser((value) => received.push(value));

    for (const character of frame(event)) parser.push(character);
    parser.finish();

    expect(received).toEqual([event]);
  });

  it('一个 chunk 中的多个事件都会解析，心跳会被忽略', () => {
    const received: CustomerServiceEvent[] = [];
    const parser = createSseParser((value) => received.push(value));
    const second = { ...event, seq: 2, delta: '世界' } as CustomerServiceEvent;

    parser.push(`: ping\n\n${frame(event)}${frame(second)}`);
    parser.finish();

    expect(received).toEqual([event, second]);
  });

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
  });

  it('拒绝不符合协议的网络事件', () => {
    expect(() => parseCustomerServiceEvent({ type: 'assistant_delta', delta: '你好' })).toThrow(
      '收到无效的流事件',
    );
  });
});
