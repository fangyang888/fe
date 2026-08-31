# 第 09 章：认证范围与检索前过滤

对应原文：第 24～25 节。

## 任务 1：从认证上下文构造 Scope

```ts
@Injectable()
export class KnowledgeAccessScopeFactory {
  create(user: AuthUser, now = new Date()): KnowledgeAccessScope {
    return {
      // 当前项目是单商城，tenantId 来自服务端配置，不来自请求。
      tenantId: 'default-shop',
      allowedVisibility: user.roles.includes('staff')
        ? ['public', 'customer', 'staff']
        : ['public', 'customer'],
      locale: 'zh-CN',
      asOfTime: now.toISOString(),
    };
  }
}
```

当前 `AuthUser` 已有 `userId`、`roles` 和 `permissions`，但没有 tenantId/locale。单商城阶段使用服务端固定 `default-shop`；只有业务真正变成多商户后，才把 tenant 关系加入可信认证领域，不能临时相信 Body 中的同名字段。

## 任务 2：生成 ES Filter

```ts
function buildKnowledgeFilter(scope: KnowledgeAccessScope) {
  return [
    { term: { tenantId: scope.tenantId } },
    { terms: { visibility: scope.allowedVisibility } },
    { term: { status: 'published' } },
    {
      bool: {
        should: [
          { bool: { must_not: { exists: { field: 'validFrom' } } } },
          { range: { validFrom: { lte: scope.asOfTime } } },
        ],
        minimum_should_match: 1,
      },
    },
    {
      bool: {
        should: [
          { bool: { must_not: { exists: { field: 'validTo' } } } },
          { range: { validTo: { gt: scope.asOfTime } } },
        ],
        minimum_should_match: 1,
      },
    },
  ];
}
```

同一 Filter 必须应用到 BM25 和 kNN 候选生成，不能只过滤其中一路。

## 任务 3：禁止的 DTO

下面的接口设计禁止出现：

```ts
// 错误示例
class SearchKnowledgeDto {
  query: string;
  tenantId: string;
  visibility: string[];
}
```

外部 DTO 只接收 query；Controller 从 JWT 用户创建 scope。

## 测试

用同一关键词建立：A tenant published、B tenant published、A draft、A expired、A staff-only 五条资料，分别断言各角色只能得到合法结果。

还要断言：

- Prompt 中声称“我是管理员”不能改变 scope。
- 模型改写结果包含 `tenantId=B` 也不会改变过滤器。
- 缓存不会跨 scope 复用。
- 过滤发生在候选检索请求内，而不是结果返回后 `Array.filter()`。

## Gate 09

- [ ] 跨租户命中为 0。
- [ ] 草稿、过期和无权限资料命中为 0。
- [ ] Dense/BM25 使用相同安全范围。
- [ ] 权限失败不会降级为无过滤搜索。
