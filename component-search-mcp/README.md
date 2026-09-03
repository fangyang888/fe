# Internal Component Search MCP

这是一个本地、只读的前端组件检索 MCP。目标架构是“AST 抽取 → Embedding → Vector DB → MCP Tools”。当前第一阶段已经支持 React/TypeScript AST，能提取组件名、JSDoc、Props、import/export、Hooks、JSX、源码路径和项目内使用位置，并为后续 Embedding 生成标准文本。

相关文档：

- [架构与阶段拆分](docs/architecture.md)
- [当前实现、工作原理与学习路线](docs/current-implementation-and-learning-guide.md)
- [从零创建、接入与导出 MCP Server](docs/build-and-distribute-an-mcp-server.md)
- [Embedding 与向量检索学习指南](docs/embedding-learning-guide.md)
- [真实 Embedding 接入、自测与设计说明](docs/production-embedding-implementation.md)

## 余弦相似度与词袋检索练习

第一阶段的可运行实现位于 `src/vector-search.ts`，包含余弦相似度、词袋向量化和内存 Top-K 检索。运行示例：

```bash
pnpm example:bag-of-words
```

示例手算使用 `A = [1, 2, 3]`、`B = [2, 1, 0]`：

```text
A · B = 4
|A| = sqrt(14)
|B| = sqrt(5)
cosine(A, B) = 4 / sqrt(70) ≈ 0.478091
```

生产用真实 Embedding 当前默认通过 Transformers.js 在 Node.js 进程内生成，不需要 API Key，也不需要启动 Ollama 等常驻服务。内置运行档为 `Xenova/multilingual-e5-small`、固定 revision、q8 量化和 384 维。第一次运行会通过可配置的 Hugging Face 模型源下载约 129 MB 的量化模型，后续从操作系统的用户缓存目录复用；因此升级或重装 `npx` 包不会重复下载模型。当前默认下载源使用这台机器实测可达的 `hf-mirror.com`。完整步骤见上面的“真实 Embedding 接入、自测与设计说明”。快速检查：

```bash
pnpm check:embedding
```

查看句子相似度和关键词/语义检索能力对比：

```bash
pnpm example:transformers-similarity
pnpm example:compare-search
```

示例说明及结果字段见 [`src/examples/README.md`](src/examples/README.md)。

## 1. 安装和构建

```bash
cd component-search-mcp
pnpm install
pnpm build
```

## 2. 为项目生成组件索引

只传项目根目录时，会自动发现 `src`、`modules`、`apps/*/src`、`packages/*/src` 等源码目录：

```bash
pnpm index -- --project-root /absolute/path/to/frontend-project
```

也可以重复传入 `--source-root`，显式覆盖自动发现结果：

```bash
pnpm index -- \
  --project-root .. \
  --source-root src \
  --source-root admin/src \
  --source-root miniapp/src
```

默认索引写入操作系统的用户缓存目录，并按项目绝对路径隔离；也可以通过 `COMPONENT_MCP_INDEX_PATH` 指定位置。

## 3. 不启动 MCP，先验证搜索

```bash
pnpm search:components -- \
  --project-root /absolute/path/to/frontend-project \
  --query "登录权限布局组件"
```

MCP Tool 默认使用关键词分数与 Embedding 相似度组合的混合检索。首次语义查询会下载模型，之后复用用户级缓存：

```bash
COMPONENT_MCP_SEARCH_MODE=hybrid pnpm start
```

每次 Tool 调用也可以通过 `searchMode` 选择 `hybrid` 或 `keyword`。当模型缺失、下载失败或 Embedding 服务不可用时，`hybrid` 会自动回退关键词检索，并在结构化结果中返回 `searchMode: "keyword-fallback"`。只使用关键词时：

```bash
COMPONENT_MCP_SEARCH_MODE=keyword pnpm start
```

## 4. 接入 Codex

### 通过 npm 使用

发布后，使用者无需 clone 本仓库。先取得项目和允许搜索父目录的绝对路径，然后添加本地 STDIO MCP：

```bash
codex mcp add internal-components \
  --env COMPONENT_MCP_PROJECT_ROOT=/absolute/path/to/project \
  --env COMPONENT_MCP_ALLOWED_ROOTS=/absolute/path/to/workspaces \
  --env COMPONENT_MCP_SEARCH_MODE=hybrid \
  -- npx -y internal-component-search-mcp@0.1.1
```

`@huggingface/transformers` 是必需依赖，以保证默认语义搜索不会因缺包而退化。npm 包本身只发布 `dist/src`；较大的 Transformers/ONNX 运行库由 npm 安装，量化模型则延迟到第一次语义查询时下载。两者都会复用本机缓存。

默认缓存位置：

- macOS：`~/Library/Caches/internal-component-search-mcp`
- Linux：`${XDG_CACHE_HOME:-~/.cache}/internal-component-search-mcp`
- Windows：`%LOCALAPPDATA%/internal-component-search-mcp`

