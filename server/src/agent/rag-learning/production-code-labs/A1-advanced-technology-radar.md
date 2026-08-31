# 附录 A1：2026 高级技术雷达与采用门槛

本附录对应原文第 55 节。它不是必做主线，而是完成生产基线后的实验清单。技术“新”不等于适合当前商城客服。

## Elasticsearch `semantic_text`

Elastic 当前官方将 `semantic_text` 作为托管语义/Hybrid 工作流的推荐入口，可自动处理推理、向量化和 Chunk。主课程仍先采用显式 `dense_vector`，原因是学习目标包括理解 Chunk、Embedding 版本、迁移和索引生命周期，而且你的项目需要兼容自定义 OpenAI Base URL。

采用实验：用相同原文和 Golden Dataset 比较：

```text
手动 Chunk + OpenAI dense_vector
semantic_text 托管 Chunk/Embedding
```

至少比较检索质量、中文效果、索引透明度、版本迁移、权限 Filter、成本和供应商锁定。

## Sparse Retrieval / ELSER

在 BM25 + Dense 已有基线后，比较 ELSER sparse vector 是否改善专业术语、短 Query 或语义扩展。不能同时替换 Chunk、Embedding 和检索算法，否则无法归因。

## MMR / Diversify Retriever

当 TopK 大量来自同一文档的相邻重复 Chunk 时使用。比较覆盖度和关键证据 Recall，不能只看结果“更分散”。

## Contextual Retrieval

离线为每个 Child Chunk 补充简短文档语境，适合“Chunk 单独看不清对象”的失败。必须验证新增上下文不会引入旧版本、错误实体和额外索引成本。

## Multi-Vector / Multi-Representation

同一 Parent 保存正文向量、摘要向量、可能问题向量。适合用户表达与文档措辞差异很大的场景。需要稳定 parentId、去重和分表示评估。

## Late Interaction / ColBERT

适合对细粒度 Token 匹配有高质量要求且能承担更复杂索引与基础设施的场景。它属于独立检索后端实验，不应直接侵入 KnowledgeAnswerService。

## Multimodal RAG

只有关键信息确实存在说明书图片、结构图、扫描表格或视频时采用。评估链必须增加 OCR/视觉解析准确性、页码/区域引用和多模态权限。

## GraphRAG

适合实体关系、跨文档社区和全局关系问题，不适合用来修复基本 FAQ 切分、版本和权限错误。先准备明确的关系型问题集，再与 Hybrid baseline 对比。

## 新生成模型

OpenAI 当前模型家族会持续变化。回答模型通过 `RAG_ANSWER_MODEL` 配置，并使用同一 Answer Dataset 比较正确性、Groundedness、P95 和成本。不要因为模型上下文更长就把整个知识库塞入 Prompt，也不要跳过检索和引用。

## 采用模板

每项高级能力必须填写：

```markdown
## Problem
哪一类已标注失败需要解决？

## Baseline
当前指标、延迟和成本是什么？

## Change
一次只改变哪个变量？

## Result
分标签指标、P95、成本、安全有什么变化？

## Decision
adopt / trial / reject，以及回滚方式。
```

