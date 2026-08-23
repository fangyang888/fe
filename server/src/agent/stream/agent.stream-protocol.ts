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

export type CustomerServiceEvent = z.infer<typeof customerServiceEventSchema>;

export type EventPayload = CustomerServiceEvent extends infer Event
  ? Event extends CustomerServiceEvent
    ? Omit<
        Event,
        'version' | 'runId' | 'conversationId' | 'turnId' | 'seq' | 'timestamp'
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