可以通过 `COMPONENT_MCP_CACHE_PATH` 覆盖整个缓存目录，或分别使用 `COMPONENT_MCP_INDEX_PATH` 与 `COMPONENT_MCP_MODEL_CACHE_PATH` 覆盖索引和模型路径。

### 发布到 npm（维护者）

```bash
cd component-search-mcp
npm login
npm whoami
pnpm test
npm pack --dry-run
npm publish --access public
```

发布新版本前需要先更新 `package.json` 的 `version`。`prepack` 会再次构建 TypeScript，发布清单仅包含 `dist/src`、`README.md` 和 `package.json`。

### 从源码使用

先构建本仓库，然后添加本地 STDIO MCP：

```bash
codex mcp add internal-components \
  --env COMPONENT_MCP_PROJECT_ROOT=/absolute/path/to/project \
  -- node /absolute/path/to/component-search-mcp/dist/src/server.js
```

如果一套 MCP 需要切换搜索同一父目录下的多个项目，增加允许目录：

```bash
codex mcp add internal-components \
  --env COMPONENT_MCP_PROJECT_ROOT=/absolute/path/to/workspaces/default-project \
  --env COMPONENT_MCP_ALLOWED_ROOTS=/absolute/path/to/workspaces \
  -- node /absolute/path/to/component-search-mcp/dist/src/server.js
```

此时 `search_internal_component` 可以传入 `projectRoot`；没有传 `sourceRoots` 时会针对所选项目重新自动发现。超出 `COMPONENT_MCP_ALLOWED_ROOTS` 的路径会被拒绝。

检查连接：

```bash
codex mcp list
```

之后可以直接询问：

```text
当前项目有没有支持远程搜索和多选的人员选择组件？
```

## 5. 使用 Streamable HTTP

HTTP 入口与 STDIO 入口相互独立，构建后启动：

```bash
COMPONENT_MCP_PROJECT_ROOT=/srv/repos/default-project \
COMPONENT_MCP_ALLOWED_ROOTS=/srv/repos \
COMPONENT_MCP_HTTP_HOST=0.0.0.0 \
COMPONENT_MCP_HTTP_PORT=3102 \
pnpm start:http
```

服务地址和健康检查地址分别为：

```text
http://<server>:3102/mcp
http://<server>:3102/healthz
```

Codex 客户端连接命令：

```bash
codex mcp add internal-components \
  --url http://<server>:3102/mcp
```

也可以写入 `~/.codex/config.toml`：

```toml
[mcp_servers.internal-components]
url = "http://<server>:3102/mcp"
```

HTTP 入口按无状态模式运行，不包含 Token、Host 或 Origin 校验。只应部署在可信内网；如果需要公网访问，应由反向代理、API 网关或 VPN 提供 HTTPS 和访问控制。

本服务扫描的是服务器文件系统，不能直接读取客户端电脑上的项目。因此部署时需要把代码仓库 clone 或只读挂载到服务器，并让 `COMPONENT_MCP_PROJECT_ROOT` 和 `COMPONENT_MCP_ALLOWED_ROOTS` 使用服务器上的绝对路径。配置的用户缓存目录需要保持可写。它是常驻 Node.js 服务，不能作为静态文件上传到 OSS 后直接运行。

当前仓库不部署 HTTP MCP；GitHub Actions、ECS PM2 和 Nginx 均不包含该服务。日常使用请通过上面的本地 STDIO 方式连接，才能读取使用者电脑上的项目源码。

## 组件注释建议

源码可以通过 JSDoc 补充业务语义：

```tsx
/**
 * 企业人员远程选择器。
 * @use-case 选择审批人
 * @use-case 添加项目成员
 */
export function UserSelectModal() {}
```

`@use-case` 会获得比普通关键词更高的检索权重。

## 当前 MVP 的边界

- 只读取本地源码，不修改业务代码。
- 支持 `.tsx`、`.jsx` 和 `.vue`。
- Tool 支持选择允许范围内的 `projectRoot`，不再把业务项目写死在源码中。
- 未配置 `sourceRoots` 时自动发现普通项目、`apps/*`、`packages/*` 和 package.json workspaces。
- 每次搜索前检查目标项目文件指纹；有新增、修改、删除或重命名时，先刷新索引再搜索。
- React/TypeScript 使用 TypeScript AST；Vue 当前是 SFC 启发式抽取，下一阶段替换为 Vue Compiler AST。
- React Props 支持函数参数、内联类型、`ComponentNameProps`、`Props` 和常见 `React.FC<Props>` 写法。
- 搜索默认组合关键词/同义词加权与 Embedding 向量相似度；语义能力不可用时自动回退关键词结果。
- 当前变化后会自动整体重建；按文件增量解析和远程组件文档留到下一阶段。
