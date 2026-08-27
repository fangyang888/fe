# 第 08 章：持久化、版本、更新与删除

## 本章目标

把学习用内存索引升级为可以跨重启、跨实例运行，并正确处理文档更新、删除、发布、回滚和 Embedding 迁移。

---

## 一、为什么 MemoryVectorStore 不能直接上线

学习用内存索引的限制：

- 服务重启后消失。
- 多个 NestJS 实例之间不共享。
- 大规模数据占用应用内存。
- 难以管理过滤、备份和索引构建。
- 无法安全执行双版本切换。

它适合最小实验和测试替身，不是最终生产架构。

---

## 二、当前项目的存储分工

可以采用：

```text
MySQL
├── knowledge_source
├── knowledge_revision
├── knowledge_index_job
└── 当前发布版本和审计信息

向量数据库
├── Chunk 向量
├── 可过滤 Metadata
└── indexVersion / tenantId / revision

对象存储或受控文件目录
└── 原始文档
```

向量数据库可以按实际环境选择 Qdrant、pgvector 或其他支持 Metadata 过滤和删除的方案。选择前先验证权限过滤、备份、运维和团队能力，不必同时接入多个方案。

---

## 三、推荐的业务表

概念字段：

```text
knowledge_source
  id
  tenant_id
  canonical_key
  title
  source_url
  authority
  created_at

knowledge_revision
  id
  source_id
  revision
  content_hash
  status
  valid_from
  valid_to
  parser_version
  splitter_version
  embedding_model
  index_version
  created_at
  published_at

knowledge_index_job
  id
  revision_id
  status
  attempt
  document_count
  chunk_count
  error_code
  started_at
  finished_at
```

不要把原始 API Key、完整异常密钥或用户隐私放进任务表。

---

## 四、Upsert 不等于更新完成

文档从 8 个 Chunk 变成 6 个 Chunk 时，仅 Upsert 新的 6 个不会自动删除旧的 2 个。

安全更新策略：

1. 为新 revision 生成完整 Chunk 集合。
2. 写入隔离的 indexVersion 或 revision 范围。
3. 验证 Chunk 数和抽样检索。
4. 发布新 revision。
5. 查询流量只读取发布版本。
6. 延迟删除旧 revision 的孤儿 Chunk。

必须有“按 source/revision 删除”的能力。

---

## 五、幂等和稳定 ID

同一个索引任务重试时：

- 不产生重复 Chunk。
- 不覆盖其他租户数据。
- 不发布半成品版本。
- 已完成步骤可以安全重复。
- 失败原因可追踪。

常用幂等键：

```text
tenantId + sourceId + revision + contentHash + pipelineVersion
```

`pipelineVersion` 可以包含 Parser、Splitter 和 Embedding 配置版本。

---

## 六、Embedding 迁移

更换模型、维度或规范化策略时，不在原索引里混放两个不兼容空间。

推荐蓝绿流程：

```text
v1 继续在线
→ 创建 v2 索引
→ 后台重新 Embedding
→ 完整性检查
→ 运行 Golden Dataset
→ 小流量验证
→ 原子切换读取版本
→ 保留回滚期
→ 清理 v1
```

查询响应和日志都保存 `indexVersion`，否则无法还原某次回答使用的索引。

---

## 七、缓存与旧政策

缓存 Key 至少需要包含影响结果的版本和权限范围：

```text
tenantScope + normalizedQuery + indexVersion + retrievalConfigVersion
```

不要使用只有 `query` 的全局缓存，否则可能导致：

- 跨租户数据泄漏。
- 发布新政策后仍返回旧结果。
- 不同过滤条件共享错误结果。

敏感、低命中或高变化场景可以先不缓存。

---

## 八、测试清单

- 同一 revision 重试不会重复写入。
- 文档 Chunk 数减少时旧片段会被清理。
- 删除文档后它不再进入任何在线结果。
- 新索引构建失败时旧索引继续服务。
- 切换失败可以回滚。
- 两个 Embedding 版本不会混用。
- 缓存 Key 包含 tenant 和 indexVersion。
- 服务重启后仍可检索。

## 验收标准

- 文档具备创建、更新、发布、删除和回滚流程。
- 每次回答可以追踪 indexVersion 和文档 revision。
- 索引任务幂等且失败不会污染线上版本。
- 能完整演示一次 Embedding v1 到 v2 的迁移方案。

通过后进入：[第 09 章：权限、安全与生产边界](./09-permissions-security-and-production-boundaries.md)。

