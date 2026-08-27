# PostgreSQL 精通指南

> 版本基线：PostgreSQL 18。核心概念适用于目前仍受官方支持的 PostgreSQL 14～18。
> 本项目生产主线仍是 MySQL；本章是 PostgreSQL 并行进阶路线，不代表直接迁移生产库。

## 一、什么叫“精通 PostgreSQL”

精通不是背完 SQL，而是能独立完成下面这些工作：

1. 根据业务不变量设计表、类型、约束和关系。
2. 写出正确、可读、可维护的查询，并理解空值和并发语义。
3. 为真实查询设计索引，用 `EXPLAIN (ANALYZE, BUFFERS)` 证明优化有效。
4. 理解 MVCC、隔离级别、锁、死锁、事务重试和幂等。
5. 判断何时使用 JSONB、全文检索、分区、物化视图和扩展。
6. 正确配置连接池、超时、VACUUM、WAL、备份和恢复。
7. 从系统视图定位慢 SQL、锁等待、膨胀、连接耗尽和复制延迟。
8. 设计最小权限、TLS、SCRAM、RLS 和安全迁移流程。
9. 使用 SQLAlchemy 2.x、Psycopg 3 和 Alembic 编写异步生产代码。
10. 对重大变更给出回滚方案、RPO/RTO 和恢复演练证据。

学习时必须坚持一个原则：所有性能结论都用数据、执行计划和监控证明，不凭感觉。

---

## 二、推荐实验环境

学习环境与生产环境必须隔离。建议准备一个可随时销毁的 PostgreSQL 18 实例：

```bash
docker run --name pg-learning \
  -e POSTGRES_USER=agent \
  -e POSTGRES_PASSWORD=change-me \
  -e POSTGRES_DB=agent_learning \
  -p 5432:5432 \
  -d postgres:18
```

连接并确认版本：

```bash
psql 'postgresql://agent:change-me@127.0.0.1:5432/agent_learning'
```

```sql
SELECT version();
SHOW server_version;
SHOW transaction_isolation;
SHOW TimeZone;
```

常用 `psql` 元命令：

```text
\conninfo             当前连接
\l                    数据库列表
\dn                   Schema列表
\dt agent.*           表列表
\d+ agent.message     表、索引和存储信息
\du                   角色列表
\dx                   扩展列表
\timing on            显示语句耗时
\x auto               宽结果自动纵向显示
\watch 2              每2秒重跑上一条查询
\copy (...) TO ...    由客户端导入导出
```

不要把实验密码、生产连接串或备份文件提交到 Git。

---

## 三、先建立正确的心智模型

### 3.1 对象层级

```text
PostgreSQL实例/集群
├─ 角色（跨数据库）
├─ database_a
│  ├─ schema public
│  └─ schema agent
│     ├─ table / index / sequence
│     ├─ view / materialized view
│     ├─ function / procedure
│     └─ type / domain
└─ database_b
```

- 一个 PostgreSQL 实例可以包含多个数据库。
- 连接建立后不能直接跨数据库 JOIN；跨库通常需要重新建模、FDW 或应用层整合。
- Schema 是数据库内的命名空间，不是独立数据库。
- Role 同时承担“用户”和“组”的职责；是否能登录由 `LOGIN` 属性决定。
- `search_path` 会影响未限定对象名的解析，生产 SQL 应避免依赖不受控的路径。

### 3.2 服务端进程与关键组件

- 客户端连接通常对应一个后端进程。
- Shared Buffers 缓存数据库页，但操作系统页缓存仍然重要。
- WAL 先记录变更，再异步把脏页刷入数据文件，保证崩溃恢复能力。
- Checkpointer、Background Writer、WAL Writer、Autovacuum Worker 等后台进程共同维护实例。
- PostgreSQL 的高并发基础是 MVCC，而不是“读写都靠互斥锁”。

### 3.3 MVCC 的最小理解

`UPDATE` 通常不会原地覆盖一行，而是创建新版本；旧版本在不再被任何事务需要后，由
`VACUUM` 标记空间可复用。这带来几个直接后果：

- 普通读取通常不会阻塞普通写入。
- 长事务会保留旧快照，阻碍死元组清理。
- 更新和删除频繁的表需要健康的 autovacuum。
- 表文件变大不等于 `VACUUM` 后立刻缩小；普通 `VACUUM` 主要让空间在表内复用。
- `VACUUM FULL` 会重写表并持有强锁，不能当日常维护命令。

---

## 四、数据类型：让数据库表达业务语义

### 4.1 常用类型选择

| 需求           | 推荐类型                           | 说明                                           |
| -------------- | ---------------------------------- | ---------------------------------------------- |
| 自增主键       | `bigint GENERATED ... AS IDENTITY` | 优先于旧式 `serial`                            |
| 分布式标识     | `uuid`                             | 应用生成或使用合适扩展/函数                    |
| 金额           | `numeric(p, s)`                    | 不使用浮点表示精确金额                         |
| 计数           | `integer` / `bigint`               | 根据上限选择                                   |
| 普通文本       | `text`                             | PostgreSQL 中通常不必为了性能改用 `varchar(n)` |
| 带时区时刻     | `timestamptz`                      | 存绝对时间，展示时转换时区                     |
| 本地日历时间   | `timestamp`                        | 仅在业务确实不代表绝对时刻时使用               |
| 日期           | `date`                             | 不用字符串存日期                               |
| 结构化动态字段 | `jsonb`                            | 可查询、可索引；稳定字段仍应建列               |
| 多值集合       | `array`                            | 适合有界简单值，不代替正常关系建模             |
| 时间/数值区间  | `range` / `multirange`             | 可配 GiST 和排斥约束                           |
| 有限状态       | `text + CHECK` 或 Enum             | Enum 变更流程需提前设计                        |

