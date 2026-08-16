# 第 5～8 关：生产级会话 Context 落地与验收

> 本文从第 5 关开始，专门处理 Redis 持久化、Coordinator 编排、鉴权/幂等/锁，以及页面和多实例验收。
> 第 1～4 关必须先在主教程中完成；没有可信的 Reference Schema、Context 纯函数、Resolver 和业务 Service，
> 不能直接跳到 Redis。

主教程：[LESSON_06_SIX_DAY_CODE_AND_PAGE_TEST.md](./LESSON_06_SIX_DAY_CODE_AND_PAGE_TEST.md)

## 开始前必须满足的前置条件

```text
[ ] 第 1 关：reference Schema、Fixture、接口实测已完成
[ ] 第 2 关：ConversationContext 纯函数及 6 个测试已完成
[ ] 第 3 关：ReferenceResolver 的 resolved/missing/ambiguous 已完成
[ ] 第 4 关：ProductCustomerService 只返回业务验证过的引用
[ ] Node.js >= 20.19.0
[ ] Docker 可用于 Redis Testcontainers 集成测试
```

本文件的学习顺序：

```text
第 5 关 Repository
→ 先证明 Redis 状态可以正确存取、过期、CAS 更新

第 6 关 Coordinator
→ 再把 Intent、Context、Resolver、业务 Service 串起来

第 7 关生产入口
→ 最后加入用户归属、幂等、分布式锁和失败恢复

第 8 关验收
→ 页面刷新、服务重启、多实例和清理生命周期
```

完整代码参考仍在[主教程](./LESSON_06_SIX_DAY_CODE_AND_PAGE_TEST.md)的对应章节：

- 5.6：Repository 抽象接口
- 5.7：Redis Provider、TTL、Zod、Lua CAS
- 5.10：Coordinator Command 和编排顺序
- 5.11～5.13：生命周期、幂等、锁、上下文预算
- 5.14：自动化测试矩阵

## 第 5 关：接 Redis，只测 Repository

先讲清三个点：

1. 这一关不改 Controller，不调模型。
2. 先证明 Redis Repository 能正确存取、过期和处理并发。
3. 不要只 Mock Redis 宣称生产级，CAS 和 TTL 必须在真实 Redis 上测试。

先检查依赖。当前项目的 `server/package.json` 已经包含 `testcontainers`，正常情况下不需要重复安装：

```bash
cd server
pnpm why testcontainers
```

只有命令确认依赖不存在时，才执行 `pnpm add -D testcontainers`。

按 5.6、5.7 新建 Repository 接口、Redis 实现和 Provider。如果本机可使用 Docker，
集成测试用 Testcontainers 启动独立 Redis；不要对开发共享 Redis 做 `FLUSHALL`。

集成测试的生命周期骨架：

```ts
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { createClient, type RedisClientType } from 'redis';

let container: StartedTestContainer;
let redis: RedisClientType;

beforeAll(async () => {
  container = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .start();

  redis = createClient({
    url: `redis://${container.getHost()}:${container.getMappedPort(6379)}`,
  });
  await redis.connect();
});

