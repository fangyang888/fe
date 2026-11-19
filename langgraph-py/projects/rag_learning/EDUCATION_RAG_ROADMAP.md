# 教育 RAG 上线实战路线

从现有的[三年级分数讲义](pdf/你的课堂讲义.pdf)起步。第一轮就把 **教材解析、Milvus 存取、增量更新、失败重试和回滚**串起来，用同一个例子学习。接着复用这条链路，做出一节孩子能完整学完的课。首个上线目标是小范围试用，能选课、看带页码的讲解、做题、查看批改和复练。

## 第一轮用同一份讲义完成四次练习

按 [LlamaIndex × Milvus 四课入口](llama/milvus_course/README.md) 从可运行小例子练起。每小节有概念、官方 API、动手练习和预期输出。

| 练习 | 每次学一个新环节 | 验收时要看到什么 |
| --- | --- | --- |
| 1. 从 PDF 到 Milvus | 在 [`file.py`](llama/file.py) 按页读，再复用 [`splitter.py`](llama/splitter.py) 的切分方式。用 PyMilvus `MilvusClient` 在独立练习库建集合，学习主键、向量维度、向量索引和集合加载。先写少量固定向量，用 `query` 核对字段，用 `search` 核对过滤和 Top K。 | Milvus 中确实有讲义第 1、2 页的片段。每个命中返回 `text`、页码和 `source_id`。重启后能查到相同数据。 |
| 2. 用教材做语义检索 | 让同一个 embedding 模型处理片段和查询，把片段向量存入 Milvus。加当前课次的过滤条件，先在终端看 Top 3 及原文。保留一条属于别课、正文相似的测试数据。 | “分母为什么不变？”命中第 2 页的计算依据。“分母表示什么？”在含第 1 页的课次里命中定义。其他课的相似片段被排除。 |
| 3. 发布改版 | 加 PostgreSQL 教材目录，记录资料版本、入库任务与当前上线的批次。同一份讲义重复导入，再上传只改一处的小改版。用两个测试版本亲眼看见新片段进入 Milvus 后仍可与旧片段共存。 | 重复导入不增加记录，也不重新调用 embedding。改版只重建这一份讲义，发布前查旧版，发布后查新版。 |
| 4. 演练失败与恢复 | 将写入分成两批。第二批前故意中断，再重跑。接着练旧任务迟到、下架、回滚和延迟清理。 | 失败期间仍能查旧版，重试后片段完整且无重复。迟到的任务无法覆盖新版，下架后新请求查不到该教材。保留期内可恢复旧版。 |

起步时，[`file.py`](llama/file.py) 第 26 行将 `len(pdf_reader.images)` 改为 `len(pdf_reader.pages[physical_page - 1].images)`，然后打印 `doc.id_`、`physical_page` 和文字预览。先确认读取 3 页，再把前两页接进 `SentenceSplitter`，检查切片能带回物理页码。第 2 页的分数条由图形表示，文字提取只留下标签。可以先给图形手写一段核对过的说明，保留对应页码。

