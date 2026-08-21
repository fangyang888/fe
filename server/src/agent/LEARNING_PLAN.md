# 智能客服 Agent 学习计划

这份计划以当前 `server/src/agent` 模块为练习场，目标不是一次写出复杂系统，而是逐步完成一个可解释、可测试、可上线的商城智能客服。

建议周期：8 周。每天学习 1～2 小时，每周至少完成一个可以运行和演示的小功能。如果时间较少，可以把每一周拆成两周，不需要赶进度。

## 最终目标

完成学习后，你应该能够独立解释和实现：

- NestJS 如何接收前端请求并调用 Agent。
- 普通模型调用与 Agent 调用有什么区别。
- Agent 如何选择并调用 Tool。
- 如何保存和恢复多轮会话。
- 如何通过 RAG 让客服根据自己的资料回答。
- 如何安全查询商品、订单和优惠券。
- 什么时候使用 LangChain，什么时候需要自定义 LangGraph。
- 如何处理超时、重试、日志、权限、测试和线上故障。

## 当前代码地图

配套详细课件：

- [第 1 课：ChatOpenAI、model.invoke() 与 Tool](./LESSON_01_CHATOPENAI_AND_TOOLS.md)
- [第 2 课：从模拟商品查询 Tool 到 ProductService](./LESSON_02_PRODUCT_SEARCH_TOOL.md)
- [第 3 课：Structured Output 客服意图识别与关键数据提取](./LESSON_03_STRUCTURED_OUTPUT_INTENT_EXTRACTION.md)
- [第 4 课：从 Structured Output 到可运行的商品客服](./LESSON_04_INTENT_TO_PRODUCT_CUSTOMER_SERVICE.md)
- [第 1～4 章现代版复习：LangChain.js v1 Agent 核心基础](./LESSON_01_04_LANGCHAIN_V1_MODERN_REVIEW.md)
- [第 5 课：多轮客服会话、缺失字段补全与短期状态](./LESSON_05_MULTI_TURN_STATE_AND_SLOT_FILLING.md)
- [第 6 课：生产级会话持久化与上下文工程](./LESSON_06_PERSISTENT_CONVERSATIONS_AND_CONTEXT_ENGINEERING.md)
- [第 7 课：生产级流式客服与可观测执行](./LESSON_07_PRODUCTION_STREAMING_AND_OBSERVABILITY.md)
- [第 8 课小白重点版：RAG 核心原理与学习要点](./LESSON_08_RAG_KEY_POINTS_AND_LEARNING_GUIDE.md)
- [第 8 课：生产级客服知识库与 RAG](./LESSON_08_PRODUCTION_RAG_AND_KNOWLEDGE_BASE.md)
- [第 9 课：安全业务 Tool、用户归属与真正转人工](./LESSON_09_SECURE_BUSINESS_TOOLS_AND_HUMAN_HANDOFF.md)
- [第 10 课：自定义 LangGraph、持久工作流与人工审批](./LESSON_10_LANGGRAPH_WORKFLOW_AND_HUMAN_APPROVAL.md)

开始前先认识当前目录：

| 文件 | 作用 | 主要学习内容 |
| --- | --- | --- |
| `agent.module.ts` | 注册 Controller 和 Service | NestJS Module、依赖注入 |
| `agent.controller.ts` | 提供 `/api/agent/chat` | HTTP、Controller、DTO |
| `agent.dto.ts` | 验证请求和定义响应 | class-validator、TypeScript 类型 |
| `agent.service.ts` | 创建并调用 Agent | ChatOpenAI、createAgent、异常处理 |
| `agent.tools.ts` | 定义计算器和时间工具 | Tool Calling、Zod Schema |
| `agent.service.spec.ts` | AgentService 单元测试 | Jest、Mock、异常断言 |
| `README.md` | 当前模块的使用说明 | 配置、边界、运行方式 |

先把一次调用流程记住：

```text
前端 AgentChat
  → POST /api/agent/chat
  → AgentController.chat()
  → AgentService.chat()
  → createAgent().invoke()
  → 模型判断是否调用 Tool
  → AgentService 提取回答
  → 返回前端
```

## 学习方法

每个知识点都按照下面的循环学习：

