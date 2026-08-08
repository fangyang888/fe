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
import { ProductService } from 'src/product/product.service';
import { CategoryService } from 'src/category/category.service';
import { AgentIntentService } from './agent.intent.service';
import { CustomerIntent, CustomerIntentName } from './agent.intent';

const DEFAULT_MODEL = 'gpt-4.1-mini';

type SingleAgent = ReturnType<typeof createAgent>;
const PRODUCT_INTENTS: ReadonlySet<CustomerIntentName> =
  new Set<CustomerIntentName>([
    'product_search',
    'inventory_query',
    'price_query',
  ]);
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private agent?: SingleAgent;

  constructor(
    private readonly configService: ConfigService,
    private readonly productService: ProductService,
    private readonly categoryService: CategoryService,
    private readonly agentIntentService: AgentIntentService,
  ) {}

  async chat(message: string): Promise<AgentChatResponseDto> {
    const modelName = this.getModelName();

    try {
      const analysis = await this.agentIntentService.analyze(message);
      console.log('chat analyze', analysis);
      if (PRODUCT_INTENTS.has(analysis.intent)) {
        const reply = await this.handleProductIntent(analysis);

        return {
          reply,
          model: modelName,
          source: 'intent_router',
          intent: analysis.intent,
          entities: analysis.entities,
        };
      }
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
      tools: createAgentTools(this.productService, this.categoryService),
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
  private async findCategoryId(categoryName: string): Promise<number | null> {
    const normalizedName = categoryName.trim().toLowerCase();
    const categories = await this.categoryService.findAll();
    console.log(
      'categories',
      categories.map((c) => c.name),
    );
    const category = categories.find((item) => {
      const name = item.name.trim().toLowerCase();

      return (
        name === normalizedName ||
        name.includes(normalizedName) ||
        normalizedName.includes(name)
      );
    });
    console.log('findCategoryId', categoryName, category?.id);
    return category?.id ?? null;
  }

  private formatInventoryReply(
    products: Array<{
      name: string;
      stock: number;
    }>,
  ): string {
    return products
      .map((product) => {
        if (product.stock <= 0) {
          return `${product.name} 当前库存为 0，暂时缺货。`;
        }

        return `${product.name} 当前库存 ${product.stock} 件，可以购买。`;
      })
      .join('\n');
  }

  private formatPriceReply(
    products: Array<{
      name: string;
      price: number;
      originalPrice?: number;
    }>,
  ): string {
    return products
      .map((product) => {
        const originalPrice = product.originalPrice
          ? `，原价 ¥${product.originalPrice}`
          : '';

        return `${product.name} 当前价格 ¥${product.price}${originalPrice}。`;
      })
      .join('\n');
  }

  private formatProductSearchReply(
    products: Array<{
      name: string;
      price: number;
      stock: number;
    }>,
  ): string {
    const lines = products.map(
      (product) =>
        `- ${product.name}：¥${product.price}，${
          product.stock > 0 ? '有货' : '暂时缺货'
        }`,
    );

    return ['找到以下商品：', ...lines].join('\n');
  }

  private async handleProductIntent(analysis: CustomerIntent): Promise<string> {
    const productName = analysis.entities.productName?.trim();
    const categoryName = analysis.entities.categoryName?.trim();
    console.log(
      'handleProductIntent',
      analysis.intent,
      productName,
      categoryName,
    );
    if (!productName && !categoryName) {
      return '请告诉我你想查询的商品名称或分类，例如“手机数码”或“电脑办公”。';
    }

    let categoryId: number | undefined;

    if (categoryName) {
      const matchedCategoryId = await this.findCategoryId(categoryName);

      if (!matchedCategoryId) {
        return `没有找到“${categoryName}”这个商品分类。`;
      }

      categoryId = matchedCategoryId;
    }

    const result = await this.productService.findAll({
      keyword: productName || undefined,
      categoryId,
      page: 1,
      pageSize: 5,
      sort: 'sales',
    });

    if (result.total === 0) {
      const target = productName || categoryName;
      return `没有找到与“${target}”相关的已上架商品。`;
    }
    console.log('handleProductIntent', analysis.intent, result.list);
    switch (analysis.intent) {
      case 'inventory_query':
        return this.formatInventoryReply(result.list);

      case 'price_query':
        return this.formatPriceReply(result.list);

      case 'product_search':
      default:
        return this.formatProductSearchReply(result.list);
    }
  }
}