### 4.2 `NULL` 不是空字符串

`NULL` 表示未知或不存在。它参与三值逻辑：`TRUE`、`FALSE`、`UNKNOWN`。

```sql
-- 错误
WHERE deleted_at = NULL

-- 正确
WHERE deleted_at IS NULL
```

需要掌握：

- `IS NULL` / `IS NOT NULL`
- `IS DISTINCT FROM`：把 `NULL` 当可比较值处理
- `COALESCE`
- 聚合函数通常忽略 `NULL`，但 `count(*)` 统计行数
- `NOT IN` 集合中只要出现 `NULL` 就可能产生意外结果，常用 `NOT EXISTS` 更稳妥

### 4.3 JSONB 的边界

适合 JSONB：

- 模型调用原始元数据。
- Tool 输入输出快照。
- 变化频繁、无需强关系约束的附加属性。

不适合 JSONB：

- 经常 JOIN、排序或作为唯一业务键的字段。
- 必须有外键、精确类型或复杂约束的核心数据。
- 只是为了逃避数据建模。

```sql
CREATE INDEX ix_message_metadata_gin
ON agent.message USING gin (metadata jsonb_path_ops);

SELECT id
FROM agent.message
WHERE metadata @> '{"channel":"web"}'::jsonb;
```

---

## 五、以 Agent 会话为例设计生产表

先把业务不变量写出来：

- 会话属于一个用户。
- 同一会话中的 `client_message_id` 唯一，用于请求幂等。
- 消息角色只能是指定集合。
- 消息创建后保留稳定排序键。
- Tool 调用必须能关联一次运行和一条消息。

```sql
CREATE SCHEMA IF NOT EXISTS agent;

CREATE TABLE agent.conversation (
    id uuid PRIMARY KEY,
    user_id bigint NOT NULL,
    title text,
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'archived')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agent.message (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conversation_id uuid NOT NULL
        REFERENCES agent.conversation(id) ON DELETE CASCADE,
    client_message_id uuid,
    role text NOT NULL
        CHECK (role IN ('system', 'user', 'assistant', 'tool')),
    status text NOT NULL DEFAULT 'completed'
        CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    content text NOT NULL DEFAULT '',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    CHECK (completed_at IS NULL OR completed_at >= created_at)
);

CREATE UNIQUE INDEX uq_message_client_id
ON agent.message (conversation_id, client_message_id)
WHERE client_message_id IS NOT NULL;

CREATE INDEX ix_message_conversation_order
ON agent.message (conversation_id, created_at DESC, id DESC)
INCLUDE (role, status);
```

设计审查问题：

1. 哪些规则只写在应用里，哪些必须由数据库兜底？
2. 删除会话时消息真的应该级联删除吗，还是需要软删除/审计？
3. `user_id` 是否应引用本库用户表？如果用户来自外部身份系统，边界是什么？
4. 时间相同如何稳定分页？这里使用 `created_at + id`。
5. JSONB 中哪些字段已经稳定到值得提升为普通列？

---

## 六、SQL 从熟练到精通

### 6.1 查询执行的逻辑顺序

理解逻辑顺序有助于解释别名作用域和聚合：

```text
FROM / JOIN
→ WHERE
→ GROUP BY
→ HAVING
→ SELECT
→ DISTINCT
→ ORDER BY
→ LIMIT / OFFSET
```

数据库优化器可以改变物理执行方式，但不能改变查询语义。

### 6.2 JOIN

- `INNER JOIN`：只保留匹配行。
- `LEFT JOIN`：保留左侧全部行。
- `FULL JOIN`：保留两侧未匹配行，业务代码中相对少见。
- `CROSS JOIN`：笛卡尔积，必须明确预期规模。
- `EXISTS`：判断是否存在，通常比“JOIN 后 DISTINCT”更准确地表达半连接。

```sql
SELECT c.id, c.title
FROM agent.conversation AS c
WHERE c.user_id = $1
  AND EXISTS (
      SELECT 1
      FROM agent.message AS m
      WHERE m.conversation_id = c.id
        AND m.status = 'failed'
  );
```

### 6.3 窗口函数

窗口函数不会像 `GROUP BY` 那样把多行压成一行：

```sql
SELECT
    conversation_id,
    id,
    role,
    created_at,
    row_number() OVER (
        PARTITION BY conversation_id
        ORDER BY created_at DESC, id DESC
    ) AS rn,
    count(*) OVER (PARTITION BY conversation_id) AS message_count
FROM agent.message;
```

必须掌握：`row_number`、`rank`、`lag`、`lead`、移动窗口和累计聚合。

### 6.4 CTE 与递归查询

CTE 适合拆分复杂查询和表达递归。不要假设 CTE 天生更快；现代 PostgreSQL 可能内联普通
CTE，也可以用 `MATERIALIZED` / `NOT MATERIALIZED` 明确控制部分行为。

```sql
WITH recent AS (
    SELECT *
    FROM agent.message
    WHERE conversation_id = $1
    ORDER BY created_at DESC, id DESC
    LIMIT 100
)
SELECT * FROM recent ORDER BY created_at, id;
```

### 6.5 `LATERAL`

`LATERAL` 允许右侧子查询引用左侧当前行，适合“每个会话取最近 N 条消息”：

```sql
SELECT c.id, latest.id AS latest_message_id, latest.content
FROM agent.conversation AS c
LEFT JOIN LATERAL (
    SELECT m.id, m.content
    FROM agent.message AS m
    WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 1
) AS latest ON true
WHERE c.user_id = $1;
```

### 6.6 `RETURNING` 与 Upsert

```sql
INSERT INTO agent.conversation (id, user_id, title)
VALUES ($1, $2, $3)
RETURNING id, created_at;
```

