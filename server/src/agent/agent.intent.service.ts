import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { CustomerIntent, CustomerIntentSchema } from './agent.intent';
import { ProductService } from 'src/product/product.service';
import { CategoryService } from 'src/category/category.service';

const DEFAULT_MODEL = 'gpt-4.1-mini';

@Injectable()
export class AgentIntentService {
  private readonly logger = new Logger(AgentIntentService.name);
  private model?: ChatOpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly productService: ProductService,
    private readonly categoryService: CategoryService,
  ) {}

  async analyze(message: string): Promise<CustomerIntent> {
    const startedAt = Date.now();

    try {
      const structuredModel = this.getModel().withStructuredOutput(
        CustomerIntentSchema,
        {
          name: 'customer_intent',
        },
      );

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
        {
          role: 'user',
          content: message,
        },
      ]);

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

  private getModel(): ChatOpenAI {
    if (this.model) {
      return this.model;
    }

    const apiKey = this.configService.get<string>('OPENAI_API_KEY')?.trim();

    if (!apiKey) {
      throw new ServiceUnavailableException(
        '尚未配置 OPENAI_API_KEY，无法识别客服意图',
      );
    }

    const baseURL = this.configService.get<string>('OPENAI_BASE_URL')?.trim();

    const model =
      this.configService.get<string>('OPENAI_MODEL')?.trim() || DEFAULT_MODEL;

    this.model = new ChatOpenAI({
      apiKey,
      model,
      temperature: 0,
      ...(baseURL
        ? {
            configuration: { baseURL },
          }
        : {}),
    });

    return this.model;
  }
}
