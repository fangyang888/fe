import {
  BadGatewayException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createAgent } from 'langchain';
import { AgentChatResponseDto } from './agent.dto';
import { AgentIntentService } from './agent.intent.service';
import { AgentModelFactory } from './agent-model.factory';
import { createAgentTools } from './agent.tools';
import { ProductCustomerService } from './product-customer.service';
import { MemorySaver } from '@langchain/langgraph';
import { AgentConversationService } from './conversation/agent.conversation.service';
import {
  AgentConversationState,
  MissingField,
  calculateMissingFields,
  isCancelMessage,
  mergeEntities,
} from './conversation/agent.conversation';
import { CustomerEntities, CustomerIntentName } from './agent.intent';
type SingleAgent = ReturnType<typeof createAgent>;

/**
 * 客服总调度器。
 *
 * 这个类只回答一个问题：“当前请求应该交给哪个处理器？”
 * 商品细节交给 ProductCustomerService，语言理解交给 AgentIntentService。
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private agent?: SingleAgent;
  private readonly checkpointer = new MemorySaver();
  constructor(
    private readonly modelFactory: AgentModelFactory,
    private readonly agentIntentService: AgentIntentService,
    private readonly productCustomerService: ProductCustomerService,
    private readonly conversationService: AgentConversationService,
  ) {}
  private resolveIntent(
    state: AgentConversationState,
    currentIntent: CustomerIntentName,
    mergedEntities: CustomerEntities,
  ): CustomerIntentName {
    if (
      state.status !== 'collecting_fields' ||
      !state.pendingIntent ||
      currentIntent === 'human_handoff'
    ) {
      return currentIntent;
    }

    const remaining = calculateMissingFields(
      state.pendingIntent,
      mergedEntities,
    );

    // 缺失数量减少，说明当前消息正在补充上一轮资料。
    if (remaining.length < state.missingFields.length) {
      return state.pendingIntent;
    }

    return currentIntent;
  }
  async chat(
    message: string,
    conversationId: string,
  ): Promise<AgentChatResponseDto> {
    const modelName = this.modelFactory.getModelName();

    try {
      let state = this.conversationService.getOrCreate(conversationId);

      // completed/cancelled 表示上一件事已经结束，新消息从空状态开始。
      if (state.status === 'completed' || state.status === 'cancelled') {
        this.conversationService.clear(conversationId);
        state = this.conversationService.getOrCreate(conversationId);
      }

      if (isCancelMessage(message)) {
        const cancelledIntent = state.pendingIntent ?? 'unknown';
        const cancelledEntities = state.entities;
        this.conversationService.clear(conversationId);

        return {
          conversationId,
          reply: '已取消当前任务。',
          model: modelName,
          source: 'intent_router',
          intent: cancelledIntent,
          entities: cancelledEntities,
          status: 'cancelled',
          missingFields: [],
        };
      }

      const analysis = await this.agentIntentService.analyze(message);
      const mergedEntities = mergeEntities(state.entities, analysis.entities);
      if (analysis.intent === 'human_handoff') {
        this.conversationService.clear(conversationId);

        return {
          conversationId,
          reply: '已记录人工客服请求，当前自动客服任务已停止。',
          model: modelName,
          source: 'intent_router',
          intent: 'human_handoff',
          entities: mergedEntities,
          status: 'completed',
          missingFields: [],
        };
      }
      const activeIntent = this.resolveIntent(
        state,
        analysis.intent,
        mergedEntities,
      );
      const missingFields = calculateMissingFields(
        activeIntent,
        mergedEntities,
      );

      if (
        this.productCustomerService.canHandle(activeIntent) &&
        missingFields.length > 0
      ) {
        this.conversationService.save({
          ...state,
          status: 'collecting_fields',
          pendingIntent: activeIntent,
          entities: mergedEntities,
          missingFields,
        });

        return {
          conversationId,
          reply: this.buildMissingFieldReply(missingFields),
          model: modelName,
          source: 'intent_router',
          intent: activeIntent,
          entities: mergedEntities,
          status: 'collecting_fields',
          missingFields,
        };
      }

      if (this.productCustomerService.canHandle(activeIntent)) {
        this.conversationService.save({
          ...state,
          status: 'processing',
          pendingIntent: activeIntent,
          entities: mergedEntities,
          missingFields: [],
        });

        const reply = await this.productCustomerService.reply({
          ...analysis,
          intent: activeIntent,
          entities: mergedEntities,
          missingFields: [],
        });

        this.conversationService.save({
          ...state,
          status: 'completed',
          pendingIntent: null,
          entities: mergedEntities,
          missingFields: [],
        });

        return {
          conversationId,
          reply,
          model: modelName,
          source: 'intent_router',
          intent: activeIntent,
          entities: mergedEntities,
          status: 'completed',
          missingFields: [],
        };
      }

      // 商品类请求由上面的确定性业务路由处理；其余请求交给通用 Agent。
      // 清除旧的商品补字段状态，避免用户已经切换话题后仍被旧任务影响。
      this.conversationService.clear(conversationId);

      const result = await this.getAgent().invoke(
        {
          messages: [{ role: 'user', content: message }],
        },
        {
          // MemorySaver 用 thread_id 隔离不同浏览器会话的短期消息状态。
          configurable: { thread_id: conversationId },
        },
      );
      const lastMessage = result.messages.at(-1);

      return {
        conversationId,
        reply: this.extractText(lastMessage?.content),
        model: modelName,
        source: 'agent' as const,
        intent: activeIntent,
        entities: mergedEntities,
        status: 'completed' as const,
        missingFields: [],
      };
    } catch (error) {
      // 保留下层已经分类好的 HTTP 错误，例如缺少 API Key 或意图识别失败。
      if (error instanceof HttpException) {
        throw error;
      }

      const detail = error instanceof Error ? error.stack : String(error);
      this.logger.error('单 Agent 调用失败', detail);
      throw new BadGatewayException(
        'AI 服务调用失败，请检查模型名称、API Key、Base URL 或稍后重试',
      );
    }
  }

  private getAgent(): SingleAgent {
    if (this.agent) {
      return this.agent;
    }

    this.agent = createAgent({
      name: 'fe_assistant',
      model: this.modelFactory.getModel(),
      checkpointer: this.checkpointer,
      // 商品查询由确定性路由负责，这里只注册通用 Tool，避免两个入口抢同一件事。
      tools: createAgentTools(),
      systemPrompt: [
        '你是 FE 商城项目的中文 AI 助手。',
        '回答要准确、简洁；不知道时明确说明，不得编造事实。',
        '需要计算、获取当前时间或转换文本时，应调用提供的工具。',
        '商品、订单、退款等业务数据必须来自后端服务；没有对应能力时明确说明。',
        '当前 Agent 没有数据库写权限，也没有长期记忆。',
      ].join('\n'),
    });

    return this.agent;
  }

  private extractText(content: unknown): string {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      const text = content
        .map((part) => {
          if (typeof part === 'string') {
            return part;
          }
          if (
            part &&
            typeof part === 'object' &&
            'text' in part &&
            typeof part.text === 'string'
          ) {
            return part.text;
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');

      if (text) {
        return text;
      }
    }

    return 'Agent 已完成处理，但没有返回可显示的文本。';
  }

  private buildMissingFieldReply(missingFields: MissingField[]): string {
    switch (missingFields[0]) {
      case 'productName':
        return '请告诉我你要查询的商品名称。';
      case 'orderNo':
        return '请告诉我订单号。';
      case 'reason':
        return '请告诉我具体原因。';
      default:
        return '请补充完成当前请求所需的信息。';
    }
  }
}