```sql
INSERT INTO agent.message (
    conversation_id, client_message_id, role, content
)
VALUES ($1, $2, 'user', $3)
ON CONFLICT (conversation_id, client_message_id)
WHERE client_message_id IS NOT NULL
DO NOTHING
RETURNING id;
```

Upsert 不是所有并发规则的万能替代品。先确定冲突键、更新语义和重试行为。

### 6.7 Keyset 分页

深页 `OFFSET` 会扫描并丢弃前面的行，并且并发插入时结果可能漂移。大数据集优先游标分页：

```sql
SELECT id, role, content, created_at
FROM agent.message
WHERE conversation_id = $1
  AND (created_at, id) < ($2, $3)
ORDER BY created_at DESC, id DESC
LIMIT 100;
```

索引顺序必须与过滤和排序匹配。

### 6.8 全文检索

PostgreSQL 原生全文检索使用 `tsvector`、`tsquery` 和 GIN/GiST 索引。不要用
`LIKE '%keyword%'` 代替大规模全文检索，也不要假设默认分词适合中文。

```sql
ALTER TABLE agent.message
ADD COLUMN search_vector tsvector
GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;

CREATE INDEX ix_message_search
ON agent.message USING gin (search_vector);

SELECT id, content
FROM agent.message
WHERE search_vector @@ plainto_tsquery('simple', $1)
ORDER BY ts_rank(search_vector, plainto_tsquery('simple', $1)) DESC
LIMIT 50;
```

中文搜索需要经过验证的 Parser/扩展或专用搜索服务，并明确词典、召回、排序和高亮要求。

### 6.9 View 与 Materialized View

- View 保存查询定义，不保存结果。
- Materialized View 保存结果，读取快但需要 `REFRESH`。
- `REFRESH MATERIALIZED VIEW CONCURRENTLY` 需要合适的唯一索引，并有额外资源成本。
- 报表可使用物化视图，但实时交易规则不能读取过期快照后假装强一致。

---

## 七、索引设计

### 7.1 索引类型

| 类型    | 典型用途                                       |
| ------- | ---------------------------------------------- |
| B-tree  | 等值、范围、排序、前缀匹配；默认选择           |
| Hash    | 纯等值；通常先比较 B-tree                      |
| GIN     | JSONB、数组、全文检索，多值倒排                |
| GiST    | 范围、几何、最近邻、排斥约束                   |
| SP-GiST | 非平衡空间分区，如 trie、四叉树等特定操作类    |
| BRIN    | 超大且与物理顺序高度相关的时间/ID 列，索引很小 |

### 7.2 联合索引

索引不是“把所有 WHERE 字段都塞进去”。设计时依次回答：

1. 查询最先按什么等值过滤？
2. 后续有没有范围条件？
3. 是否需要匹配 `ORDER BY`？
4. 返回列能否用 `INCLUDE` 覆盖，但又不参与查找？
5. 选择性和数据分布如何？
6. 这个索引会增加多少写放大和存储？

```sql
CREATE INDEX ix_message_lookup
ON agent.message (conversation_id, status, created_at DESC, id DESC)
INCLUDE (role);
```

不要机械套用“最左前缀”口号。应查看当前版本对多列索引、Skip Scan 和统计信息的真实计划。

### 7.3 部分索引

只为常查子集建索引：

```sql
CREATE INDEX ix_pending_message
ON agent.message (created_at, id)
WHERE status = 'pending';
```

查询条件必须能让优化器证明符合索引谓词。参数化和复杂等价表达式可能影响匹配。

### 7.4 表达式索引

```sql
CREATE UNIQUE INDEX uq_conversation_title_per_user
ON agent.conversation (user_id, lower(title))
WHERE title IS NOT NULL;
```

表达式索引解决的是稳定查询模式。若表达式昂贵或写入频繁，要评估写成本。

### 7.5 在线创建索引

生产大表通常使用：

```sql
CREATE INDEX CONCURRENTLY ix_name ON agent.message (created_at);
```

注意：

- `CONCURRENTLY` 用更少的写阻塞换取更长时间和更多工作。
- 不能在普通事务块中执行。
- 失败可能留下 `INVALID` 索引，需要检查并处理。
- 删除生产索引也应评估 `DROP INDEX CONCURRENTLY`。
- Alembic 迁移需要为这类语句设置 autocommit 边界。

### 7.6 索引不是越多越好

每个索引都会增加：

- INSERT/UPDATE/DELETE 成本。
- WAL 量、复制流量和备份体积。
- Autovacuum 与维护负担。
- 缓存压力。

定期结合 `pg_stat_user_indexes`、业务周期和执行计划审查低使用率、重复和重叠索引。
“扫描次数为零”不能单独证明索引可删，可能只是统计重置或尚未经历关键周期。

---

## 八、读懂执行计划

### 8.1 安全使用

```sql
EXPLAIN (ANALYZE, BUFFERS, WAL, VERBOSE, SETTINGS, FORMAT TEXT)
SELECT ...;
```

`ANALYZE` 会真正执行语句。对 `UPDATE`、`DELETE`、`INSERT` 或调用有副作用的函数时，
必须在安全环境运行，或在明确可回滚的事务中测试。

### 8.2 先看这六件事

1. 实际总耗时和返回行数。
2. 每个节点的 `estimated rows` 与 `actual rows` 差距。
3. `loops`，真实工作量约等于单次工作乘循环次数。
4. `Rows Removed by Filter` 是否巨大。
5. Shared read/hit、临时读写和 WAL 量。
6. 最耗时节点，以及时间是否花在数据库之外的结果传输。

### 8.3 常见节点

