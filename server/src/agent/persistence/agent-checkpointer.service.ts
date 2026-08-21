import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MemorySaver } from '@langchain/langgraph';
import { RedisSaver } from '@langchain/langgraph-checkpoint-redis';

type AgentCheckpointer = MemorySaver | RedisSaver;

@Injectable()
export class AgentCheckpointerService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(AgentCheckpointerService.name);
  private checkpointer: AgentCheckpointer = new MemorySaver();

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = this.config
      .get<string>('AGENT_CHECKPOINT_REDIS_URL')
      ?.trim();

    if (!redisUrl) {
      this.logger.warn(
        '未配置 AGENT_CHECKPOINT_REDIS_URL，Agent 使用 MemorySaver',
      );
      return;
    }

    this.checkpointer = await RedisSaver.fromUrl(redisUrl, {
      defaultTTL: 24 * 60,
      refreshOnRead: true,
    });

    this.logger.log('Agent 已启用 Redis Checkpointer');
  }

  get(): AgentCheckpointer {
    return this.checkpointer;
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.checkpointer instanceof RedisSaver) {
      await this.checkpointer.end();
    }
  }
}
