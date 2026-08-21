# 第 10 课：自定义 LangGraph、持久工作流与人工审批

> 本章基于当前项目安装的 `@langchain/langgraph`、NestJS、Redis Checkpointer、MySQL、JWT 和第 9 章安全业务边界编写。
>
> 本章第一次主动编写 `StateGraph`。目标不是把所有 Agent 代码改成图，而是只把“有明确状态、分支、暂停、恢复和审批”的高风险流程交给 LangGraph。
>
> 示例退款流程只做模拟执行。接入真实支付退款前，还必须完成支付平台验签、金额校验、幂等、审计、对账和发布审批。

---

## 一、为什么现在才学习自定义 LangGraph

前面章节的大部分能力用普通代码更清楚：

```text
商品查询
→ ProductCustomerService

订单查询
→ OrderCustomerService

知识问答
→ KnowledgeSearchService + KnowledgeAnswerService
```

这些流程短、分支少、不需要暂停，不必为了“看起来高级”强行画图。

退款审批不同：

```text
验证身份
→ 查询订单
→ 检查退款资格
→ 读取政策
→ 计算方案
→ 等待人工批准
→ 几分钟或几小时后恢复
→ 执行一次退款
→ 写审计
```

它具有：

- 明确的多个步骤。
- 条件分支。
- 长时间暂停。
- 服务重启后恢复。
- 高风险操作只允许执行一次。
- 需要知道失败发生在哪个步骤。

这才是自定义 LangGraph 的合适场景。

---

## 二、本章完成标准

学完后你应该能解释：

- `createAgent()` 与自定义 `StateGraph` 的区别。
- State、Node、Edge 和 Conditional Edge 分别是什么。
- Graph State 与聊天消息、业务数据库记录有什么区别。
- 为什么图状态必须小、可序列化、可验证。
- Checkpointer、`thread_id` 和业务 `workflowId` 怎样配合。
- `interrupt()` 为什么能够暂停，`Command({ resume })` 怎样恢复。
- 为什么恢复时节点可能从头重新执行。
- 为什么副作用必须放在审批之后并具备幂等性。
- 人工批准与真正执行为什么必须分开授权。
- Graph Checkpoint 为什么不能代替业务审计表。

最终应完成：

- 一张最小三节点图。
- 一张模拟退款审批图。
- Redis 持久化暂停状态。
- 审批和拒绝恢复接口。
- 重启恢复测试、重复恢复测试和越权审批测试。

---

## 三、先建立 LangGraph 的核心地图

```text
State
  ├─ 当前流程需要记住的数据
  └─ 每个 Node 读取 State，返回部分更新

Node
  └─ 一个可测试的工作步骤

Edge
  └─ 固定地连接两个步骤

Conditional Edge
  └─ 根据 State 决定下一个步骤

Checkpointer
  └─ 在每个步骤保存图状态

thread_id
  └─ 定位这一条持久工作流

interrupt
  └─ 暂停图并向外暴露审批请求

Command({ resume })
  └─ 带着人工决定恢复同一个 thread_id
```

最重要的运行方向：

```text
输入初始 State
→ START
→ Node A 返回更新
→ Checkpoint
→ Node B 返回更新
→ Checkpoint
→ 条件路由
→ Node C 或 END
```

---

## 四、createAgent 和 StateGraph 不要混为一谈

`createAgent()` 适合：

- 模型根据问题选择 Tool。
- 简单的 ReAct 循环。
- 不需要你显式控制每一条边。

自定义 `StateGraph` 适合：

- 业务步骤和顺序必须确定。
- 有明确条件分支。
- 需要暂停和恢复。
- 高风险操作要审批。
- 需要从具体失败节点排查。

可以在某个 Node 内调用模型或 `createAgent()`，但整个业务流程的控制权仍然属于图和确定性代码。

---

## 五、第一张图只做三个节点

先不要直接实现退款。建立最小图：

```text
START
  ↓
validate_input
  ↓
prepare_result
  ↓
finish
  ↓
END
```

概念代码：

