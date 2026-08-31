import { tool } from 'langchain';
import { z } from 'zod';
import { ElkMcpClientService } from './elk-mcp-client.service';

export function createElkTools(client: ElkMcpClientService) {
  return [
    tool(
      async (_args, runtime) =>
        JSON.stringify(
          await client.call('get_connection_status', {}, runtime.signal),
        ),
      {
        name: 'elk_connection_status',
        description:
          '检查 ELK MCP 浏览器状态，不启动浏览器。discover_available 仅代表查询框可见，不保证登录和页面设置正确。',
        schema: z.strictObject({}),
      },
    ),
    tool(
      async (_args, runtime) =>
        JSON.stringify(await client.call('open_kibana', {}, runtime.signal)),
      {
        name: 'elk_open_kibana',
        description:
          '在 MCP 运行机器上打开独立 Kibana 窗口。必须由用户手动登录并设置 Discover，不能索要密码或 Cookie；调用后结束本轮，等用户确认再查询。',
        schema: z.strictObject({}),
      },
    ),
    tool(
      async (args, runtime) =>
        JSON.stringify(await client.call('search_logs', args, runtime.signal)),
      {
        name: 'elk_search_logs',
        description:
          '查询获准域名指定时间范围的 HTTP 5xx（最近 15 分钟、最近 1 小时、最近 24 小时、今天或昨天），最多 50 条白名单字段样本。host 必须由用户明确提供，不是 Kibana 地址；缺失时询问用户。不能改变索引或状态范围，不支持任意 KQL。失败不是零结果，样本不是全量统计。',
        schema: z.strictObject({
          host: z
            .string()
            .trim()
            .toLowerCase()
            .max(253)
            .regex(
              /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
            ),
          limit: z.number().int().min(1).max(50).default(10),
          range: z.enum(['last_15m', 'last_1h', 'last_24h', 'today', 'yesterday']).default('last_15m'),
        }),
      },
    ),
    tool(
      async (args, runtime) =>
        JSON.stringify(await client.call('count_path_visits', args, runtime.signal)),
      {
        name: 'elk_count_path_visits',
        description:
          '统计 url_path 在指定时间范围内的访问文档数（最近 15 分钟、最近 1 小时、最近 24 小时、今天或昨天）。用户只需提供路径；后端有白名单时会限制在白名单内，没有白名单时按当前 Kibana 登录权限查询。若结果 exact=false，只能说明当前页面样本数，不能宣称为全量访问量。',
        schema: z.strictObject({
          host: z
            .string()
            .trim()
            .toLowerCase()
            .max(253)
            .regex(
              /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
            )
            .optional(),
          url_path: z
            .string()
            .trim()
            .min(1)
            .max(2048)
            .regex(/^\/[^\s"'<>]*$/),
          range: z.enum(['last_15m', 'last_1h', 'last_24h', 'today', 'yesterday']).default('today'),
        }),
      },
    ),
  ];
}
