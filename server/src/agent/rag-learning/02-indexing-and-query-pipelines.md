# 第 02 章：离线索引与在线问答

## 本章目标

建立 RAG 最重要的系统地图：离线索引管道和在线查询管道是两套不同流程。

---

## 一、离线索引管道

文档新增、修改、发布或删除时运行：

```text
可信文档
→ 读取
→ 解析和清洗
→ 结构化切分
→ 生成 Chunk 和 Metadata
→ Embedding
→ 写入索引
→ 发布 indexVersion
```

它回答的是：“怎样把资料变成稳定、可更新、可检索的索引？”

离线任务需要记录：

- 文档来源和版本。
- 内容哈希。
- 使用的解析器和切分策略版本。
- Embedding 模型和向量维度。
- Chunk 数量、失败数量和耗时。
- 当前索引版本。

---

## 二、在线查询管道

用户每次提问时运行：

```text
用户问题
→ 可选的查询改写
→ 根据服务端身份生成过滤条件
→ 向量/关键词检索
→ 融合、去重、重排序
→ 选择少量上下文
→ 根据证据生成回答
→ 验证引用
```

它回答的是：“怎样在有限延迟和上下文预算内找到可信证据并回答？”

在线请求应记录：

- 原问题和最终检索查询。
- 权限范围的非敏感摘要。
- indexVersion。
- TopK Chunk ID 和各阶段耗时。
- 是否降级、是否证据不足。
- 最终使用的引用 ID。

不要在日志中保存不必要的完整用户隐私或整篇私有文档。

---

## 三、为什么必须拆开

如果每次提问都重新读取和索引全部文档，会出现：

- 请求延迟和费用不可接受。
- 同一问题可能使用不同索引状态。
- 无法安全更新和回滚。
- 并发请求重复产生 Embedding。
- 旧文档和新文档难以一致删除。
- 线上错误无法判断发生在导入还是检索。

正确边界：

```text
KnowledgeIndexService  → 离线写索引
KnowledgeSearchService → 在线只读检索
KnowledgeAnswerService → 使用检索结果回答
```

---

## 四、文档生命周期

建议把一份资料看成有状态的业务对象：

```text
draft
→ validating
→ indexed
→ published
→ archived
```

只有满足权限、状态和有效期要求的版本才能进入线上检索。

一个安全的发布流程可以是：

1. 新版本先写入 staging 索引。
2. 校验文档数、Chunk 数和抽样检索。
3. 运行最小评估集。
4. 原子切换当前 `indexVersion`。
5. 保留上一版本用于回滚。
6. 延迟清理旧索引。

学习阶段可以简化，但必须保留“版本”概念。

---

## 五、在当前项目中的第一版职责

```ts
interface KnowledgeIndexService {
  indexDirectory(path: string): Promise<IndexSummary>;
}

interface KnowledgeSearchService {
  search(input: SearchInput): Promise<RetrievalResult>;
}
```

Controller 不应该自己读文件、切分和调用 Embedding；AgentService 也不应该承担索引任务。

第一版可以在开发环境启动时显式执行一次索引，但不要把它伪装成最终生产方案。后续应迁移到管理接口、CLI 或队列任务。

---

## 六、本章练习

1. 画出当前项目未来的离线和在线两条时序图。
2. 为索引任务设计 `IndexSummary`：

```ts
type IndexSummary = {
  indexVersion: string;
  documentCount: number;
  chunkCount: number;
  skippedCount: number;
  failedCount: number;
  durationMs: number;
};
```

3. 写出文档新增、修改、删除时分别应该执行什么。
4. 解释服务重启后为什么不能只依赖内存索引。

## 验收标准

- 能不看文档画出两条管道。
- 能说明每个 Service 的职责。
- 能描述新版本发布失败时如何保留旧版本。
- 不在用户查询请求中重新索引全部资料。

通过后进入：[第 03 章：Document、Chunk 与 Metadata](./03-document-chunk-and-metadata.md)。