1. 先阅读当前代码，写下自己不理解的语句。
2. 只修改一个小功能，不同时做多个大改动。
3. 用 `curl` 或前端页面验证正常输入。
4. 再验证空参数、错误参数、超时等异常情况。
5. 补充至少一个测试。
6. 在本文件末尾记录当天学到了什么。

每次修改后至少执行：

```bash
cd server
pnpm run build
pnpm test -- agent.service.spec.ts --runInBand
```

不要把真实 API Key 写入代码、测试文件、README 或 Git 提交。

---

## 第 0 周：准备环境和学会观察请求

### 学习目标

- 知道前端、NestJS、模型网关分别运行在哪里。
- 能独立启动项目并调用 Agent 接口。
- 能区分构建错误、HTTP 错误和模型供应商错误。

### 要学习的知识

- Node.js、pnpm 和环境变量。
- HTTP 请求方法、Header、JSON、状态码。
- `.env` 与 `.env.example` 的区别。
- 浏览器 Network 面板和 NestJS 日志。

### 实践任务

- [ ] 确认 Node.js 版本不低于 `20.19.0`。
- [ ] 启动 NestJS 和前端。
- [ ] 使用页面发送一条普通问题。
- [ ] 使用 `curl` 直接调用 `/api/agent/chat`。
- [ ] 故意发送空 `message`，观察 DTO 返回的 400。
- [ ] 暂时移除本地 API Key，观察 503，然后立即恢复。
- [ ] 记录一次请求经过的所有文件和方法。

测试命令：

```bash
curl -X POST http://127.0.0.1:3000/api/agent/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"你好，请介绍你的能力"}'
```

### 验收标准

- 能解释 200、400、502、503、504 分别表示什么。
- 接口 pending 时，知道先检查 NestJS、网络、模型网关还是 Nginx。
- 不查看源码也能说出 `.env` 中三个 OpenAI 配置的用途。

---

## 第 1 周：TypeScript 和 NestJS 基础

### 学习目标

- 看懂当前 Agent 模块，而不是只会复制代码。
- 理解 Controller、Service、Module、DTO 的职责。

### TypeScript 必学内容

- [ ] `type`、`interface`、`class`。
- [ ] `private`、`readonly`、可选属性 `?`。
- [ ] 联合类型与类型缩小。
- [ ] 数组的 `map`、`filter`、`at`。
- [ ] `async`、`await`、`Promise`。
- [ ] `try/catch/finally`。
- [ ] `unknown` 与 `instanceof Error`。
- [ ] 模块的 `import/export`。

### NestJS 必学内容

- [ ] `@Module()`。
- [ ] `@Controller()` 和 `@Post()`。
- [ ] `@Injectable()` 与构造函数依赖注入。
- [ ] `@Body()` 和 ValidationPipe。
- [ ] ConfigService。
- [ ] NestJS HttpException。

### 实践任务

- [ ] 给 `AgentChatResponseDto` 增加一个非敏感的 `timestamp` 字段。
- [ ] 给 DTO 增加一条自定义验证规则并写测试。
- [ ] 新增 `GET /api/agent/health`，只返回是否配置、模型名称和服务状态，绝不能返回 Key。
- [ ] 给 Controller 补一个最简单的单元测试。

### 验收标准

- 能解释为什么 Controller 不应该直接创建 ChatOpenAI。
- 能解释为什么 API Key 只能放在 Service 端。
- 能自己新增一个 DTO 字段并通过构建。

---

## 第 2 周：理解普通模型调用和稳定性

### 学习目标

- 理解“模型”和“Agent”不是同一个概念。
- 解决模型调用无限 pending 的问题。

### 要学习的知识

- System、User、Assistant 三种消息角色。
- Token、上下文窗口、temperature。
- 模型 API 的请求与响应。
- 超时、重试、AbortSignal。
- 日志中不能打印 API Key 和完整用户隐私。

### 实践任务

- [ ] 在独立练习 Service 中直接调用 `ChatOpenAI.invoke()`，暂时不使用 `createAgent()`。
- [ ] 比较普通模型调用和 `createAgent()` 的响应结构。
- [ ] 为 ChatOpenAI 设置合理的请求超时。
- [ ] 限制重试次数，避免错误请求长时间占用连接。
- [ ] 区分供应商 401、404、429、5xx 和网络超时。
- [ ] 给前端返回可以理解的错误信息，但在服务器日志保留详细原因。

