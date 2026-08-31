# 第 04 章：结构感知切分、Parent-Child 与稳定 ID

对应原文：第 10～12 节。

## 任务 1：先解析标题结构

不要直接把整篇 Markdown 丢进固定字符切分器。第一层先生成：

```ts
type MarkdownSection = {
  sectionPath: string[];
  body: string;
  ordinal: number;
};
```

状态机概念：

```ts
function updateHeadingPath(
  current: string[],
  level: number,
  title: string,
): string[] {
  return [...current.slice(0, level - 1), title.trim()];
}
```

解析时保留列表和表格整体，避免把表头、条件和例外分开。

## 任务 2：超长 Section 再递归切分

```ts
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

const fallbackSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 800,
  chunkOverlap: 100,
  separators: ['\n\n', '\n', '。', '；', '，', ' ', ''],
});
```

这是第一组实验参数，不是生产真理。必须用第 14 章数据集比较 500/50、800/100、1200/150 等方案。

## 任务 3：稳定 Chunk ID

```ts
import { createHash } from 'node:crypto';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function createChunkId(input: {
  tenantId: string;
  documentId: string;
  revision: number;
  sectionPath: string[];
  chunkIndex: number;
  contentHash: string;
}): string {
  return sha256(JSON.stringify(input));
}
```

不要加入当前时间或随机 UUID，否则同一版本重跑无法幂等。

## 任务 4：Parent-Child

第一版同时输出：

```ts
type ParentSection = {
  parentId: string;
  documentId: string;
  sectionPath: string[];
  content: string;
};

type ChildChunk = KnowledgeChunk & {
  parentId: string;
};
```

Child 用于精确检索，Parent 在检索后按需展开。不要默认把整篇文档作为 Parent 塞入上下文。

## 测试

- 相同输入产生完全相同的 Chunk ID。
- 修改一个章节不会让所有无关章节 ID 改变。
- 标题与正文不会分离。
- “适用条件”和紧随其后的“例外”保持在同一父章节。
- overlap 不会生成空 Chunk 或完全重复 Chunk。
- 中文、英文、编号和表格测试快照可人工阅读。

## Gate 04

- [ ] 每个 Chunk 能追踪 document/revision/section/parent。
- [ ] 10 篇 FAQ 的切分输出全部人工抽查。
- [ ] 参数实验写入配置版本，不散落在代码常量中。
- [ ] 能解释字符数与 Token 数不是同一概念。