- `Seq Scan`：不一定坏；读取表的大部分数据时可能最优。
- `Index Scan`：按索引定位后回表。
- `Index Only Scan`：仍可能因可见性映射不足而发生 Heap Fetches。
- `Bitmap Index/Heap Scan`：先聚合行位置，再按页访问。
- `Nested Loop`：小外表 + 高效内表查找很好，估算错时可能爆炸。
- `Hash Join`：等值 JOIN 常见；关注哈希表是否分批并落盘。
- `Merge Join`：两侧有序时有效。
- `Sort`：关注排序方法、内存和磁盘溢出。
- `Memoize`：缓存参数化子计划结果，适合重复键。

### 8.4 估算错误优先查统计信息

```sql
ANALYZE agent.message;

SELECT attname, n_distinct, most_common_vals, histogram_bounds
FROM pg_stats
WHERE schemaname = 'agent' AND tablename = 'message';
```

当多列高度相关时，单列统计可能误判：

```sql
CREATE STATISTICS st_message_conversation_status
(dependencies, ndistinct, mcv)
ON conversation_id, status
FROM agent.message;

ANALYZE agent.message;
```

优化顺序通常是：确认语义 → 收集基线 → 看计划 → 修正统计/SQL/索引 → 再测。不要第一步就调全局成本参数。

---

## 九、事务、隔离和锁

### 9.1 隔离级别

| 隔离级别        | PostgreSQL 关键行为                    |
| --------------- | -------------------------------------- |
| Read Committed  | 默认；每条语句取得新快照               |
| Repeatable Read | 事务内稳定快照；可能出现序列化失败     |
| Serializable    | 提供可序列化语义；冲突时必须整事务重试 |

PostgreSQL 的 `Read Uncommitted` 实际按 `Read Committed` 处理。

应用收到 SQLSTATE `40001`（serialization_failure）或合适场景下的 `40P01`
（deadlock_detected）时，应回滚并从事务开头有限重试，配合退避与日志；不能只重跑最后一条 SQL。

### 9.2 行级锁

```sql
SELECT *
FROM agent.message
WHERE id = $1
FOR UPDATE;
```

还需理解：`FOR NO KEY UPDATE`、`FOR SHARE`、`FOR KEY SHARE`。选择最弱且足够的锁，缩短事务，
不要在持锁期间调用模型或慢外部 API。

### 9.3 任务队列与 `SKIP LOCKED`

```sql
WITH picked AS (
    SELECT id
    FROM agent.message
    WHERE status = 'pending'
    ORDER BY created_at, id
    FOR UPDATE SKIP LOCKED
    LIMIT 10
)
UPDATE agent.message AS m
SET status = 'completed', completed_at = now()
FROM picked
WHERE m.id = picked.id
RETURNING m.*;
```

这适合多个 Worker 竞争任务，但不是通用读取一致性方案。还要处理租约、Worker 崩溃、重试次数和毒消息。

### 9.4 死锁

数据库会检测死锁并终止其中一个事务。预防原则：

- 所有代码按相同顺序锁定资源。
- 一次事务只做必要工作。
- 批量操作按稳定主键排序。
- 设置合理 `lock_timeout` 和 `statement_timeout`。
- 记录 SQLSTATE、事务标识和锁等待上下文。

### 9.5 Advisory Lock

Advisory Lock 是应用自定义的协作锁。适合无法自然映射到单行的资源，例如“同一会话只允许一个迁移任务”。
它不替代唯一约束和行锁；所有参与者必须遵循同一协议，并谨慎选择 session 级还是 transaction 级锁。

### 9.6 幂等必须由约束兜底

“先查再插”存在竞态：两个事务都可能查不到。正确做法是唯一约束 + 冲突处理：

```sql
INSERT INTO agent.message (...)
VALUES (...)
ON CONFLICT (...) DO NOTHING
RETURNING id;
```

应用再根据是否返回行决定创建成功还是读取已有记录。

---

## 十、VACUUM、膨胀与可见性

### 10.1 VACUUM 的职责

- 回收可复用的死元组空间。
- 维护可见性映射，帮助 Index Only Scan。
- 防止事务 ID 和 MultiXact ID 回卷风险。
- `ANALYZE` 维护优化器统计；它与 VACUUM 相关但职责不同。

### 10.2 监控死元组和维护状态

```sql
SELECT
    schemaname,
    relname,
    n_live_tup,
    n_dead_tup,
    last_autovacuum,
    last_autoanalyze,
    autovacuum_count,
    autoanalyze_count
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC;
```

```sql
SELECT * FROM pg_stat_progress_vacuum;
```

### 10.3 常见根因

- 长事务或 `idle in transaction` 阻止清理。
- 高频更新表使用默认 scale factor，触发太晚。
- Autovacuum Worker、I/O 或维护内存不足。
- 大批量删除制造突发死元组。
- 频繁更新被索引覆盖的列，无法利用 HOT Update。
- 复制槽或副本长期滞后导致 WAL 积压，这是另一类磁盘压力。

先修根因，再考虑 `VACUUM FULL`、`CLUSTER` 或在线重写工具。强制重写表会带来锁、额外磁盘和 WAL 成本。

---

## 十一、分区表

### 11.1 何时考虑分区

- 表已经非常大，且查询通常包含稳定分区键。
- 需要按时间快速归档/删除整批数据。
- 单表 VACUUM、索引维护或数据生命周期难以控制。
- 冷热数据有清晰边界。

“行数很多”本身不是充分理由。普通索引、正确 SQL 和维护通常更简单。

### 11.2 范围分区示例

```sql
CREATE TABLE agent.run_event (
    id bigint GENERATED ALWAYS AS IDENTITY,
    run_id uuid NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL,
    PRIMARY KEY (created_at, id)
) PARTITION BY RANGE (created_at);

CREATE TABLE agent.run_event_2026_08
PARTITION OF agent.run_event
FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
```

生产必须处理：

