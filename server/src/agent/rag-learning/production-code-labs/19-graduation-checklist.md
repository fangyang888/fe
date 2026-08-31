# 第 19 章：毕业验收与真实上线清单

对应原文：第 56～60 节。

## 代码验收

- [ ] `src/knowledge` 分层清晰，AgentService 不包含索引细节。
- [ ] Loader、Splitter、Embedding、Search、Answer 都有独立测试。
- [ ] Domain 不依赖 Elasticsearch/LangChain 原始类型。
- [ ] 所有外部输入有运行时校验。
- [ ] Abort、超时、有限重试和降级路径有测试。

## 数据验收

- [ ] 原始来源可信，有上传与审核记录。
- [ ] Chunk ID 稳定，Metadata 完整。
- [ ] revision、有效期和 contentHash 可追踪。
- [ ] 文档更新、撤回和删除不会留下在线孤儿 Chunk。
- [ ] Embedding 模型/维度变化会构建新索引。

## 检索验收

- [ ] Dense、BM25、RRF 有同数据集对照。
- [ ] 50+ Golden Cases 覆盖同义、编号、例外、无答案、版本和权限。
- [ ] Hit/Recall/MRR 分标签报告。
- [ ] Rerank/Parent-Child 只有在数据证明有收益时启用。
- [ ] 相似度阈值来自评估而不是照抄。

## 回答验收

- [ ] 固定 2-Step RAG 一定先检索。
- [ ] Structured Output 经过 Zod 校验。
- [ ] 引用只允许本轮 S-ID 且由服务端映射 URL。
- [ ] 无证据和冲突证据会拒答/澄清/转人工。
- [ ] 每个回答保存 indexVersion 和引用 revision 快照。

## 安全验收

- [ ] tenant/role/status/time 在候选检索前过滤。
- [ ] Prompt、模型和前端不能控制 scope。
- [ ] 恶意文档不能驱动敏感 Tool。
- [ ] 私有 Chunk、系统 Prompt、密钥和内部路径不流到前端。
- [ ] RAG 解释不能代替订单归属和退款业务鉴权。

## 运维验收

- [ ] 指标、Trace、结构化日志完成且不含不必要隐私。
- [ ] P50/P95、错误率、拒答率、降级率和成本有预算。
- [ ] 新索引先评估再切 alias。
- [ ] 一键回滚已演练。
- [ ] 严重安全事件可立即关闭 RAG 路由。
- [ ] Runbook 和负责人明确。

## 最终演示脚本

1. 同义问题由 Dense 找到政策。
2. 精确编号由 BM25/Hybrid 找到政策。
3. 已拆封耳机例外条件有正确引用。
4. 无答案问题明确拒答。
5. A tenant 无法查询 B tenant 文档。
6. 草稿和过期政策无法命中。
7. 恶意文档不会改变系统指令或调用写 Tool。
8. 发布 v2 后不改 Prompt 得到新答案。
9. 切回 v1 alias 完成回滚。
10. 用 runId 展示检索、生成、引用和耗时证据。

## 毕业定义

你能用评估数据解释每一个组件为什么存在，能在不泄漏权限的情况下更新和回滚知识，并能从一次错误回答追踪到原文、Chunk、索引版本、检索排名、最终上下文和引用验证，才算完成生产级 RAG，而不只是完成一个聊天 Demo。

