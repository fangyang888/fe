# 第 03 章：可信 FAQ、Markdown Loader 与清洗

对应原文：第 8～9 节。

## 任务 1：准备 10 篇可检查资料

目录：

```text
server/src/knowledge/fixtures/faq/
├── return-headphone-v1.md
├── return-headphone-v2.md
├── refund-arrival.md
├── shipping-area.md
└── ...
```

文件格式：

```markdown
---
documentId: return-headphone
title: 耳机退货政策
tenantId: demo-shop
visibility: customer
revision: 2
status: published
validFrom: 2026-08-01T00:00:00+08:00
validTo: null
canonicalUrl: https://example.invalid/policies/return-headphone
---

# 耳机退货政策

## 已拆封商品

已拆封且影响二次销售的入耳式耳机不适用七天无理由退货。
质量问题按售后质量保障流程处理。
```

`.invalid` 用于本地测试，生产来源必须经过白名单映射。

## 任务 2：Frontmatter Schema

```ts
const FrontmatterSchema = z.strictObject({
  documentId: z.string().regex(/^[a-z0-9-]{3,100}$/),
  title: z.string().trim().min(1).max(200),
  tenantId: z.string().trim().min(1).max(100),
  visibility: z.enum(['public', 'customer', 'staff']),
  revision: z.number().int().positive(),
  status: z.enum(['draft', 'published', 'archived']),
  validFrom: z.string().datetime({ offset: true }).nullable(),
  validTo: z.string().datetime({ offset: true }).nullable(),
  canonicalUrl: z.string().url().nullable(),
});
```

## 任务 3：安全 Loader

```ts
const MAX_MARKDOWN_BYTES = 1_000_000;

async function loadMarkdownFile(root: string, filename: string) {
  if (!/^[a-z0-9][a-z0-9-]*\.md$/i.test(filename)) {
    throw new Error('非法知识文件名');
  }
  const absoluteRoot = path.resolve(root);
  const absoluteFile = path.resolve(absoluteRoot, filename);
  if (!absoluteFile.startsWith(`${absoluteRoot}${path.sep}`)) {
    throw new Error('知识文件越界');
  }
  const stat = await fs.stat(absoluteFile);
  if (!stat.isFile() || stat.size > MAX_MARKDOWN_BYTES) {
    throw new Error('知识文件类型或大小不合法');
  }
  return fs.readFile(absoluteFile, 'utf8');
}
```

解析 Frontmatter 可以选择成熟的小型库，也可以为本课程固定格式实现严格解析器；无论哪种方式都要 Zod 校验，不能把任意 YAML 对象直接信任为 Metadata。

## 任务 4：清洗原则

只做可解释清洗：

- 统一换行和 Unicode 形式。
- 去掉重复空行和明确的模板页脚。
- 保留标题、列表、表格和政策编号。
- 不用正则“智能改写”业务正文。
- 清洗前后保存 contentHash 和 pipelineVersion。

## 测试

- 路径穿越 `../secret.md` 被拒绝。
- 超大文件被拒绝。
- Metadata 多余字段被拒绝。
- `validTo <= validFrom` 被拒绝。
- v1 与 v2 可以共存，但只有发布规则决定在线版本。
- 恶意正文被保留为不可信数据，不能在 Loader 阶段执行任何内容。

## Gate 03

- [ ] 10 篇资料可以人工逐篇核对。
- [ ] 每份资料来源、租户、版本和有效期明确。
- [ ] Loader 无法读取允许目录外文件。
- [ ] 清洗不会静默修改政策含义。