- 提前创建未来分区和默认分区告警。
- 查询必须带可裁剪的分区条件。
- 主键/唯一约束通常需要包含分区键。
- 每个分区的索引和权限一致性。
- 分区数量不能无限增长。
- Attach/Detach、归档、备份和恢复流程。

---

## 十二、WAL、检查点与持久性

### 12.1 WAL

WAL 让 PostgreSQL 在数据页落盘前先记录重做信息，用于：

- 崩溃恢复。
- 物理流复制。
- 连续归档和时间点恢复（PITR）。
- 逻辑解码的变更来源。

### 12.2 不要随意牺牲持久性

`fsync`、`full_page_writes`、`synchronous_commit` 等设置直接影响数据安全。
没有明确业务容忍度、故障模型和恢复测试，不要为了压测数字关闭安全保证。

### 12.3 Checkpoint 过密的信号

- 写延迟周期性抖动。
- WAL 生成速度异常高。
- 日志频繁提示 checkpoint。
- `pg_stat_checkpointer`、`pg_stat_wal` 的指标异常。

调优需要联合考虑 `max_wal_size`、`checkpoint_timeout`、`checkpoint_completion_target`、磁盘能力和恢复时间，不能只改一个参数。

---

## 十三、备份、恢复与高可用

### 13.1 三类备份

| 方式         | 工具/机制                             | 适用场景                              |
| ------------ | ------------------------------------- | ------------------------------------- |
| 逻辑备份     | `pg_dump`、`pg_restore`、`pg_dumpall` | 单库/单表迁移、跨版本恢复、可选择对象 |
| 物理基础备份 | `pg_basebackup` 或备份系统            | 整个实例、快速恢复、复制初始化        |
| WAL 连续归档 | `archive_command` 等                  | PITR，恢复到指定时间/LSN              |

只有“备份成功”日志不够，必须定期恢复到隔离环境并验证数据、权限、扩展和业务查询。

### 13.2 RPO 与 RTO

- RPO：最多能丢多少数据。
- RTO：故障后多久恢复服务。

先由业务给出 RPO/RTO，才能选择备份频率、同步/异步复制、跨可用区和故障切换方案。

### 13.3 物理流复制

- Primary 通过 WAL Sender 发送 WAL。
- Standby 的 WAL Receiver 接收并重放。
- 异步复制延迟小但主库故障时可能丢最近事务。
- 同步复制可降低数据丢失，但会把副本延迟传播到提交延迟。
- Hot Standby 可读，但长查询可能与恢复冲突。

### 13.4 复制槽

复制槽能防止主库过早删除消费者仍需要的 WAL，但失联消费者可能让 WAL 无限堆积直至磁盘耗尽。
必须监控槽状态、滞后字节和消费者心跳，并设置处置流程。

### 13.5 逻辑复制

适合按表发布订阅、部分数据迁移和低停机升级，但要理解：

- DDL 通常不会自动复制。
- Sequence 状态需要单独处理。
- 表需要合适 Replica Identity。
- 冲突、初始同步、复制槽和版本兼容必须演练。

### 13.6 高可用不是“有副本”

完整 HA 还需要：

- 故障检测与仲裁。
- 自动或人工提升策略。
- 防止脑裂。
- 客户端发现新主库。
- 旧主库重新加入流程。
- 定期切换演练和回切方案。

---

## 十四、安全

### 14.1 最小权限角色

```sql
CREATE ROLE agent_owner NOLOGIN;
CREATE ROLE agent_app LOGIN PASSWORD 'replace-at-runtime';
CREATE ROLE agent_readonly LOGIN PASSWORD 'replace-at-runtime';

ALTER SCHEMA agent OWNER TO agent_owner;
GRANT USAGE ON SCHEMA agent TO agent_app, agent_readonly;
GRANT SELECT, INSERT, UPDATE, DELETE
ON ALL TABLES IN SCHEMA agent TO agent_app;
GRANT SELECT ON ALL TABLES IN SCHEMA agent TO agent_readonly;
```

还要设置 `ALTER DEFAULT PRIVILEGES`，否则未来新表不一定继承预期权限。应用账号不应是 Superuser，也不应拥有建库、建角色或绕过 RLS 的能力。

### 14.2 认证与传输

- 使用 `pg_hba.conf` 精确限制来源、数据库、角色和认证方式。
- 优先 SCRAM，不继续新增 MD5 密码认证。
- 跨不可信网络使用 TLS，并让客户端验证服务端身份。
- 密码、证书和连接串来自 Secret 管理系统，不写日志和仓库。
- 网络边界、安全组和数据库权限要同时存在。

### 14.3 SQL 注入

值必须参数化：

```python
await session.execute(
    select(Message).where(Message.conversation_id == conversation_id)
)
```

表名、列名和排序方向通常不能作为普通值参数绑定。动态标识符必须来自代码内白名单，不能直接接受用户或模型文本。

### 14.4 Row-Level Security

RLS 可以按当前角色或会话上下文限制行：

```sql
ALTER TABLE agent.conversation ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversation_tenant_policy
ON agent.conversation
USING (user_id = current_setting('app.user_id', true)::bigint);
```

注意表所有者、Superuser 和 `BYPASSRLS` 可能绕过策略；连接池复用时必须在事务边界正确设置和清理上下文。
RLS 是纵深防御，不代替应用鉴权测试。

---

## 十五、监控与排障 SQL

### 15.1 当前连接与慢事务

```sql
SELECT
    pid,
    usename,
    application_name,
    client_addr,
    state,
    wait_event_type,
    wait_event,
    xact_start,
    query_start,
    now() - xact_start AS xact_age,
    now() - query_start AS query_age,
    left(query, 500) AS query
FROM pg_stat_activity
WHERE pid <> pg_backend_pid()
ORDER BY xact_start NULLS LAST, query_start;
```

