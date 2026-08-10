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

  constructor(
    private readonly modelFactory: AgentModelFactory,
    private readonly agentIntentService: AgentIntentService,
    private readonly productCustomerService: ProductCustomerService,
  ) {}

  async chat(message: string): Promise<AgentChatResponseDto> {
    const modelName = this.modelFactory.getModelName();

    try {
      // 第一步永远先把自然语言整理成可供 TypeScript 判断的固定对象。
      const analysis = await this.agentIntentService.analyze(message);

      if (this.productCustomerService.canHandle(analysis.intent)) {
        const reply = await this.productCustomerService.reply(analysis);

        return {
          reply,
          model: modelName,
          source: 'intent_router',
          intent: analysis.intent,
          entities: analysis.entities,
        };
      }

      // 非商品问题才进入自由 Agent，例如计算、时间和文本转换。
      const result = await this.getAgent().invoke({
        messages: [{ role: 'user', content: message }],
      });
      const lastMessage = result.messages.at(-1);

      return {
        reply: this.extractText(lastMessage?.content),
        model: modelName,
        source: 'agent',
        intent: analysis.intent,
        entities: analysis.entities,
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
}
