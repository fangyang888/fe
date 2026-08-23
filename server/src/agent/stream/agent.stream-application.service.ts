import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AgentChatDto } from '../agent.dto';
import { AgentService } from '../agent.service';
import {
  createEventFactory,
  type CustomerServiceEvent,
} from './agent.stream-protocol';
import { AgentHistoryService } from '../persistence/agent-history.service';

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