重点关注 `idle in transaction`，它既占连接又可能阻止 VACUUM。

### 15.2 谁阻塞了谁

```sql
SELECT
    blocked.pid AS blocked_pid,
    blocked.query AS blocked_query,
    blocker.pid AS blocker_pid,
    blocker.query AS blocker_query,
    blocker.xact_start AS blocker_xact_start
FROM pg_stat_activity AS blocked
CROSS JOIN LATERAL unnest(pg_blocking_pids(blocked.pid)) AS b(blocker_pid)
JOIN pg_stat_activity AS blocker ON blocker.pid = b.blocker_pid;
```

终止会话是有副作用的生产操作。先确认业务影响、事务内容和负责人，再选择
`pg_cancel_backend` 或 `pg_terminate_backend`。

### 15.3 表和索引

```sql
SELECT
    relname,
    seq_scan,
    idx_scan,
    n_live_tup,
    n_dead_tup,
    last_autovacuum,
    last_autoanalyze
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;
```

```sql
SELECT
    schemaname,
    relname,
    indexrelname,
    idx_scan,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
ORDER BY pg_relation_size(indexrelid) DESC;
```

### 15.4 容量

```sql
SELECT pg_size_pretty(pg_database_size(current_database()));

SELECT
    relname,
    pg_size_pretty(pg_total_relation_size(relid)) AS total,
    pg_size_pretty(pg_relation_size(relid)) AS heap,
    pg_size_pretty(pg_indexes_size(relid)) AS indexes
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
```

### 15.5 `pg_stat_statements`

启用扩展后按归一化查询聚合调用次数、总耗时、平均耗时、返回行数和 I/O：

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

SELECT
    queryid,
    calls,
    total_exec_time,
    mean_exec_time,
    rows,
    left(query, 500) AS query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;
```

它可能包含业务 SQL 片段，访问权限、日志和监控平台都要按敏感数据管理。

### 15.6 核心告警

- 连接使用率与连接池等待。
- P95/P99 查询和事务延迟。
- 锁等待、死锁和序列化失败率。
- 长事务、`idle in transaction`。
- 数据库、表、索引和 WAL 磁盘增长。
- Autovacuum 延迟、死元组和回卷年龄。
- Checkpoint、WAL、临时文件和 I/O。
- 复制延迟、复制槽滞后、归档失败。
- 备份新鲜度与最近恢复演练结果。

---

## 十六、配置与连接池

### 16.1 连接不是越多越好

PostgreSQL 连接有进程和内存成本。应用实例数、每实例 Pool Size、Overflow、后台任务和 DBA 连接之和必须小于服务端可用连接，并预留应急空间。

```text
总潜在应用连接
= 应用实例数 × (pool_size + max_overflow)
+ Worker/任务连接
+ 迁移和运维连接
```

大量短连接或 Serverless 场景可评估 PgBouncer，但必须理解 session/transaction pooling 对 prepared statement、临时表、LISTEN/NOTIFY 和会话设置的影响。

### 16.2 必设超时

按业务配置，而不是全局复制固定数字：

- `connect_timeout`
- `statement_timeout`
- `lock_timeout`
- `idle_in_transaction_session_timeout`
- 应用请求超时和连接池等待超时

外层超时必须能取消数据库工作，不能只让 HTTP 客户端先放弃而 SQL 继续运行。

### 16.3 常见内存参数

- `shared_buffers`：数据库共享缓存，不等于全部可用内存。
- `work_mem`：可能由一条查询的多个节点、多个并发会话分别使用，不能简单按连接只算一次。
- `maintenance_work_mem`：索引创建、VACUUM 等维护工作。
- `effective_cache_size`：优化器对可用缓存规模的估计，不是预分配内存。

参数必须基于实例内存、并发、查询计划和压测调整。托管数据库还要遵守平台参数限制。

---

## 十七、SQLAlchemy 2.x 异步接入

### 17.1 驱动选择

常见选择：

```bash
# Psycopg 3，同一驱动支持现代同步/异步用法
uv add 'sqlalchemy[asyncio]' 'psycopg[binary,pool]' alembic

# 或 asyncpg
uv add 'sqlalchemy[asyncio]' asyncpg alembic
```

连接 URL 示例：

```text
postgresql+psycopg://user:password@host:5432/dbname
postgresql+asyncpg://user:password@host:5432/dbname
```

驱动和 SQLAlchemy 版本要锁定并在目标 Python 版本上测试。

### 17.2 Engine 与 Session Factory

```python
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

engine = create_async_engine(
    settings.database_url,
    pool_size=10,
    max_overflow=5,
    pool_timeout=5,
    pool_recycle=1800,
    pool_pre_ping=True,
)

session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)
```

不要照抄连接池数字。先用“实例数 × 池上限”核算服务端连接预算。

### 17.3 请求级事务

```python
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession


async def get_session() -> AsyncIterator[AsyncSession]:
    async with session_factory() as session:
        yield session
```

业务操作明确事务边界：

```python
async with session_factory() as session:
    async with session.begin():
        session.add(message)
```

一个 `AsyncSession` 是有状态事务对象，不能在多个并发 Task 之间共享。并发任务必须各自持有 Session。

### 17.4 PostgreSQL 模型

```python
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Message(Base):
    __tablename__ = "message"
    __table_args__ = (
        Index(
            "ix_message_conversation_order",
            "conversation_id",
            "created_at",
            "id",
        ),
        {"schema": "agent"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    conversation_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("agent.conversation.id", ondelete="CASCADE"),
    )
    client_message_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        nullable=True,
    )
    role: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text, default="")
    metadata_: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
```

数据库默认值与 Python 默认值职责不同。涉及审计、一致时间和多客户端写入时，优先让数据库提供最终默认值。

### 17.5 SQLAlchemy Upsert

```python
from sqlalchemy.dialects.postgresql import insert

