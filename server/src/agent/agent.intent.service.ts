import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AgentModelFactory } from './agent-model.factory';
import { CustomerIntent, CustomerIntentSchema } from './agent.intent';

/** 只负责“理解用户说了什么”，不查询商品，也不直接回答用户。 */
@Injectable()
export class AgentIntentService {
  private readonly logger = new Logger(AgentIntentService.name);

  constructor(private readonly modelFactory: AgentModelFactory) {}

  async analyze(message: string): Promise<CustomerIntent> {
    const startedAt = Date.now();

    try {
      // withStructuredOutput 把模型的自由文本输出约束成 CustomerIntent 对象。
      const structuredModel = this.modelFactory
        .getModel()
        .withStructuredOutput(CustomerIntentSchema, {
          name: 'customer_intent',
        });

      const result = await structuredModel.invoke([
        {
          role: 'system',
          content: [
            '你是商城客服意图识别器，不负责直接回答用户。',
            '只提取用户明确表达的信息，不得编造商品、订单号、金额或原因。',
            '用户明确要求人工时，intent 优先返回 human_handoff。',
            '用户询问商品是否有货或库存数量时，返回 inventory_query。',
            '用户只询问商品价格时，返回 price_query。',
            '用户搜索、推荐或浏览商品时，返回 product_search。',
            '无法可靠判断时返回 unknown。',
            '缺失的数据返回 null，并写入 missingFields。',
          ].join('\n'),
        },
        { role: 'user', content: message },
      ]);

      // 即使模型声称返回了结构化对象，也再用 Zod 做一次运行时校验。
      const parsed = CustomerIntentSchema.parse(result);

      this.logger.debug(
        `意图识别成功 intent=${parsed.intent} durationMs=${Date.now() - startedAt}`,
      );

      return parsed;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      const detail = error instanceof Error ? error.stack : String(error);
      this.logger.error('客服意图识别失败', detail);
      throw new BadGatewayException(
        '客服意图识别失败，请检查模型是否支持 Structured Output',
      );
    }
  }
}