```ts
import {
  Annotation,
  END,
  START,
  StateGraph,
} from '@langchain/langgraph';

const DemoState = Annotation.Root({
  input: Annotation<string>(),
  normalized: Annotation<string>(),
  result: Annotation<string>(),
});

type DemoStateType = typeof DemoState.State;

const validateInput = (state: DemoStateType) => {
  const normalized = state.input.trim();
  if (!normalized) throw new Error('input 不能为空');
  return { normalized };
};

const prepareResult = (state: DemoStateType) => ({
  result: `已处理：${state.normalized}`,
});

const finish = () => ({});

const graph = new StateGraph(DemoState)
  .addNode('validate_input', validateInput)
  .addNode('prepare_result', prepareResult)
  .addNode('finish', finish)
  .addEdge(START, 'validate_input')
  .addEdge('validate_input', 'prepare_result')
  .addEdge('prepare_result', 'finish')
  .addEdge('finish', END)
  .compile();
```

第一张图的目标只是理解“节点返回部分 State 更新”，不要同时加入模型、Redis和审批。

---

## 六、State 应该保存什么

模拟退款 State 示例：

```ts
type RefundWorkflowStatus =
  | 'validating'
  | 'ineligible'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected'
  | 'executing'
  | 'completed'
  | 'failed';

const RefundState = Annotation.Root({
  workflowId: Annotation<string>(),
  userId: Annotation<number>(),
  conversationId: Annotation<string>(),
  orderId: Annotation<number>(),
  reason: Annotation<string>(),
  orderNo: Annotation<string | null>(),
  eligible: Annotation<boolean | null>(),
  eligibilityReason: Annotation<string | null>(),
  proposedAmount: Annotation<number | null>(),
  policyCitationIds: Annotation<string[]>(),
  status: Annotation<RefundWorkflowStatus>(),
  approvalId: Annotation<string | null>(),
  reviewerId: Annotation<number | null>(),
  rejectionReason: Annotation<string | null>(),
  executionId: Annotation<string | null>(),
  errorCode: Annotation<string | null>(),
});
```

State 适合保存：

- 稳定标识。
- 当前状态。
- 节点之间需要传递的小型业务结果。
- 可验证的引用 ID。
- 错误分类和审批结果。

State 不应该保存：

- Service 实例。
- Repository 或数据库连接。
- JWT、API Key、支付密钥。
- 完整大文档和无限聊天历史。
- 不可序列化对象。
- 可以随时从数据库重新查询的巨大 Entity。

---

## 七、Graph State、业务表和聊天表怎样分工

| 数据 | 推荐存储 | 目的 |
| --- | --- | --- |
| 图的执行状态 | Checkpointer | 暂停、恢复、节点进度 |
| 退款申请和最终状态 | MySQL 业务表 | 业务真相、查询和对账 |
| 审批决定 | MySQL 审批/审计表 | 谁在何时批准或拒绝 |
| 用户与助手消息 | `agent_message` | 页面历史和客服记录 |
| 知识政策 | RAG 索引 + 来源库 | 提供政策证据 |

Checkpoint 是工作流快照，不是财务账本。真实退款状态必须由业务数据库负责。

---

## 八、workflowId、thread_id 和 conversationId

三者不要默认完全相同：

```text
conversationId
→ 一段聊天，可以包含多个业务任务

workflowId
→ 一次退款或审批流程

thread_id
→ Checkpointer 定位图状态的键
```

推荐：

```text
thread_id = workflowId
State 中保存 conversationId
```

这样同一段聊天可以先后发起两个独立工作流，不会共享同一个退款状态。

workflowId 必须由服务端生成，不能让用户任意覆盖他人的流程。

---

## 九、退款图的推荐结构

```text
START
  ↓
load_order
  ↓
check_eligibility
  ├─ 不符合 → explain_ineligible → END
  └─ 符合
       ↓
retrieve_policy
       ↓
prepare_proposal
       ↓
request_approval
       ├─ 拒绝 → record_rejection → END
       └─ 批准
            ↓
execute_refund_once
            ↓
record_completion
            ↓
END
```

每个节点只做一件事，便于单独测试和重试。

---

## 十、Node 怎样设计才可测试

以 `load_order` 为例：

```ts
const loadOrder = async (state: RefundStateType) => {
  const order = await orderService.findOne(state.userId, state.orderId);

  return {
    orderNo: order.orderNo,
    status: 'validating' as const,
  };
};
```

节点输入来自 State，依赖通过 NestJS Service 或 Graph Factory 注入。

节点返回部分更新，不要在节点里任意修改共享对象：

```ts
return {
  orderNo: order.orderNo,
};
```

