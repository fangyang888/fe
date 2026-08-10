import { Injectable } from '@nestjs/common';
import { CategoryService } from '../category/category.service';
import { ProductService } from '../product/product.service';
import { CustomerIntent, CustomerIntentName } from './agent.intent';

const PRODUCT_INTENTS: ReadonlySet<CustomerIntentName> = new Set([
  'product_search',
  'inventory_query',
  'price_query',
]);

/**
 * 商品客服用例服务。
 *
 * 为什么从 AgentService 拆出来：
 * AgentService 应该只负责“把请求交给谁”。分类匹配、数据库查询和商品回答
 * 属于同一个商品业务用例，集中在这里更容易阅读、测试和继续扩展。
 */
@Injectable()
export class ProductCustomerService {
  constructor(
    private readonly productService: ProductService,
    private readonly categoryService: CategoryService,
  ) {}

  canHandle(intent: CustomerIntentName): boolean {
    return PRODUCT_INTENTS.has(intent);
  }

  async reply(analysis: CustomerIntent): Promise<string> {
    const productName = analysis.entities.productName?.trim();
    const categoryName = analysis.entities.categoryName?.trim();

    // 模型负责提取字段，但业务代码仍要做最终校验，不能完全相信模型。
    if (!productName && !categoryName) {
      return '请告诉我你想查询的商品名称或分类，例如“手机数码”或“电脑办公”。';
    }

    let categoryId: number | undefined;
    if (categoryName) {
      const matchedCategoryId = await this.findCategoryId(categoryName);

      if (matchedCategoryId === null) {
        return `没有找到“${categoryName}”这个商品分类。`;
      }

      categoryId = matchedCategoryId;
    }

    // 真实商品、价格和库存只能来自 ProductService，不能让模型自己编造。
    const result = await this.productService.findAll({
      keyword: productName || undefined,
      categoryId,
      page: 1,
      pageSize: 5,
      sort: 'sales',
    });

    if (result.total === 0) {
      return `没有找到与“${productName || categoryName}”相关的已上架商品。`;
    }

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

  private async findCategoryId(categoryName: string): Promise<number | null> {
    const expectedName = this.normalizeName(categoryName);
    const categories = await this.categoryService.findAll();

    // 先精确匹配，再做包含匹配，避免“手机”和“手机配件”优先匹配错对象。
    const exactMatch = categories.find(
      (category) => this.normalizeName(category.name) === expectedName,
    );
    if (exactMatch) {
      return exactMatch.id;
    }

    const fuzzyMatch = categories.find((category) => {
      const actualName = this.normalizeName(category.name);
      return (
        actualName.includes(expectedName) || expectedName.includes(actualName)
      );
    });

    return fuzzyMatch?.id ?? null;
  }

  private normalizeName(value: string): string {
    return value.trim().toLowerCase();
  }

  private formatInventoryReply(
    products: Array<{ name: string; stock: number }>,
  ): string {
    return products
      .map((product) =>
        product.stock <= 0
          ? `${product.name} 当前库存为 0，暂时缺货。`
          : `${product.name} 当前库存 ${product.stock} 件，可以购买。`,
      )
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
    products: Array<{ name: string; price: number; stock: number }>,
  ): string {
    const lines = products.map(
      (product) =>
        `- ${product.name}：¥${product.price}，${
          product.stock > 0 ? '有货' : '暂时缺货'
        }`,
    );

    return ['找到以下商品：', ...lines].join('\n');
  }
}
