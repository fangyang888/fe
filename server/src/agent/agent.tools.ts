import { tool } from 'langchain';
import { z } from 'zod';
import { demoProducts } from './mock';
import { ProductService } from 'src/product/product.service';
import { CategoryService } from 'src/category/category.service';

const calculatorTool = tool(
  ({ operation, left, right }) => {
    let result: number;

    switch (operation) {
      case 'add':
        result = left + right;
        break;
      case 'subtract':
        result = left - right;
        break;
      case 'multiply':
        result = left * right;
        break;
      case 'divide':
        if (right === 0) {
          return '计算失败：除数不能为 0。';
        }
        result = left / right;
        break;
    }

    if (!Number.isFinite(result)) {
      return '计算失败：结果不是有限数字。';
    }

    return String(result);
  },
  {
    name: 'calculator',
    description: '对两个数字执行加、减、乘、除运算。涉及算术时必须使用此工具。',
    schema: z.object({
      operation: z
        .enum(['add', 'subtract', 'multiply', 'divide'])
        .describe('要执行的运算'),
      left: z.number().describe('左操作数'),
      right: z.number().describe('右操作数'),
    }),
  },
);

const transformTextTool = tool(
  ({ operation, text }) => {
    console.log('transformTextTool called with:', { operation, text });
    switch (operation) {
      case 'uppercase':
        return text.toUpperCase();
      case 'lowercase':
        return text.toLowerCase();
      case 'trim':
        return text.trim();
      case 'reverse':
        return Array.from(text).reverse().join('');
    }
  },
  {
    name: 'transform_text',
    description:
      '对字符串执行大写、小写、删除首尾空格或反转操作。用户明确要求转换文本时使用。',
    schema: z.object({
      operation: z.enum(['uppercase', 'lowercase', 'trim', 'reverse']),
      text: z
        .string()
        .min(1, 'text 不能为空')
        .max(1000, 'text 不能超过 1000 个字符')
        .describe('需要处理的原始文本'),
    }),
  },
);

const currentTimeTool = tool(
  ({ timeZone }) => {
    try {
      return new Intl.DateTimeFormat('zh-CN', {
        dateStyle: 'full',
        timeStyle: 'long',
        timeZone,
      }).format(new Date());
    } catch {
      return `无法识别时区 ${timeZone}，请使用 Asia/Shanghai 这类 IANA 时区名称。`;
    }
  },
  {
    name: 'get_current_time',
    description: '获取指定 IANA 时区的当前日期和时间。',
    schema: z.object({
      timeZone: z
        .string()
        .default('Asia/Shanghai')
        .describe('IANA 时区名称，例如 Asia/Shanghai'),
    }),
  },
);

const searchProductDemoTool = tool(
  ({ keyword, limit }) => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    const products = demoProducts
      .filter((product) => {
        const searchableText =
          product.name.toLowerCase() + ' ' + product.category.toLowerCase();

        return searchableText.includes(normalizedKeyword);
      })
      .slice(0, limit);

    return {
      keyword,
      total: products.length,
      products: products.map((product) => ({
        id: product.id,
        name: product.name,
        price: product.price,
        stock: product.stock,
        inStock: product.stock > 0,
        availability: product.stock > 0 ? 'in_stock' : 'out_of_stock',
      })),
    };
  },
  {
    name: 'search_product_demo',
    description: `用户询问商品名称、价格或库存时，必须调用商品查询工具,
"商品信息必须以工具返回结果为准，不得根据模型记忆编造,
"商品工具没有返回结果时，应明确说明没有找到相关商品。`,

    schema: z.object({
      keyword: z
        .string()
        .trim()
        .min(1, 'keyword 不能为空')
        .max(50, 'keyword 不能超过 50 个字符')
        .describe('商品名称或分类关键词，例如耳机、数码'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(5)
        .default(3)
        .describe('最多返回的商品数量'),
    }),
  },
);

function createSearchProductTool(productService: ProductService) {
  return tool(
    async ({ keyword, limit, sort }) => {
      const result = await productService.findAll({
        keyword,
        page: 1,
        pageSize: limit,
        sort,
      });

      return {
        keyword,
        total: result.total,
        products: result.list.map((product) => ({
          id: product.id,
          name: product.name,
          price: product.price,
          originalPrice: product.originalPrice ?? null,
          sales: product.sales,
          inStock: product.stock > 0,
          image: product.image ?? null,
        })),
      };
    },
    {
      name: 'search_product',
      description:
        '查询商城中已上架的真实商品。用户询问商品名称、价格、销量或库存时使用。查询结果为空时不得编造商品。',
      schema: z.object({
        keyword: z
          .string()
          .trim()
          .min(1, 'keyword 不能为空')
          .max(50, 'keyword 不能超过 50 个字符')
          .describe('商品名称关键词，例如耳机、键盘'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(5)
          .default(3)
          .describe('最多返回的商品数量'),
        sort: z
          .enum(['sales', 'price', 'newest'])
          .default('sales')
          .describe('商品排序方式'),
      }),
    },
  );
}

function createListCatalogTool(
  categoryService: CategoryService,
  productService: ProductService,
) {
  return tool(
    async ({ categoryId, limitPerCategory }) => {
      const categories = await categoryService.findAll();

      const selectedCategories = categoryId
        ? categories.filter((category) => category.id === categoryId)
        : categories;

      const result = await Promise.all(
        selectedCategories.map(async (category) => {
          const productResult = await productService.findAll({
            categoryId: category.id,
            page: 1,
            pageSize: limitPerCategory,
            sort: 'newest',
          });

          return {
            category: {
              id: category.id,
              name: category.name,
            },
            total: productResult.total,
            products: productResult.list.map((product) => ({
              id: product.id,
              name: product.name,
              price: product.price,
              stock: product.stock,
              inStock: product.stock > 0,
            })),
          };
        }),
      );

      return {
        categoryCount: result.length,
        categories: result,
      };
    },
    {
      name: 'list_catalog',
      description:
        '查看商城分类和分类下的商品。用户询问有哪些分类、全部商品、某个分类有哪些商品时使用。',
      schema: z.object({
        categoryId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('分类 ID；不传表示查询全部分类'),
        limitPerCategory: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(10)
          .describe('每个分类最多返回多少件商品'),
      }),
    },
  );
}
export function createAgentTools(
  productService: ProductService,
  categoryService: CategoryService,
) {
  return [
    calculatorTool,
    currentTimeTool,
    transformTextTool,
    // searchProductDemoTool,
    createSearchProductTool(productService),
    createListCatalogTool(categoryService, productService),
  ];
}
