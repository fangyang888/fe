# 真实 Embedding 接入、自测与设计说明

本文记录真实 Embedding 纵向链路的每一步改动、稳定性目的和自测方法。阅读顺序与代码依赖方向一致，适合对照源码学习。

## 1. 当前完成范围

已经打通：

```text
组件源码
  → AST 元数据与 embeddingText
  → EmbeddingProvider 工厂
      ├─ Transformers.js 进程内 ONNX 推理（当前默认）
      ├─ Ollama 本地 Embed API（保留备用）
      └─ OpenAI Embeddings API（保留备用）
  → 本地持久化向量索引
  → 查询文本向量
  → 精确余弦相似度
  → Top-K 语义结果
```

当前刻意没有把原 MCP 的关键词搜索直接替换成语义搜索。上线前必须先用真实查询评测语义召回质量；未经评测直接切换主链路会扩大回归风险。现在可以分别运行关键词搜索和语义搜索，完成对比后再实现 Hybrid Search 与灰度切换。

官方参考：

- [Transformers.js Pipeline API](https://huggingface.co/docs/transformers.js/pipelines)
- [Transformers.js Feature Extraction API](https://huggingface.co/docs/transformers.js/api/pipelines#module_pipelines.FeatureExtractionPipeline)
- [multilingual-e5-small 的 Transformers.js 模型产物](https://huggingface.co/Xenova/multilingual-e5-small)

## 2. 第一步：删除学习用默认词表

相关代码：`src/vector-search.ts`、`src/examples/bag-of-words-search.ts`。

生产函数现在要求调用方显式传入词表：

```ts
bagOfWords(text, vocabulary);

searchByBagOfWords(query, documents, {
  vocabulary,
  limit: 5,
});
```

词袋向量的每个位置由词表顺序决定。静默使用默认词表会产生两个风险：

1. 业务文本出现默认词表以外的词时会变成零向量，但程序不会报错；
2. 索引端和查询端使用不同词表或不同顺序时，数字维度相同也会表达不同含义。

因此生产模块不再导出 `LEARNING_VOCABULARY`。教学词表移动到示例文件并命名为 `EXAMPLE_VOCABULARY`，明确限定其作用域。

真实 Embedding 不依赖手工词表。模型、维度和文档哈希会成为新的兼容性边界。

## 3. 第二步：定义 Provider 边界

相关代码：`src/embeddings/provider.ts`。

```ts
interface EmbeddingProvider {
  provider: string;
  model: string;
  dimensions: number;
  embedDocuments(texts: readonly string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}
```

搜索和索引代码只依赖这个接口，不依赖 Transformers.js、Ollama 或 OpenAI 的调用格式。这样做的稳定性收益是：

- 单元测试可以使用 Fake Provider，不消耗额度，也不依赖网络；
- 以后切换公司内部模型或其他服务时，不必重写索引和搜索；
- 文档批量生成与单条查询的职责分开，方便分别统计成本和延迟；
- `provider + model + dimensions` 共同定义向量兼容性，任意一项变化都会使旧缓存失效。

`assertEmbeddingVector()` 统一检查数组类型、维度和 `NaN/Infinity`。校验集中在边界层，错误不会传播到相似度排序后才被发现。

## 4. 第三步：实现可切换 Provider

相关代码：

- `src/embeddings/factory.ts`：选择 Provider；
- `src/embeddings/transformers-js.ts`：当前默认的进程内实现；
- `src/embeddings/ollama.ts`：保留的本地服务实现；
- `src/embeddings/openai.ts`：保留的远程备用实现。

公共配置来自运行环境：

```text
COMPONENT_MCP_EMBEDDING_PROVIDER
COMPONENT_MCP_EMBEDDING_MODEL
COMPONENT_MCP_EMBEDDING_MODEL_REVISION
COMPONENT_MCP_EMBEDDING_DIMENSIONS
COMPONENT_MCP_EMBEDDING_BATCH_SIZE
COMPONENT_MCP_MODEL_CACHE_PATH
COMPONENT_MCP_MODEL_HUB_URL
COMPONENT_MCP_TRANSFORMERS_DTYPE
```

Ollama 额外使用：

```text
OLLAMA_BASE_URL
OLLAMA_KEEP_ALIVE
COMPONENT_MCP_EMBEDDING_TIMEOUT_MS
COMPONENT_MCP_EMBEDDING_MAX_RETRIES
```

OpenAI 备用实现额外使用：

```text
OPENAI_API_KEY
OPENAI_BASE_URL
```

未指定 Provider 时默认使用 `transformers-js`，它不会产生 API 调用费用，也不依赖常驻服务。固定运行档集中定义在 `DEFAULT_TRANSFORMERS_JS_EMBEDDING_CONFIG`：

```text
model: Xenova/multilingual-e5-small
revision: 761b726dd34fb83930e26aab4e9ac3899aa1fa78
dimensions: 384
batchSize: 16
dtype: q8
cacheDir: .cache/transformers
modelHubUrl: https://hf-mirror.com/
```

集中常量避免同一组参数散落在 CLI、索引和查询代码里。模型 revision 被固定，并拼入 Provider 对外报告的模型标识；升级模型 revision 会使旧向量缓存自动失效。环境变量仍可覆盖这些值，方便部署时指定统一缓存目录或受控升级。

切换只需要更改配置：

```bash
# 当前默认模式（通常无需设置）
export COMPONENT_MCP_EMBEDDING_PROVIDER="transformers-js"

# 需要复用已有 Ollama 服务时
export COMPONENT_MCP_EMBEDDING_PROVIDER="ollama"

# 以后切回 OpenAI
export COMPONENT_MCP_EMBEDDING_PROVIDER="openai"
```

工厂返回的三个实现都满足同一个 `EmbeddingProvider` 接口，向量索引和搜索代码不需要出现 Provider 分支。

Transformers.js Provider 包含以下保护：

- 惰性加载模型，只有首次真正生成向量时才初始化 ONNX Runtime；
- 同一个 Provider 实例只加载一次 Pipeline，并发调用共享同一个加载 Promise；
- 文档批量生成，控制单次内存峰值；
- 使用 `mean pooling + normalize` 生成适合余弦相似度的定长向量；
- 根据 E5 模型约定，为索引文本加 `passage:`，为查询加 `query:`；
- 严格检查返回数量、维度和有限数值；
- 模型加载失败后清除失败的 Promise，后续调用可以重试；
- q8 权重降低磁盘占用与 CPU 内存压力；
- OpenAI 备用实现仍只从环境读取密钥，不把密钥写进源码或索引。

首次运行需要从 Hugging Face 下载模型文件。文件缓存成功后，推理只在当前 Node.js 进程内完成，不需要网络端口或后台服务。索引和查询必须继续使用同一 Provider、模型 revision、维度以及 E5 输入前缀规则。

## 5. 第四步：建立可增量更新的向量索引

相关代码：`src/vector-index.ts`。

向量索引与 AST 组件索引分开保存：

```ts
interface ComponentVectorIndex {
  schemaVersion: 1;
  projectRoot: string;
  sourceFingerprint: string;
  provider: string;
  model: string;
  dimensions: number;
  records: VectorRecord[];
}
```

每条记录还保存：

- `documentHash`：`embeddingText` 的 SHA-256；
- `indexedAt`：该向量实际生成时间；
- `vector`：真实模型返回的浮点数组。

重建时的规则：

1. Provider、模型或维度变化：全部重新生成；
2. `documentHash` 不变且缓存向量合法：直接复用；
3. 新增或内容变化：只请求变化的组件；
4. 已删除组件：不会写进新索引；
5. 缓存损坏或维度错误：只重新生成损坏项。

这保证普通源码扫描不会重复运行本地模型；以后切回收费 API 时，同一机制也能避免重复费用。

索引写入使用“同目录临时文件 → `rename` 原子替换”，文件权限设置为 `0600`。进程在写入中途退出时，旧索引仍然完整，不会留下半截 JSON。

## 6. 第五步：提供三条独立命令

### 6.1 模型烟雾测试

```bash
pnpm check:embedding
```

它只处理两个短文本，验证模型能下载或从缓存加载、ONNX 推理可执行、返回维度正确且余弦计算有效。输出只包含 Provider、模型标识、维度和相似度，不输出完整向量。

### 6.2 构建组件向量索引

```bash
pnpm index:vectors -- --project-root /absolute/path/to/project
```

命令会先生成最新 AST 组件索引，再增量生成向量索引。输出包括生成数量和复用数量，便于检查是否发生不必要的重复推理。

### 6.3 执行语义搜索

```bash
pnpm search:semantic -- \
  --project-root /absolute/path/to/project \
  --query "展示九张照片的布局组件" \
  --limit 5
```

它会检查源码指纹、刷新过期组件索引、增量刷新向量索引，然后生成查询向量并执行精确 Top-K 搜索。

## 7. 从零自测

在 `component-search-mcp` 目录执行以下步骤。

### 7.1 单元测试：不需要模型、网络或密钥

```bash
pnpm test
```

必须看到所有测试通过。重点测试包括：

- 空环境稳定选择固定的 Transformers.js 运行档；
- 工厂能在 Transformers.js、Ollama 与 OpenAI 之间显式切换；
- Pipeline 惰性加载且只加载一次；
- E5 查询和文档分别添加 `query:`、`passage:` 前缀；
- 文档按批次生成，Pipeline 使用 mean pooling 和归一化；
- 返回维度错误时拒绝写入；
- 未变化文档复用缓存；
- 单文档变化只重新生成一条；
- 模型切换使旧缓存整体失效；
- 向量索引可以持久化、重新读取和搜索。

### 7.2 第一次下载并缓存模型

不需要安装 Ollama，也不需要执行 `ollama serve` 或配置 API Key。安装 Node 依赖后直接运行：

```bash
pnpm install
pnpm check:embedding
```

第一次运行会通过 `hf-mirror.com` 下载 `Xenova/multilingual-e5-small` 的 tokenizer、配置和 q8 ONNX 权重，并保存到项目的 `.cache/transformers`。选择该默认源是因为当前机器访问 Hugging Face 官方源发生连接超时，而该镜像已完成真实下载验证；需要使用官方源或公司制品库时，通过 `COMPONENT_MCP_MODEL_HUB_URL` 覆盖。缓存完成后，推理在 Node.js 进程内完成，不需要模型服务。

模型名、revision、维度和量化类型是当前部署选择。这个固定配置与“学习用默认词表”不同：Provider、模型 revision 和维度会写入向量索引，发生变化时程序能识别并重建；词袋默认词表如果静默改变含义，旧向量无法自证兼容。

默认情况下不需要设置任何 Embedding 环境变量。生产机没有外网时，应在构建或发布阶段预热 `.cache/transformers`，并通过 `COMPONENT_MCP_MODEL_CACHE_PATH` 指向随制品分发的只读/可读模型目录。本项目不会自动加载 `.env.example`；它只是可选覆盖项的配置模板。

### 7.3 运行真实烟雾测试

```bash
pnpm check:embedding
```

检查：

- `model` 与配置相同；
- `provider` 是 `transformers-js`；
- `model` 同时包含模型名和固定 revision；
- `dimensions` 和两个 `returnedDimensions` 都是 `384`；
- `cosineSimilarity` 是有限数值；
- 终端中没有出现完整向量。

相似度没有固定标准答案，不能把它解释成正确率。

### 7.4 验证增量缓存

第一次执行：

```bash
pnpm index:vectors -- --project-root /absolute/path/to/project
```

预期 `Generated` 等于组件数量、`reused` 为 `0`。

不修改源码，再执行同一命令。预期 `Generated: 0`，全部为 `reused`。

然后只修改一个组件的 JSDoc 描述或 `@use-case`，再次执行。预期只生成一条。如果全部重新生成，应检查模型、维度、项目路径是否发生变化。

### 7.5 验证搜索质量

至少准备三类查询：

```text
业务语义：展示九张照片的布局组件
准确名称：NineGrid
Props/路径：支持 multiple 的选择组件
```

分别运行：

```bash
pnpm search:semantic -- --project-root /absolute/path/to/project --query "查询内容"
pnpm search:components -- --project-root /absolute/path/to/project --query "查询内容"
```

预期业务语义查询更可能受益于 Embedding；准确名称、Props 和路径通常由关键词搜索表现更好。这组结果是后续 Hybrid Search 的基线。

当前固定模型在仓库 24 条 Fixture Case 上的实测结果为：关键词 Top-1 `37.5%`，语义 Top-1 `66.7%`，提升 `29.2` 个百分点；其中 exact 组均为 `100%`。该结果证明链路在小样本上有增益，但不能替代真实业务查询评测。

## 8. 常见故障定位

### 首次运行提示无法下载模型

检查机器能否访问 Hugging Face。若所在网络需要可信镜像，可临时设置 `COMPONENT_MCP_MODEL_HUB_URL` 后预热缓存。生产环境若禁止出网，应提前运行 `pnpm check:embedding` 预热缓存，再把完整缓存目录作为部署制品的一部分，并设置 `COMPONENT_MCP_MODEL_CACHE_PATH`。

### 模型每次启动都重新下载

检查 `.cache/transformers` 是否持久化、运行用户是否有读取权限，以及启动时的 `COMPONENT_MCP_MODEL_CACHE_PATH` 是否一致。不要把模型放在容器临时层。

### 切换回 Ollama

Ollama Provider 仍保留。需要使用已有 Ollama 服务时显式设置：

```bash
export COMPONENT_MCP_EMBEDDING_PROVIDER="ollama"
```

同时确保 Ollama 模型、维度和地址配置相互匹配。切换 Provider 后旧向量会自动失效并重建。

### 切换回 OpenAI

保留的 OpenAI Provider 仍可使用：

```bash
export COMPONENT_MCP_EMBEDDING_PROVIDER="openai"
export OPENAI_API_KEY="由 Secret Manager 注入的密钥"
export COMPONENT_MCP_EMBEDDING_MODEL="text-embedding-3-small"
export COMPONENT_MCP_EMBEDDING_DIMENSIONS="1536"
```

Provider、模型或维度改变后，旧向量会自动失效并重建。不要把真实 API Key 写进源码。

### `dimensions differ`

配置维度与模型输出维度不一致，或者旧缓存来自另一个模型。恢复 `384` 维默认值或为新模型填写真实维度后重建，不能截断、补零或混用向量。

### 第二次构建仍全部重新生成

依次检查 `provider`、`model`、`dimensions`、`projectRoot` 和 `embeddingText` 是否稳定。不要用 `mtime` 判断 Embedding 是否变化，本实现使用内容哈希。

## 9. 上线前仍需完成

- 建立至少 30 条真实查询及期望组件标注；
- 对比关键词与语义检索的 Top-1、Recall@3；
- 实现 Hybrid Search 与可回滚开关；
- 增加请求耗时、重试次数、生成/复用数量和失败率指标；
- 记录 Transformers.js 首次加载时间、常驻内存和批量推理 P95；
- 部署阶段预热并校验模型缓存，避免生产实例启动时临时下载；
- 明确以后切回远程服务时，组件源码或注释能否外发；
- CI 默认只跑模拟 Provider 测试，真实模型烟雾测试放到拥有持久缓存的受控环境；
- 根据实测 P95 延迟和数据量决定是否接入 Qdrant。

在完成质量评测之前，保留原关键词搜索作为稳定主链路是有意设计，不是遗漏。
