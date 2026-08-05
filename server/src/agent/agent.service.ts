import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { createAgent } from 'langchain';
import { AgentChatResponseDto } from './agent.dto';
import { createAgentTools } from './agent.tools';

const DEFAULT_MODEL = 'gpt-4.1-mini';

type SingleAgent = ReturnType<typeof createAgent>;

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private agent?: SingleAgent;

  constructor(private readonly configService: ConfigService) {}

  async chat(message: string): Promise<AgentChatResponseDto> {
    const modelName = this.getModelName();

    try {
      const result = await this.getAgent().invoke({
        messages: [{ role: 'user', content: message }],
      });
      const lastMessage = result.messages.at(-1);

      return {
        reply: this.extractText(lastMessage?.content),
        model: modelName,
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
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

    const apiKey = this.configService.get<string>('OPENAI_API_KEY')?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        '尚未配置 OPENAI_API_KEY，无法调用单 Agent',
      );
    }

    const baseURL = this.configService.get<string>('OPENAI_BASE_URL')?.trim();
    const model = new ChatOpenAI({
      apiKey,
      model: this.getModelName(),
      temperature: 0,
      ...(baseURL
        ? {
            configuration: { baseURL },
          }
        : {}),
    });

    this.agent = createAgent({
      name: 'fe_assistant',
      model,
      tools: createAgentTools(),
      systemPrompt: [
        '你是 FE 项目的中文 AI 助手。',
        '回答要准确、简洁；不知道时明确说明，不得编造事实。',
        '需要计算或获取当前时间时，应调用提供的工具。',
        '当前 Agent 没有用户数据库写权限，也没有长期记忆。',
      ].join('\n'),
    });

    return this.agent;
  }

  private getModelName(): string {
    return (
      this.configService.get<string>('OPENAI_MODEL')?.trim() || DEFAULT_MODEL
    );
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