不要：

```ts
state.orderNo = order.orderNo;
return state;
```

保持输入输出清晰，测试才能断言每个节点产生了哪些更新。

---

## 十一、条件边怎样表达业务分支

```ts
const routeEligibility = (state: RefundStateType) =>
  state.eligible ? 'retrieve_policy' : 'explain_ineligible';

builder.addConditionalEdges(
  'check_eligibility',
  routeEligibility,
  {
    retrieve_policy: 'retrieve_policy',
    explain_ineligible: 'explain_ineligible',
  },
);
```

路由函数应尽量是纯函数：

```text
相同 State
→ 永远得到相同下一节点
```

不要在条件路由中调用数据库、支付或模型。

---

## 十二、哪些步骤应该用模型，哪些不应该

适合模型：

- 从用户文字中提取退款原因。
- 根据可信政策证据生成易读说明。
- 生成给审批人的摘要草稿。

必须由代码决定：

- 当前用户是否拥有订单。
- 订单状态是否允许退款。
- 最大可退金额。
- 是否达到人工审批阈值。
- 审批人是否有权限。
- 是否已经执行过退款。

模型输出必须经过 Schema 校验，不能直接成为执行金额或权限结论。

---

## 十三、interrupt 到底发生了什么

审批节点概念代码：

```ts
import { interrupt } from '@langchain/langgraph';

type ApprovalDecision = {
  approved: boolean;
  reviewerId: number;
  reason?: string;
};

const requestApproval = (state: RefundStateType) => {
  const decision = interrupt<
    {
      workflowId: string;
      orderNo: string | null;
      proposedAmount: number | null;
      reason: string;
      policyCitationIds: string[];
    },
    ApprovalDecision
  >({
    workflowId: state.workflowId,
    orderNo: state.orderNo,
    proposedAmount: state.proposedAmount,
    reason: state.reason,
    policyCitationIds: state.policyCitationIds,
  });

  return {
    status: decision.approved ? 'approved' : 'rejected',
    reviewerId: decision.reviewerId,
    rejectionReason: decision.approved ? null : decision.reason ?? null,
  };
};
```

第一次执行到 `interrupt()`：

```text
没有 resume 值
→ LangGraph 产生特殊中断
→ Checkpointer 保存状态
→ 调用方得到待审批信息
→ 图停止继续执行
```

它不是普通错误，不要在节点周围用 `try/catch` 吞掉。

---

## 十四、怎样恢复同一个流程

```ts
import { Command } from '@langchain/langgraph';

const config = {
  configurable: {
    thread_id: workflowId,
  },
};

await graph.invoke(
  new Command({
    resume: {
      approved: true,
      reviewerId: currentReviewer.userId,
      reason: '审核通过',
    },
  }),
  config,
);
```

恢复必须满足：

- 使用同一个已存在的 `thread_id`。
- Checkpointer 中仍然有对应状态。
- 当前审批人已通过 JWT 认证。
- 服务端验证审批权限。
- 工作流当前确实处于 `awaiting_approval`。
- 审批请求没有过期或被其他人处理。

不能因为用户知道 workflowId 就允许恢复。

---

## 十五、恢复时节点可能重新执行

这是 `interrupt()` 最重要的学习点之一。

节点恢复时，包含 `interrupt()` 的节点可能从开头重新运行，再由 `interrupt()` 返回 resume 值。因此：

```ts
const approvalNode = async () => {
  await chargeMoney();        // 危险：恢复时可能再次执行
  const decision = interrupt(...);
  return decision;
};
```

正确做法：

```text
审批节点中只准备安全数据并 interrupt
→ 得到批准后路由到独立执行节点
→ 执行节点使用业务幂等键
```

不要把不可重复副作用放在 `interrupt()` 前面。

---

## 十六、执行节点必须 Exactly-Once 吗

分布式系统中很难只依靠运行时保证绝对 exactly-once。更实际的目标是：

```text
At-least-once 调用
+
业务幂等
=
最终只产生一次业务结果
```

退款执行幂等键示例：

```text
refund:{workflowId}
```

数据库建立唯一约束：

```text
refund_request.workflow_id UNIQUE
payment_refund.external_request_no UNIQUE
```

执行逻辑：

```text
查询 workflowId 是否已有成功结果
→ 有：返回原结果
→ 无：调用下游并保存结果
→ 超时未知：先向下游查询状态，不能盲目再次退款
```