stmt = (
    insert(Message)
    .values(
        conversation_id=conversation_id,
        client_message_id=client_message_id,
        role="user",
        content=content,
    )
    .on_conflict_do_nothing(
        index_elements=[Message.conversation_id, Message.client_message_id],
        index_where=Message.client_message_id.is_not(None),
    )
    .returning(Message.id)
)

message_id = await session.scalar(stmt)
```

若数据库使用部分唯一索引，冲突目标还要与索引谓词一致。必须查看生成 SQL 并写真实 PostgreSQL 集成测试。

### 17.6 避免异步隐式 I/O

- 不在序列化响应时意外触发 Lazy Load。
- 根据返回结构选择 `selectinload`、`joinedload` 或显式查询。
- 限制集合大小，不加载完整会话历史。
- Repository 返回业务需要的数据，不泄露全局 Session。
- 每条关键查询记录耗时、行数和稳定查询标识，避免记录敏感参数。

---

## 十八、Alembic 与零停机迁移

### 18.1 Expand → Migrate → Contract

例：把 `content` 拆成 `content_text`。

1. Expand：新增可空列，不破坏旧代码。
2. 发布双写或兼容读代码。
3. Migrate：小批量回填，监控锁、WAL 和复制延迟。
4. 验证新旧数据一致。
5. 切换只读新列。
6. Contract：观察期后再删旧列和兼容代码。

不要在一个迁移里直接“加非空列 + 全表默认值 + 回填 + 删除旧列”。

### 18.2 降低加约束风险

```sql
ALTER TABLE agent.message
ADD CONSTRAINT ck_message_content
CHECK (length(content) <= 100000)
NOT VALID;