afterAll(async () => {
  if (redis.isOpen) await redis.quit();
  await container.stop();
});
```

完整断言清单使用 5.14 的 Repository 集成测试部分。先运行：

```bash
cd server
pnpm test -- --runInBand agent/context/redis-conversation-context.repository.spec.ts
```

预期：

```text
Testcontainers 启动 Redis
→ 两个 Repository 实例可读取同一状态
→ CAS 冲突重试后不丢 references
→ TTL 和 delete 只影响目标 conversation
→ 测试结束自动删除容器
```

如果 Docker 不可用，本关应标记为“未完成生产验证”，不能用 Mock 通过来代替。

## 第 6 关：最后才写 Coordinator

先讲清三个点：

1. Coordinator 自己不生成业务事实。
2. 它只按顺序调用 Intent、Context、Resolver 和 ProductCustomerService。
3. 先用 Fake Repository 做编排单元测试，再接真 Redis，这样失败时容易定位。

实现：按 5.10 新建 `agent-customer.coordinator.ts`。测试中实现一个最小
`FakeConversationContextRepository`，它实现与 Redis Repository 相同的抽象接口，但不需要网络。

先测四条主线：

```text
1. Apple iPhone 库存→ProductService 成功→Context 保存 productId
2. 它库存多少→Resolver 唯一解析→ProductService.findOne(productId)
3. 两个候选后问“它”→返回澄清问题，不调用 ProductService.findOne
4. 澄清回复“第二个”→选中第二个 ID→成功后 activeTask=null
```

测试：

```bash
cd server
pnpm test -- --runInBand agent/context/agent-customer.coordinator.spec.ts
```

预期：测试不需要真实 LLM，`AgentIntentService` 使用结构化 Fixture，
`ProductCustomerService` 使用确定性 Mock，主要断言调用顺序、ID 和 Context 结果。

## 第 7 关：接入 Application Service、鉴权、幂等和锁

先讲清四个点：

1. `userId` 只从 JWT 取，不加到 `AgentChatDto`。
2. 先在 MySQL 验证会话归属，再用 `userId + conversationId` 读 Redis。
3. 幂等防同一 `clientMessageId` 重复执行；锁防两个不同 Turn 乱序；CAS 防状态覆盖。
4. 加 Guard 前页面必须先能携带登录 Token，否则所有聊天都会返回 401。

Controller 最终入口：

```ts
@UseGuards(JwtAuthGuard)
@Post('chat')
chat(
  @CurrentUser('userId') userId: number,
  @Body() dto: AgentChatDto,
) {
  return this.chatApplication.chat({
    userId,
    ...dto,
  });
}
```

`AgentChatApplicationService` 不再直接调用旧的商品路由，而是按 5.12 的顺序：

```text
归属校验→幂等查询→获取锁→再查幂等→保存 pending user
→ Coordinator/Agent→保存 completed assistant→释放锁
```

当关测试：

```text
1. 相同 clientMessageId 请求两次，Coordinator 只调用一次
2. 不属于当前 userId 的 conversation 在读 Redis 前返回 404/403
3. 同 conversation 已持有锁时，第二条请求返回 409/429
4. Coordinator 失败时 user 消息转为 failed，锁仍会在 finally 释放
5. 已有 completed assistant 时直接返回已存结果
```

测试：

```bash
cd server
pnpm test -- --runInBand agent/persistence/agent-chat-application.service.spec.ts
pnpm test -- --runInBand agent/agent.controller.spec.ts
pnpm exec tsc --noEmit --incremental false
```

这一关通过后再开始页面联调。

## 第 8 关：页面和多实例验收

先用一台 NestJS 验证功能，再测重启和多实例：

```text
1. 登录，新建会话。
2. 发送“Apple iPhone 15 Pro Max 库存多少？”。
3. 检查 Redis 中是 productId + canonical name，不是只存用户输入词。
4. 发送“它库存多少？”，确认走 ProductService.findOne(id)。
5. 创造多候选查询，再问“它多少钱？”，页面必须先追问。
6. 回复“第二个”，确认按第二个 ID 查询。
7. 刷新页面，同 conversationId 能继续引用。
8. 保持 Redis 运行并重启 NestJS，再问“它多少钱？”。
9. 用两个 NestJS 实例交替发送同会话请求，不应丢引用。
10. 点击“清空对话”，确认 MySQL 会话策略、Redis Context 和 Checkpointer 按设计一起清理。
```

最后一次执行：

```bash
cd server
pnpm test -- --runInBand agent
pnpm exec tsc --noEmit --incremental false
pnpm run build
```

页面测试没有代替自动化测试；自动化测试也没有代替 Redis 重启、多实例和故障演练。

## 第 5～8 关全部完成后的验收结果

```text
同一会话第二轮说“它”
→ Redis 恢复 verified reference
→ Resolver 得到唯一 productId
→ ProductService 按 ID 重新校验和查询

请求重试
→ clientMessageId 幂等命中
→ 不重复调用模型、不重复保存助手消息

同一会话并发请求
→ 分布式锁保证 Turn 顺序
→ CAS 防止 Context 静默覆盖

刷新、重启或切换 NestJS 实例
→ conversationId 不变
→ Redis Context 仍可恢复
→ MySQL 聊天历史仍可展示
```
