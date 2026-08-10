import { CategoryService } from '../category/category.service';
import { ProductService } from '../product/product.service';
import { CustomerIntent } from './agent.intent';
import { ProductCustomerService } from './product-customer.service';

describe('ProductCustomerService', () => {
  it('库存意图使用 ProductService 的真实库存生成回答', async () => {
    const productService = {
      findAll: jest.fn().mockResolvedValue({
        list: [{ name: '无线耳机', price: 299, stock: 10 }],
        total: 1,
        page: 1,
        pageSize: 5,
      }),
    } as unknown as ProductService;
    const categoryService = {
      findAll: jest.fn(),
    } as unknown as CategoryService;
    const service = new ProductCustomerService(productService, categoryService);
    const analysis: CustomerIntent = {
      intent: 'inventory_query',
      confidence: 0.95,
      entities: {
        productName: '无线耳机',
        categoryName: null,
        orderNo: null,
        budgetMax: null,
        quantity: null,
        reason: null,
      },
      missingFields: [],
      normalizedQuery: '查询无线耳机库存',
    };

    await expect(service.reply(analysis)).resolves.toBe(
      '无线耳机 当前库存 10 件，可以购买。',
    );
    expect(productService.findAll).toHaveBeenCalledWith({
      keyword: '无线耳机',
      categoryId: undefined,
      page: 1,
      pageSize: 5,
      sort: 'sales',
    });
  });
});
