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