### 验收标准

- 模型供应商不可访问时，接口能在规定时间内结束，而不是一直 pending。
- 能解释为什么增加 Nginx 900 秒超时不能真正解决模型连接问题。
- 能解释普通 LLM、Tool Calling 和 Agent 循环的区别。

---

## 第 3 周：Tool Calling

### 学习目标

- 理解模型只负责“决定调用工具”，真正的业务操作由代码完成。
- 能独立编写带 Zod Schema 的安全工具。

### 先读懂现有工具

- `calculator` 为什么使用枚举限制 operation。
- `get_current_time` 为什么要求 IANA 时区。
- Tool 的 `name`、`description`、`schema` 各自影响什么。

### 实践任务

- [ ] 为除数为 0 的情况补测试。
- [ ] 新增 `search_product` 只读工具。
- [ ] 新增 `get_product_detail` 只读工具。
- [ ] 为工具输入设置长度、数字范围和枚举限制。
- [ ] 模拟数据库异常，确保工具返回可理解的错误。
- [ ] 在日志中记录工具名、耗时和成功/失败，不记录敏感返回值。

### 安全规则

- Tool 参数永远不直接拼接 SQL。
- Tool 先从登录上下文获取用户身份。
- 模型传入的 `userId`、价格、权限都不可信。
- 查询订单必须验证订单属于当前用户。
- 退款、取消订单等写操作暂时不要开放给 Agent。

### 验收标准

- 用户询问时间时会调用时间工具。
- 用户查询商品时会调用商品工具。
- 普通闲聊不会错误调用业务工具。
- 工具输入非法时不会导致 NestJS 进程崩溃。

---

## 第 4 周：多轮状态、Checkpointer 和数据库

### 学习目标

- 将当前“每次独立”的单轮 Agent 改成有 `conversationId` 的多轮客服。
- 理解会话记忆不是模型自动拥有的。
- 理解 `conversationId` 如何映射为 LangGraph Checkpointer 的 `thread_id`。
- 区分 Agent 线程 State、Redis 业务状态和 MySQL 长期消息。

### 当前主流分层

```text
createAgent + Checkpointer
→ 保存同一个 thread_id 的 Agent 消息与线程 State

Redis + TTL
→ 保存 pendingIntent、entities、missingFields

MySQL
→ 保存长期会话和消息，供刷新恢复、客服后台和审计
```

本地可以使用 `MemorySaver` 和 Map 学习接口；它们都会在进程重启后丢失，不能作为生产持久化方案。

### 建议数据表

```text
customer_conversation
  id
  user_id
  status
  created_at
  updated_at

customer_message
  id
  conversation_id
  role
  content
  model
  created_at
```

### 实践任务

- [ ] 把 `@langchain/langgraph` 声明为直接依赖。
- [ ] 给 `createAgent` 配置一个长期复用的 `MemorySaver`。
- [ ] 调用 Agent 时传入稳定的 `configurable.thread_id`。
- [ ] 验证同一 thread 能记住消息、不同 thread 不串线。
- [ ] 实现 `pendingIntent`、`entities`、`missingFields` 业务状态。
- [ ] 本地用 Map 学习 Repository 接口，再设计 Redis + TTL 实现。
- [ ] 创建会话和消息 Entity。
- [ ] 新建会话接口。
- [ ] 发送消息时保存用户消息。
- [ ] Agent 返回后保存 assistant 消息。
- [ ] 明确哪些消息由 Checkpointer 提供给 Agent，哪些从 MySQL 恢复给页面。
- [ ] 对长消息线程使用裁剪或 `summarizationMiddleware`，不要无限增长。
- [ ] 校验会话属于当前登录用户。
- [ ] 增加查询会话列表和消息历史接口。
- [ ] 给会话增加 `open`、`human_pending`、`closed` 状态。

### 需要理解的问题

- 为什么不能把所有历史消息无限传给模型？
- Checkpointer 与业务 Redis 状态有什么区别？
- `thread_id` 为什么不能代替登录鉴权？
- 如何按消息数量或 Token 预算裁剪历史？
- 用户刷新页面后，如何继续原会话？
- 两个请求同时写入同一个会话会发生什么？

