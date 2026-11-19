# 第 4 课 · 让写失败的新版不影响学生

这课用两个小例子看清楚两类事情。[`version_visibility.py`](version_visibility.py) 真的把两版数据写进 Milvus，观察哪些片段能查到。它用 Python 变量模拟数据库返回的发布指针。[`publish_lab.sql`](publish_lab.sql) 用 PostgreSQL 演练更新指针、拦截旧任务和下架。生产服务要把两段接起来，读取真实目录决定查询范围。

## 4.1 将故障放在你想观察的位置

按前几课设置同一个 `EDU_MILVUS_URI`，然后执行下面命令。本课专门用集合 `edu_lab_04_versions`，每次生成不同批次 ID，所以不会把上次的 V2 行当成这次的结果。

```bash
uv run --no-project --python 3.13 \
  --with 'pymilvus==3.0.2' --with 'milvus-lite==3.2.2' \
  python -B "$EDU_COURSE/version_visibility.py"
```

脚本先写 V1，指针设为 V1。它将 V2 分成两条记录，先写第一条，然后用 `raise InterruptedError(...)` 模拟第二条还没有写入。`except InterruptedError` 让我们留在进程中观察故障，真实网络和数据库错误仍会报出来。

| 阶段 | 后台按 `build_id` 检查 | 按学生发布指针读取 |
| --- | --- | --- |
| V1 刚发布 | V1 有一条 | V1 的一条例题 |
| V2 第一条写入后出错 | V2 只有一条 | 仍是 V1 |
| V2 重写全部片段并核对后 | V2 有两个预期主键和对应正文 | 发布后只看见 V2 |
| 回滚 | V1 仍能按自己的批次查到 | 只看见 V1 |
| 下架 | 两批历史记录仍可供授权管理查询 | 没有发布指针，学生得到空结果 |

**小练习。** 在中断后增加一行打印 `active_build_id`。你会看到写入 V2 没有改变它。再把 `read_build(client, active_build_id)` 临时换成 `read_build(client, v2)`，观察半成品为什么会出现在输出里。做完恢复。

## 4.2 幂等重试需要同一批次和同一清单

「幂等」在这里指重复执行后，最终正确的数据状态和只成功执行一次相同。第一次上传成功了一半，第二次用同样的 `build_id` 和 `id` 重放整份清单，第一条命中已有主键，缺失的第二条被补上。确认期望是两个主键，就应读回恰好这两个主键与对应正文。

网络超时可能出现在服务器已经写成功、但客户端还没收到响应的时候。处理这种情况先按该批次读回，或者重放同一份清单后再读回。生产中要一起核对片段数量、主键、课程和来源，有条件时校验文本摘要，并试一次带该批次条件的向量搜索。空数据需明确处理。发布时要检查 PostgreSQL 任务状态，已经成功的任务应返回已有结果。 [Milvus Upsert API](https://milvus.io/api-reference/pymilvus/v3.0.x/MilvusClient/Vector/upsert.md)

**小练习。** 运行例子两次，分别记录每次的 V2 ID 和最终条数。同一次执行中第一条 V2 在重试前后 ID 相同。两次独立执行使用不同 ID。这个例子保留各次练习的合成记录，生产清理规则见 4.5。

## 4.3 用一致性读回，判断写入是否真正可查

Milvus 的写入返回值和学生看得到最新数据之间多一步查询。校验中指定 `consistency_level="Strong"`，便于对刚完成的写入做读后核对。正式服务要用 Standalone 验证这种读法的延迟和故障表现。此处的 Strong 约束 Milvus 自己读到的数据，PostgreSQL 的发布则由 PostgreSQL 事务控制。 [Milvus 一致性](https://milvus.io/docs/consistency.md) · [Query API](https://milvus.io/api-reference/pymilvus/v3.0.x/MilvusClient/Vector/query.md)

这个教学示例最多两条，所以 `limit=20` 足够。真实批次很大时，按清单分组核对已写主键，或分页查完整批次。不要只拿前 20 条判断「全部写齐」，也不要只比较条数来代替 ID 对照。

## 4.4 迟到的任务为什么不能发布

重跑第 3 课的 SQL，重点读第 4 步之后的输出。

```bash
psql -X -d postgres -f "$EDU_COURSE/publish_lab.sql"
```

从 V1 到 V2 时，`latest_request_seq` 变成 2。旧工作任务拿着 1 来更新，SQL 的 `v.request_seq = s.latest_request_seq` 不成立，`UPDATE 0` 意味着它没有获得发布资格。即使旧批次依然可查，学生查询也只取最新发布指针。

上线后同一来源的「接收请求并分配序号」也需要一次短事务，可以用教材行锁依次分配。回滚或下架同样会递增序号。当两个事务要更新同一行时，PostgreSQL 根据锁与事务规则处理等待。在默认 `Read Committed` 下，等待更新成功后会按当前行重新判断该 `UPDATE` 的条件。应用仍要检验返回行数并处理任何数据库错误。 [PostgreSQL 隔离级别](https://www.postgresql.org/docs/current/transaction-iso.html) · [显式锁](https://www.postgresql.org/docs/current/explicit-locking.html)

**纸面练习。** 假设 V3 和 V4 都提交了，最新请求号是 4，V3 晚完成时携带 3。写出条件 `3 = 4` 的结果，再写出当前学生应看到的是谁。要分清「最新上传」和「最后成功发布」，V4 还没验收时学生可能仍在看 V2。

## 4.5 下架、回滚和物理删除有不同的时间点

- **下架**清空 `active_build_id`，新请求没有可读版本。学生公开链接也应重查发布状态或权限。
- **回滚**将指针切回一版已验证仍完整的历史批次。回滚前核对可读记录，事务内再次检查状态。回滚和下架都让在途任务的旧序号失效。
- **物理清理**在回滚保留期与在途查询窗口过去后执行。先在目录事务中确认该批次未被发布并标记为清理中，防止它同时被回滚选中，再精确按批次清理 Milvus。失败留着状态重试，不假装已清理。 [Milvus 删除实体](https://milvus.io/docs/delete-entities.md)

## 4.6 这一轮之后自己接一条最小链路

先把 `version_visibility.py` 中 `active_build_id` 的赋值画出五个变化点。再把第 3 课的 SQL 发布语句和读取指针的 `SELECT` 接给真实服务。Milvus 继续使用已验证的批次条件，学生查询时可以用第 2 课的真实语义搜索替换这里方便观察的 `query`。

| 验收场景 | 必须记录的证据 |
| --- | --- |
| 原件与索引配置重复提交 | 返回同一个任务，Milvus 新写入数和正文 embedding 调用数为 0。 |
| 只改一份教材 | 两份教材并存时，另一份教材的发布 ID 和已写片段不变。 |
| 新版写到一半崩溃 | 另一进程仍查 V1，后台能核对 V2 缺的 ID。 |
| 重启重试并发布 | 重用 V2 的主键，已删除的旧例题在学生查询中消失。 |
| 旧任务在新版之后完成 | 更新指针返回 0 行，学生依旧读新版。 |
| 回滚、下架与清理失败 | 回滚恢复指定历史版。下架后无结果。清理失败有可追踪的状态和重试路径。 |

把一次完整实验的版本号、用的命令、实际输出和发现的问题记下来。能解释每一项检查失败时学生还能看到什么，就可以返回[教育项目上线路线](../../EDUCATION_RAG_ROADMAP.md)接课程讲解和批改。
