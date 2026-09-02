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

生产用真实 Embedding 当前默认通过 Transformers.js 在 Node.js 进程内生成，不需要 API Key，也不需要启动 Ollama 等常驻服务。内置运行档为 `Xenova/multilingual-e5-small`、固定 revision、q8 量化和 384 维。第一次运行会通过可配置的 Hugging Face 模型源下载到 `.cache/transformers`，后续直接复用本地缓存；当前默认下载源使用这台机器实测可达的 `hf-mirror.com`。完整步骤见上面的“真实 Embedding 接入、自测与设计说明”。快速检查：

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

默认索引写入 `.cache/components-index.json`，不会提交到 Git。

## 3. 不启动 MCP，先验证搜索

```bash
pnpm search:components -- \
  --project-root /absolute/path/to/frontend-project \
  --query "登录权限布局组件"
```

## 4. 接入 Codex

先取得绝对路径，然后添加本地 STDIO MCP：

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

本服务扫描的是服务器文件系统，不能直接读取客户端电脑上的项目。因此部署时需要把代码仓库 clone 或只读挂载到服务器，并让 `COMPONENT_MCP_PROJECT_ROOT` 和 `COMPONENT_MCP_ALLOWED_ROOTS` 使用服务器上的绝对路径。`.cache` 目录需要保持可写。它是常驻 Node.js 服务，不能作为静态文件上传到 OSS 后直接运行。

当前仓库的 `.github/workflows/deploy.yml` 已将该服务接入阿里云 ECS 发布流程：CI 构建并测试 MCP，把根项目、`admin` 和 `miniapp` 的源码打包为干净快照，ECS 使用 PM2 运行 HTTP 服务，并由 Nginx 暴露：

```text
http://47.106.103.79/mcp/component-search
http://47.106.103.79/mcp/component-search/healthz
```

对应的 Codex 配置为：

```toml
[mcp_servers.internal-components]
url = "http://47.106.103.79/mcp/component-search"
```

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
- 搜索使用可解释的关键词与同义词加权，尚未使用向量数据库。
- 当前变化后会自动整体重建；按文件增量解析和远程组件文档留到下一阶段。
