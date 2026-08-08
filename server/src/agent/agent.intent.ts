import { z } from 'zod';

/**
 * 第一版客服意图。
 * 不要一开始放几十种意图，分类越多越容易混淆。
 */
export const CustomerIntentNameSchema = z.enum([
  'product_search',
  'inventory_query',
  'price_query',
  'order_status',
  'refund_request',
  'complaint',
  'human_handoff',
  'general_chat',
  'unknown',
]);

/**
 * 用户话语中明确出现的关键数据。
 * 没有出现的字段统一返回 null，不允许模型猜测。
 */
export const CustomerEntitiesSchema = z.object({
  productName: z
    .string()
    .nullable()
    .describe('用户明确提到的商品名称，未提到时为 null'),

  categoryName: z
    .string()
    .nullable()
    .describe('用户明确提到的商品分类，未提到时为 null'),

  orderNo: z
    .string()
    .nullable()
    .describe('用户明确提供的订单号，未提供时为 null'),

  budgetMax: z
    .number()
    .nonnegative()
    .nullable()
    .describe('用户明确表达的最高预算，未表达时为 null'),

  quantity: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe('用户明确表达的数量，未表达时为 null'),

  reason: z.string().nullable().describe('退款或投诉原因，未表达时为 null'),
});

export const MissingFieldSchema = z.enum([
  'productName',
  'categoryName',
  'orderNo',
  'budgetMax',
  'quantity',
  'reason',
]);

/**
 * 模型最终必须填写的完整登记表。
 */
export const CustomerIntentSchema = z.object({
  intent: CustomerIntentNameSchema.describe('用户当前最主要的客服意图'),

  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('模型对主要意图的判断信心，范围 0 到 1'),

  entities: CustomerEntitiesSchema,

  missingFields: z
    .array(MissingFieldSchema)
    .describe('完成当前请求仍缺少的关键字段'),

  normalizedQuery: z
    .string()
    .describe('整理后的用户请求，不得增加用户没有说过的事实'),
});

export type CustomerIntentName = z.infer<typeof CustomerIntentNameSchema>;

export type CustomerEntities = z.infer<typeof CustomerEntitiesSchema>;

export type CustomerIntent = z.infer<typeof CustomerIntentSchema>;