---

## 十七、Checkpointer 怎样接入

学习阶段：

```ts
const graph = builder.compile({
  checkpointer: new MemorySaver(),
});
```

这只能在当前 Node.js 进程中恢复。

生产阶段复用第 6 章的 Redis Checkpointer：

```ts
const graph = builder.compile({
  checkpointer: agentCheckpointerService.get(),
});
```

但需要确认：

- Redis 具备 Checkpointer 所需能力。
- 服务启动时已完成索引/结构初始化。
- `defaultTTL` 足够覆盖审批最长等待时间。
- TTL 到期后的业务表仍能说明流程状态。
- Redis 故障有明确错误和告警。

审批可能等待几天时，不要沿用只适合聊天的短 TTL。

---

## 十八、建议建立业务工作流表

即使有 Checkpointer，也建议 MySQL 保存可查询的工作流投影：

```ts
type RefundWorkflowRecord = {
  id: string;
  userId: number;
  conversationId: string;
  orderId: number;
  status: RefundWorkflowStatus;
  proposedAmount: number | null;
  currentNode: string | null;
  approvalId: string | null;
  resultReference: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};
```

用途：

- 用户查询进度。
- 管理后台列出待审批任务。
- 权限过滤。
- 运维统计。
- Checkpoint 丢失后的故障处理。

业务表不需要复制整个 Graph State，只保存产品和运维需要的投影。

---

## 十九、审批表应该记录什么

```ts
type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

type ApprovalRecord = {
  id: string;
  workflowId: string;
  operation: 'refund';
  requestedBy: number;
  status: ApprovalStatus;
  reviewerId: number | null;
  decisionReason: string | null;
  payloadDigest: string;
  expiresAt: Date;
  decidedAt: Date | null;
};
```

`payloadDigest` 用于确认审批的对象没有在批准后被偷偷修改。例如金额、订单和原因变化时，旧审批不能继续使用。

---

## 二十、HTTP 接口怎样设计

建议分开用户接口和审批接口。

### 发起工作流

```http
POST /api/agent/workflows/refund
Authorization: Bearer <user-token>

{
  "conversationId": "...",
  "clientMessageId": "...",
  "orderId": 123,
  "reason": "商品损坏"
}
```

### 查询自己的工作流

```http
GET /api/agent/workflows/:workflowId
Authorization: Bearer <user-token>
```

必须验证 `workflow.userId === currentUser.userId`。

### 管理员审批

```http
POST /api/admin/agent/approvals/:approvalId/decision
Authorization: Bearer <reviewer-token>

{
  "decision": "approved",
  "reason": "符合政策"
}
```

审批接口需要 `JwtAuthGuard + PermissionGuard`，例如权限点：

```text
refund:approve
```

不要让普通聊天接口接受 `approved=true`。

---

## 二十一、批准接口的安全顺序

```text
1. 验证审批人 JWT
2. 验证 refund:approve 权限
3. 查询 ApprovalRecord
4. 检查 status=pending
5. 检查 expiresAt
6. 检查 payloadDigest
7. 使用数据库条件更新抢占审批
8. 写审计日志
9. 使用同一 workflowId 恢复 Graph
10. 返回接受状态或最终结果
```

第 7 步需要并发控制，例如：

```sql
UPDATE approval
SET status = 'approved', reviewer_id = ?
WHERE id = ? AND status = 'pending';
```

受影响行数为 0，说明已经被处理，不能再次恢复执行。

---

## 二十二、拒绝、过期和取消不是异常

它们是正常业务分支：

```text
approved → 执行节点
rejected → 记录拒绝 → 通知用户 → END
expired  → 标记过期 → 通知用户重新申请 → END
cancelled → 用户主动取消 → END
```

不要把所有非批准情况都抛出 500。

State 和业务表应保存明确状态，页面才能给用户正确说明。

---

## 二十三、失败重试和补偿

节点失败分三类：

| 类型 | 示例 | 策略 |
| --- | --- | --- |
| 瞬时故障 | 网络超时、限流 | 有限重试 + 退避 |
| 业务拒绝 | 状态不允许、金额不符 | 不重试，进入拒绝分支 |
| 结果未知 | 支付调用超时 | 查询下游状态，不能直接重做 |

