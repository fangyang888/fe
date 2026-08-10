import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';

const DEFAULT_MODEL = 'gpt-4.1-mini';

/**
 * 统一创建模型客户端。
 *
 * 为什么单独放一个类：
 * Agent 和意图识别都要调用同一个模型服务。如果它们各自读取环境变量、
 * 各自 new ChatOpenAI，后续修改模型名、Base URL 或超时配置时很容易漏改。
 */
@Injectable()
export class AgentModelFactory {
  private model?: ChatOpenAI;

  constructor(private readonly configService: ConfigService) {}

  getModel(): ChatOpenAI {
    // ChatOpenAI 客户端可以复用，不需要每次 HTTP 请求都重新创建。
    if (this.model) {
      return this.model;
    }

    const apiKey = this.configService.get<string>('OPENAI_API_KEY')?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        '尚未配置 OPENAI_API_KEY，无法调用 AI 服务',
      );
    }

    const baseURL = this.configService.get<string>('OPENAI_BASE_URL')?.trim();

    this.model = new ChatOpenAI({
      apiKey,
      model: this.getModelName(),
      temperature: 0,
      ...(baseURL ? { configuration: { baseURL } } : {}),
    });

    return this.model;
  }

  getModelName(): string {
    return (
      this.configService.get<string>('OPENAI_MODEL')?.trim() || DEFAULT_MODEL
    );
  }
}