### 验收标准

- 用户刷新页面后还能看到历史消息。
- 同一个 `conversationId/thread_id` 可以继续 Agent 线程。
- 库存补参由确定性业务状态控制，不只依赖模型猜历史。
- 用户追问“刚才那个订单”时，Agent 能理解上下文。
- 用户不能读取其他用户的会话。

---

## 第 5 周：客服知识库与 RAG

### 学习目标

- 让 Agent 根据自己的售后资料回答，而不是依赖模型记忆。
- 回答中能够提供来源。

### 要学习的知识

- Document、Chunk、Embedding。
- Vector Store、Retriever、相似度。
- Top K 和相似度阈值。
- 2-Step RAG 与 Agentic RAG。
- 文档更新和重新索引。

### 第一批知识库内容

- 退款和退货规则。
- 配送区域和发货时间。
- 优惠券使用规则。
- 商品常见问题。
- 联系人工客服的方法。

### 实践任务

- [ ] 建立 `knowledge_document` 和 `knowledge_chunk` 数据结构。
- [ ] 编写一个文档切片脚本。
- [ ] 保存每个 Chunk 的文档 ID、标题和来源。
- [ ] 实现相似内容检索。
- [ ] 将检索结果放入模型上下文。
- [ ] 回答中返回引用文档标题。
- [ ] 相似度不足时明确说不知道并建议转人工。
- [ ] 准备至少 20 个固定问题作为评测集。

### 验收标准

- 回答售后规则时不编造不存在的条款。
- 修改知识库后，不修改 Prompt 也能回答新规则。
- 能展示回答引用了哪份文档。
- 对知识库不存在的问题能够拒绝猜测。

---

## 第 6 周：商城客服业务工具和转人工

### 学习目标

- 将客服从“会聊天”升级为“能查询业务并安全转人工”。

### 推荐工具

```text
search_knowledge_base
search_product
get_product_detail
get_order_status
get_logistics_info
get_user_coupons
create_support_ticket
```

### 实践任务

- [ ] 查询当前用户订单状态。
- [ ] 查询订单物流信息。
- [ ] 查询用户可用优惠券。
- [ ] 创建 `support_ticket` 数据表。
- [ ] Agent 无法回答时创建工单。
- [ ] 工单保存问题、会话 ID、用户 ID、分类和摘要。
- [ ] 创建人工客服查看工单的管理接口。
- [ ] 增加用户满意/不满意评价。

### 验收标准

- Agent 无法解决问题时不会无限重复回答。
- 工单能关联完整会话。
- 所有订单和优惠券工具都经过身份与归属校验。
- 写操作有审计日志。

---

## 第 7 周：开始自定义 LangGraph

到这一周才开始主动编写 LangGraph。前面使用的 `createAgent()` 内部已经使用预构建图，但这一周要学习自己控制状态和分支。

### 什么时候确实需要 LangGraph

- 会话需要暂停，等待人工处理后继续。
- 退款或取消订单需要人工批准。
- 不同问题需要进入明确的不同流程。
- 某一步失败后需要从检查点恢复。
- 需要记录每一个流程节点的状态。

### 第一张客服图

```text
START
  → classify_intent
  → route_intent
      → answer_with_knowledge
      → query_order
      → create_handoff
  → check_confidence
      → respond
      → human_handoff
  → END
```

### 要学习的概念

- [ ] State。
- [ ] Node。
- [ ] Edge。
- [ ] Conditional Edge。
- [ ] Thread ID。
- [ ] Checkpointer。
- [ ] Interrupt 和 Resume。
- [ ] Human-in-the-loop。

### 实践任务

- [ ] 先写一个只有 3 个节点的最小 Graph。
- [ ] 根据意图在 FAQ 和订单节点之间路由。
- [ ] 使用 `conversationId` 作为 thread ID。
- [ ] 为图增加持久化 Checkpointer。
- [ ] 在退款申请前触发 Interrupt。
- [ ] 人工批准后从原状态恢复。
- [ ] 给每个节点增加输入、输出和异常测试。

### 验收标准

