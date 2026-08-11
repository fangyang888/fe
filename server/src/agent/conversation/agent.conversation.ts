import type { CustomerEntities, CustomerIntentName } from '../agent.intent';

export type ConversationStatus =
  | 'idle'
  | 'collecting_fields'
  | 'processing'
  | 'completed'
  | 'cancelled';

export type MissingField = keyof CustomerEntities;

export const CONVERSATION_TTL_MS = 30 * 60 * 1000;

export interface AgentConversationState {
  conversationId: string;
  status: ConversationStatus;
  pendingIntent: CustomerIntentName | null;
  entities: CustomerEntities;
  missingFields: MissingField[];
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

/**
 * 业务规则才是 missingFields 的权威来源。
 * 第一遍只开放库存和价格，避免同时处理过多意图。
 */
const REQUIRED_FIELDS: Partial<Record<CustomerIntentName, MissingField[]>> = {
  inventory_query: ['productName'],
  price_query: ['productName'],
};

export function createEmptyEntities(): CustomerEntities {
  return {
    productName: null,
    categoryName: null,
    orderNo: null,
    budgetMax: null,
    quantity: null,
    reason: null,
  };
}

export function createConversationState(
  conversationId: string,
  now = Date.now(),
): AgentConversationState {
  return {
    conversationId,
    status: 'idle',
    pendingIntent: null,
    entities: createEmptyEntities(),
    missingFields: [],
    createdAt: now,
    updatedAt: now,
    expiresAt: now + CONVERSATION_TTL_MS,
  };
}

function isMissing(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim().length === 0;
  }

  return value === null || value === undefined;
}

export function calculateMissingFields(
  intent: CustomerIntentName,
  entities: CustomerEntities,
): MissingField[] {
  const requiredFields = REQUIRED_FIELDS[intent] ?? [];

  return requiredFields.filter((field) => isMissing(entities[field]));
}

function preferNewValue<T>(current: T | null, incoming: T | null): T | null {
  if (typeof incoming === 'string') {
    return incoming.trim().length > 0 ? incoming : current;
  }

  return incoming ?? current;
}

/**
 * 第二轮的 null 不能覆盖第一轮已经收集到的值；
 * 但第二轮提供的新非空值可以纠正第一轮。
 */
export function mergeEntities(
  current: CustomerEntities,
  incoming: CustomerEntities,
): CustomerEntities {
  return {
    productName: preferNewValue(current.productName, incoming.productName),
    categoryName: preferNewValue(current.categoryName, incoming.categoryName),
    orderNo: preferNewValue(current.orderNo, incoming.orderNo),
    budgetMax: preferNewValue(current.budgetMax, incoming.budgetMax),
    quantity: preferNewValue(current.quantity, incoming.quantity),
    reason: preferNewValue(current.reason, incoming.reason),
  };
}

export function isCancelMessage(message: string): boolean {
  return /^(取消|算了|不用了|停止)$/.test(message.trim());
}
