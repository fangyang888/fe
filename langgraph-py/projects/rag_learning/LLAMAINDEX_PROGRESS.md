# LlamaIndex 学习进度

目标：深入掌握 LlamaIndex RAG，并把图书馆问答服务做到可上线；之后迁移到小学课堂 PDF 知识库。主路线见 [LLAMAINDEX_MASTERY_PLAN.md](LLAMAINDEX_MASTERY_PLAN.md)。

## 当前状态

- 当前阶段：2，Document → Node 切分；阶段 0～1 的正式验收仍待补齐。
- 已有材料：10 篇虚构 Markdown、20 道评测问题和参考答案文件。
- 项目已安装 `llama-index`，并有 `llama/reader.py`、`document.py`、`file.py` 练习代码。
- 已观察到示例 PDF 的文字可提取，分数条图形不在 `PDFReader` 输出的 `doc.text` 中。
- 本阶段不能读取 `eval/answer_key.jsonl` 来完成练习，也不能把评测文件入库。

## 下一次提交给我检查

1. Q01、Q06、Q18 的人工答案或拒答理由，以及文档编号和原文位置。
2. 用自己的话解释 Reader、Document、metadata、`doc_id` 的职责，以及评测答案不能入库的原因。
3. 阶段 1：10 篇 Markdown 的两次加载输出，检查稳定 ID、来源和正文预览。
4. 阶段 2：对示例 PDF 比较两组 `SentenceSplitter` 参数，提交 Node 数、边界文本、`ref_doc_id` 和页码 metadata。

## 验收记录

| 阶段 | 状态 | 证据或问题 |
| --- | --- | --- |
| 0 人工基线 | 待做 | Q01、Q06、Q18 |
| 1 Reader / Document | 部分完成 | 已练习单页 PDF 与 metadata；10 篇 Markdown 和稳定 ID 验收待补 |
| 2 Node / 切分 | 进行中 | 对示例 PDF 比较两组切分参数 |

每次验收后更新此文件，记录完成项、失败样例与下一阶段，避免只凭聊天记录追踪进度。