补偿不是简单的“反向调用”。例如退款已成功后不能用“再次扣款”自动补偿。支付类流程通常需要人工对账和专门状态机。

---

## 二十四、图与第 7 章流式协议怎样结合

不要把 LangGraph 原始内部事件直接暴露给前端。继续转换为稳定业务事件：

```text
workflow_started
status
approval_required
approval_resolved
operation_started
operation_completed
workflow_completed
workflow_failed
```

示例：

```json
{
  "type": "approval_required",
  "workflowId": "wf_123",
  "message": "退款申请正在等待人工审核",
  "occurredAt": "2026-08-18T10:00:00.000Z"
}
```

不能把模型思维链、密钥、完整订单或内部策略细节作为流事件输出。

---

## 二十五、NestJS 推荐代码结构

```text
server/src/agent/workflows/
├── refund-workflow.state.ts
├── refund-workflow.factory.ts
├── refund-workflow.service.ts
├── refund-workflow.controller.ts
├── refund-approval.controller.ts
├── refund-workflow.entity.ts
├── approval.entity.ts
└── nodes/
    ├── load-order.node.ts
    ├── check-eligibility.node.ts
    ├── retrieve-policy.node.ts
    ├── prepare-proposal.node.ts
    ├── request-approval.node.ts
    ├── execute-refund.node.ts
    └── record-result.node.ts
```

第一遍可以把节点集中在 Factory 中看懂流程；节点稳定后再按职责拆文件。不要一开始创建几十个抽象类。

---

## 二十六、Graph Factory 的职责

```text
接收 NestJS 业务依赖
→ 定义 Node 函数
→ 注册节点和边
→ 使用 Checkpointer compile
→ 缓存编译后的 Graph
```

它不负责：

- HTTP 身份认证。
- 管理审批权限。
- 直接格式化页面响应。
- 代替业务数据库事务。

Graph 通常可以复用，但每次调用的初始 State 和 `thread_id` 必须隔离。

---

## 二十七、推荐实施顺序

### 第 1 天：最小三节点图

- `Annotation.Root`。
- `StateGraph`。
- Node、Edge、START、END。
- 纯函数节点单元测试。

验收：能解释每一步 State 如何变化。

### 第 2 天：退款只读流程

- `load_order`。
- `check_eligibility`。
- 条件分支。
- 不符合时安全结束。

验收：不同订单状态进入正确分支。

### 第 3 天：MemorySaver + interrupt

- 增加 `request_approval`。
- 返回待审批数据。
- `Command({ resume })` 批准和拒绝。

验收：没有 resume 时图暂停；resume 后继续。

### 第 4 天：Redis Checkpointer 与重启恢复

- 使用独立 workflowId/thread_id。
- 重启 NestJS。
- 使用相同 thread_id 恢复。
- 调整审批 TTL。

验收：服务重启后仍能批准或拒绝。

### 第 5 天：MySQL 工作流和审批投影

- 工作流表。
- 审批表。
- 权限和归属接口。
- payloadDigest。

验收：后台能列出待审批，用户只能查看自己的流程。

### 第 6 天：模拟执行与幂等

- 独立执行节点。
- workflowId 唯一约束。
- 重复批准与网络重试。

验收：执行计数永远为 1。

### 第 7 天：流式事件和故障演练

- 安全业务事件。
- 节点超时。
- Redis 暂时不可用。
- 下游结果未知。
- 审批过期。

验收：每种情况都有明确状态和恢复路径。

---

## 二十八、自动化测试矩阵

### State 与路由测试

- 合格订单进入政策节点。
- 不合格订单进入拒绝节点。
- 未知状态安全失败。
- 路由函数没有副作用。

### Interrupt 测试

- 首次运行产生中断。
- 中断数据不含敏感字段。
- 批准后进入执行节点。
- 拒绝后不会进入执行节点。

### 恢复测试

- 同一 thread_id 可以恢复。
- 错误 thread_id 不能恢复目标流程。
- 重启进程后可以恢复。
- Checkpoint TTL 过期进入可解释故障状态。

### 权限测试

- 普通用户不能调用审批接口。
- 无 `refund:approve` 权限的管理员不能审批。
- 用户 A 不能查询用户 B 的 workflowId。
- 审批人不能修改 proposedAmount 后沿用旧审批。

### 幂等与并发测试