ALTER TABLE agent.message
VALIDATE CONSTRAINT ck_message_content;
```

先让新写入受约束，再以更可控方式校验历史数据。

### 18.3 迁移检查清单

- 语句需要什么锁，最长会等待多久？
- 表和索引大小是多少？
- 是否会重写整表？
- 会产生多少 WAL 和副本延迟？
- Alembic 事务模式是否适合 `CONCURRENTLY`？
- 新旧应用版本能否同时工作？
- 回滚是撤销 Schema，还是回滚应用并保留兼容 Schema？
- 是否在生产数据量副本上演练？

---

## 十九、PostgreSQL 与 MySQL 的关键差异

| 主题       | PostgreSQL                  | MySQL 迁移时要确认                |
| ---------- | --------------------------- | --------------------------------- |
| 默认隔离   | Read Committed              | InnoDB 常见默认是 Repeatable Read |
| MVCC 清理  | 依赖 VACUUM/autovacuum      | Undo/Purge 机制不同               |
| 自增       | Identity/Sequence           | `AUTO_INCREMENT`                  |
| Upsert     | `ON CONFLICT`               | `ON DUPLICATE KEY UPDATE`         |
| JSON       | `json` / `jsonb`，GIN 等    | JSON 函数和索引方式不同           |
| 大小写     | 未加引号标识符折叠为小写    | 行为受系统和配置影响              |
| 布尔       | 原生 `boolean`              | 常见映射为整数语义                |
| 时间       | `timestamptz` 语义明确      | 类型与时区行为需逐项核对          |
| 分页       | `LIMIT/OFFSET`、Keyset      | 语法相近，计划和索引不同          |
| 在线索引   | `CREATE INDEX CONCURRENTLY` | Online DDL 选项不同               |
| 锁和错误码 | PostgreSQL SQLSTATE/锁模型  | 死锁、间隙锁等行为不同            |
| 全文检索   | `tsvector`/`tsquery`        | Parser、索引和语法不同            |

不能只把 SQLAlchemy URL 从 MySQL 改成 PostgreSQL。必须逐项审查类型、默认值、排序规则、唯一约束、JSON、时间、事务、锁、原生 SQL 和迁移脚本。

---

## 二十、生产故障处理手册

### 20.1 连接耗尽

1. 查看 `pg_stat_activity` 的来源、状态和事务年龄。
2. 区分流量增长、连接泄漏、慢 SQL、`idle in transaction` 和池配置错误。
3. 保护 DBA 预留连接。
4. 先限制新流量或修复泄漏，不要只提高 `max_connections`。
5. 核对所有应用实例池上限和扩容后的乘数效应。

### 20.2 突发慢 SQL

1. 保存查询标识、参数分布、计划和系统指标。
2. 检查锁等待，而不只是 CPU。
3. 对比估算行数和实际行数。
4. 检查统计信息、数据倾斜、计划变化、缓存和临时文件。
5. 在副本/测试环境验证修复，再安全上线。

### 20.3 磁盘快速增长

1. 分解数据、索引、临时文件、WAL 和日志占用。
2. 检查复制槽、归档失败、副本滞后和长事务。
3. 检查表/索引膨胀与批量写入。
4. 先阻止继续增长，保留恢复空间。
5. 不在磁盘将满时贸然执行需要双倍空间的表重写。

### 20.4 锁风暴

1. 用 `pg_blocking_pids` 找阻塞链根节点。
2. 确认根事务业务含义、开始时间和是否仍在工作。
3. 评估取消查询还是终止连接。
4. 记录证据后处置，并验证回滚完成。
5. 修复事务边界、锁顺序、超时和发布脚本。

### 20.5 副本延迟

1. 区分网络发送、接收、写入、刷盘和重放延迟。
2. 检查主库 WAL 生成突增和副本 I/O/CPU。
3. 检查 Hot Standby 长查询冲突。
4. 确认复制槽不会拖垮主库磁盘。
5. 根据 RPO/RTO 决定是否允许读取旧数据或执行切换。

---

## 二十一、分阶段练习

### 阶段 A：SQL 与建模

1. 创建 `conversation`、`message`、`tool_call` 三张表。
2. 用约束实现角色、状态、幂等和时间规则。
3. 写出最近 100 条消息的稳定 Keyset 分页。
4. 用窗口函数统计每个会话最近一次失败及消息数。
5. 写一个 `LATERAL` 查询获取每个会话的最后一条消息。

### 阶段 B：索引与性能

1. 生成至少 100 万条可重复测试数据。
2. 为五条真实查询记录无索引基线。
3. 设计 B-tree、部分索引和 GIN 索引。
4. 比较估算行数、实际行数、Buffer 和临时文件。
5. 删除一个无效索引并证明写入成本下降且查询不回退。

### 阶段 C：并发与事务

1. 两个并发事务重复写入同一 `client_message_id`，证明只生成一条消息。
2. 制造死锁，捕获 `40P01`，实现有限事务重试。
3. 用 `SKIP LOCKED` 实现多 Worker 抢任务。
4. 比较 Read Committed、Repeatable Read 和 Serializable 的可见结果。
5. 证明 AsyncSession 不能由 `asyncio.gather()` 中多个任务共享。

### 阶段 D：运维与恢复

1. 制造长事务，观察死元组清理受阻。
2. 使用 `pg_dump` 备份并恢复到新数据库。
3. 建立基础备份 + WAL 归档，在实验环境完成 PITR。
4. 配置流复制，观察写、刷盘、重放 LSN 差异。
5. 模拟连接耗尽、锁等待、磁盘增长和副本延迟，写事故报告。

### 阶段 E：Python 项目接入

1. 使用 SQLAlchemy 2.x 建模并生成 Alembic 初始迁移。
2. 实现请求级 AsyncSession 和 Repository。
3. 为幂等写、事务回滚、分页和并发写建立 PostgreSQL 集成测试。
4. 在 CI 中启动固定版本 PostgreSQL，测试失败时不允许部署。
5. 为连接池、SQL 超时和数据库健康检查增加可观测性。

---

## 二十二、自测题

1. 为什么 PostgreSQL 需要 VACUUM？普通 VACUUM 为什么通常不会缩小表文件？
2. Read Committed 为什么可能让同一事务中的两条查询看到不同已提交数据？
3. Serializable 失败后为什么必须重跑整个事务？
4. 唯一约束如何解决“先查再插”的竞态？
5. Seq Scan 什么时候比 Index Scan 更合理？
6. `estimated rows` 和 `actual rows` 差几个数量级时先查什么？
7. GIN、GiST 和 BRIN 分别适合什么数据？
8. `work_mem` 为什么不能简单设置成“总内存 ÷ 最大连接数”？
9. 长事务为什么会导致表膨胀？
10. 复制槽为什么既有用又危险？
11. `CREATE INDEX CONCURRENTLY` 有哪些限制和失败状态？
12. 为什么连接池大小必须乘以应用实例数？
13. RLS 在连接池环境中最容易犯什么错误？
14. `pg_dump`、物理基础备份和 WAL 归档分别解决什么问题？
15. 为什么有只读副本不等于实现高可用？
16. AsyncSession 为什么不能跨并发 Task 共享？
17. MySQL 迁移到 PostgreSQL 时，哪些行为不能只靠 ORM 屏蔽？

能独立回答、实验复现并解释失败案例，才算真正掌握。

---

## 二十三、验收标准

### 入门

- 能建表、写 JOIN/聚合/事务和基本索引。
- 不拼接 SQL，不混淆 `NULL`。
- 能使用 `psql` 和逻辑备份恢复。

### 熟练

- 能设计约束、Upsert、Keyset 分页和复杂查询。
- 能阅读基础执行计划并修复明显慢查询。
- 能正确使用 SQLAlchemy AsyncSession 和 Alembic。

### 高级

- 能处理估算偏差、锁等待、死锁、膨胀、连接池和 Autovacuum。
- 能设计分区、在线索引和兼容性迁移。
- 能建立监控、告警、备份、PITR 和复制。

### 精通

- 能基于证据完成容量规划、性能优化和事故处置。
- 能把 RPO/RTO 转化为可验证的备份与 HA 架构。
- 能审查安全、并发和数据一致性边界。
- 能在生产数据规模副本上演练升级、迁移、故障切换和回滚。
- 能解释每个关键设计的代价，而不是只给出“最佳实践”口号。

---

## 二十四、权威参考

优先阅读与你实际版本一致的官方文档：

- [PostgreSQL 18 官方文档](https://www.postgresql.org/docs/18/)
- [数据类型](https://www.postgresql.org/docs/current/datatype.html)
- [索引](https://www.postgresql.org/docs/current/indexes.html)
- [并发控制与 MVCC](https://www.postgresql.org/docs/current/mvcc.html)
- [使用 EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html)
- [查询规划器统计信息](https://www.postgresql.org/docs/current/planner-stats.html)
- [日常 VACUUM](https://www.postgresql.org/docs/current/routine-vacuuming.html)
- [表分区](https://www.postgresql.org/docs/current/ddl-partitioning.html)
- [客户端认证](https://www.postgresql.org/docs/current/client-authentication.html)
- [Row Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [备份与恢复](https://www.postgresql.org/docs/current/backup.html)
- [高可用、负载均衡与复制](https://www.postgresql.org/docs/current/high-availability.html)
- [监控数据库活动](https://www.postgresql.org/docs/current/monitoring.html)
- [SQLAlchemy PostgreSQL Dialect](https://docs.sqlalchemy.org/en/20/dialects/postgresql.html)
- [SQLAlchemy AsyncIO](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html)

版本升级前必须阅读目标大版本 Release Notes，并在生产数据量副本上验证扩展、驱动、查询计划和迁移脚本。
