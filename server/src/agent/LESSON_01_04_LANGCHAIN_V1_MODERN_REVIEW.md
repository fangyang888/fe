# 第 1～4 章现代版复习：对照当前代码精讲 LangChain.js v1 Agent

> **阅读提示：这是一份详细参考手册，不建议小白从头连续阅读。**
>
> 请先学习更短、更清晰的主线版：`LESSON_01_04_BEGINNER_MAINLINE.md`。
> 主线版学完后，遇到具体问题再回到本文查阅生产级细节。

这份文档是第 1～4 章的“当前代码对照版”。它不是让你把前四章全部推翻重学，而是直接对照现有 `agent.service.ts`、`agent.tools.ts`、意图识别、Controller、DTO 和测试，回答四个问题：

```text
当前代码到底怎样运行？
哪些地方已经做对了？
哪些地方应该修改？
需要引入什么新概念，为什么现在要引入？
```

本章不会只给出“最佳实践”结论。每个重要修改都会说明：

```text
当前写法
→ 实际后果
→ 新概念
→ 推荐改法
→ 为什么这样改
→ 怎样测试
```

当前项目的版本基线：

```json
{
  "node": ">=20.19.0",
  "langchain": "^1.5.5",
  "@langchain/core": "^1.2.5",
  "@langchain/openai": "^1.5.6",
  "zod": "^4.4.3"
}
```

## 最新状态：本轮代码结构已经落地

下面是现在真正运行的结构，不是未来设想：

```text
AgentController
  └─ AgentService                  总调度，只决定请求交给谁
      ├─ AgentIntentService        用 Structured Output 理解用户
      │   └─ AgentModelFactory     统一读取模型配置并创建 ChatOpenAI
      ├─ ProductCustomerService    商品搜索、价格和库存用例
      │   ├─ ProductService        查询真实商品数据库
      │   └─ CategoryService       查询和匹配真实分类
      └─ createAgent               处理通用问题
          └─ calculator/time/text 三个 Tool
```

### 为什么这样拆

| 文件 | 现在只负责什么 | 为什么这样做 |
| --- | --- | --- |
| `agent.service.ts` | 识别意图后选择商品通道或 Agent 通道 | 总调度器不再同时处理分类、数据库和答案格式化 |
| `agent-model.factory.ts` | 创建并复用 `ChatOpenAI` | 模型名、API Key、Base URL 只有一个配置入口 |
| `agent.intent.service.ts` | 自然语言 → `CustomerIntent` | 意图识别不应该注入未使用的商品服务 |
| `product-customer.service.ts` | 商品字段校验、分类匹配、商品查询、回答格式化 | 商品业务集中后更容易单测和扩展 |
| `agent.tools.ts` | 计算、时间、文本转换 | 商品能力不再与确定性商品路由重复 |
| `agent.dto.ts` | 请求校验与统一响应 | 空格消息会被拒绝；每次响应明确带 `source` |

### 现在的一条请求怎样运行

商品问题：

```text
“无线耳机还有多少库存？”
→ AgentService.chat()
→ AgentIntentService.analyze()
→ intent = inventory_query
→ ProductCustomerService.reply()
→ ProductService.findAll()
→ “无线耳机 当前库存 10 件，可以购买。”
```

通用 Tool 问题：

```text
“125 × 8 等于多少？”
→ AgentService.chat()
→ AgentIntentService.analyze()
→ 不属于商品意图
→ createAgent.invoke()
→ calculator Tool
→ Agent 组织最终答案
```

### 建议按这个顺序阅读代码

1. `agent.controller.ts`：找到 HTTP 入口。
2. `agent.service.ts`：只跟踪两个分支，不看实现细节。
3. `agent.intent.ts`：看意图对象长什么样。
4. `agent.intent.service.ts`：看模型怎样填这张表。
5. `product-customer.service.ts`：看商品分支怎样查真实数据。
6. `agent.tools.ts`：看非商品分支怎样注册 Tool。
7. `agent-model.factory.ts`：最后再看模型配置怎样复用。

代码中只在“职责边界”和“容易产生误解”的地方加入了注释。没有逐行注释，
因为逐行翻译 TypeScript 会制造更多噪音，也容易让注释和代码以后不一致。

> 从后面的“第零部分”开始，保留的是**重构前代码审计记录**，用于解释为什么要做这些修改。
> 学习当前调用链时，先读完上面的“最新状态”，然后直接看实际代码；遇到原理问题再向下查。

这份课件以你本地已经安装的 API 为准，同时参考当前官方 v1 文档：

