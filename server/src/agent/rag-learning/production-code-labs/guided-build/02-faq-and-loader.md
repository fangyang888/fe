# 第 02 章：客服 FAQ 与安全 Markdown Loader

## 本章结果

从受控目录读取第一批客服政策，校验 Metadata，并输出尚未切分的 `KnowledgeDocument`。

## 第一步：定义领域对象

新建 `server/src/knowledge/domain/knowledge-document.ts`：

```ts
export type KnowledgeDocument = {
  /** 跨版本稳定的知识文档标识，例如 return-headphone。 */
  documentId: string;
  /** 展示给运营人员和用户的文档标题。 */
  title: string;
  /** 文档所属商城；来自可信导入配置，不来自用户问题。 */
  tenantId: string;
  /** 文档可见范围，决定哪些认证角色可以检索。 */
  visibility: 'public' | 'customer' | 'staff';
  /** 同一 documentId 下单调递增的业务修订号。 */
  revision: number;
  /** 文档生命周期状态；只有 published 可以进入在线检索。 */
  status: 'draft' | 'published' | 'archived';
  /** 文档开始生效时间；null 表示不限制开始时间。 */
  validFrom: string | null;
  /** 文档失效时间；null 表示尚未设置失效时间。 */
  validTo: string | null;
  /** 服务端审核过的公开来源地址；不能由模型自行生成。 */
  canonicalUrl: string | null;
  /** 已解析和清洗、等待切分的完整 Markdown 正文。 */
  content: string;
  /** 正文 SHA-256，用于去重、变更检测和索引幂等。 */
  contentHash: string;
};
```

这里不 import LangChain `Document`。领域模型属于你的客服系统，不属于某个框架。

## 第二步：准备第一篇 FAQ

创建：

```text
server/src/knowledge/fixtures/faq/return-headphone-v2.md
```

为减少第一遍依赖，使用严格 JSON Frontmatter：

```markdown
---json
{
  "documentId": "return-headphone",
  "title": "耳机退货政策",
  "tenantId": "default-shop",
  "visibility": "customer",
  "revision": 2,
  "status": "published",
  "validFrom": "2026-08-01T00:00:00+08:00",
  "validTo": null,
  "canonicalUrl": "/help/return-headphone"
}
---

# 耳机退货政策

## 未拆封商品

商品签收后七日内，包装和配件完整且不影响二次销售时，可以申请七天无理由退货。

## 已拆封入耳式耳机

已拆封且影响二次销售的入耳式耳机不适用七天无理由退货。
如果商品存在质量问题，仍可按照质量保障流程申请售后。
```

使用 JSON 是为了让第一版解析行为确定；以后需要 YAML 时再引入 YAML parser 和额外安全测试。

## 第三步：Metadata Schema

新建 `server/src/knowledge/ingestion/knowledge-loader.service.ts`：

```ts
import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { KnowledgeDocument } from '../domain/knowledge-document';

const MetadataSchema = z
  .strictObject({
    documentId: z
      .string()
      .regex(/^[a-z0-9-]{3,100}$/)
      .describe('跨修订稳定的文档业务 ID，只允许小写字母、数字和连字符'),
    title: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe('知识文档标题，用于检索上下文和公开引用'),
    tenantId: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .describe('文档所属商城，由可信导入源提供'),
    visibility: z
      .enum(['public', 'customer', 'staff'])
      .describe('文档可见范围，在线检索必须进行权限过滤'),
    revision: z
      .number()
      .int()
      .positive()
      .describe('同一文档的正整数修订号'),
    status: z
      .enum(['draft', 'published', 'archived'])
      .describe('文档发布状态，只有 published 能服务在线请求'),
    validFrom: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .describe('带时区的生效时间；null 表示不限制开始时间'),
    validTo: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .describe('带时区的失效时间；null 表示当前没有失效时间'),
    canonicalUrl: z
      .string()
      .max(1000)
      .nullable()
      .describe('审核后的公开来源 URL 或站内路径，模型不能改写'),
  })
  .refine(
    (value) =>
      !value.validFrom ||
      !value.validTo ||
      new Date(value.validTo) > new Date(value.validFrom),
    { message: 'validTo 必须晚于 validFrom' },
  );

function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
```

继续写解析函数：

```ts
function parseMarkdown(raw: string): KnowledgeDocument {
  const normalized = raw.replace(/\r\n/g, '\n').normalize('NFC');
  const match = /^---json\n([\s\S]*?)\n---\n([\s\S]+)$/.exec(normalized);
  if (!match) throw new Error('知识文档缺少合法 JSON Frontmatter');

  const metadata = MetadataSchema.parse(JSON.parse(match[1]));
  const content = match[2].trim();
  if (!content) throw new Error('知识正文不能为空');

  return {
    ...metadata,
    content,
    contentHash: sha256(content),
  };
}
```

最后写 Service：

```ts
@Injectable()
export class KnowledgeLoaderService {
  async loadFile(root: string, filename: string): Promise<KnowledgeDocument> {
    if (!/^[a-z0-9][a-z0-9-]*\.md$/i.test(filename)) {
      throw new Error('非法知识文件名');
    }

    const absoluteRoot = path.resolve(root);
    const absoluteFile = path.resolve(absoluteRoot, filename);
    if (!absoluteFile.startsWith(`${absoluteRoot}${path.sep}`)) {
      throw new Error('知识文件路径越界');
    }

    const stat = await fs.stat(absoluteFile);
    if (!stat.isFile() || stat.size > 1_000_000) {
      throw new Error('知识文件类型或大小不合法');
    }

    return parseMarkdown(await fs.readFile(absoluteFile, 'utf8'));
  }
}
```

## 第四步：测试

新建 `knowledge-loader.service.spec.ts`，使用真实 fixture 路径：

```ts
import path from 'node:path';
import { KnowledgeLoaderService } from './knowledge-loader.service';

describe('KnowledgeLoaderService', () => {
  const loader = new KnowledgeLoaderService();
  const fixtureRoot = path.resolve(__dirname, '../fixtures/faq');

  it('加载并校验耳机退货政策', async () => {
    const doc = await loader.loadFile(fixtureRoot, 'return-headphone-v2.md');
    expect(doc).toMatchObject({
      documentId: 'return-headphone',
      revision: 2,
      status: 'published',
      tenantId: 'default-shop',
    });
    expect(doc.content).toContain('已拆封入耳式耳机');
    expect(doc.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('拒绝路径穿越', async () => {
    await expect(loader.loadFile(fixtureRoot, '../secret.md')).rejects.toThrow(
      /非法知识文件名|路径越界/,
    );
  });
});
```

## 故意破坏实验

把 `revision` 改成字符串 `"2"`，观察严格 Schema 拒绝。知识导入宁可明确失败，也不能静默转换错误 Metadata 后发布。

## Gate 02

- [ ] Loader 测试通过。
- [ ] 能解释 `contentHash` 与文件名的区别。
- [ ] Loader 无法读取 fixture 目录外文件。
- [ ] 当前只读取资料，还没有生成向量。
