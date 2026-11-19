# 第 3 课 · 判断教材是否变化，再发布新版本

从本课起，将「数据库已写入片段」和「学生可以看这批片段」当作两件事。Milvus 保存片段。PostgreSQL 给每份教材记录一个当前发布指针 `active_build_id`。第一版增量以整份教材为单位，一份文件变更就重建这份文件的片段。

## 3.1 三种 ID 有什么区别

| 字段 | 同一教材改了几行之后 | 举例 |
| --- | --- | --- |
| `source_id` | 保持稳定 | `fractions-handout`，说明是同一份讲义。 |
| `revision` | 文件字节变了就会得到新的摘要，作为原件的版本标识 | SHA-256 的 64 位十六进制字符串。 |
| `build_id` | 每次独立建索引有自己的批次 ID，同一任务重试应沿用 | `b1`、`b2` 是手写教学值，应用可以用 `uuid4().hex`。 |
| `active_build_id` | 只有发布、回滚或下架时才变化 | `b2` 写入过程中保持指向 `b1`。 |

文件名、修改时间都可能变化。给同一来源的原件算 SHA-256，能判断字节是否相同。它也会受 PDF 元数据变化影响，所以改了 PDF 作者字段也可能得到新摘要。这个练习只判断字节与配置有没有变。 [Python hashlib](https://docs.python.org/3.13/library/hashlib.html) · [Python uuid](https://docs.python.org/3.13/library/uuid.html)

```python
import hashlib

old_bytes = "每份是六分之一。".encode("utf-8")
new_bytes = "每份是八分之一。".encode("utf-8")

print(hashlib.sha256(old_bytes).hexdigest())
print(hashlib.sha256(old_bytes).hexdigest())
print(hashlib.sha256(new_bytes).hexdigest())
```

**小练习。** 前两个摘要应相同。第三个会变。换成真实文件时使用 `hashlib.sha256(pdf_path.read_bytes()).hexdigest()`。正式入库应解析刚才算过摘要的同一份不可变文件，避免原件在检查之后被覆盖。

## 3.2 文件相同，为什么还要检查切分和模型

原件没变，改用另一个 embedding 模型，向量就可能不同。即使模型相同，`chunk_size` 从 256 改成 128，分段结果也会变。为了判断某次入库能否复用，把会影响索引的设置做成一份配置摘要。比如解析器和版本、课程映射、可公开页、切分参数、embedding 模型和版本。

```python
import hashlib
import json

index_config = {
    "published_pages": [1, 2],
    "chunk_size": 256,
    "chunk_overlap": 20,
    "embedding_model": "your-embedding-model",
}
config_bytes = json.dumps(index_config, sort_keys=True).encode("utf-8")
config_fingerprint = hashlib.sha256(config_bytes).hexdigest()
print(config_fingerprint)
```

`sort_keys=True` 让键顺序不同但内容相同的字典得到相同表示。练习用到了几个最小字段。正式版要记录固定模型版本、解析器版本和课程映射。比较的是**同一来源、最近接受的请求**。原件和配置相同，返回已有任务状态或重试失败任务；任一不同就安排新批次。历史版本重新上传可以作为新请求处理。 [Python json](https://docs.python.org/3/library/json.html)

## 3.3 给每条片段分配可重跑的主键

```python
build_id = "b2"
lesson_id = "fractions-addition"
chunk_number = 1
chunk_id = f"{build_id}:{lesson_id}:{chunk_number}"
print(chunk_id)
```

同一任务重试会得到 `b2:fractions-addition:1`，Milvus `upsert` 可写回这行。V1 的 `b1:fractions-addition:1` 仍然存在。要保证重试真的复用同一批数据，把要写入的片段 ID、来源字段和文本摘要存成清单，解析配置变了就生成新 `build_id`。 [Milvus Upsert 行为](https://milvus.io/docs/upsert-entities.md)

可以去看 `deal_pilot_rag` 如何给文档比较版本和执行 `aupsert`。它的同主键更新会覆盖原有切片，后面再做旧版本清理。你的练习用不同批次主键保留整版，最后切换学生的查询范围。 [参考项目的版本比较](/Users/yang/duyi/deal_pilot_rag/src/deal_pilot/graphs/feishu_doc_index/document_index/nodes.py:28) · [参考项目的写入节点](/Users/yang/duyi/deal_pilot_rag/src/deal_pilot/graphs/feishu_doc_index/document_index/nodes.py:121)

## 3.4 先读懂两张 PostgreSQL 表，再执行例子

[`publish_lab.sql`](publish_lab.sql) 用两张表演示目录。

- `edu_sources` 每份教材一行。`latest_request_seq` 是最新操作的顺序号，`active_build_id` 指向上线批次，可以为 `NULL`。
- `edu_versions` 每个构建批次一行。`source_id` 是所属教材，`request_seq` 记录这批任务的顺序，`revision` 与 `config_fingerprint` 用于比较。`ready` 表示写入已核对。例子用 `hash-v1` 这种可读的占位值。
- `PRIMARY KEY` 保证一行有唯一标识。`UNIQUE (source_id, request_seq)` 防止给同一份教材重复占用同一个序号。复合 `FOREIGN KEY` 让一个教材的指针只能指向属于自己的批次。

终端连接你自己的开发 PostgreSQL。在本机默认实例上可使用以下命令。`-X` 不读取本机的 `psqlrc`，`-f` 让 `psql` 从文件执行。脚本只用临时表，末尾 `ROLLBACK` 结束这一轮。 [psql 官方参考](https://www.postgresql.org/docs/current/app-psql.html) · [PostgreSQL 约束](https://www.postgresql.org/docs/current/ddl-constraints.html)

```bash
psql -X -d postgres -f "$EDU_COURSE/publish_lab.sql"
```

先专注前三段输出。第一段找到 `b1`，表示相同输入可复用。第二段 `latest_request_seq` 变成 2，`active_build_id` 仍是 `b1`，表示新版请求已经登记，学生继续看旧版。第三段校验通过后返回 `b2`。

## 3.5 发布时检查最新请求和可见范围

发布 SQL 用 `UPDATE … FROM` 连接教材和待上线批次，再逐项检查 `v.ready`、`v.request_seq = s.latest_request_seq`、批次属于哪份教材。满足条件就更新指针，`RETURNING` 打印新值。应用应把「核对批次当前状态 + 更新指针」放进一个短 PostgreSQL 事务；算 embedding、写 Milvus 和网络调用都在事务前做。这个例子的临时表事务用来重置练习数据，应用的登记和发布应分开提交。 [PostgreSQL 事务教程](https://www.postgresql.org/docs/current/tutorial-transactions.html) · [UPDATE 和 RETURNING](https://www.postgresql.org/docs/current/sql-update.html)

上线路径可依次打印三个值，`active_build_id`、实际传给 Milvus 的过滤条件、每条结果的 `build_id`。学生请求先做课程权限校验，从目录取已发布批次，只查询课程、课次和可见的 `build_id`。如果没有可用批次，直接返回资料未发布。查问题时应复用第 2 课的 embedding 配置。

**小练习。** 复制一份 SQL 到临时目录。在发布前把 `UPDATE edu_versions SET ready = true …` 注释掉，重跑，看看发布返回几行。再恢复，让它返回一行。你就能解释为什么「写入完成」必须经过验证才能「对学生发布」。下一步进入[第 4 课](04_FAILURE_AND_ROLLBACK.md)。
