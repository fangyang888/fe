# 案例 03：登录用户订单状态查询

## 用户场景

```text
用户：我的订单 202608310001 到哪里了？
```

这是实时、个人、强鉴权数据，只走 OrderService，不走 RAG。

## 第一步：保护 AgentController

在决定客服必须登录的前提下：

```ts
@Controller('api/agent')
@UseGuards(JwtAuthGuard)
export class AgentController {
  @Post('chat')
  chat(@Body() dto: AgentChatDto, @CurrentUser() user: AuthUser) {
    return this.chatApplication.chat(dto, user);
  }
}
```

流式接口同样传递 `AuthUser`。如果产品要求游客也能问公共 FAQ，应拆成公共知识入口与登录客服入口，不要让同一路径根据 Body 中 userId 切权限。

## 第二步：安全查询方法

当前 `OrderService.findOne(userId, id)` 按数据库数字 ID 查询。客服用户通常提供 `orderNo`，新增：

```ts
async findByOrderNoForUser(userId: number, orderNo: string) {
  const order = await this.orderRepo.findOne({
    where: { userId, orderNo },
  });
  if (!order) throw new NotFoundException('订单不存在');
  return order;
}
```

不要调用 `adminFindOne()`，也不要先按 orderNo 全局查出订单再在应用层判断归属。

## 第三步：OrderCustomerService

```ts
@Injectable()
export class OrderCustomerService {
  constructor(private readonly orders: OrderService) {}

  async getStatus(userId: number, orderNo: string) {
    const order = await this.orders.findByOrderNoForUser(userId, orderNo);
    return {
      orderNo: order.orderNo,
      status: order.status,
      paidAt: order.paidAt ?? null,
      items: order.items.map((item) => ({ name: item.name, quantity: item.quantity })),
    };
  }
}
```

只返回客服回答需要的最小字段，不把地址快照和无关隐私交给模型。

## 测试

- 无 JWT 为 401。
- 用户 A 查询用户 B 的 orderNo 返回 404，且不泄露订单是否存在。
- 模型提供 userId=B 不会改变认证 userId。
- Agent 只读查询不会调用 `updateStatus()`。
- 日志不打印完整地址、openid 或支付数据。

## Gate CS-03

- [ ] 身份从 JWT 一路传到 OrderService。
- [ ] 订单归属在数据库查询条件中生效。
- [ ] Agent 没有后台订单能力。
- [ ] 当前阶段不开放取消、退款或状态修改 Tool。

