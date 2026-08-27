# 第 03 章：Document、Chunk 与 Metadata

## 本章目标

理解切分为什么决定检索效果的上限，并设计可追踪、可更新、可过滤的知识片段。

---

## 一、Document 不等于一段字符串

推荐先定义自己的领域对象，不让上层代码直接依赖某个向量库的返回类型：

```ts
type KnowledgeDocument = {
  documentId: string;
  title: string;
  content: string;
  metadata: {
    sourceUrl: string | null;
    tenantId: string;
    revision: number;
    status: 'draft' | 'published' | 'archived';
    validFrom: string | null;
    validTo: string | null;
    contentHash: string;
  };
};
```

正文负责语义检索，Metadata 负责权限、版本、引用、删除和排查，两者同样重要。

---

## 二、为什么要切成 Chunk

整篇文档作为一个 Chunk：

- 混合多个主题。
- 召回内容噪音很大。
- 占用大量模型上下文。
- 细节问题可能被整体语义淹没。

每句话作为一个 Chunk：

- 条件与例外被分开。
- 指代关系丢失。
- 搜到的内容缺少完整结论。
- 重复候选大量增加。

理想 Chunk 应尽量只表达一个完整主题，同时保留理解该主题所需的条件和例外。

---

## 三、优先使用结构感知切分

Markdown 第一版推荐：

```text
按标题层级识别 sectionPath
→ 按段落、列表和业务条款形成语义块
→ 超长块再使用递归字符切分
→ 少量 overlap 保护边界
```

不要先迷信一个固定 `chunkSize`。中文字符数也不等于 Token 数，最终参数需要通过真实问题评估。

切分时尽量避免：

- 把标题和正文分开。
- 把“适用条件”和“例外情况”分开。
- 把表格的表头和数据行分开。
- 重复附加过长的父标题。
- overlap 大到多个 Chunk 基本相同。

---

## 四、稳定 Chunk ID

随机 UUID 方便生成，但不利于重新导入、删除旧片段和比较评估结果。

稳定 ID 可以根据这些字段生成：

```text
documentId + revision + sectionPath + chunkIndex + contentHash
```

概念代码：

```ts
function createChunkId(input: {
  documentId: string;
  revision: number;
  sectionPath: string[];
  chunkIndex: number;
  contentHash: string;
}): string {
  return stableHash(JSON.stringify(input));
}
```

这里的 `stableHash` 应是确定性的哈希实现。不要把不稳定的时间戳放进 ID。

---

## 五、推荐的 Chunk 结构

```ts
type KnowledgeChunk = {
  chunkId: string;
  documentId: string;
  parentId: string | null;
  content: string;
  metadata: {
    title: string;
    sectionPath: string[];
    sourceUrl: string | null;
    tenantId: string;
    revision: number;
    status: 'draft' | 'published' | 'archived';
    validFrom: string | null;
    validTo: string | null;
    contentHash: string;
    chunkIndex: number;
    parserVersion: string;
    splitterVersion: string;
  };
};
```

`parentId` 为以后实现 Parent-Child Retrieval 留出边界，但第一版可以保持为 `null`。

---

## 六、第一批 FAQ 规范

先准备 10 篇 Markdown：

```markdown
---
documentId: return-headphone
title: 耳机退货政策
revision: 1
tenantId: demo-shop
status: published
validFrom: 2026-01-01T00:00:00+08:00
sourceUrl: https://example.com/policies/return-headphone
---

# 耳机退货政策

## 未拆封商品

...

## 已拆封商品

...
```

资料中应故意加入：

- 相近但不同的条款。
- 一个精确政策编号。
- 一个过期版本。
- 一条例外条件。
- 一个知识库无法回答的问题。

这样后面才有真实测试价值。

---

## 七、本章测试

至少覆盖：

- 同一输入重复切分得到相同 Chunk ID。
- 修改一个段落只影响对应 Chunk。
- 标题路径正确保存。
- 空文档和只有空白的文档被拒绝。
- 超长段落会被 fallback splitter 处理。
- 条件和例外不会被明显错误地拆开。
- Metadata 缺少 `tenantId` 或版本时导入失败。

## 验收标准

- 能从任意 Chunk 追踪回文档、章节和版本。
- 重复导入同一版本不会无限产生重复片段。
- 能人工检查全部 10 篇 FAQ 的切分结果。
- 能解释 Chunk 太大和太小的后果。

通过后进入：[第 04 章：Embedding 与向量检索](./04-embeddings-and-vector-search.md)。

