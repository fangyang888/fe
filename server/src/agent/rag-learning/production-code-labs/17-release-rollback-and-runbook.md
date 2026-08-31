# 第 17 章：索引发布、灰度、回滚与 Runbook

对应原文：第 14、43～46、60 节。

## 任务 1：蓝绿索引流程

```text
1. 锁定 source revision 集合和 pipelineVersion
2. 创建 knowledge_chunks_<version>
3. 解析、切分、Embedding、Bulk
4. 完整性校验
5. 运行 smoke + Golden Dataset
6. 安全用例必须全过
7. 小流量 shadow/灰度
8. 原子切 read alias
9. 观察错误、延迟、拒答和反馈
10. 保留旧索引回滚窗口
11. 审批后删除旧索引
```

## 任务 2：发布记录

```ts
type IndexRelease = {
  indexVersion: string;
  previousIndexVersion: string | null;
  embeddingVersion: string;
  pipelineVersion: string;
  documentCount: number;
  chunkCount: number;
  evaluationReportId: string;
  releasedBy: number;
  releasedAt: string;
  status: 'candidate' | 'active' | 'rolled_back' | 'retired';
};
```

## 任务 3：回滚命令的应用封装

不要让普通 API 接受任意索引名。管理 Service 只能从数据库已验证 release 记录选择 previousIndexVersion，再原子切 alias，并写审计日志。

## 任务 4：Runbook

至少编写：

```text
检索完全不可用
Embedding 429/超时
新政策发布后仍命中旧版本
跨租户安全告警
Rerank 延迟暴涨
引用验证错误增加
索引任务部分失败
alias 指向错误版本
```

每项包含：症状、仪表盘、只读诊断、止损、回滚、根因证据和复盘入口。

## 任务 5：灾难演练

- ES 短时不可用。
- 新索引质量门槛失败。
- alias 切换后 P95 超标。
- 当前索引误含过期文档。
- Embedding 模型升级需要重建。

## Gate 17

- [ ] 新版本失败不会影响当前线上查询。
- [ ] alias 回滚演练完成且可审计。
- [ ] 删除旧索引前有明确保留期和审批。
- [ ] 严重权限事件有立即禁用 RAG/撤回索引方案。