- 同一 workflowId 只执行一次。
- 两个审批人并发操作只有一个成功。
- 执行响应丢失后重试返回原结果。
- 下游超时未知时不盲目再次执行。

---

## 二十九、最常见的错误

### 错误 1：把所有聊天都重写成 StateGraph

简单问答仍然适合现有 Agent 和 Service。

### 错误 2：把完整 Entity 放进 State

Checkpoint 会膨胀，数据容易过期，也可能泄露敏感字段。

### 错误 3：把副作用放在 interrupt 前

恢复重放时可能重复执行。

### 错误 4：知道 workflowId 就能 resume

workflowId 不是审批权限，必须验证登录身份和权限点。

### 错误 5：有 Checkpointer 就不建业务表

Checkpoint 不能承担对账、审计、后台查询和长期业务真相。

### 错误 6：批准后直接相信模型金额

金额必须由业务 Service 根据订单和规则重新校验。

### 错误 7：异常就无限重试

业务拒绝和结果未知都不能按普通瞬时故障处理。

### 错误 8：Redis 聊天 TTL 直接用于审批

聊天和业务审批的生命周期可能完全不同。

---

## 三十、暂时不要做的事

- 不接真实支付退款。
- 不做多 Agent 审批委员会。
- 不让模型担任最终审批人。
- 不做几十个节点的大图。
- 不把所有业务都塞进一个全局 State。
- 不在 State 保存 Secret、JWT 或完整隐私数据。
- 不依赖 Prompt 保证只执行一次。
- 不跳过 MySQL 业务记录和审计。
- 不在没有故障测试前上线高风险写操作。

---

## 三十一、上线检查清单

### 图结构

- [ ] State 字段小、稳定、可序列化。
- [ ] 每个 Node 职责单一。
- [ ] 条件路由是纯函数。
- [ ] 图可以画出来并与代码一致。

### 持久化与恢复

- [ ] workflowId 与 conversationId 分离。
- [ ] Checkpointer 使用独立 thread_id。
- [ ] 审批 TTL 满足业务等待时间。
- [ ] 重启后能恢复。
- [ ] Checkpoint 丢失有故障处理流程。

### 审批安全

- [ ] 审批接口要求 JWT 和权限点。
- [ ] 审批记录有 payloadDigest。
- [ ] 并发审批只有一个成功。
- [ ] 拒绝和过期是明确业务状态。
- [ ] 普通聊天不能伪造批准。

### 副作用与审计

- [ ] interrupt 前没有不可重复副作用。
- [ ] 执行节点有数据库幂等约束。
- [ ] 结果未知时先查询下游状态。
- [ ] 业务表保存最终真相。
- [ ] 审计记录包含操作者和请求关联 ID。

### 测试

- [ ] 节点和路由有单元测试。
- [ ] 暂停、批准、拒绝有集成测试。
- [ ] 重启恢复有真实 Checkpointer 测试。
- [ ] 并发恢复和重复执行有测试。
- [ ] 权限、过期和下游超时有测试。

---

## 三十二、毕业自测

1. 什么需求出现时才应该自定义 StateGraph？
2. State、Node、Edge 和 Conditional Edge 各自负责什么？
3. 为什么 thread_id 更适合使用 workflowId，而不是 conversationId？
4. 为什么 Checkpoint 不能代替退款业务表？
5. `interrupt()` 第一次运行时发生什么？
6. `Command({ resume })` 为什么必须使用同一 thread_id？
7. 为什么包含 interrupt 的节点恢复时可能重新执行？
8. 为什么副作用必须放在审批之后？
9. 怎样通过幂等实现最终只产生一次退款结果？
10. 为什么审批接口不能放在普通聊天入口？
11. payloadDigest 解决什么风险？
12. 下游退款超时且结果未知时为什么不能直接重试？
13. 哪些步骤可以使用模型，哪些必须由代码决定？
14. MemorySaver 和 Redis Checkpointer 的验收差异是什么？

---

## 三十三、一句话总结

> LangGraph 的价值不是把代码画成图，而是把重要业务流程变成可观察、可持久化、可暂停、可恢复、可审批的状态机；真正的权限、金额、幂等和审计仍然必须由确定性业务系统负责。

完成本章后，下一阶段应学习生产级 Agent 安全与 Guardrails，再建立覆盖整个 Agent、Tool、RAG 和 LangGraph 工作流的评测与发布门禁。
