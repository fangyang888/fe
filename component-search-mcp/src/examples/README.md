# Transformers.js Embedding 示例

这些示例分两层验证真实 Embedding 带来的能力，不把“模型能运行”误当成“搜索质量提高”。

## 准备

项目默认使用写在 `src/embeddings/transformers-js.ts` 中的固定运行档：

```text
model: Xenova/multilingual-e5-small
dimensions: 384
dtype: q8
cache: .cache/transformers
model hub: https://hf-mirror.com/
```

安装项目依赖后直接执行：

```bash
pnpm install
pnpm check:embedding
```

不需要 API Key，不需要运行 `ollama serve`。第一次执行会联网下载模型，之后使用磁盘缓存离线推理。

## 示例一：观察句子相似度

```bash
pnpm example:transformers-similarity
```

查询是“填写联系方式的表单控件”，候选包括手机号输入框、数据表格和人员选择弹窗。预期 `PhoneInput` 排名第一。

这个示例只验证：不同字面表达能否在向量空间中靠近。`score` 是余弦相似度，不是正确率。

## 示例二：关键词与 Transformers.js 对比

```bash
pnpm example:compare-search
```

它使用 `test/fixtures/project` 中的三个真实组件，执行 24 个带标准答案的 Case：

- `semantic`：刻意使用不同措辞，观察 Embedding 新增召回；
- `exact`：组件名、Props 等精确查询，观察语义搜索是否退化；
- `hard`：带否定和相近概念的困难查询。

逐条输出字段：

```text
keywordTop1     关键词搜索第一名
semanticTop1    Transformers.js 搜索第一名
semanticScore   第一名余弦相似度
outcome                   两者正确 / 语义新增命中 / 语义退化 / 两者错误
```

最后汇总每组 Top-1 准确率和提升百分点。当前只有三个候选组件，Top-3 没有区分度，因此示例只比较 Top-1。

使用当前固定模型在 24 条内置 Case 上的实测基线：

```text
关键词 Top-1：      37.5%
Transformers Top-1：66.7%
总提升：             29.2 个百分点
semantic 组：         8.3% → 58.3%
exact 组：          100.0% → 100.0%
hard 组：            33.3% → 50.0%
```

这只是小型 Fixture 的回归基线，不等于生产准确率。E5 的余弦分数整体可能较高，应比较同一候选集内的排名，不应直接把 `0.8` 当成“80% 正确”。

评估时不要只看总分：上线前最重要的是 `semantic` 组有明确提升，同时 `exact` 组没有明显退化。最终生产方案通常会把关键词与语义召回融合，而不是二选一。
