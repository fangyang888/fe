# LangChain 单 Agent

当前模块提供一个无状态的 LangChain.js Agent，入口为：

```http
POST /api/agent/chat
Content-Type: application/json

{
  "message": "请计算 125 × 8，并告诉我上海现在几点"
}
```

响应示例：

```json
{
  "reply": "125 × 8 = 1000。上海当前时间是……",
  "model": "gpt-4.1-mini"
}
```

## 配置

在 `server/.env` 中配置：

```dotenv
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=gpt-4.1-mini
# 使用 OpenAI 官方接口时留空；使用兼容接口时填写完整地址
OPENAI_BASE_URL=
```

运行环境需要 Node.js 20.19 或更高版本。

## 当前边界

- 每次请求独立执行，不保存对话记忆。
- 工具只有基础计算和时区时间查询，均不写入数据库。
- API Key 只存在 NestJS 服务端，不发送给前端。
- `createAgent` 内部使用 LangGraph 的预构建 Agent 运行时，但本模块没有定义自定义图。

## 何时改为自定义 LangGraph

出现以下任一需求时，应设计显式的 LangGraph 工作流：

- 一次任务需要跨请求暂停并恢复。
- 工具执行前需要人工审批。
- 需要持久化每一步状态或从失败节点重试。
- 业务包含明确的多分支、循环或多个 Agent 协作。
- 需要可追踪的长时间后台任务。
