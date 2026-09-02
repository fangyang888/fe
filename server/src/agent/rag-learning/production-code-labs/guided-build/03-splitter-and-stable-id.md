# 第 03 章：结构切分与稳定 Chunk ID

## 本章结果

把政策按 Markdown 标题切成完整章节，只有章节过长时才递归切分，并为每个 Chunk 生成稳定 ID。

## 第一步：定义 Chunk

新建 `server/src/knowledge/domain/knowledge-chunk.ts`：

```ts
export type KnowledgeChunk = {
  /** 由文档、修订、章节、序号和内容哈希生成的稳定 Chunk ID。 */
  chunkId: string;
  /** Chunk 所属的稳定文档 ID。 */
  documentId: string;
  /** 所属父章节 ID，用于检索命中后展开完整上下文。 */
  parentId: string;
  /** 来源文档标题。 */
  title: string;
  /** 从一级标题到当前章节的完整标题路径。 */
  sectionPath: string[];
  /** 当前 Chunk 的正文，不包含模型生成内容。 */
  content: string;
  /** 当前 Chunk 正文 SHA-256，用于去重和变更检测。 */
  contentHash: string;
  /** Chunk 所属商城，后续用于权限过滤。 */
  tenantId: string;
  /** Chunk 的用户可见范围。 */
  visibility: 'public' | 'customer' | 'staff';
  /** 来源文档修订号，引用和回放必须保留。 */
  revision: number;
  /** 来源文档生命周期状态。 */
  status: 'draft' | 'published' | 'archived';
  /** 来源文档生效时间。 */
  validFrom: string | null;
  /** 来源文档失效时间。 */
  validTo: string | null;
  /** 审核过的公开来源地址。 */
  canonicalUrl: string | null;
  /** Chunk 在当前文档修订中的稳定顺序。 */
  chunkIndex: number;
  /** 生成该 Chunk 的切分算法版本。 */
  splitterVersion: 'markdown-v1';
};
```

## 第二步：标题解析

新建 `knowledge-splitter.service.ts`：

```ts
import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { KnowledgeDocument } from '../domain/knowledge-document';
import { KnowledgeChunk } from '../domain/knowledge-chunk';

type Section = {
  /** 从文档根标题到当前标题的层级路径。 */
  sectionPath: string[];
  /** 当前标题下、进入递归切分前的完整章节正文。 */
  content: string;
};

function parseSections(markdown: string): Section[] {
  const sections: Section[] = [];
  const headingPath: string[] = [];
  let currentLines: string[] = [];

  const flush = () => {
    const content = currentLines.join('\n').trim();
    if (content) sections.push({ sectionPath: [...headingPath], content });
    currentLines = [];
  };

  for (const line of markdown.split('\n')) {
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (!heading) {
      currentLines.push(line);
      continue;
    }

    flush();
    const level = heading[1].length;
    headingPath.splice(level - 1);
    headingPath[level - 1] = heading[2].trim();
  }
  flush();
  return sections;
}
```

注意：标题不直接放入正文，而是保存在 `sectionPath`。真正建立 Embedding 文本时，会把标题路径与正文组合，避免语义丢失。

## 第三步：递归 fallback

```ts
const fallback = new RecursiveCharacterTextSplitter({
  chunkSize: 800,
  chunkOverlap: 100,
  separators: ['\n\n', '\n', '。', '；', '，', ' ', ''],
});

function hash(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function stableChunkId(input: object) {
  return hash(JSON.stringify(input));
}
```

完成 Service：

```ts
@Injectable()
export class KnowledgeSplitterService {
  async split(document: KnowledgeDocument): Promise<KnowledgeChunk[]> {
    const result: KnowledgeChunk[] = [];
    let chunkIndex = 0;

    for (const section of parseSections(document.content)) {
      const parentId = stableChunkId({
        documentId: document.documentId,
        revision: document.revision,
        sectionPath: section.sectionPath,
      });
      const pieces = await fallback.splitText(section.content);

      for (const piece of pieces) {
        const content = piece.trim();
        if (!content) continue;
        const contentHash = hash(content);
        result.push({
          ...document,
          content,
          contentHash,
          parentId,
          sectionPath: section.sectionPath,
          chunkIndex,
          splitterVersion: 'markdown-v1',
          chunkId: stableChunkId({
            documentId: document.documentId,
            revision: document.revision,
            sectionPath: section.sectionPath,
            chunkIndex,
            contentHash,
          }),
        });
        chunkIndex += 1;
      }
    }
    return result;
  }
}
```

`...document` 会暂时带入不属于 Chunk 的字段时，TypeScript 结构兼容但不够严格。练习完成后可以改成显式字段映射，避免领域对象扩展后意外写入索引。

## 第四步：测试切分语义

```ts
it('保留标题路径并稳定生成 ID', async () => {
  const first = await splitter.split(document);
  const second = await splitter.split(document);

  expect(first.map((x) => x.chunkId)).toEqual(second.map((x) => x.chunkId));
  expect(first).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        sectionPath: ['耳机退货政策', '已拆封入耳式耳机'],
      }),
    ]),
  );
});

it('质量问题例外与拆封限制保留在同一父章节', async () => {
  const chunks = await splitter.split(document);
  const opened = chunks.filter((x) =>
    x.sectionPath.includes('已拆封入耳式耳机'),
  );
  expect(opened.map((x) => x.content).join('\n')).toContain('质量问题');
  expect(new Set(opened.map((x) => x.parentId)).size).toBe(1);
});
```

## 故意破坏实验

把 chunkSize 改成 40，打印 Chunk，观察条件与例外怎样被切碎。再改成 5000，观察整个政策怎样混进一个 Chunk。这比背诵“Chunk 很重要”更直观。

## Gate 03

- [ ] 同一文档重复切分 ID 相同。
- [ ] 标题路径、revision 和 parentId 可追踪。
- [ ] 人工阅读每个 Chunk，没有明显断句和条件丢失。
- [ ] 能解释为什么 chunkSize 必须通过真实问题评估。
