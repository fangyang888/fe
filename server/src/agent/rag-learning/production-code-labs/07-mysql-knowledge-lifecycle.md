# 第 07 章：MySQL 文档生命周期与索引任务

对应原文：第 25、43～44 节。

## 任务 1：KnowledgeSource

```ts
@Entity('knowledge_source')
@Unique(['tenantId', 'canonicalKey'])
export class KnowledgeSourceEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', length: 100 }) tenantId: string;
  @Column({ name: 'canonical_key', length: 150 }) canonicalKey: string;
  @Column({ length: 200 }) title: string;
  @Column({ name: 'canonical_url', nullable: true, length: 1000 })
  canonicalUrl: string | null;
  @Column({ length: 30 }) authority: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
```

## 任务 2：KnowledgeRevision

```ts
@Entity('knowledge_revision')
@Unique(['sourceId', 'revision'])
export class KnowledgeRevisionEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'source_id' }) sourceId: string;
  @Column({ type: 'int' }) revision: number;
  @Column({ name: 'content_hash', length: 64 }) contentHash: string;
  @Column({ length: 30 }) status: 'draft' | 'indexed' | 'published' | 'archived';
  @Column({ name: 'valid_from', type: 'datetime', nullable: true }) validFrom: Date | null;
  @Column({ name: 'valid_to', type: 'datetime', nullable: true }) validTo: Date | null;
  @Column({ name: 'index_version', nullable: true, length: 100 }) indexVersion: string | null;
  @Column({ name: 'embedding_version', nullable: true, length: 100 }) embeddingVersion: string | null;
}
```

生产迁移应使用项目正式 migration，不依赖 TypeORM `synchronize`。

## 任务 3：KnowledgeIndexJob

```ts
type IndexJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

@Entity('knowledge_index_job')
@Unique(['idempotencyKey'])
export class KnowledgeIndexJobEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'idempotency_key', length: 200 }) idempotencyKey: string;
  @Column({ name: 'revision_id' }) revisionId: string;
  @Column({ length: 30 }) status: IndexJobStatus;
  @Column({ type: 'int', default: 0 }) attempt: number;
  @Column({ name: 'chunk_count', type: 'int', default: 0 }) chunkCount: number;
  @Column({ name: 'error_code', nullable: true, length: 100 }) errorCode: string | null;
}
```

## 任务 4：状态机

允许：

```text
draft → indexed → published → archived
draft/indexed → failed（通过 job 表表达，不把半成品发布）
```

发布事务必须保证同一 source 在同一生效区间只有一个当前 revision，冲突时拒绝而不是让模型决定。

## 测试

- 幂等键重复时只创建一个 job。
- revision 不能倒退或重复。
- 构建失败不改变当前 published revision。
- 生效区间冲突被拒绝。
- A tenant 不能更新 B tenant source。

## Gate 07

- [ ] MySQL 是文档发布状态的权威来源。
- [ ] 索引任务可重试且幂等。
- [ ] 新版本失败不影响当前线上版本。
- [ ] 数据库迁移可向前执行并有回滚说明。

