# 第 08 章：Elasticsearch 生产索引、Alias 与批量写入

对应原文：第 16～19、43 节。

## 任务 1：独立客户端

```ts
import { Client } from '@elastic/elasticsearch';

const client = new Client({
  node: config.getOrThrow('KNOWLEDGE_ELASTICSEARCH_NODE'),
  auth: { apiKey: config.getOrThrow('KNOWLEDGE_ELASTICSEARCH_API_KEY') },
  maxRetries: 2,
  requestTimeout: 10_000,
});
```

凭据只允许访问知识索引必要的 read/write/manage_aliases 权限，不使用超级管理员，也不复用 Kibana Cookie。

## 任务 2：版本化索引名

```text
knowledge_chunks_20260831_001
knowledge_chunks_current → alias 指向当前版本
```

查询只访问 read alias；构建任务写具体版本索引。

## 任务 3：Mapping

```json
{
  "mappings": {
    "dynamic": "strict",
    "properties": {
      "chunkId": { "type": "keyword" },
      "documentId": { "type": "keyword" },
      "parentId": { "type": "keyword" },
      "tenantId": { "type": "keyword" },
      "visibility": { "type": "keyword" },
      "status": { "type": "keyword" },
      "revision": { "type": "integer" },
      "validFrom": { "type": "date" },
      "validTo": { "type": "date" },
      "title": { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
      "sectionPath": { "type": "keyword" },
      "content": { "type": "text" },
      "contentHash": { "type": "keyword" },
      "embeddingVersion": { "type": "keyword" },
      "embedding": {
        "type": "dense_vector",
        "dims": 1536,
        "index": true,
        "similarity": "cosine"
      }
    }
  }
}
```

`dims` 必须从实际 Embedding Descriptor 生成，不能照抄 1536。更换维度建立新索引。

## 任务 4：Bulk 写入与完整性校验

每个 action 使用稳定 `chunkId` 作为 `_id`。检查 bulk response 中每个 item 的错误，不能只看 HTTP 200。写完后验证：

```text
预期 Chunk 数 == 实际文档数
抽样 chunkId 可读
所有 embeddingVersion 一致
tenant/status 字段存在
20 条 smoke query 可执行
```

## 任务 5：原子切 Alias

```ts
await client.indices.updateAliases({
  actions: [
    { remove: { index: oldIndex, alias: readAlias } },
    { add: { index: newIndex, alias: readAlias } },
  ],
});
```

保存 oldIndex 进入回滚记录，观察期结束后再删除。

## 测试

- Mapping 为 strict，未知字段写入失败。
- 维度不匹配时构建失败且不切 alias。
- Bulk 部分失败时整次发布失败。
- Alias 切换是一次原子操作。
- 删除旧文档靠新版本全量/差异构建解决，不误以为 upsert 会清理孤儿 Chunk。

## Gate 08

- [ ] 服务重启后仍能检索。
- [ ] 两个应用实例读取同一 alias。
- [ ] 索引构建失败不影响当前 alias。
- [ ] 可以在一分钟内执行 alias 回滚演练。

