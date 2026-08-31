# LangChain 单 Agent

> 初学者学习路线和每周练习计划请查看：[LEARNING_PLAN.md](./LEARNING_PLAN.md)。
>
> Zod 专项学习请查看：[Server Agent Zod 项目实战学习指南](./ZOD_PROJECT_STUDY_GUIDE.md)。
>
> 第 1 课详细讲解请查看：[ChatOpenAI、model.invoke() 与 Tool](./LESSON_01_CHATOPENAI_AND_TOOLS.md)。
>
> 第 2 课详细讲解请查看：[从模拟商品查询 Tool 到 ProductService](./LESSON_02_PRODUCT_SEARCH_TOOL.md)。
>
> 第 3 课详细讲解请查看：[Structured Output 客服意图识别与关键数据提取](./LESSON_03_STRUCTURED_OUTPUT_INTENT_EXTRACTION.md)。
>
> 第 4 课详细讲解请查看：[从 Structured Output 到可运行的商品客服](./LESSON_04_INTENT_TO_PRODUCT_CUSTOMER_SERVICE.md)。
>
> 第 1～4 章现代版复习请查看：[LangChain.js v1 Agent 核心基础](./LESSON_01_04_LANGCHAIN_V1_MODERN_REVIEW.md)。
>
> 如果详细版看起来太多，请先阅读：[第 1～4 章小白主线版](./LESSON_01_04_BEGINNER_MAINLINE.md)。
>
> 第 5 课详细讲解请查看：[多轮客服会话、缺失字段补全与短期状态](./LESSON_05_MULTI_TURN_STATE_AND_SLOT_FILLING.md)。
>
> 第 5 课动手版请查看：[五天代码实验与每日自测](./LESSON_05_FIVE_DAY_CODE_AND_SELF_TEST.md)。
>
> 第 6 课详细讲解请查看：[生产级会话持久化与上下文工程](./LESSON_06_PERSISTENT_CONVERSATIONS_AND_CONTEXT_ENGINEERING.md)。
>
> 如果原理容易混乱，请先跟着当前项目逐步修改：[第 6 课现有项目跟敲版](./LESSON_06_EXISTING_PROJECT_STEP_BY_STEP.md)。
>
> 第 6 课动手版请查看：[六天代码实验与页面自测](./LESSON_06_SIX_DAY_CODE_AND_PAGE_TEST.md)。

> 完成第 1～4 关后，从这里继续：[第 5～8 关生产级会话 Context 落地与验收](./LESSON_06_GATE_05_TO_08_PRODUCTION_CONTEXT.md)。
>
> 第 7 课详细讲解请查看：[生产级流式客服与可观测执行](./LESSON_07_PRODUCTION_STREAMING_AND_OBSERVABILITY.md)。
>
> 第 7 课跟敲上篇：[后端事件协议、Agent Streaming 与 SSE 自测](./LESSON_07_UPPER_BACKEND_STREAMING_CODE_AND_SELF_TEST.md)。
>
> 第 7 课跟敲下篇：[前端流式页面、取消、可观测性与线上验收](./LESSON_07_LOWER_FRONTEND_OBSERVABILITY_AND_SELF_TEST.md)。
>
> 第 8 课第一次学习请先阅读：[RAG 核心原理与学习要点](./LESSON_08_RAG_KEY_POINTS_AND_LEARNING_GUIDE.md)。
>
> 第 8 课详细讲解请查看：[生产级客服知识库与 RAG](./LESSON_08_PRODUCTION_RAG_AND_KNOWLEDGE_BASE.md)。
>
> 如果希望从入门到生产实战逐章学习，请使用：[RAG 从入门到精通：商城客服项目实战](./rag-learning/README.md)。
>
> 如果希望直接结合当前项目编写生产代码，请使用：[生产级 RAG 代码实验课](./rag-learning/production-code-labs/README.md)。
>
> 第 9 课详细讲解请查看：[安全业务 Tool、用户归属与真正转人工](./LESSON_09_SECURE_BUSINESS_TOOLS_AND_HUMAN_HANDOFF.md)。
>
> 第 10 课详细讲解请查看：[自定义 LangGraph、持久工作流与人工审批](./LESSON_10_LANGGRAPH_WORKFLOW_AND_HUMAN_APPROVAL.md)。

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
  "model": "gpt-4.1-mini",
  "source": "agent",
  "intent": "general_chat",
  "entities": {
    "productName": null,
    "categoryName": null,
    "orderNo": null,
    "budgetMax": null,
    "quantity": null,
    "reason": null
  }
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
- 商品搜索、价格和库存走 `ProductCustomerService → ProductService` 确定性路径。
- `createAgent` 当前只注册计算、文本转换和时区时间三个通用 Tool。
- 当前不提供数据库写操作。
- API Key 只存在 NestJS 服务端，不发送给前端。
- `createAgent` 内部使用 LangGraph 的预构建 Agent 运行时，但本模块没有定义自定义图。

## 当前代码结构

```text
AgentController
  └─ AgentService                 # 总调度：决定交给谁
      ├─ AgentIntentService       # 理解语言：提取 intent/entities
      │   └─ AgentModelFactory    # 统一创建 ChatOpenAI
      ├─ ProductCustomerService   # 商品业务：分类、查询、回答
      │   ├─ ProductService
      │   └─ CategoryService
      └─ createAgent              # 非商品问题：计算、时间、文本 Tool
          └─ AgentModelFactory
```

## 何时改为自定义 LangGraph

出现以下任一需求时，应设计显式的 LangGraph 工作流：

- 一次任务需要跨请求暂停并恢复。
- 工具执行前需要人工审批。
- 需要持久化每一步状态或从失败节点重试。
- 业务包含明确的多分支、循环或多个 Agent 协作。
- 需要可追踪的长时间后台任务。
