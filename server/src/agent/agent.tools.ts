import { tool } from 'langchain';
import { z } from 'zod';

/**
 * Tool = 普通函数 + 给模型看的使用说明 + Zod 参数规则。
 * Tool 本身不会主动执行，createAgent 会根据用户问题决定是否调用它。
 */
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

/**
 * 当前只注册通用 Tool。
 * 商品问题由 ProductCustomerService 确定性处理，避免同一能力同时存在两个入口。
 */
export function createAgentTools() {
  return [calculatorTool, currentTimeTool, transformTextTool];
}