- [LangChain v1 迁移指南](https://docs.langchain.com/oss/javascript/migrate/langchain-v1)
- [LangChain Agent](https://docs.langchain.com/oss/javascript/langchain/agents)
- [Structured Output](https://docs.langchain.com/oss/javascript/langchain/structured-output)
- [Middleware](https://docs.langchain.com/oss/javascript/langchain/middleware/overview)
- [Runtime Context](https://docs.langchain.com/oss/javascript/langchain/runtime)
- [Context Engineering](https://docs.langchain.com/oss/javascript/langchain/context-engineering)

---

## 一、先说结论：哪些不用重学，哪些需要升级

### 不会过时的基础

下面这些知识即使 LangChain API 将来变化，也不会白学：

- `system`、`user`、`assistant`、`tool` 消息角色。
- 模型输入、模型输出和 Token。
- `async/await`、超时、重试和异常处理。
- Zod Schema 和运行时校验。
- Tool 的名称、描述、参数和执行函数。
- 模型不能代替权限验证。
- Structured Output 只负责提取，业务代码负责裁决。
- ProductService 返回真实商品数据，模型不能编造库存。
- 单元测试与模型评测是两种不同测试。

### 需要采用 v1 新写法的部分

| 旧教程中常见写法 | 当前课程采用 |
| --- | --- |
| `createReactAgent` | `createAgent` |
| `initializeAgentExecutorWithOptions` | `createAgent` |
| `LLMChain` / `ConversationChain` | 模型 `invoke()`、Runnable 或 `createAgent` |
| 动态 Prompt 手动拼在每个接口里 | `dynamicSystemPromptMiddleware` |
| Tool 错误在每个 Tool 重复 try/catch | `toolRetryMiddleware` / 自定义 Middleware |
| Prompt 要求模型“返回 JSON” | `withStructuredOutput` 或 `responseFormat` |
| Tool 参数中接受模型生成的 `userId` | 从可信 Runtime Context 读取用户身份 |
| 手动把所有消息无限拼接 | Checkpointer + 裁剪/摘要 Middleware |
| 只看最终文本 | 标准消息、`contentBlocks`、Tool Calls、结构化结果 |

### 暂时只了解、不要求实现

- 旧版 `@langchain/classic`。
- 多 Agent。
- Deep Agents。
- 自定义 LangGraph StateGraph。
- MCP Server。
- Agent Server 和 LangSmith Deployment。

它们不是没用，而是对当前“商城单 Agent 客服”还不是最短路径。

---

## 二、当前主流 Agent 技术地图

先把整个系统看成六层：

```text
HTTP 层
Controller + DTO + 登录鉴权
        ↓
客服编排层
意图路由、字段补全、确定性业务规则
        ↓
LangChain Agent 层
createAgent + Middleware + State + Runtime Context
        ↓
模型层
ChatOpenAI / initChatModel + Structured Output
        ↓
Tool / Service 层
Zod Tool → ProductService / OrderService / KnowledgeService
        ↓
状态和观测层
Checkpointer、Redis、MySQL、Tracing、Evals
```

这六层不要混在一个 `AgentService.chat()` 中。

### 每一层的职责

| 层 | 应该做 | 不应该做 |
| --- | --- | --- |
| Controller | 接 HTTP、验证 DTO | 直接创建模型 |
| 编排 Service | 意图分流、补参、调用业务 | 保存 API Key |
| Agent | 决定是否调用 Tool | 绕过权限规则 |
| Model | 理解和生成 | 查询你没有提供的数据 |
| Tool | 调用可信业务 Service | 相信模型传入的用户身份 |
| 状态/观测 | 保存状态、追踪、评测 | 替代业务逻辑 |

---

# 第零部分：重构前代码快照——理解为什么要修改

## A1、当前请求实际上走了哪条路径

你当前的 `/api/agent/chat` 并不是“所有问题直接进入 Agent”。真实流程是：

```text
POST /api/agent/chat
→ AgentController.chat(dto)
→ AgentService.chat(message)
→ AgentIntentService.analyze(message)
→ withStructuredOutput(CustomerIntentSchema)
→ 得到 intent + entities + missingFields
```

接着分成两条路径：

```text
如果 intent 属于：
product_search / inventory_query / price_query
→ handleProductIntent()
→ ProductService.findAll()
→ 代码模板生成回答

否则
→ getAgent().invoke()
→ createAgent 内部决定是否调用 Tool
→ 取最后一条消息
→ 返回回答
```

可以画成：

```text
                    ┌─ 商品意图 ─→ 确定性 ProductService 路由
用户 → 意图模型 ────┤
                    └─ 其他意图 ─→ createAgent + Tools
```

这叫“双通道架构”。方向本身是合理的，但当前实现存在一个重要问题：

```text
确定性商品通道
和
Agent 的 search_product / list_catalog Tool
同时拥有商品查询职责
```

当两个通道都能做同一件事，就会出现“谁才是权威入口”的问题。

---

## A2、先给出完整结论：修改优先级

### P0：现在就应该修正的正确性问题

| 当前位置 | 当前问题 | 推荐修改 | 为什么 |
| --- | --- | --- | --- |
| `agent.service.ts` | Agent 分支没有返回 `source: 'agent'` | 两个响应分支都明确填写 `source` | 前端和日志才能可靠区分执行路径 |
| `agent.tools.ts` | `search_product` 声称能查库存，但只返回 `inStock`，没有库存数量 | 返回安全的 `stock` 数量 | 用户问“有多少件”时模型没有真实数据 |
| `agent.intent.ts` | `missingFields` 完全由模型决定 | 用代码根据 intent 重新计算 | 必填字段属于业务规则，不属于模型判断 |
| `agent.intent.ts` | 定义了订单、退款、投诉和人工意图，但 `AgentService` 没有明确处理 | 建立完整、穷尽的路由表 | 当前这些意图会悄悄落入无相应 Tool 的 Agent |
| `agent.tools.ts` | Demo Tool 虽未导出，仍留在生产文件并导入 mock 数据 | 移到测试/学习 fixture 或删除 | 避免生产代码存在两套商品事实来源 |
| `agent.tools.ts` | `list_catalog` 对所有分类并发逐个查询商品 | 增加分类上限、分页或批量查询 | 避免 N+1 查询、无界并发和巨大 Tool 结果 |
| `agent.service.ts` | 多处 `console.log` 打印分类和完整商品结果 | 改用 Nest Logger，只记必要字段 | 生产日志可能泄露数据且无法结构化检索 |
| `agent.intent.service.ts` | 注入了未使用的 ProductService、CategoryService | 删除无用依赖 | 降低耦合，也让测试更容易构造 |
| `agent.service.spec.ts` | 构造函数仍只传一个依赖 | 补齐四个 Mock，按新流程测试 | 当前测试不能编译 |
| `agent.intent.spec.ts` | 引用了未声明的 `@jest/globals` | 使用项目 Jest 全局或声明直接依赖 | 当前测试不能编译 |

### P1：完成 P0 后进行的架构升级

| 要引入的新概念 | 解决什么问题 |
| --- | --- |
| `AgentModelFactory` | 两个 Service 重复读取 Key、Base URL、模型名和创建 ChatOpenAI |
| 路由所有权 | 商品查询不能同时由确定性路由和自由 Agent 随意负责 |
| Discriminated Union | `source`、`intent`、`entities` 等响应字段关系更明确 |
| Error Taxonomy | 不能把数据库错误、模型错误、业务空结果全部包装成同一个 502 |
| Capability Matrix | 兼容网关到底支持普通调用、Tool、Structured Output、Streaming，需要实测 |
| Runtime Context | 以后订单 Tool 的可信 userId 不能由模型生成 |
| Agent Middleware | 统一限制模型/Tool 调用次数、处理瞬时重试和日志 |
| Bounded Fan-out | 防止“所有分类”导致几十个并发数据库查询和超长上下文 |
| Contract Test / Trajectory Eval | 不只看回答，还要验证路由、Tool、参数和调用次数 |

### P2：后续章节再实现

```text
Checkpointer 与 thread_id
多轮状态合并
Streaming / SSE
LangSmith Tracing
RAG 知识库
PII Middleware
Human-in-the-loop
自定义 LangGraph
```

P2 很重要，但不能用它掩盖 P0 的基本正确性问题。

---

## A3、当前做对的地方：不要为了重构全部推翻

### 1. 使用 `createAgent` 而不是旧 AgentExecutor

当前：

```ts
this.agent = createAgent({
  name: 'fe_assistant',
  model,
  tools: createAgentTools(...),
  systemPrompt,
});
```

这是 LangChain.js v1 的正确主线。

### 2. 意图识别使用模型级 Structured Output

当前：

```ts
this.getModel().withStructuredOutput(CustomerIntentSchema)
```

“一次分类和字段提取”不需要 Agent 循环，用模型级结构化输出是合理选择。

### 3. Tool 调用真实 ProductService

当前 `createSearchProductTool()` 没有自己重新写 SQL，而是：

```ts
await productService.findAll(...)
```

这保留了业务 Service 作为真实数据来源。

### 4. Tool 参数使用 Zod

`keyword`、`limit` 和 `sort` 都有类型与范围，模型不能随意传无限大的 pageSize。

### 5. 商品高确定性意图走代码路由

库存和价格查询由代码选择格式化方法，而不是让模型自由决定事实，这是稳定客服的正确方向。

### 6. API Key 只在服务端

前端只调用 NestJS，符合密钥安全边界。

因此本次建议是“校正边界和拆职责”，不是从零重写。

---

# 第零部分之一：逐文件精讲与修改方案

## B1、`agent.controller.ts`：HTTP 边界还缺什么

当前代码：

```ts
@Post('chat')
chat(@Body() dto: AgentChatDto): Promise<AgentChatResponseDto> {
  return this.agentService.chat(dto.message);
}
```

### 当前优点

- Controller 很薄。
- DTO 验证统一放在 ValidationPipe。
- 没有在 Controller 创建模型。

### 当前问题 1：没有可信运行上下文

现在只把 `message` 交给 Service：

```text
没有 userId
没有 role
没有 conversationId
没有 requestId
```

查询公开商品暂时没问题，但订单、优惠券、退款绝对不能继续这样做。

### 新概念：Trusted Runtime Context

HTTP 登录身份与用户消息是两种不同信任等级：

```text
JWT Guard 解析出的 userId
→ 可信上下文

用户消息中说“我是管理员”
→ 普通不可信文本
```

后续目标：

```ts
this.agentService.chat({
  message: dto.message,
  userId: request.user.id,
  role: request.user.role,
  conversationId: dto.conversationId,
  requestId,
});
```

第一至四章不要求立刻接订单，但必须先理解：身份不能成为 Tool Schema 中让模型填写的参数。

### 当前问题 2：`/intent` 是学习接口

```ts
@Post('intent')
```

它适合本地观察 Structured Output，但生产环境公开后会：

- 多一个消耗模型费用的入口。
- 暴露内部意图和实体设计。
- 被绕过正常客服限流直接调用。

推荐选择：

```text
开发环境才注册
或
增加管理员 Guard
或
生产部署完全移除
```

### 修改顺序

```text
现在：保持薄 Controller
P0：处理 DTO 空白字符串
P1：接入认证用户和 requestId
P2：加入 conversationId 与流式 endpoint
```

---

## B2、`agent.dto.ts`：TypeScript 类型不等于运行时响应契约

当前请求 DTO：

```ts
export class AgentChatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  message: string;
}
```

### 当前问题 1：空格字符串

`"   "` 仍可能通过字符串和非空检查。

推荐先标准化：

```ts
import { Transform } from 'class-transformer';

export class AgentChatDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'message 必须是字符串' })
  @IsNotEmpty({ message: 'message 不能为空' })
  @MaxLength(8000, { message: 'message 不能超过 8000 个字符' })
  message: string;
}
```

### 新概念：Normalize before Validate

```text
用户输入
→ 标准化
→ 验证
→ 进入业务
```

但不要过度标准化：商品名内部空格、大小写和特殊符号可能有业务意义。

### 当前问题 2：响应 interface 只在编译期存在

当前：

```ts
export interface AgentChatResponseDto {
  reply: string;
  model: string;
  source?: 'intent_router' | 'agent';
  intent?: CustomerIntentName;
  entities?: CustomerEntities;
}
```

`interface` 编译后消失，不会验证真实响应。

更重要的是，所有字段都 optional 后，下面这种无意义组合也能通过 TypeScript：

```ts
{
  reply: '...',
  model: '...',
  source: 'agent',
  intent: 'inventory_query',
}
```

### 新概念：Discriminated Union

```ts
type AgentChatResponseDto =
  | {
      source: 'intent_router';
      reply: string;
      model: string;
      intent: CustomerIntentName;
      entities: CustomerEntities;
    }
  | {
      source: 'agent';
      reply: string;
      model: string;
    };
```

`source` 成为判别字段：

```text
source = intent_router
→ intent/entities 必须存在

source = agent
→ 不假装存在确定性意图结果
```

为什么要改：

- 前端分支更安全。
- 测试更明确。
- 日志和统计可区分路径。
- 后续 Streaming 事件也能使用相同判别联合思想。

如果需要运行时响应验证，再为响应定义 Zod Schema 或序列化 DTO；不要误以为 TypeScript interface 已经做了运行时验证。

---

## B3、`AgentService.chat()`：当前最大的架构焦点

当前主干：

```ts
const analysis = await this.agentIntentService.analyze(message);

if (PRODUCT_INTENTS.has(analysis.intent)) {
  return this.handleProductIntent(analysis);
}

return this.getAgent().invoke(...);
```

### 新概念 1：Router Tax（路由成本）

现在每一条消息都先调用意图模型。

例如用户只说：

```text
你好
```

仍然会发生：

```text
第一次模型调用：意图识别
第二次模型调用：Agent 回答
```

这带来：

- 更高延迟。
- 更多费用。
- 第一次模型失败会阻止普通聊天。

这不一定代表当前架构错误，而是必须明确付出的成本。

可选优化：

```text
高频确定规则先做代码 Fast Path
→ 明确问候可直接处理

使用更小的意图模型
→ OPENAI_INTENT_MODEL

只在需要确定性路由的入口做分类
→ 其他入口直接 Agent
```

是否优化要用真实延迟和意图准确率决定，不能只凭感觉。

### 新概念 2：Routing Ownership（路由所有权）

当前 `product_search` 被确定性路由拦截，因此通常不会到 Agent 的 `search_product` Tool。

“有哪些分类”也可能被识别成 `product_search`，但当前 `handleProductIntent()` 发现没有 productName/categoryName 后只会追问：

```text
请告诉我你想查询的商品名称或分类
```

这意味着虽然 Agent 注册了 `list_catalog`，真实请求可能永远到不了它。

#### 推荐方案 A：确定性商品路由拥有全部商品意图

```text
product_search
inventory_query
price_query
catalog_browse
```

都进入 ProductCustomerService。

Agent 不再注册相同商品 Tool，或只在专门实验入口注册。

适合当前学习阶段和稳定客服。

#### 方案 B：Agent 拥有开放式商品咨询

```text
确定性路由只处理高风险/高确定查询
开放式推荐和比较交给 Agent Tool
```

这时意图路由要明确将哪些请求交给 Agent。

#### 不推荐方案

```text
两个通道都拥有全部商品能力
但没有明确优先级和测试
```

本课程建议先采用方案 A，等你完成 Tool 轨迹评测后再开放方案 B。

### 当前问题 3：Agent 分支漏写 source

当前 Agent 返回：

```ts
return {
  reply: this.extractText(lastMessage?.content),
  model: modelName,
};
```

应该至少变成：

```ts
return {
  source: 'agent',
  reply: this.extractText(lastMessage?.content),
  model: modelName,
};
```

这是 P0 正确性修复，不需要等后续章节。

### 当前问题 4：一个 catch 覆盖太多错误

当前除 `ServiceUnavailableException` 外，全部变成：

```text
502 AI 服务调用失败
```

但真实错误可能是：

```text
数据库连接失败
分类服务失败
模型 429
模型超时
Tool 参数错误
代码 Bug
```

### 新概念：Error Taxonomy

先按“错误是谁造成、用户能否重试”分类：

```ts
type AgentErrorCode =
  | 'AI_NOT_CONFIGURED'
  | 'MODEL_UNAUTHORIZED'
  | 'MODEL_RATE_LIMITED'
  | 'MODEL_TIMEOUT'
  | 'MODEL_UNAVAILABLE'
  | 'BUSINESS_DEPENDENCY_UNAVAILABLE'
  | 'INVALID_MODEL_OUTPUT'
  | 'INTERNAL_ERROR';
```

内部日志保存 cause 和 requestId；用户只看到安全文案。

注意：不要简单重抛所有 `HttpException`，因为某些内部 Tool 抛出的异常也可能包含不适合给用户的详情。正确方式是建立已知 Domain Error 到 Public Error 的映射。

---

## B4、`getAgent()`：单例复用是对的，但配置与角色需要改

当前 `private agent?: SingleAgent` 会延迟创建并复用 Agent。

### 这部分为什么合理

- 不需要每条请求重新构造 Tool 列表。
- 不需要重复创建模型客户端。
- Tool 依赖的 ProductService/CategoryService 是 Nest 单例。

### 未来加入用户身份后不要这样做

错误方向：

```ts
this.agent = createAgent({
  systemPrompt: `当前用户是 ${userId}`,
});
```

如果 Agent 是单例，第一个用户的信息可能污染后续调用。

正确方向：

```text
Agent 定义是单例、无用户状态
每次 invoke 通过 Runtime Context 传 userId/role/conversationId
```

### 当前 systemPrompt 身份不一致

当前：

```text
你是 FE 项目的中文 AI 助手
```

意图识别器却是：

```text
商城客服意图识别器
```

Tool 也在查询商城商品。

推荐统一为：

```text
你是商城中文客服助手。
公开商品事实必须来自授权 Tool 或确定性路由。
不得声称已执行退款、改地址、取消订单等写操作。
知识不足时明确说明并建议下一步。
```

为什么：同一系统不同层对角色理解不一致，会造成路由与回答边界冲突。

### 当前 Tool 集合包含学习工具

```text
calculator
get_current_time
transform_text
search_product
list_catalog
```

`transform_text` 对商城客服不是核心能力。

### 新概念：Minimal Tool Surface

Tool 越多：

- 模型选择越难。
- Tool 描述占 Token。
- 攻击面越大。
- 评测组合越多。

建议区分：

```ts
createLearningTools()
createCustomerServiceTools()
```

本地学习页面可以保留字符串 Tool；生产客服只注册业务需要的 Tool。

---

## B5、模型创建重复：引入 AgentModelFactory

当前两个地方都在做：

```text
读取 OPENAI_API_KEY
读取 OPENAI_BASE_URL
读取 OPENAI_MODEL
创建 ChatOpenAI
检查 Key
```

分别位于：

```text
AgentService.getAgent()
AgentIntentService.getModel()
```

### 实际风险

- 将来加 timeout 时可能只改一处。
- 将来加 maxRetries 时配置不一致。
- 兼容网关参数可能漂移。
- 测试需要重复 Mock ConfigService。
- 错误文案重复。

### 新概念：Factory + Purpose-specific Model

推荐：

```ts
type ModelPurpose = 'intent' | 'agent' | 'answer';

@Injectable()
export class AgentModelFactory {
  create(purpose: ModelPurpose): ChatOpenAI {
    // 集中读取和验证配置
    // 可以按用途选择不同模型、timeout、retry
  }
}
```

配置可以逐步演进为：

```dotenv
OPENAI_API_KEY=...
OPENAI_BASE_URL=...
OPENAI_MODEL=...
OPENAI_INTENT_MODEL=...
AI_REQUEST_TIMEOUT_MS=30000
```

### 为什么不是一个全局 `const model`

不同用途可能需要不同能力：

| 用途 | 关键能力 |
| --- | --- |
| intent | Structured Output、低成本、低延迟 |
| agent | Tool Calling、较强指令遵循 |
| answer | 文本质量、引用或结构化回答 |

Factory 统一配置，但不强迫三个用途永远使用同一个模型。

---

## B6、Capability Matrix：兼容网关不能只测试一句“你好”

你当前使用自定义 `OPENAI_BASE_URL`。所谓 OpenAI Compatible 可能只兼容部分能力。

应该建立能力矩阵：

| 能力 | 最小测试 | 当前用途 |
| --- | --- | --- |
| 普通 Chat | `model.invoke()` | 普通回答 |
| Structured Output | `withStructuredOutput()` | 意图识别 |
| Tool Calling | 一个 calculator Tool | Agent |
| Tool + Structured Output | Agent `responseFormat` | 后续卡片式回答 |
| Streaming | `stream()` / `streamEvents()` | 第 7 章 |
| Embeddings | `/embeddings` | 第 8 章 RAG |

### 新概念：Fail-fast Capability Probe

线上启动时不一定要真实调用所有付费接口，但部署前必须有独立 smoke test：

```text
配置存在
→ 普通调用成功
→ Schema 能力成功
→ Tool 调用成功
→ 超时和错误格式符合预期
```

为什么：普通聊天成功不能证明 Structured Output 和 Tool Calling 成功。

---

## B7、`AgentIntentService`：结构化提取正确，但边界还不完整

### 当前问题 1：两个注入依赖完全没使用

当前构造函数：

```ts
constructor(
  private readonly configService: ConfigService,
  private readonly productService: ProductService,
  private readonly categoryService: CategoryService,
) {}
```

后两个字段没有在任何方法中使用。

推荐删除，直到这个 Service 真正需要它们。

为什么：

- 意图识别应该只负责语言理解。
- 数据库查询属于编排或业务 Service。
- 无用依赖让单元测试必须构造无关对象。

### 当前问题 2：`confidence` 不是统计概率

模型返回：

```ts
confidence: 0.95
```

这只是模型按提示生成的自我评分，不自动等于：

```text
有 95% 的概率判断正确
```

### 新概念：Calibration（置信度校准）

你需要用标注评测集检查：

```text
所有 confidence 在 0.9～1.0 的样本
实际正确率是多少？
```

如果 100 个高置信样本只对 70 个，它就没有被校准。

第一版安全做法：

```text
confidence 仅作为路由辅助信号
高风险业务不依赖它授权
低置信度进入 unknown / 追问
```

例如：

```ts
if (analysis.confidence < 0.7) {
  return createClarificationReply();
}
```

阈值 `0.7` 也只是起点，最终必须从评测数据得到。

### 当前问题 3：所有异常都说“模型不支持 Structured Output”

真实原因也可能是：

- API Key 错误。
- 429。
- 网络超时。
- Base URL 不可达。
- Zod 验证失败。
- 供应商返回格式错误。

日志需要保留内部错误分类；用户文案可以统一，但运维必须能区分。

---

## B8、`CustomerIntentSchema`：Schema 正确不等于业务策略完整

当前意图枚举：

```text
product_search
inventory_query
price_query
order_status
refund_request
complaint
human_handoff
general_chat
unknown
```

### 当前问题 1：定义了能力，但系统并没有实现

当前没有订单查询 Tool、退款工作流、投诉工单或人工转接处理器。

这些 intent 会落入普通 Agent，而 systemPrompt 只说没有数据库写权限。

### 新概念：Declared Capability vs Implemented Capability

Schema 中出现一个 intent，等于对编排层提出一项必须处理的状态。

推荐建立穷尽表：

```ts
const INTENT_CAPABILITIES = {
  product_search: 'supported',
  inventory_query: 'supported',
  price_query: 'supported',
  order_status: 'not_implemented',
  refund_request: 'requires_handoff',
  complaint: 'requires_handoff',
  human_handoff: 'requires_handoff',
  general_chat: 'agent',
  unknown: 'clarify',
} satisfies Record<CustomerIntentName, CapabilityPolicy>;
```

`satisfies Record<...>` 的价值：新增一个 intent 后，如果忘记配置策略，TypeScript 会报错。

### 当前问题 2：缺少 catalog_browse

用户问：

```text
你们有哪些分类？
展示数码分类下的商品。
```

这与搜索具体商品不同。

建议新增：

```ts
'catalog_browse'
```

它需要的字段规则也与 product_search 不同。

### 当前问题 3：`missingFields` 由模型填写

模型可能返回：

```ts
intent: 'order_status'
orderNo: null
missingFields: []
```

Schema 仍然会通过，因为 Zod 不知道业务对应关系。

### 新概念：Cross-field Business Invariant

Zod 验证单个字段形状；代码策略验证字段之间的业务关系。

推荐：

```ts
const REQUIRED_FIELDS = {
  product_search: ['productName', 'categoryName'],
  inventory_query: ['productName', 'categoryName'],
  price_query: ['productName'],
  catalog_browse: [],
  order_status: ['orderNo'],
  refund_request: ['orderNo'],
  complaint: ['reason'],
  human_handoff: [],
  general_chat: [],
  unknown: [],
} as const;
```

注意：`product_search` 中 productName/categoryName 是“至少一个”，不能简单理解为两个都必填。

应该写业务函数：

```ts
function computeMissingFields(intent: CustomerIntent): MissingField[] {
  switch (intent.intent) {
    case 'product_search':
    case 'inventory_query':
      return intent.entities.productName || intent.entities.categoryName
        ? []
        : ['productName'];
    case 'price_query':
      return intent.entities.productName ? [] : ['productName'];
    case 'order_status':
    case 'refund_request':
      return intent.entities.orderNo ? [] : ['orderNo'];
    case 'complaint':
      return intent.entities.reason ? [] : ['reason'];
    default:
      return [];
  }
}
```

模型返回的 `missingFields` 可以用于对比和评测，但执行前以代码复算结果为准。

### 当前问题 4：`normalizedQuery` 仍然不可信

它可以用于：

- 搜索关键词。
- 记录脱敏后的语义请求。
- RAG 查询改写。

不能用于：

- 决定 userId。
- 决定权限。
- 证明订单归属。
- 直接执行 SQL。

---

## B9、`findCategoryId()`：字符串 includes 不是稳定实体解析

当前做法：

```ts
const categories = await categoryService.findAll();

name === normalizedName ||
name.includes(normalizedName) ||
normalizedName.includes(name)
```

### 它为什么在 Demo 中能工作

- 分类数量少。
- 名称简单。
- 每次加载全部分类成本低。

### 生产风险

假设存在：

```text
手机
手机配件
数码手机
```

用户说“手机”时，`find()` 只返回第一个命中，结果受数据库排序影响。

### 新概念：Entity Resolution

意图模型提取的是自然语言实体：

```text
categoryName = “手机相关”
```

业务系统需要解析成稳定 ID：

```text
categoryId = 12
```

推荐分层：

```text
精确规范化名称命中
→ 别名表命中
→ 多候选时让用户选择
→ 没有候选时明确未找到
```

可以给 CategoryService 增加：

```ts
findCandidatesByName(name: string): Promise<CategoryCandidate[]>
```

而不是 AgentService 每次加载全部分类自行匹配。

为什么放 CategoryService：分类规范化和别名属于分类领域规则，不属于 Agent 编排。

---

## B10、`handleProductIntent()`：正在承担太多职责

当前方法同时负责：

```text
读取实体
检查缺失字段
解析分类 ID
查询 ProductService
区分空结果
按 intent 格式化自然语言
```

随着加入预算、数量、品牌、分页和比较，它会越来越长。

### 新概念：Application Service / Use Case Service

建议提取：

```text
ProductCustomerService
```

职责：

```ts
searchProducts(intent)
queryInventory(intent)
queryPrice(intent)
browseCatalog(intent)
```

AgentService 只负责编排：

```ts
const handler = this.intentRouter.resolve(analysis.intent);
return handler.execute(analysis, context);
```

### 为什么不是“为了文件少而全部放一起”

拆分不是按代码行数，而是按变化原因：

```text
模型配置变化
→ ModelFactory

商品业务变化
→ ProductCustomerService

意图策略变化
→ IntentPolicy

HTTP 变化
→ Controller / DTO
```

一个类最好只有一类主要变化原因。

---

## B11、格式化商品回答：先建立安全快照

当前有三组匿名类型：

```ts
Array<{ name: string; stock: number }>
Array<{ name: string; price: number; originalPrice?: number }>
Array<{ name: string; price: number; stock: number }>
```

推荐统一：

```ts
type PublicProductSnapshot = {
  id: number;
  name: string;
  price: number;
  originalPrice: number | null;
  stock: number;
  sales: number;
  image: string | null;
};
```

先从 Entity 映射到安全快照，再交给模板或 Tool。

为什么：

- 明确哪些字段允许进入模型和响应。
- 避免 ORM Entity 新增内部字段后意外泄露。
- 复用格式化和测试类型。
- 前端以后能渲染商品卡片。

### 一个细节 Bug

当前：

```ts
const originalPrice = product.originalPrice
  ? `，原价 ¥${product.originalPrice}`
  : '';
```

更准确：

```ts
const originalPrice = product.originalPrice != null
  ? `，原价 ¥${product.originalPrice}`
  : '';
```

因为 `0` 是合法数字但在 JavaScript 中是假值。虽然商品原价通常不会是 0，理解 nullish 与 truthy 的区别仍然重要。

---

## B12、`agent.tools.ts`：当前 Tool 逐个对照

### calculatorTool

做对了：

- operation 使用 enum。
- 除零有业务反馈。
- 检查有限数字。
- 返回紧凑字符串。

应该补充：

- 每种 operation 的单元测试。
- 极大数字和 `Infinity` 测试。
- 明确是否允许小数。

### transformTextTool

做对了：

- 字符串长度有限制。
- 中文反转使用 `Array.from()`，比普通 `split('')` 更好地处理 Unicode code point。

应该修改：

- 删除 `console.log`。
- 从生产客服 Tool 集移出。
- 如果学习保留，放入 `agent.learning-tools.ts`。

### currentTimeTool

做对了：

- 接收 IANA 时区。
- 捕获非法时区。

应该理解：

- 返回字符串是 Tool Result，不代表模型一定原样回答。
- 时间敏感测试要固定系统时间或 Mock Date。

### searchProductDemoTool

当前没有加入 `createAgentTools()`，属于死代码，但仍：

```text
导入 demoProducts
编译
占据维护空间
与真实 ProductService 形成第二事实源
```

它的 description 还包含多余的引号字符：

```ts
description: `...,
"商品信息必须...
"商品工具没有...`
```

推荐移动到第 2 课专用示例或测试 fixture，不留在生产 Tool 文件。

### createSearchProductTool

当前描述：

```text
用户询问商品名称、价格、销量或库存时使用
```

当前返回：

```ts
{
  inStock: product.stock > 0,
  // 没有 stock
}
```

如果用户问“还有多少件”，模型只能知道有货或缺货，不能知道数量。

P0 修改：

```ts
stock: product.stock,
inStock: product.stock > 0,
```

如果库存数量不允许公开，那么 Tool description 就不能承诺返回库存数量，应明确只回答是否有货。

这叫“Tool Contract Consistency”：

```text
Tool description
Schema
实现
返回值
测试
必须表达同一项能力
```

### createListCatalogTool

当前：

```ts
await Promise.all(
  selectedCategories.map(category => productService.findAll(...)),
)
```

假设有 100 个分类，会同时发起 100 个数据库查询。

### 新概念：Bounded Fan-out

任何“对列表中的每一项并发调用”的代码都要回答：

```text
列表最大多长？
并发最大多少？
返回最大多少 Token？
部分失败怎么办？
```

推荐 API 不叫“所有商品”，而是：

```text
分页查看分类
指定一个分类查看商品
每页有硬上限
```

或者由 ProductService 提供批量查询，避免 N+1。

### `categoryId ?` 的语义细节

当前：

```ts
const selectedCategories = categoryId
  ? ...
  : categories;
```

更准确：

```ts
categoryId !== undefined
```

Schema 已限制 positive，所以当前通常不会出现 0；但使用“是否存在”时应表达真实意图，而不是依赖 truthy。

---

## B13、Tool 返回对象时，模型如何知道它是什么

模型先通过 Tool 的 description 和 Schema 决定是否调用；Tool 执行后，返回对象会序列化为 Tool Result，模型根据字段名和内容理解。

因此返回字段也要语义清晰：

```ts
{
  totalMatched: result.total,
  returnedCount: result.list.length,
  products: [...],
  truncated: result.total > result.list.length,
}
```

为什么区分 `totalMatched` 和 `returnedCount`：

```text
数据库一共有 56 条匹配
本次只返回前 5 条
```

当前 Tool 用：

```ts
total: result.total,
products: result.list,
```

模型可能错误理解 `total` 是当前数组长度。

### 新概念：Machine-readable Tool Contract

Tool Result 不是只给用户看的文案，而是 Agent 下一轮模型调用的数据协议。

建议包含：

- 明确字段名。
- 是否截断。
- 稳定 ID。
- 必要事实。
- 安全的错误 code。

不要包含：

- ORM 全字段。
- 内部成本。
- SQL。
- 用户无权数据。
- 巨大日志对象。

---

## B14、ProductService 搜索边界解释

当前 `ProductService.findAll()`：

```ts
if (keyword) where.name = Like(`%${keyword}%`);
```

它只搜索商品名称，不搜索分类名称。

这解释了为什么：

```text
keyword = “数码”
```

不一定能搜出数码分类商品。

当前 `AgentService` 对 categoryName 的正确做法是先解析 categoryId，再传：

```ts
productService.findAll({ categoryId })
```

但是 `createSearchProductTool` 只有 keyword，没有 categoryId，因此 Agent Tool 无法可靠按分类搜索。

### 两种正确设计

#### 设计 A：Tool 接收 categoryId

适用于代码已经解析出稳定 ID，但 Agent 通常只有自然语言名称，不能凭空知道 ID。

#### 设计 B：Tool 接收 categoryName，内部调用分类解析 Service

```ts
schema: z.object({
  keyword: z.string().optional(),
  categoryName: z.string().optional(),
})
```

Tool 内：

```text
categoryName
→ CategoryResolutionService
→ categoryId
→ ProductService.findAll
```

如果采用确定性商品路由所有权，Agent Tool 可以直接删除这项重复能力，避免两套解析。

### 不推荐修改 ProductService 为字符串拼接所有字段

不要简单把：

```text
product.name + product.category
```

塞进内存过滤。

因为真实分类在独立表中，而且数据库才应该负责分页、过滤和索引。应该使用 categoryId、Join 查询或专门搜索索引。

---

## B15、日志：从 `console.log` 进入结构化可观测性

当前存在：

```ts
console.log('chat analyze', analysis);
console.log('categories', categories.map(...));
console.log('handleProductIntent', result.list);
console.log('transformTextTool called with:', ...);
```

问题：

- 没有 requestId。
- 没有统一 level。
- 可能打印完整商品或以后打印用户隐私。
- 测试输出嘈杂。
- 线上难以检索一次请求的完整链路。

推荐日志只记录：

```ts
this.logger.debug(
  `intent_routed requestId=${requestId} intent=${intent} durationMs=${duration}`,
);
```

生产更进一步使用结构化 logger：

```json
{
  "event": "agent_intent_routed",
  "requestId": "req_123",
  "intent": "inventory_query",
  "confidence": 0.82,
  "durationMs": 431
}
```

默认不要记录完整 message、orderNo、地址和 Tool Result。

---

## B16、测试为什么已经跟不上代码

### `agent.service.spec.ts`

当前：

```ts
const service = new AgentService(configService);
```

真实构造函数需要：

```text
ConfigService
ProductService
CategoryService
AgentIntentService
```

这说明测试仍对应旧版 Service。

### 不能只随便传 `{}`

测试“没有 API Key”时，`chat()` 会先执行：

```ts
agentIntentService.analyze(message)
```

所以测试必须明确控制路由：

```ts
const intentService = {
  analyze: jest.fn().mockResolvedValue({
    intent: 'general_chat',
    confidence: 1,
    entities: emptyEntities,
    missingFields: [],
    normalizedQuery: '你好',
  }),
} as unknown as AgentIntentService;
```

然后再验证 `getAgent()` 因 Key 缺失抛出 ServiceUnavailable。

### `agent.intent.spec.ts`

项目已经配置 Jest globals 和 `@types/jest`，可以直接使用：

```ts
describe(...)
it(...)
expect(...)
```

如果坚持：

```ts
import { describe, it, expect } from '@jest/globals';
```

则应把 `@jest/globals` 声明为直接 devDependency，不能依赖 pnpm 偶然提升的传递依赖。

### 新概念：Test at the Correct Seam

正确测试边界：

```text
Schema Test
→ 只测 Zod

Intent Model Eval
→ 测真实模型分类质量

Router Unit Test
→ Mock AgentIntentService，验证走哪个 handler

Tool Unit Test
→ Mock ProductService，验证参数与安全返回

Agent Trajectory Eval
→ 验证 Tool 名、次数和参数

HTTP E2E
→ 验证 DTO、状态码和认证
```

不要用一个真实模型 + 真实数据库 + HTTP 的大测试覆盖所有层。

---

## B17、`agent.module.ts`：Module 也应该只暴露必要能力

当前：

```ts
@Module({
  imports: [ProductModule, CategoryModule],
  controllers: [AgentController],
  providers: [AgentService, AgentIntentService],
  exports: [AgentService, AgentIntentService],
})
export class AgentModule {}
```

### `imports` 为什么正确

AgentService 和 Tool Factory 需要 ProductService、CategoryService，因此导入对应 Module 是 NestJS 正常依赖注入边界。

前提是 ProductModule 和 CategoryModule 已导出各自 Service。

### `exports` 是否都需要

Controller 使用同一个 Module 内的 Provider，不要求 export。

只有其他 Module 要注入 AgentService 时才需要：

```ts
exports: [AgentService]
```

如果没有外部 Module 直接调用 AgentIntentService，不建议把它暴露出去。

### 新概念：Minimal Module API

NestJS Module 的 exports 是模块公共 API。

```text
导出越多
→ 外部耦合越多
→ 以后越难重构内部结构
```

推荐只导出外部真正需要的编排入口，内部的意图分析、Mapper 和 Tool Factory 留在 AgentModule 内部。

---

## B18、`agent.conversation.ts`：定义了类型不等于已经有会话状态

当前文件定义：

```ts
export interface AgentConversationState {
  conversationId: string;
  status: ConversationStatus;
  pendingIntent: CustomerIntentName | null;
  entities: CustomerEntities;
  missingFields: MissingField[];
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}
```

这个设计表达了第五章需要的状态，但当前没有任何代码：

- 创建它。
- 保存它。
- 根据 conversationId 读取它。
- 检查 expiresAt。
- 合并上一轮 entities。
- 把它传给 Agent。

因此当前 Agent 仍然是无状态的。

### 新概念：Declared State vs Managed State

```text
TypeScript interface
→ 只描述对象长什么样

State Manager / Checkpointer / Redis
→ 才真正管理生命周期和并发
```

`expiresAt` 字段本身不会自动过期；必须由 Redis TTL、定时清理或读取逻辑执行。

### 当前阶段建议

第一至四章只保留它作为下一阶段设计草图，不要在当前 `chat(message)` 中假装已经具备多轮记忆。

第五、六章再决定：

```text
业务补参状态 → Redis / MySQL
Agent messages state → Checkpointer
长期产品记录 → MySQL
```

---

## B19、`extractText()`：最终输出需要一个 Adapter

当前：

```ts
const lastMessage = result.messages.at(-1);
return this.extractText(lastMessage?.content);
```

`extractText()` 能处理：

- 字符串 content。
- 数组中的字符串。
- 数组中带 `text` 字段的对象。

这是一个不错的兼容防线，但仍有三个问题。

### 问题 1：最后一条消息不一定是可展示回答

异常 Agent 运行可能以 ToolMessage、空 AIMessage 或结构化输出结束。

### 问题 2：没有文本时返回“已完成”可能掩盖错误

当前 fallback：

```text
Agent 已完成处理，但没有返回可显示的文本。
```

这让上层误以为执行成功。

生产环境更适合：

```text
检测最终消息类型
→ 有用户可见文本则返回
→ 有 structuredResponse 则走结构化 Mapper
→ 只有 Tool Call / 空内容则记录异常并返回稳定错误
```

### 问题 3：响应解析散落会影响 Streaming

第 7 章开始后，会同时处理 delta、final、Tool event。建议建立：

```text
AgentResultAdapter
```

它负责把 LangChain 内部消息转换为你的稳定业务响应，而不是让 Controller 或前端理解 LangChain message 类型。

### 新概念：Anti-corruption Layer

这是领域设计中的“防腐层”：

```text
LangChain 类型
→ AgentResultAdapter
→ 你的 CustomerServiceResponse
```

以后 LangChain 消息结构或模型供应商变化，只改 Adapter。

---

## B20、`ProductService.findAll()`：能用，但不是完整搜索引擎

当前：

```ts
if (keyword) where.name = Like(`%${keyword}%`);
```

优点：

- TypeORM 参数化处理，避免直接拼 SQL。
- 自动只查 `status: 1`。
- 分页有硬上限。

边界：

- 只搜索 name。
- 前置 `%` 通常难以有效使用普通索引。
- `%` 和 `_` 在 LIKE 中有通配语义。
- 不支持拼音、同义词、错别字和相关性排序。
- 不支持 categoryName，分类必须转 categoryId。

### 现在应该怎么做

小规模商城：继续使用它，先把业务正确性做好。

数据量和搜索需求扩大后：

```text
MySQL 确定性过滤
+
专门搜索能力（全文索引 / Elasticsearch / OpenSearch 等）
```

不要为了修复一个分类查询问题，就立刻引入复杂搜索集群。

第 8 章的向量知识库主要解决政策和非结构化知识，也不应该替代实时 ProductService。

---

# 第零部分之二：推荐的目标结构

## C1、第一至四章完成后的目标目录

```text
server/src/agent/
├── agent.module.ts
├── agent.controller.ts
├── agent.dto.ts
│
├── agent.service.ts
├── agent-model.factory.ts
├── agent-runtime-context.ts
├── agent-errors.ts
│
├── intent/
│   ├── customer-intent.schema.ts
│   ├── customer-intent.service.ts
│   ├── customer-intent.policy.ts
│   └── customer-intent.spec.ts
│
├── product-customer/
│   ├── product-customer.service.ts
│   ├── product-response.mapper.ts
│   └── product-customer.spec.ts
│
├── tools/
│   ├── calculator.tool.ts
│   ├── current-time.tool.ts
│   ├── product-search.tool.ts       # 只有确定采用 Agent 商品通道才保留
│   ├── catalog.tool.ts              # 只有确定采用 Agent 商品通道才保留
│   └── agent-tools.factory.ts
│
└── testing/
    ├── agent.fixtures.ts
    ├── fake-model.ts
    └── fake-tools.ts
```

初学阶段不必一次创建所有文件。这里是在展示职责最终应该去哪里。

---

## C2、推荐的目标调用链

```text
AgentController
→ 创建可信 RequestContext
→ AgentService.chat(command)
→ CustomerIntentService.analyze()
→ CustomerIntentPolicy.normalizeAndValidate()
→ IntentRouter
```

然后：

```text
商品确定性意图
→ ProductCustomerService
→ ProductService / CategoryService
→ PublicProductSnapshot
→ 稳定响应
```

或者：

```text
普通低风险咨询
→ createAgent.invoke(
     messages,
     { context: trustedRuntimeContext }
   )
→ 受限 Tool 集
→ 最终响应
```

核心原则：

```text
模型提议
代码裁决
Service 查事实
上下文传身份
```

---

## C3、推荐的路由策略代码形态

不要让 `chat()` 持续增长成几十个 if：

```ts
type IntentRoute =
  | 'product_customer_service'
  | 'agent'
  | 'clarify'
  | 'human_handoff'
  | 'not_supported';

const INTENT_ROUTES = {
  product_search: 'product_customer_service',
  inventory_query: 'product_customer_service',
  price_query: 'product_customer_service',
  catalog_browse: 'product_customer_service',
  order_status: 'not_supported',
  refund_request: 'human_handoff',
  complaint: 'human_handoff',
  human_handoff: 'human_handoff',
  general_chat: 'agent',
  unknown: 'clarify',
} as const satisfies Record<CustomerIntentName, IntentRoute>;
```

优势：

- 全部 intent 一眼可见。
- 新增 intent 时编译器提醒。
- 可以对路由表写参数化测试。
- 未实现能力不会意外落进 Agent。

---

## C4、推荐的 `chat()` 伪代码

```ts
async chat(command: AgentChatCommand): Promise<AgentChatResponseDto> {
  const analysis = await this.intentService.analyze(command.message);
  const normalized = this.intentPolicy.normalize(analysis);
  const route = INTENT_ROUTES[normalized.intent];

  switch (route) {
    case 'product_customer_service':
      return this.productCustomerService.handle(normalized, command);

    case 'agent':
      return this.invokeAgent(normalized, command);

    case 'clarify':
      return createClarificationResponse(normalized);

    case 'human_handoff':
      return createHandoffResponse(normalized);

    case 'not_supported':
      return createNotSupportedResponse(normalized);
  }
}
```

为什么 switch 比 default 落入 Agent 更好：

```text
unknown 不等于 general_chat
refund_request 不等于普通聊天
未实现不等于让模型自由处理
```

---

## C5、新概念总表：什么时候引入，解决什么

| 新概念 | 白话解释 | 当前对应问题 | 引入时机 |
| --- | --- | --- | --- |
| Model Factory | 统一造模型的地方 | 两个 Service 重复配置 | P1 |
| Router Tax | 每次分类都要付出的调用成本 | 普通问候也调用两次模型 | 现在理解，评估后优化 |
| Routing Ownership | 一项能力只能有明确主入口 | 商品路由和商品 Tool 重叠 | P0/P1 |
| Discriminated Union | 用 source 决定响应结构 | 可选字段组合含糊 | P0 |
| Capability Matrix | 实测网关支持什么 | 兼容接口不一定支持 Tool/Schema | P0 部署测试 |
| Confidence Calibration | 检查 0.9 是否真有高正确率 | 模型自报 confidence | P1 评测 |
| Cross-field Invariant | 字段组合必须满足业务规则 | missingFields 可与 entities 矛盾 | P0 |
| Entity Resolution | 名称解析成稳定业务 ID | 分类 includes 模糊命中 | P1 |
| Public Snapshot | 只暴露允许字段的安全快照 | Entity 直接映射分散 | P1 |
| Tool Contract | 描述、输入、返回与实现一致 | 声称查库存却不返回数量 | P0 |
| Bounded Fan-out | 限制并发分支数量 | list_catalog N+1 | P0 |
| Error Taxonomy | 给错误分稳定类别 | 所有异常都变 502 | P1 |
| Runtime Context | 每次运行的可信静态信息 | 未来订单 userId 来源 | 做订单前 |
| Middleware | Agent 循环统一拦截器 | 重试、限次、日志散落 | P1 |
| Trajectory Eval | 检查 Agent 走了哪条路径 | 只看最终文案 | P1 |
| Checkpointer | 保存 Agent 短期状态 | 当前每次独立 | 第 5～6 章 |
| Streaming Protocol | 稳定传输进度和结果 | 当前等待完整 JSON | 第 7 章 |
| RAG Evaluation | 检索与回答分别评测 | 企业知识不可验证 | 第 8 章 |

---

# 第零部分之三：按步骤修改，而不是一次重写

## D1、第一批修改：只修正确性，不改变架构

建议完成：

1. Agent 响应补 `source: 'agent'`。
2. `search_product` 返回 `stock` 或修改其能力描述。
3. 删除生产文件中的 Demo 商品 Tool 和 console.log。
4. 删除 AgentIntentService 未使用依赖。
5. 代码复算 missingFields。
6. 对所有 intent 建立明确 route。
7. 修复两个失败测试。
8. 为 Tool 增加最小单元测试。

验收：

```text
pnpm run build
pnpm test -- agent.intent.spec.ts agent.service.spec.ts --runInBand
```

业务验收：

```text
“耳机库存有多少”
→ 回答数量来自 ProductService

“有哪些分类”
→ 不再错误追问具体商品

“我要退款”
→ 不会落入普通 Agent 假装执行

“转人工”
→ 有明确结果
```

---

## D2、第二批修改：明确双通道所有权

做一个明确选择：

### 推荐学习方案

```text
确定性通道拥有商品搜索、库存、价格、分类浏览
Agent 只保留 calculator、time 和后续 knowledge search
```

优点：

- 商品结果更稳定。
- 不会重复调用模型。
- 更容易测试。
- 分类、预算和分页由代码控制。

缺点：

- 开放式比较需要额外编排。

等建立 Agent trajectory eval 后，可以把“比较多个商品”作为低风险 Agent Tool 场景重新开放。

---

## D3、第三批修改：Model Factory 与错误分类

完成：

```text
AgentModelFactory
配置启动校验
Intent/Agent 分用途模型
模型超时
有限重试
公开错误码
requestId 日志
```

验收：

- 缺 Key 时应用启动或首次调用明确失败。
- Structured Output 不支持与网络超时能区分日志。
- 429 不会无限重试。
- 数据库错误不会伪装成“模型名错误”。

---

## D4、第四批修改：Runtime Context 与 Middleware

只有接入真实用户和受保护 Tool 时实施：

```ts
const AgentRuntimeContextSchema = z.object({
  userId: z.number().int().positive(),
  role: z.enum(['customer', 'staff', 'admin']),
  conversationId: z.string().uuid(),
  requestId: z.string().min(1),
});
```

加入最少 Middleware：

```text
modelCallLimitMiddleware
toolCallLimitMiddleware
有条件的 modelRetryMiddleware
自定义安全日志 Middleware
```

不要一开始加入全部内置 Middleware。每加一个，都要有对应失败场景和测试。

---

## D5、第五批修改：评测而不是继续凭感觉调 Prompt

建立三套数据：

```text
intent-cases.json
tool-selection-cases.json
orchestration-cases.json
```

至少覆盖：

- 正常商品名。
- 分类名。
- 价格和库存混合问题。
- 缺少商品名。
- “所有分类”。
- 退款、订单和人工。
- 模糊表达。
- Prompt Injection 尝试。
- 空数据库结果。
- 模型或 Tool 超时。

每次修改 Schema、Prompt、Tool description 或模型版本，都跑同一评测集。

---

# 第一部分：现代模型调用

## 三、`ChatOpenAI` 现在仍然重要吗

重要。`ChatOpenAI` 是 OpenAI 及兼容接口的具体模型类。你当前项目需要自定义 `OPENAI_BASE_URL`，继续使用它很合适：

```ts
const model = new ChatOpenAI({
  apiKey,
  model: modelName,
  temperature: 0,
  configuration: {
    baseURL,
  },
});
```

它解决：

- 使用什么模型；
- API Key；
- Base URL；
- temperature；
- 超时、重试及供应商配置；
- 把统一 LangChain 消息转换成供应商请求。

### `initChatModel` 是什么

LangChain v1 还提供统一初始化函数：

```ts
import { initChatModel } from 'langchain';

const model = await initChatModel('openai:gpt-4.1-mini');
```

它适合：

- 希望通过统一字符串切换模型供应商；
- 使用动态模型选择 Middleware；
- 不需要复杂的供应商专属配置。

你的项目当前需要兼容 Base URL，因此第一阶段继续使用 `ChatOpenAI` 更直观。不要为了“新”而强行换成 `initChatModel`。

### 选择原则

```text
需要明确的 OpenAI/兼容接口配置
→ ChatOpenAI

需要多供应商统一初始化
→ initChatModel
```

---

## 四、`model.invoke()` 是最小模型调用单元

```ts
const response = await model.invoke([
  {
    role: 'system',
    content: '你是商城客服。',
  },
  {
    role: 'user',
    content: '无线蓝牙耳机多少钱？',
  },
]);
```

它只完成一次模型调用：

```text
消息输入
→ 模型
→ 一条 AIMessage
```

它不会自动循环调用多个 Tool，也不会自动执行完整 Agent 工作流。

### 为什么必须学 invoke

后面遇到问题时，你需要判断错误在哪一层：

```text
model.invoke() 都失败
→ 模型配置、网络或供应商问题

model.invoke() 成功，Agent 失败
→ Tool、Agent 循环或 Middleware 问题
```

### 最小调试接口

学习时可以保留一个只在开发环境开放的模型测试方法：

```ts
async testModel(message: string): Promise<string> {
  const response = await this.getModel().invoke([
    { role: 'user', content: message },
  ]);

  return response.text;
}
```

注意：你本地的消息对象仍可能需要兼容 `content` 数组，所以现有 `extractText()` 暂时不应该删除。

---

## 五、现代消息不只有字符串 content

早期最常见的理解是：

```ts
message.content === '一段文本';
```

现代模型消息可能包含标准内容块：

- 文本；
- 图片；
- 音频；
- Tool Call；
- Tool Result；
- 文件；
- 推理相关块；
- 供应商特定数据。

LangChain v1 使用标准 `contentBlocks` 尽量统一不同模型供应商的消息内容。

### 当前客服第一版怎么做

第一版只渲染文本即可，但需要知道：

```text
没有文本
≠
模型什么都没返回
```

它可能返回了 Tool Call。

### Agent 中不要只看固定数组位置

现有代码：

```ts
const lastMessage = result.messages.at(-1);
```

学习版可以这样提取最终回答，但调试 Agent 时应检查：

```ts
for (const message of result.messages) {
  console.log({
    type: message.getType?.(),
    content: message.content,
    toolCalls: 'tool_calls' in message ? message.tool_calls : undefined,
  });
}
```

生产日志不能直接打印完整用户隐私和 Tool 返回值。

---

## 六、模型配置的现代原则

### temperature

客服意图识别和结构化提取通常使用：

```ts
temperature: 0
```

它不能保证 100% 相同，但可以减少不必要随机性。

### timeout

线上不能无限等待模型。应设置：

- SDK 请求超时；
- NestJS 请求超时；
- Nginx/网关超时；
- 前端 AbortController。

最内层超时应该最先结束。不能只把 Nginx 超时改成 900 秒。

### retry

区分：

| 错误 | 是否重试 |
| --- | --- |
| 401 API Key 错误 | 否 |
| 404 模型名错误 | 否 |
| DTO 校验错误 | 否 |
| 429 限流 | 可按退避策略重试 |
| 网络瞬断 | 可重试 |
| 供应商 5xx | 可有限重试 |
| 商品不存在 | 否，这不是系统异常 |

后面 Agent 层会使用 `modelRetryMiddleware` 或 `modelFallbackMiddleware`，但底层 SDK 仍需要合理配置。

### 模型名称不能写死在前端

模型名、Key 和 Base URL都属于后端配置：

```dotenv
OPENAI_API_KEY=...
OPENAI_MODEL=...
OPENAI_BASE_URL=...
```

前端不应该决定线上调用哪个高权限模型。

---

## 七、第一部分练习

- [ ] 能用 `model.invoke()` 完成一次无 Tool 调用。
- [ ] 能解释 `ChatOpenAI` 与 `createAgent` 的区别。
- [ ] 能解释 `content` 与 `contentBlocks`。
- [ ] 能区分模型配置错误与 Agent Tool 错误。
- [ ] 能让模型超时后结束，而不是一直 pending。
- [ ] 不在日志打印 API Key。

---

# 第二部分：现代 Tool Calling

## 八、当前 Tool 标准写法

LangChain v1 可以从 `langchain` 直接导入 `tool`：

```ts
import { tool } from 'langchain';
import { z } from 'zod';
```

从 `@langchain/core/tools` 导入也仍然可以：

```ts
import { tool } from '@langchain/core/tools';
```

新课程为了统一 v1 Agent API，示例优先使用：

```ts
import { createAgent, tool } from 'langchain';
```

### 一个 Tool 的四部分

```ts
const searchProductTool = tool(
  async ({ keyword, limit }) => {
    return {
      items: [],
      total: 0,
    };
  },
  {
    name: 'search_product',
    description: '按照商品名称关键词搜索当前上架商品',
    schema: z.object({
      keyword: z.string().trim().min(1).max(100),
      limit: z.number().int().min(1).max(10).default(5),
    }),
  },
);
```

四部分分别是：

1. `name`：模型调用的稳定标识。
2. `description`：告诉模型什么时候应该使用。
3. `schema`：约束模型能传什么参数。
4. 执行函数：真正调用代码或数据库。

---

## 九、Tool 字段“模型怎么知道是什么意思”

模型主要通过三类信息理解：

```text
Tool description
+
Schema 字段名称
+
Zod describe
```

例如：

```ts
schema: z.object({
  keyword: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .describe('用户明确提到的商品名称关键词'),

  categoryId: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe('已由系统确认的分类 ID；未知时为 null'),
})
```

字段名不要使用：

```ts
a
b
data
value
```

应使用业务含义明确的名字：

```ts
productName
categoryId
orderNo
budgetMax
```

### Schema 是边界，不是说明文档而已

```ts
z.number().int().min(1).max(10)
```

不仅告诉模型范围，还会在运行时阻止非法值进入 Tool。

---

## 十、Tool 的返回值应该是什么

Tool 不应该只返回一段给人看的长文本：

```ts
return `找到了商品，库存是 35，价格是……`;
```

更推荐返回紧凑、稳定的结构化对象：

```ts
return {
  items: result.list.map((product) => ({
    id: product.id,
    name: product.name,
    price: product.price,
    stock: product.stock,
  })),
  total: result.total,
};
```

好处：

- 模型更容易读取字段；
- 测试可以断言具体属性；
- 不需要从自然语言再解析一次；
- 以后可以把结果渲染成商品卡片。

### 返回越多越好吗

不是。Tool 返回内容会进入模型上下文，字段越多 Token 越多，也越容易泄露无关数据。

只返回回答当前问题需要的字段。

不要返回：

- 内部采购价；
- 数据库敏感字段；
- 未公开商品；
- 完整用户隐私；
- ORM Entity 的所有关联对象。

---

## 十一、Tool 与 ProductService 的职责

推荐关系：

```text
search_product Tool
→ 参数校验和 Agent 适配
→ ProductService.findAll()
→ 数据最小化
→ 返回 Tool 结果
```

Tool 不应该重新复制 ProductService 的数据库查询。

### 为什么

如果 Controller、Tool、定时任务各写一份查询逻辑，后面“只搜索上架商品”的规则修改时容易漏掉某一份。

正确做法：

```ts
export function createSearchProductTool(
  productService: ProductService,
) {
  return tool(
    async ({ keyword, limit }) => {
      const result = await productService.findAll({
        keyword,
        page: 1,
        pageSize: limit,
      });

      return {
        items: result.list.map(toSafeProductResult),
        total: result.total,
      };
    },
    {
      name: 'search_product',
      description: '搜索当前已上架商品及其公开价格和库存',
      schema: SearchProductInputSchema,
    },
  );
}
```

---

## 十二、现代安全重点：用户身份不能成为模型参数

危险 Tool：

```ts
schema: z.object({
  userId: z.number(),
  orderNo: z.string(),
})
```

模型可能生成别人的 `userId`。

正确思路：

```text
JWT Guard 验证用户
→ Controller 得到可信 userId
→ 作为 Runtime Context 传给 Agent
→ Tool 从 Runtime Context 读取 userId
→ OrderService 再校验订单归属
```

### contextSchema

```ts
import { createAgent } from 'langchain';
import { z } from 'zod';

const AgentRuntimeContextSchema = z.object({
  userId: z.number().int().positive(),
  role: z.enum(['customer', 'staff', 'admin']),
  conversationId: z.string().uuid(),
});

const agent = createAgent({
  model,
  tools,
  contextSchema: AgentRuntimeContextSchema,
});
```

调用：

```ts
await agent.invoke(
  {
    messages: [{ role: 'user', content: message }],
  },
  {
    context: {
      userId: authenticatedUser.id,
      role: authenticatedUser.role,
      conversationId,
    },
  },
);
```

Runtime Context 是本次运行的可信静态数据，不是模型需要填的 Tool 参数。

### 当前阶段怎么办

商品公开搜索不需要用户身份，可以暂时不加入 contextSchema。

当你开始做订单查询、优惠券和售后时，必须先加入 Runtime Context，再开放 Tool。

---

## 十三、Tool 错误的现代处理方式

不要在每个 Tool 中无限重复：

```ts
try {
  // ...
} catch {
  return '发生错误';
}
```

Tool 自己应该处理业务错误：

```text
商品不存在
参数不符合业务规则
订单不属于当前用户
```

横切错误可以交给 Middleware：

```ts
import {
  createAgent,
  toolRetryMiddleware,
} from 'langchain';

const agent = createAgent({
  model,
  tools,
  middleware: [
    toolRetryMiddleware({
      tools: ['search_product'],
      maxRetries: 2,
      onFailure: 'error',
    }),
  ],
});
```

### 什么错误可以重试

- 数据库连接瞬断；
- 外部接口临时 5xx；
- 网络超时。

### 什么错误不能重试

- 商品不存在；
- 用户没有权限；
- 参数非法；
- API Key 错误；
- 余额不足；
- 用户明确取消。

重试写操作还会有重复执行风险，必须加入幂等键。

---

## 十四、不要给 Agent 太多 Tool

Tool 越多不一定越智能：

- 模型选择难度增加；
- Tool 描述占用更多 Token；
- 相似 Tool 容易混淆；
- 权限边界更复杂；
- 测试组合爆炸。

第一版必须先确定商品能力的路由所有权：

```text
如果商品由确定性路由负责
→ Agent 只保留 calculator、get_current_time 和后续知识检索 Tool

如果商品由 Agent 负责
→ Agent 再注册 search_product、list_catalog
```

不要在没有明确策略和轨迹测试时，让确定性路由与 Agent 同时拥有完整商品查询能力。

后面 Tool 数量很多时再学习 `llmToolSelectorMiddleware` 或按业务路由提供动态 Tool。

---

## 十五、第二部分练习

- [ ] 能解释 Tool 四部分。
- [ ] 每个 Zod 字段有明确名称和描述。
- [ ] Tool 复用 ProductService，不复制查询。
- [ ] Tool 只返回必要的安全字段。
- [ ] 商品不存在和系统异常有不同结果。
- [ ] 不把可信用户身份交给模型生成。
- [ ] 能解释 Runtime Context 的作用。
- [ ] 知道 Tool Retry 不能用于所有错误。

---

# 第三部分：现代 Structured Output

## 十六、Structured Output 解决什么

用户说：

```text
帮我看看无线蓝牙耳机还有没有货
```

代码希望得到：

```ts
{
  intent: 'inventory_query',
  entities: {
    productName: '无线蓝牙耳机',
  },
}
```

Structured Output 的价值不是“JSON 更漂亮”，而是让下一步代码获得经过 Schema 检查的对象。

### 不推荐只用 Prompt 要 JSON

```text
请只返回 JSON，不要返回其他内容
```

可能出现：

- Markdown 代码块；
- 少字段；
- 多余解释；
- 类型错误；
- JSON 无法解析。

当前主流做法是使用模型或 Agent 的结构化输出能力。

---

## 十七、两种 Structured Output 用法

### 用法 A：模型级 `withStructuredOutput`

适合单次提取：

```ts
const structuredModel = model.withStructuredOutput(
  CustomerIntentSchema,
  {
    name: 'customer_intent',
  },
);

const result = await structuredModel.invoke([
  { role: 'system', content: INTENT_SYSTEM_PROMPT },
  { role: 'user', content: message },
]);
```

你的 `AgentIntentService` 当前使用这条路线，是合理的。

调用关系：

```text
一句用户消息
→ 一次结构化模型调用
→ CustomerIntent
```

### 用法 B：Agent 级 `responseFormat`

适合 Agent 在调用 Tool 后，最终还必须返回固定结构：

```ts
const CustomerReplySchema = z.object({
  reply: z.string(),
  intent: CustomerIntentNameSchema,
  needsHuman: z.boolean(),
});

const agent = createAgent({
  model,
  tools,
  responseFormat: CustomerReplySchema,
});

const result = await agent.invoke({
  messages: [{ role: 'user', content: message }],
});

console.log(result.structuredResponse);
```

Agent 最终结构化结果在：

```ts
result.structuredResponse
```

不是最后一条文本消息。

---

## 十八、providerStrategy 与 toolStrategy

LangChain v1 支持明确选择策略：

```ts
import {
  providerStrategy,
  toolStrategy,
} from 'langchain';
```

### Provider Strategy

```ts
responseFormat: providerStrategy(CustomerReplySchema)
```

含义：使用模型供应商原生结构化输出。

优点：

- 通常更直接；
- 结构化约束可能更稳定；
- 供应商原生支持时体验较好。

限制：

- 模型或兼容网关必须真正支持；
- 第三方兼容接口可能只实现了普通聊天；
- 工具与结构化输出并用时需要模型支持。

### Tool Strategy

```ts
responseFormat: toolStrategy(CustomerReplySchema)
```

含义：通过 Tool Calling 机制生成结构化结果。

优点：

- 对支持 Tool Calling 的模型兼容范围较广；
- 可配置结构化错误处理。

限制：

- 供应商的 Tool Calling 必须可靠；
- 可能出现多次结构化 Tool 调用等错误。

### 你的兼容 Base URL 应该怎么选

先写最小能力测试：

1. 普通 `model.invoke()`。
2. `withStructuredOutput()`。
3. 单 Tool Calling。
4. Agent Tool + Structured Output。

不要因为接口写着“OpenAI Compatible”就假定全部功能都兼容。

---

## 十九、Schema 设计原则

### 使用有限枚举

```ts
const IntentSchema = z.enum([
  'inventory_query',
  'price_query',
  'product_search',
  'general_chat',
  'unknown',
]);
```

不要：

```ts
intent: z.string()
```

否则模型可能返回几十种拼写。

### 缺失字段统一 null

```ts
productName: z.string().nullable()
```

不要同时允许：

```text
undefined
空字符串
没有这个属性
null
```

统一格式可以减少大量分支判断。

### 数值必须限制范围

```ts
confidence: z.number().min(0).max(1)
quantity: z.number().int().positive().nullable()
budgetMax: z.number().nonnegative().nullable()
```

### describe 要写“数据来源边界”

```ts
orderNo: z
  .string()
  .nullable()
  .describe('用户明确提供的订单号；未提供时必须为 null'),
```

这比只写“订单号”更能阻止模型猜测。

---

## 二十、模型输出通过 Zod，不等于业务可信

假设模型返回：

```ts
{
  intent: 'inventory_query',
  entities: {
    productName: '无线蓝牙耳机',
  },
}
```

Zod 只能证明：

```text
结构正确
类型正确
枚举正确
```

不能证明：

```text
商品一定存在
库存一定是 35
用户一定有订单权限
退款一定可以执行
```

真实事实仍由业务 Service 和权限系统验证。

---

## 二十一、missingFields 必须由代码复算

模型可以返回：

```ts
missingFields: ['productName']
```

但代码仍应维护：

```ts
const REQUIRED_FIELDS = {
  inventory_query: ['productName'],
  price_query: ['productName'],
  order_status: ['orderNo'],
};
```

原因：

```text
模型负责理解用户说了什么
代码负责规定完成业务必须有什么
```

这也是第五章多轮补参的基础。

---

## 二十二、结构化输出的三层测试

### 第一层：Schema 测试

不调用模型：

```ts
expect(CustomerIntentSchema.safeParse(validData).success)
  .toBe(true);
```

验证类型规则。

### 第二层：固定模型样本评测

真实调用模型，准备至少 20～50 条语句：

```text
耳机还有货吗
无线蓝牙耳机多少钱
预算 300 元推荐耳机
订单 A001 到哪了
我要人工客服
```

验证意图和实体正确率。

### 第三层：编排测试

Mock 意图服务，验证：

```text
inventory_query
→ 是否调用 ProductService
→ 参数是否正确
→ 空结果是否拒绝编造
```

不要在一个测试里同时依赖模型、数据库和 HTTP，否则失败时很难定位。

---

## 二十三、第三部分练习

- [ ] 能解释 `withStructuredOutput` 与 `responseFormat`。
- [ ] 能读取 `result.structuredResponse`。
- [ ] 能解释 Provider Strategy 与 Tool Strategy。
- [ ] Schema 使用枚举、范围和 nullable。
- [ ] 知道 Zod 通过不代表业务事实正确。
- [ ] 代码会重新计算 `missingFields`。
- [ ] Schema 测试不调用真实模型。
- [ ] 有固定意图评测样本。

---

# 第四部分：现代 createAgent 与客服架构

## 二十四、createAgent 到底做什么

```ts
const agent = createAgent({
  model,
  tools,
  systemPrompt,
});
```

它创建的不是“只调用一次模型”的函数，而是一个运行在 LangGraph Runtime 上的预构建 Agent。

基本循环：

```text
用户消息
→ 模型判断
   ├── 不需要 Tool → 最终回答
   └── 需要 Tool
       → 执行 Tool
       → Tool Result 回到模型
       → 模型再次判断
       → 最终回答或继续调用 Tool
```

### 为什么你没写 LangGraph 也能用 Agent

因为 `createAgent()` 已经把常用 Agent 循环封装好了。

```text
createAgent
→ 内部使用 LangGraph Runtime
→ 你没有自己定义 StateGraph
```

这时不需要自己画节点和边。

---

## 二十五、systemPrompt 应该写什么

推荐包含：

- Agent 身份和业务范围；
- 事实来源边界；
- 哪类问题调用哪类 Tool；
- 不知道时怎么回答；
- 敏感和高风险操作边界；
- 输出语言和简洁程度。

例如：

```ts
systemPrompt: [
  '你是商城中文客服。',
  '商品价格和库存必须来自工具结果，不得使用模型记忆猜测。',
  '工具没有返回商品时，明确告诉用户未找到。',
  '不得声称已经退款、取消订单或修改用户资料。',
  '涉及写操作时，只能说明下一步，不得虚构执行成功。',
].join('\n')
```

### Prompt 不应该代替什么

不能用 Prompt 代替：

- DTO 校验；
- 权限校验；
- 数据库约束；
- 幂等保护；
- Tool Schema；
- 超时；
- 人工审批。

---

## 二十六、当前最重要的新能力：Middleware

Middleware 是围绕 Agent 循环的可组合拦截层。

可以在这些位置工作：

```text
Agent 开始前
模型调用前后
Tool 调用前后
Agent 完成前后
```

### 为什么比在 chat() 中继续堆 if/try 更好

下面这些需求会作用于多个 Tool 或多个模型调用：

- 日志；
- 重试；
- 限流；
- 动态 Prompt；
- 隐私脱敏；
- Tool 调用次数限制；
- 模型降级；
- 长对话摘要。

如果都写在 `chat()`，方法会越来越难维护。

### 当前版本已有的 Middleware

你本地 `langchain 1.5.5` 已导出：

```ts
modelRetryMiddleware
modelFallbackMiddleware
toolRetryMiddleware
toolErrorMiddleware
toolCallLimitMiddleware
modelCallLimitMiddleware
summarizationMiddleware
dynamicSystemPromptMiddleware
llmToolSelectorMiddleware
piiMiddleware
humanInTheLoopMiddleware
createMiddleware
```

不需要一次全部使用。

---

## 二十七、当前客服应该先加哪几个 Middleware

### 1. Tool 调用次数限制

防止 Agent 因错误判断反复调用 Tool：

```ts
import {
  createAgent,
  toolCallLimitMiddleware,
} from 'langchain';

const agent = createAgent({
  model,
  tools,
  middleware: [
    toolCallLimitMiddleware({
      runLimit: 8,
    }),
  ],
});
```

具体参数要以本地类型定义和当前官方文档为准，不要从旧博客直接复制。

### 2. 有条件的 Tool Retry

只给真正可能瞬时失败的只读 Tool：

```ts
toolRetryMiddleware({
  tools: ['search_product'],
  maxRetries: 2,
  retryOn: (error) => isTransientError(error),
  onFailure: 'error',
})
```

### 3. 模型调用限制

避免一次请求进入过长 Agent 循环。

### 后面再加

- 长会话后：`summarizationMiddleware`。
- 多供应商后：`modelFallbackMiddleware`。
- 订单客服后：`piiMiddleware`。
- 写操作后：`humanInTheLoopMiddleware`。

---

## 二十八、模型降级不是简单换模型名

```ts
modelFallbackMiddleware(
  fallbackModelA,
  fallbackModelB,
)
```

适合供应商临时不可用时尝试备用模型。

需要注意：

- 备用模型必须支持所需 Tool Calling；
- Structured Output 能力可能不同；
- Base URL 和 API Key 可能不同；
- 数据合规区域可能不同；
- 备用模型回答质量必须经过同一评测集。

模型降级不是“只要不报错就算成功”。

---

## 二十九、现代客服推荐“双通道架构”

不是所有用户消息都应该交给自由 Agent 循环。

### 通道 A：确定性业务路由

适合：

- 查价格；
- 查库存；
- 查订单状态；
- 字段补全；
- 权限敏感操作；
- 固定业务流程。

```text
Structured Output
→ 代码判断 intent
→ 检查 required fields
→ 调用 ProductService
→ 模板或受控模型生成回答
```

### 通道 B：Agent + Tool

适合：

- 普通咨询；
- 需要灵活组合多个只读工具；
- 开放式商品比较；
- 时间、计算等通用能力；
- 后续知识库检索。

```text
createAgent
→ 模型决定 Tool
→ Agent 循环
→ 最终回答
```

### 为什么两条通道同时存在

```text
高确定性、高风险业务
→ 代码主导

开放式、低风险理解和组合
→ Agent 主导
```

这比“所有问题都让 Agent 自己决定”更可靠。

---

## 三十、Context Engineering 比无限加 Prompt 更重要

Agent 可靠性经常不是因为 Prompt 少写了一句，而是因为上下文不对。

需要管理四类信息：

### Model Context

模型本次看到：

- systemPrompt；
- 最近消息；
- Tool 描述；
- 检索到的文档；
- 输出 Schema。

### Runtime Context

代码和 Tool 使用，但不应由模型生成：

- userId；
- 用户角色；
- conversationId；
- 权限；
- 数据库依赖；
- 当前租户。

### State

当前会话变化的数据：

- messages；
- pendingIntent；
- entities；
- missingFields；
- Tool 结果。

### Store

跨会话长期保存：

- 用户偏好；
- 长期记忆；
- 已确认的资料；
- 可检索知识。

后续章节会分别实现，不再把所有东西都称为“聊天记录”。

---

## 三十一、什么时候用 Agent，什么时候直接 model.invoke

| 需求 | 推荐 |
| --- | --- |
| 一次意图提取 | `model.withStructuredOutput().invoke()` |
| 一次文本改写 | `model.invoke()` |
| 固定库存查询 | Structured Output + ProductService |
| 模型需要决定是否查商品 | `createAgent` + Tool |
| 多个 Tool 可能反复组合 | `createAgent` |
| 有暂停、恢复、审批和复杂分支 | 自定义 LangGraph |

不要把任何 LLM 调用都叫 Agent。

---

## 三十二、Agent 测试不只看最后回答

一个回答看起来正确，过程可能仍然危险。

Agent 评测至少看：

```text
最终回答是否正确
是否选择正确 Tool
Tool 参数是否正确
是否调用了多余 Tool
是否泄露敏感字段
数据库为空时是否编造
延迟和 Token 是否合理
```

### 单元测试

适合确定性代码：

- DTO；
- Zod；
- 字段合并；
- ProductService 参数；
- 权限；
- 路由分支。

### 离线评测

适合非确定性模型：

- 意图准确率；
- Tool 选择；
- 回答质量；
- RAG 引用；
- 多轮一致性。

后面会加入 LangSmith 或自建评测脚本。

---

## 三十三、第 1～4 章对应到当前项目

| 当前文件 | 当前已经具备 | 优先修改 | 对应精讲 |
| --- | --- | --- | --- |
| `agent.controller.ts` | 薄 HTTP 入口、ValidationPipe | 空白标准化、限制学习接口、后续传可信 Context | B1 |
| `agent.dto.ts` | class-validator 请求校验 | 响应改判别联合，理解编译期与运行时契约 | B2 |
| `agent.service.ts` | 双通道路由、`createAgent` | 路由所有权、source、错误分类、拆商品 Use Case | B3、B4、B10 |
| `agent.tools.ts` | Zod Tool、真实 Service | 库存契约、移除 Demo、限制 catalog fan-out | B12、B13 |
| `agent.intent.ts` | Structured Output Schema | 能力策略、catalog intent、代码复算 missingFields | B8 |
| `agent.intent.service.ts` | 模型级结构化提取 | 删除无用依赖、置信度校准、错误分类 | B7 |
| `agent.module.ts` | NestJS 注入边界 | 只导出必要公共 Service | B17 |
| `agent.conversation.ts` | 会话状态类型草图 | 第 5～6 章加入真正状态管理 | B18 |
| `agent.service.spec.ts` | 缺 Key 场景意图 | 补齐依赖 Mock，控制先发生的意图调用 | B16 |
| `agent.intent.spec.ts` | Schema 正反例 | 修复 Jest import，补交叉业务规则测试 | B16 |
| `ProductService` | 上架过滤、分页、数据库事实 | 明确名称搜索边界，分类走 ID | B14、B20 |

### 当前做对的地方

- 使用 LangChain v1 `createAgent`。
- 使用 Zod Tool Schema。
- 使用 `withStructuredOutput()`。
- 使用 ProductService 查询真实商品。
- Key 和 Base URL 在后端。
- Agent 与意图 Service 分开。

### 当前还缺的现代能力

- 明确的 intent 路由表和能力状态。
- 代码复算的业务必填字段。
- Tool Contract 一致性与 Tool 单元测试。
- 集中的 Model Factory 和 Capability Probe。
- 稳定错误分类与 requestId。
- Checkpointer 和 `thread_id`。
- Runtime Context 中的可信用户身份。
- Middleware。
- Streaming。
- PII 处理。
- Trace 和评测集。
- 生产级会话持久化。

这些会在后续章节逐步加入，不需要一次全部改完。

---

## 三十四、不要提前学习的旧 API

看到旧教程时，如果出现下面内容，先确认发布日期和版本：

```text
createReactAgent
AgentExecutor
initializeAgentExecutorWithOptions
ConversationChain
LLMChain
BufferMemory
@langchain/langgraph/prebuilt
prompt 参数代替 systemPrompt
```

并不是所有旧 API 都完全不能运行，但它们不再是本课程新代码的默认选择。

判断方法：

1. 先看项目 `package.json`。
2. 看当前官方 JavaScript 文档，不混用 Python 示例。
3. 搜索本地 `.d.ts`，确认 API 确实存在。
4. 写最小 TypeScript 示例并构建。
5. 再接入 NestJS。

---

## 三十五、六天代码对照复习计划

每天只解决一组问题。前一天验收没有通过，不要急着进入下一天。

### 第一天：画清真实调用链与路由所有权

任务：

- [ ] 从 `AgentController.chat()` 开始手写完整调用链。
- [ ] 标出哪一步是第一次模型调用。
- [ ] 标出哪些 intent 被 `PRODUCT_INTENTS` 拦截。
- [ ] 说明 `search_product` Tool 在什么情况下才能真正被调用。
- [ ] 用一句话解释 Router Tax。
- [ ] 在纸上选择“商品确定性路由”或“商品 Agent Tool”的主所有者。

动手验证：

```text
你好
查耳机库存
有哪些分类
我要退款
转人工
```

记录每句话实际走了哪个分支，而不是只看最终回答。

当天必须能回答：

```text
为什么当前注册了 list_catalog，也不代表“有哪些分类”一定会调用它？
```

### 第二天：模型调用、Factory 与兼容网关能力

任务：

- [ ] 跑一次普通 `model.invoke()`。
- [ ] 查看 AIMessage 的 `content` 与 `contentBlocks`。
- [ ] 对比 AgentService 与 AgentIntentService 的模型创建代码。
- [ ] 设计 `AgentModelFactory` 的三个 purpose。
- [ ] 分别验证普通调用、Structured Output 和 Tool Calling。
- [ ] 记录 401、404、429、超时的真实错误形态。

当天必须能回答：

```text
为什么普通聊天成功，仍不能证明兼容网关支持意图识别和 Agent Tool？
```

### 第三天：逐个审查 Tool Contract

任务：

- [ ] 逐字段解释 calculator Tool。
- [ ] 逐字段解释 search_product Tool。
- [ ] 对比 Tool description 与真实返回字段。
- [ ] 判断库存应该返回数量还是只返回 inStock。
- [ ] 计算 list_catalog 最坏会发起多少个查询。
- [ ] 把 Demo Tool 与生产 Tool 的职责分开。
- [ ] 为每个 Tool 写正常参数、非法参数和 Service 异常测试。

当天必须能回答：

```text
Tool 的 description、Schema、实现、返回对象和测试为什么必须一致？
```

### 第四天：Structured Output 与业务不变量

任务：

- [ ] 跑通 `CustomerIntentSchema` 纯 Schema 测试。
- [ ] 对比 `withStructuredOutput` 和 Agent `responseFormat`。
- [ ] 为每个 intent 写能力策略。
- [ ] 新增或设计 `catalog_browse`。
- [ ] 用代码复算 missingFields。
- [ ] 准备至少 30 条意图样本。
- [ ] 分析高 confidence 样本的真实正确率。

当天必须能回答：

```text
为什么 Zod 验证成功不等于业务正确，confidence=0.95 也不等于 95% 正确概率？
```

### 第五天：Service 拆分、错误与响应契约

任务：

- [ ] 将响应设计为以 source 判别的 union。
- [ ] 给所有 intent 建立穷尽路由表。
- [ ] 设计 ProductCustomerService 的方法边界。
- [ ] 设计 PublicProductSnapshot。
- [ ] 列出至少六类内部错误码。
- [ ] 删除或替换 console.log 设计。
- [ ] 说明 AgentResultAdapter 的作用。

当天必须能回答：

```text
为什么数据库异常、模型超时和商品空结果不能全部叫“AI 服务调用失败”？
```

### 第六天：测试、Runtime Context 与最小 Middleware

任务：

- [ ] 修复 AgentService 构造函数 Mock。
- [ ] 修复 Jest globals 问题。
- [ ] 分开 Schema Test、Router Test、Tool Test 和 Agent Eval。
- [ ] 设计 `AgentRuntimeContextSchema`。
- [ ] 解释为什么订单 Tool 不能接收模型提供的 userId。
- [ ] 加一个 run 级 model call limit 实验。
- [ ] 加一个 run 级 tool call limit 实验。
- [ ] 写下哪些需求才需要 Checkpointer 和 LangGraph。

当天必须能回答：

```text
Tool Schema、Runtime Context、Agent State、ProductService 和 Middleware 分别负责什么？
```

### 六天结束验收

你应该能够不看文档画出：

```text
HTTP DTO
→ Trusted Context
→ Intent Structured Output
→ Intent Policy
→ Deterministic Route / Agent Route
→ ProductService / Safe Tool
→ AgentResultAdapter
→ Typed Response
```

并且能够解释每一个箭头的数据是否可信、由谁验证、失败时怎样处理。

---

## 三十六、最终自测题

如果下面问题都能用自己的话回答，就可以进入现代版第五章。

### 模型

1. `ChatOpenAI` 与 `createAgent` 有什么区别？
2. `model.invoke()` 会自动执行 Tool 吗？
3. 为什么消息内容不一定只是字符串？
4. 哪些模型错误不应该重试？

### Tool

5. Tool 的 name、description、schema 各有什么作用？
6. Tool 为什么应该复用 ProductService？
7. Tool 返回 ORM Entity 全部字段有什么风险？
8. 为什么不能让模型提供可信 userId？
9. Runtime Context 与 Tool 参数有什么区别？

### Structured Output

10. `withStructuredOutput` 适合什么？
11. `responseFormat` 适合什么？
12. `structuredResponse` 在哪里？
13. Provider Strategy 和 Tool Strategy 有什么差异？
14. 为什么业务代码还要重新计算 missingFields？

### Agent

15. `createAgent` 内部循环是什么？
16. 为什么使用 createAgent 不等于已经自定义 LangGraph？
17. Middleware 解决什么问题？
18. 什么需求走确定性路由？
19. 什么需求交给 Agent？
20. 如何判断 Agent 真的变好，而不只是“感觉回答不错”？

### 对照当前代码

21. 为什么普通“你好”当前可能调用两次模型？
22. 为什么三个商品 intent 通常不会进入 `search_product` Tool？
23. “有哪些分类”为什么可能到不了 `list_catalog`？
24. `search_product` 当前为什么不能回答准确库存数量？
25. `list_catalog` 为什么存在 N+1 和无界并发风险？
26. 为什么 `confidence: 0.95` 不能直接当成 95% 正确率？
27. 为什么 `missingFields` 必须由代码复算？
28. 当前哪些 intent 被声明了但没有真正实现？
29. `findCategoryId()` 使用 includes 会产生什么歧义？
30. 为什么 Agent 分支必须补 `source: 'agent'`？
31. 为什么 `AgentChatResponseDto` 更适合使用判别联合？
32. 为什么 AgentIntentService 应删除 ProductService 和 CategoryService 依赖？
33. `AgentConversationState` 已存在，为什么系统仍然没有多轮记忆？
34. 当前两个测试分别为什么不能通过编译？
35. P0、P1 和 P2 的修改边界分别是什么？

---

## 三十七、本课总结

第 1～4 章现代版主线可以压缩成：

```text
ChatOpenAI / initChatModel
→ 提供模型能力

model.invoke
→ 完成单次模型调用

Zod + withStructuredOutput
→ 把自然语言变成可靠结构

tool + ProductService
→ 让模型安全读取真实业务数据

createAgent
→ 让模型在循环中选择和组合 Tool

Runtime Context
→ 把可信用户、权限和会话信息传给代码

Middleware
→ 统一处理重试、限制、隐私、摘要和审批

确定性业务路由
→ 控制价格、库存、订单等关键流程
```

最重要的判断不是“是不是用了最多最新 API”，而是：

> 模型负责理解和生成，代码负责业务规则，Service 负责真实数据，Runtime Context 负责可信身份，Middleware 负责横切控制。

对你当前代码还要再加一句：

> 同一项业务能力必须有明确的路由所有者；Tool 描述、参数、返回值和真实实现必须一致；模型给出的 confidence、missingFields 和 normalizedQuery 都只是建议或提取结果，最终业务裁决仍由代码完成。

复习完成后，继续阅读：[第 5 课：多轮客服会话、缺失字段补全与短期状态](./LESSON_05_MULTI_TURN_STATE_AND_SLOT_FILLING.md)。第五章会使用 `conversationId`、`thread_id`、Checkpointer 和确定性业务状态实现多轮客服。