第一次跟着 [Milvus Quickstart](https://milvus.io/docs/quickstart.md) 的连接现有服务器部分做，指向独立的 Milvus Standalone 开发实例。`deal_pilot_rag` 的 Compose 文件可以对照 Milvus、etcd、MinIO 三个服务的关系。教育练习单独建数据库或集合，避免向飞书教材集合写入。开发和预发布用同一套经过联调的 Milvus 与 PyMilvus 版本，部署时锁定版本。 [参考 Compose](/Users/yang/duyi/deal_pilot_rag/docker-compose.yml:246) · [Milvus Standalone 部署指南](https://milvus.io/docs/install_standalone-docker-compose.md) · [过滤检索文档](https://milvus.io/docs/filtered-search.md)

## 上线架构

| 组件 | 负责的事 |
| --- | --- |
| Python + LlamaIndex | 把 PDF、Markdown、TXT、Word `.docx` 读成统一片段。PDF 保留物理页码，Markdown 和 Word 保留章节和段落，TXT 保留行号范围。 |
| Milvus + PyMilvus | 存教材片段及向量。先学稠密向量和过滤检索，之后在固定题集上比较 BM25 混合检索和重排的效果。 |
| PostgreSQL | 存课程目录、资料版本、已发布批次、导入任务、题库、评分规则和答题记录。 |
| 私有对象存储 | 保存不可变的教材原件或授权公开的摘录，引用时可定位到对应的原件版本。 |
| FastAPI + 一个后台入库进程 | 教师上传资料后返回任务 ID，后台解析、向量化和发布。学生请求按课检索、提交作业和查看复习记录。第一版由一个后台进程处理入库任务。 |

建议新建 `projects/edu_tutor/` 承载业务代码，先用 CLI 调用同一套入库、检索和评分函数，再把这些函数接到 API。第一轮直接使用最终的 Milvus 和 PostgreSQL；CLI 只是方便看清楚每一步的输入和输出。

## 增量更新按整份变更教材发布

先做到“只处理发生变化的那份教材”。版本字段分清三个概念。

| 字段 | 表示什么 |
| --- | --- |
| `source_id` | 教材的稳定身份。换文件名或上传新版时沿用这个 ID。 |
| `revision` | 原件字节的 SHA-256。结合解析器、切分参数、embedding 和发布范围的配置指纹判断能否复用。 |
| `build_id` / `active_build_id` | 一次入库的批次，以及当前对学生开放的批次。一次任务重试沿用自己的 `build_id`。 |

Milvus 的片段主键可以由 `build_id`、`lesson_id` 和片段序号确定性生成，另存 `course_id`、`source_id`、位置、正文和向量。新版使用自己的 `build_id`，旧版主键仍可读。一次已经开始写入的任务，重试时复用同一份片段清单；改配置或改切分结果时另开新批次。

1. **接收**。为上传保留不可变原件。在 PostgreSQL 记录请求顺序、版本和导入任务。最近接受的同一资料请求，如果原件与索引配置指纹一致，直接返回现有任务状态。失败则重试该任务。用户明确重新上传历史内容时，按新请求排序。
2. **写入**。生成本批预期的片段 ID 清单，分批 `upsert` 到 Milvus。每个批次的片段 ID 固定，重试使用相同 ID。用强一致性读回核对预期 ID、片段数和来源字段，再试一次带批次过滤的检索。空页或解析质量异常需要明确记录，空结果由人工确认后才允许发布。 [Milvus Upsert](https://milvus.io/docs/upsert-entities.md) · [一致性级别](https://milvus.io/docs/consistency.md)
3. **发布**。用一段短 PostgreSQL 事务检查该任务仍是最新请求、教材仍允许发布，再更新 `active_build_id`。向量生成和 Milvus 写入在事务外完成。查询端先校验课程权限，从 PostgreSQL 读取本课当前可用的批次，再限制 Milvus 搜索的 `course_id`、`lesson_id` 和 `build_id` 列表。无可用批次时直接返回资料不可用，发布初版可用强一致性读取并记录延迟。 [PostgreSQL 并发事务](https://www.postgresql.org/docs/current/transaction-iso.html) · [Milvus 过滤模板](https://milvus.io/docs/filtering-templating.md)
4. **下架、回滚和清理**。写入或校验失败时沿用上一版。下架时取消指针并递增请求序号。回滚时核对历史批次完整，在事务内确认它仍可回滚，再切换指针并递增请求序号。这样在途入库任务无法在操作结束后自动覆盖。历史批次过了回滚保留期且超过在途查询窗口后才清理。清理事务确认批次未上线并将其标为清理中，再按 `build_id` 删除；失败可重试。历史引用需要在保留窗口内定位到原始版本，已下架的资料仍须按权限检查。

PostgreSQL 中的指针切换给查询请求一个确定的可见版本。Milvus 和 PostgreSQL 各自完成自己的操作。更换 embedding 模型时，建立新集合并重建受影响的教材，演练按同一份配置切换「查询向量模型和集合」，保证一次查询从头到尾使用同一个模型版本，即使新旧向量维度相同。

### 同一份教材怎么练增量

| 你做的操作 | 从学生查询和入库任务分别观察 |
| --- | --- |
| 发布 V1，再原样上传 | 查询仍返回 V1，任务 ID 相同，向量写入数和 embedding 调用数没有增加。 |
| 给 V2 增加一个新例题，并删掉 V1 的一个例题 | 先留住 V1 的文件和批次。写 V2 第一批后中断，学生仍只能查到 V1。任务能找到失败位置。 |
| 重试 V2 并发布 | 复用 V2 的批次和主键。发布后，新例题能命中，删掉的旧例题不会命中。另一份教材的批次和向量写入数都没变。 |
| 回滚到 V1，再尝试完成一个已过期的入库任务 | V1 恢复可查，过期任务的发布条件失败。再做一次下架，确认新请求查不到这份教材。 |

### 用现有企业项目对照

| 想学什么 | 建议从哪里开始 |
| --- | --- |
| 集合、主键、稠密/稀疏字段 | [Milvus Schema 源码](/Users/yang/duyi/deal_pilot_rag/src/deal_pilot/rag/store/feishu_doc/schema.py:10)里的 `id`、`text`、`dense`。初学先把这三个字段和必要来源字段连起来。 |
| 版本比较、结构化、切片、写入 | [单文档索引图](/Users/yang/duyi/deal_pilot_rag/src/deal_pilot/graphs/feishu_doc_index/document_index/graph.py:34)和[版本比较节点](/Users/yang/duyi/deal_pilot_rag/src/deal_pilot/graphs/feishu_doc_index/document_index/nodes.py:28)。把飞书的来源和版本换成你自己的课程目录和文件版本。 |
| 新旧版本的发布差异 | [写入和清理节点](/Users/yang/duyi/deal_pilot_rag/src/deal_pilot/graphs/feishu_doc_index/document_index/nodes.py:121)。参考项目会按相同主键 `upsert` 并随后删除旧版本。练习时观察同一主键的替换效果，再用你的批次 ID 和发布时间点保留完整旧版。 |
| 查教材、给证据、看评测 | [带过滤的检索函数](/Users/yang/duyi/deal_pilot_rag/src/deal_pilot/rag/retriever/feishu_doc/feishu_doc_retriever.py:48)与[第 37 课《质量评估》](</Users/yang/duyi/deal_pilot_rag/课件/37. 质量评估.md>)。先用固定问题记录目标页是否命中，再核对回答和引用。 |

## 从索引练习接到一节完整的课

1. **选课与讲解**。课程目录先手工排「认识分子和分母 → 同分母分数加法 → 易错题复习」。问答只检索当前课，返回来源页和经过授权的摘录。资料未覆盖的问题，例如讲义没有教过的通分步骤，明确告诉孩子本课没有提供。第 3 页同时含练习和参考答案，第一版的学生可见索引和引用只开放前两页。
2. **作答与批改**。从固定题库按 `question_id` 拿评分规则，用 Python `fractions.Fraction` 判计算题。是允许 `1/2` 和 `4/8` 等值，还是要求保留分母，写进题目规则。记录采用的题目和评分规则版本，便于课后回看。开放题先给按评分标准组织的建议，标记人工复核。
3. **反馈与复练**。例如孩子在 `1/8 + 3/8` 写了 `4/16`，给出提示「每一份还是八分之一，想想一共取了几份」，引用讲义第 2 页，并推荐 `2/7 + 3/7`。答题记录保留原答案、得分、知识点和复练结果。
4. **扩课与扩格式**。用 Markdown、TXT、DOCX 和文本 PDF 各做一份样本，验证可以打开正确位置。英语先做词义选择和限定答案填空。扫描 PDF、手写答卷、公式和图表各用单独样本验证，先确认识别内容，再进入讲解或批改。

## 发布到预发环境后，用真实服务验收

| 验收项 | 小范围试用前要通过 |
| --- | --- |
| 课程与质量 | 用固定题集覆盖有答案题、无答案题、跨课干扰和错例。分别检查检索命中、回答依据、引用是否可打开。给客观题做人工标注样例，覆盖等值分数、空答、格式错误、重复提交。 |
| 版本与恢复 | 在真实 Milvus 和 PostgreSQL 中演练新增、重复导入、编辑、删页、写一半中断、重启重试、并发上传、下架、回滚、清理失败。任何需要版本切换的场景都同时验证学生查询结果。 |
| API 与访问控制 | 用两个测试账号验证课程和答卷权限。资料和答案由服务端按身份检查；学生接口只返回获准公开的字段。数据库走私有网络，应用对外走 HTTPS，密钥与部署配置分开。 |
| 可观察与可恢复 | 用任务 ID 查到进度和失败原因，记录入库耗时、检索延迟和模型调用量，日志里避免完整儿童答卷。备份 PostgreSQL 和原件，演练恢复到隔离环境，并验证能从保存的原件与版本信息恢复 Milvus 检索。 [Milvus Backup](https://milvus.io/docs/milvus_backup_overview.md) |

第一个可交付成果是独立练习库里的一份讲义。你能展示「先查旧版 → 新版写到一半并失败 → 仍查旧版 → 重试发布 → 只查新版 → 回滚到旧版」。这条链路验收后，网页和批改功能直接用它。