- 能画出 Graph，再解释代码中的每条边。
- 重启服务后仍能恢复等待人工审批的流程。
- 未批准的退款操作绝不会执行。
- 节点失败后能确定失败位置，而不是只看到“Agent 调用失败”。

---

## 第 8 周：上线质量、评测和毕业项目

### 学习目标

- 让客服不仅“能运行”，还要可监控、可评测、可控制成本。

### 稳定性任务

- [ ] 模型超时。
- [ ] 有限重试和退避。
- [ ] 前端取消请求。
- [ ] 工具调用超时。
- [ ] 限流。
- [ ] 请求 ID 和结构化日志。
- [ ] 模型服务不可用时的降级回答。
- [ ] Nginx、NestJS、模型三层超时关系。

### 评测任务

建立固定客服题库，覆盖：

- FAQ 正确回答。
- 知识库不存在的问题。
- 商品查询。
- 当前用户订单查询。
- 其他用户订单越权测试。
- 工具异常。
- 模型超时。
- Prompt Injection。
- 退款操作必须审批。

记录以下指标：

- 回答正确率。
- 知识来源命中率。
- 平均响应时间。
- 模型调用次数。
- 工具调用成功率。
- 转人工率。
- 用户满意度。
- 单次会话 Token 和成本。

### 毕业项目验收

完成一个商城智能客服演示：

1. 用户登录后创建客服会话。
2. 咨询退货规则，客服从知识库回答并显示来源。
3. 咨询自己的订单，客服调用订单工具。
4. 咨询其他用户订单，系统拒绝越权。
5. 用户申请退款，LangGraph 暂停并等待人工批准。
6. 客服人员批准或拒绝后恢复流程。
7. 页面展示完整聊天历史和工单状态。
8. 模型不可用时，请求在规定时间内失败并提示转人工。

---

## 暂时不要学习的内容

在完成第 6 周之前，暂时不要投入太多时间学习：

- 多 Agent 协作。
- Deep Agent。
- MCP 工具市场。
- Fine-tuning。
- 自动生成和执行 SQL。
- 大规模向量数据库集群。
- 让 Agent 自动退款或修改订单。
- 复杂 Prompt 技巧和所谓“万能提示词”。

这些内容不是没有价值，而是会让初学阶段的调试范围过大。

## 推荐官方资料

- LangChain.js 概览：<https://docs.langchain.com/oss/javascript/langchain/overview>
- LangChain Agent：<https://docs.langchain.com/oss/javascript/langchain/agents>
- LangChain Tools：<https://docs.langchain.com/oss/javascript/langchain/tools>
- LangChain Retrieval：<https://docs.langchain.com/oss/javascript/langchain/retrieval>
- LangGraph 概览：<https://docs.langchain.com/oss/javascript/langgraph/overview>
- LangGraph Persistence：<https://docs.langchain.com/oss/javascript/langgraph/persistence>
- Human-in-the-loop：<https://docs.langchain.com/oss/javascript/langchain/human-in-the-loop>
- NestJS 文档：<https://docs.nestjs.com/>
- TypeScript Handbook：<https://www.typescriptlang.org/docs/handbook/intro.html>

阅读资料时以“解决当前练习问题”为目标，不需要一次读完整份文档。

## 每日学习记录模板

每次学习结束后复制一份：

```text
日期：
学习时间：

今天学习的概念：
-

今天修改的文件：
-

成功验证的功能：
-

遇到的错误：
- 错误信息：
- 根本原因：
- 解决方法：

仍然不理解的问题：
-

下一次只做的一件事：
-
```

## 学习进度总表

- [ ] 第 0 周：环境、HTTP 和日志。
- [ ] 第 1 周：TypeScript 和 NestJS。
- [ ] 第 2 周：普通模型调用和稳定性。
- [ ] 第 3 周：Tool Calling。
- [ ] 第 4 周：多轮会话和数据库。
- [ ] 第 5 周：知识库和 RAG。
- [ ] 第 6 周：业务工具和转人工。
- [ ] 第 7 周：自定义 LangGraph。
- [ ] 第 8 周：上线质量和毕业项目。

学习过程中如果某一周的验收标准还不能独立完成，就先重复练习，不要急着进入下一周。
