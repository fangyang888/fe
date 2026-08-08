import type { CustomerEntities, CustomerIntentName } from './agent.intent';

export type ConversationStatus =
  | 'idle'
  | 'collecting_fields'
  | 'processing'
  | 'completed'
  | 'cancelled';

export type MissingField = keyof CustomerEntities;

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
