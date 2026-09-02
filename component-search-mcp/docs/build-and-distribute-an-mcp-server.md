# 从零创建、接入与导出一个 MCP Server

这份文档以 Node.js + TypeScript + STDIO 为例，从空目录创建一个最小 MCP Server，并说明如何本地安装、打包成 `.tgz`、发布到私有 npm，以及什么时候需要部署为远程 Streamable HTTP 服务。

这里的“导出”可能有三种含义：

1. 把源码交给别人运行：Git 仓库分发。
2. 把 MCP 做成可安装命令：npm 包或 `.tgz` 文件。
3. 让团队不安装本地代码也能使用：部署远程 HTTP MCP。

MCP 本身不是一种构建产物格式。通常导出的是一个**能够启动 MCP Server 的程序或服务**，再让 MCP Client 配置它。

## 1. 先理解最小架构

```text
Codex / Cursor / Claude
        │
        │ MCP 协议
        ↓
你的 MCP Server
        │
        ├─ Tool：执行操作或查询
        ├─ Resource：提供可读取上下文
        └─ Prompt：提供可复用提示模板
```

搜索项目组件最适合从 Tool 开始，因为它有明确输入 `query`，并返回结构化候选结果。

传输方式常见有：

| 方式 | 适用场景 | Client 怎样连接 |
|---|---|---|
| STDIO | 本地开发、本地仓库扫描、单人或每人独立运行 | Client 启动一个本地子进程 |
| Streamable HTTP | 团队共享服务、远程数据、统一鉴权 | Client 连接一个 URL |

本地组件搜索涉及读取开发者工作区，第一版优先使用 STDIO 最简单，也不需要开放网络端口。

## 2. 环境准备

确认 Node.js 版本：

```bash
node --version
npm --version
```

本文示例要求 Node.js 18 或更高版本。

创建项目：

```bash
mkdir my-component-mcp
cd my-component-mcp
npm init -y
npm install @modelcontextprotocol/sdk zod
npm install --save-dev typescript @types/node
```

官方 MCP TypeScript SDK 是：

```text
@modelcontextprotocol/sdk
```

## 3. 配置 `package.json`

将 `package.json` 调整为：

```json
{
  "name": "my-component-mcp",
  "version": "0.1.0",
  "description": "Search reusable frontend components through MCP",
  "type": "module",
  "private": true,
  "bin": {
    "my-component-mcp": "dist/server.js"
  },
  "files": [
    "dist",
    "README.md"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "test": "npm run build && node --test dist/test/*.test.js",
    "prepack": "npm run build"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.25.3",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@types/node": "^24.6.0",
    "typescript": "~5.9.3"
  },
  "engines": {
    "node": ">=18"
  }
}
```

说明：

- `type: module` 使用 ESM。
- `bin` 让 npm 安装后生成同名可执行命令。
- `files` 限制发布包内容，避免把测试数据、缓存和源码仓库全部打包。
- `prepack` 保证执行 `npm pack` 或 `npm publish` 前先编译。
- 开发阶段使用 `private: true` 防止误发布；真正发布到 registry 前才改为 `false` 或删除该字段。

实际开发时应让 npm 自动写入你安装到的版本，不必机械复制这里的版本号。

## 4. 配置 TypeScript

新建 `tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"]
}
```

NodeNext 模式下，TypeScript 源码中的本地 import 要写编译后的 `.js` 扩展名：

```ts
import { searchComponents } from "./search.js";
```

## 5. 编写最小 MCP Server

新建 `src/server.ts`：

```ts
#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const components = [
  {
    name: "PhoneInput",
    description: "手机号输入组件",
    sourcePath: "src/components/PhoneInput.tsx",
  },
  {
    name: "GridMenu",
    description: "九宫格入口菜单",
    sourcePath: "src/components/GridMenu.tsx",
  },
];

const componentSchema = z.object({
  name: z.string(),
  description: z.string(),
  sourcePath: z.string(),
});

const server = new McpServer(
  {
    name: "my-component-search",
    version: "0.1.0",
  },
  {
    instructions: "实现新组件前先搜索已有组件。本服务只读。",
  },
);

server.registerTool(
  "search_component",
  {
    title: "Search project components",
    description:
      "Search reusable frontend components by a natural-language requirement.",
    inputSchema: {
      query: z.string().min(1).describe("Component name or requirement"),
      limit: z.number().int().min(1).max(20).default(5),
    },
    outputSchema: {
      query: z.string(),
      results: z.array(componentSchema),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  async ({ query, limit }) => {
    const normalizedQuery = query.toLowerCase();
    const results = components
      .filter((component) =>
        `${component.name} ${component.description}`
          .toLowerCase()
          .includes(normalizedQuery),
      )
      .slice(0, limit);

    const structuredContent = { query, results };

    return {
      structuredContent,
      content: [
        {
          type: "text",
          text: results.length
            ? results
                .map(
                  (item, index) =>
                    `${index + 1}. ${item.name} - ${item.sourcePath}`,
                )
                .join("\n")
            : "没有找到匹配组件。",
        },
      ],
    };
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("my-component-mcp started");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

这个示例仍然是内存数据，目的只是先跑通 MCP 协议。跑通后再把 `components` 替换为 AST 索引和搜索模块。

## 6. 为什么 Tool 要这样设计

### 6.1 Tool 名称

名称应该稳定、明确、使用动词：

```text
search_component
get_component
find_component_usage
refresh_component_index
```

不要把版本号或具体项目名写进通用 Tool 名称。项目范围可以由 Server 配置或 Tool 参数决定。

### 6.2 description

description 不只是给人看的，Agent 会根据它判断什么时候调用工具。应写清：

- 工具做什么。
- 什么时候应该调用。
- 返回什么信息。
- 是否有副作用。

### 6.3 inputSchema 和 outputSchema

Schema 的作用：

- 在执行前拒绝错误参数。
- 让 Agent 知道必填项、类型和范围。
- 保证调用方得到稳定的数据结构。
- 以后升级时更容易做兼容控制。

搜索结果应该返回稳定 ID，而不只返回名字。后续的 `get_component` 可以通过 ID 获取详情。

### 6.4 `structuredContent` 和 `content`

- `structuredContent` 适合 Agent 和程序继续处理。
- `content` 适合显示简短、人类可读的摘要。

两者可以同时返回。不要把几千行源码全部塞进搜索结果；先返回候选，再用详情 Tool 按需读取。

### 6.5 annotations

只读搜索工具应明确标注：

```ts
{
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false
}
```

如果以后新增刷新索引工具，它会写缓存但不修改业务源码，需要按实际副作用重新判断 annotations，不要复制只读标记。

## 7. 构建与本地启动

```bash
npm run build
npm start
```

STDIO Server 启动后会持续等待协议消息，看起来像“命令卡住”是正常现象。按 `Ctrl+C` 结束。

关键规则：**MCP Server 不要向 stdout 打普通日志。** STDIO 协议会使用 stdout，日志请用 `console.error` 写到 stderr。

检查构建产物第一行是否保留 shebang：

```bash
head -n 1 dist/server.js
```

应该看到：

```text
#!/usr/bin/env node
```

## 8. 接入 Codex

Codex 支持本地 STDIO MCP 和远程 Streamable HTTP MCP。桌面端、CLI 和 IDE 扩展共享 MCP 配置。

### 8.1 使用命令添加本地 MCP

使用编译后文件的绝对路径：

```bash
codex mcp add my-components -- \
  node /absolute/path/to/my-component-mcp/dist/server.js
```

如果 Server 需要环境变量：

```bash
codex mcp add my-components \
  --env COMPONENT_MCP_PROJECT_ROOT=/absolute/path/to/frontend-project \
  --env COMPONENT_MCP_SOURCE_ROOTS=src,packages/ui/src \
  -- node /absolute/path/to/my-component-mcp/dist/server.js
```

检查：

```bash
codex mcp list
```

在 Codex 交互界面中也可以使用 `/mcp` 查看状态。

### 8.2 手动配置 `config.toml`

全局配置文件：

```text
~/.codex/config.toml
```

也可以在受信任项目中使用项目级：

```text
.codex/config.toml
```

STDIO 配置示例：

```toml
[mcp_servers.my_components]
command = "node"
args = ["/absolute/path/to/my-component-mcp/dist/server.js"]
cwd = "/absolute/path/to/frontend-project"

[mcp_servers.my_components.env]
COMPONENT_MCP_PROJECT_ROOT = "/absolute/path/to/frontend-project"
COMPONENT_MCP_SOURCE_ROOTS = "src,packages/ui/src"
```

用 `cwd` 推断当前项目比较方便，但显式环境变量更容易排查。路径必须使用真实绝对路径，不要把文档里的 `/absolute/path` 原样复制。

## 9. 如何在不同项目中通用

一个通用 MCP 不应该把 `node-tools` 或某个业务仓库路径写死在源码中。

当前组件搜索 MCP 已经按三层实现基础版本：

1. Server 启动配置：默认 `COMPONENT_MCP_PROJECT_ROOT` 和 `COMPONENT_MCP_ALLOWED_ROOTS`。
2. Tool 调用参数：`query`、`projectRoot`、`sourceRoots`、`limit`。
3. 自动发现：常见源码目录、`apps/*`、`packages/*` 和 package.json workspaces。

启动配置示例：

```bash
codex mcp add company-components \
  --env COMPONENT_MCP_PROJECT_ROOT=/absolute/path/to/workspaces/default-project \
  --env COMPONENT_MCP_ALLOWED_ROOTS=/absolute/path/to/workspaces \
  -- node /absolute/path/to/component-search-mcp/dist/src/server.js
```

安全设计：

- 维护允许读取的 `allowedRoots`。
- `path.resolve` 后检查目标路径仍在允许目录下。
- 忽略 `.env`、证书、密钥、构建产物和依赖目录。
- 搜索工具只返回必要源码摘要，不默认返回整个文件。
- 缓存按项目隔离，不把多个客户或仓库数据混在一起。
- 如果使用远程服务，不应上传未经授权的公司源码到外部 Embedding API。

推荐的通用索引键：

```text
hash(projectRoot + sourceRoots + schemaVersion + parserVersion)
```

## 10. 导出方式一：Git 仓库分发

适合团队内部早期试用。

提供以下内容：

- 源码。
- lockfile。
- README。
- 安装、构建和 Codex 配置示例。
- `.gitignore` 排除 `.cache`、`dist` 和密钥。

使用者执行：

```bash
git clone <repository-url>
cd my-component-mcp
npm ci
npm run build
codex mcp add my-components -- node "$(pwd)/dist/server.js"
```

优点是简单、方便审查源码；缺点是每个使用者都要安装和构建。

## 11. 导出方式二：生成 `.tgz` 安装包

这是“不发布到 npm，但交付一个可安装文件”的方式。

### 11.1 打包前检查

保持 `private: true` 也可以执行 `npm pack`。先查看将被打包的文件：

```bash
npm pack --dry-run
```

确认没有包含：

- `.env` 和 Token。
- 本地组件索引和源码缓存。
- 测试仓库、日志、临时文件。
- 不必要的源代码或公司数据。

### 11.2 生成包

```bash
npm pack
```

会生成类似：

```text
my-component-mcp-0.1.0.tgz
```

### 11.3 测试安装包

在临时目录安装：

```bash
mkdir /tmp/my-component-mcp-smoke-test
cd /tmp/my-component-mcp-smoke-test
npm init -y
npm install /absolute/path/to/my-component-mcp-0.1.0.tgz
./node_modules/.bin/my-component-mcp
```

Server 正常等待 STDIO 消息即可按 `Ctrl+C` 结束。

将它配置给 Codex时，可以使用安装后的实际 bin 文件：

```bash
codex mcp add my-components -- \
  /absolute/path/to/smoke-test/node_modules/.bin/my-component-mcp
```

团队也可以把 `.tgz` 上传到内部制品库，但不要通过聊天或公共网盘传播包含公司源码、缓存或密钥的包。

## 12. 导出方式三：发布到私有 npm Registry

适合多人安装和版本管理。

### 12.1 修改包名和发布设置

使用公司 scope，避免名称冲突：

```json
{
  "name": "@your-company/component-search-mcp",
  "version": "0.1.0",
  "private": false,
  "publishConfig": {
    "access": "restricted"
  }
}
```

如果公司使用 Verdaccio、GitHub Packages、Azure Artifacts 等私有 registry，应按公司规范配置 registry 和认证。Token 不要写入仓库中的 `package.json` 或文档示例。

### 12.2 发布前检查

```bash
npm test
npm pack --dry-run
npm publish --dry-run
```

确认后发布：

```bash
npm publish --access restricted
```

发布是外部写操作，必须确认 registry、scope、版本、包内容和权限全部正确后执行。

### 12.3 使用发布后的包

可以让 Codex 通过 `npx` 启动：

```bash
codex mcp add company-components \
  --env COMPONENT_MCP_PROJECT_ROOT=/absolute/path/to/frontend-project \
  -- npx -y @your-company/component-search-mcp
```

私有包需要使用者机器已经登录对应 registry，或者通过安全的环境变量/凭据管理提供认证。不要把 npm Token 放进共享的 MCP 配置文件。

### 12.4 版本升级

遵循语义化版本：

- Patch：修复，不改变 Tool 契约。
- Minor：新增可选字段或新 Tool，保持兼容。
- Major：重命名 Tool、删除字段、改变现有语义。

MCP Tool 的名称、输入和输出 Schema 就是 API。发布后应尽量保持兼容。

## 13. 导出方式四：部署远程 Streamable HTTP MCP

适合以下场景：

- 团队共享远程组件文档或统一索引。
- 不希望每个人都下载和运行索引服务。
- 需要集中鉴权、审计、限流和版本升级。

远程服务的典型形态：

```text
Codex ──HTTPS──> MCP Gateway / Server
                    ├─ Authentication
                    ├─ Component metadata DB
                    ├─ Vector DB
                    └─ Repository/document connectors
```

Codex 配置形态是 URL，而不是本地 `command`：

```toml
[mcp_servers.company_components]
url = "https://mcp.example.com/components"
```

远程化不是简单地把 STDIO 入口放到服务器上，还需要处理：

- HTTPS。
- OAuth 或其他身份认证。
- 用户、团队和仓库权限隔离。
- 请求超时、限流和审计。
- 索引更新任务。
- 源码与向量数据的合规存储。
- 健康检查和可观测性。

对于“搜索每个人本地尚未提交的代码”，远程 MCP 并不天然合适。可以采用混合方式：

- 本地 STDIO MCP 搜索当前工作区。
- 远程 HTTP MCP 搜索公司公共组件和文档。
- Agent 将两边结果合并后推荐。

## 14. MCP 与 Codex Plugin 的关系

纯 MCP Server 已经可以被支持 MCP 的 Client 使用。如果希望把 MCP、Skills、说明和默认配置作为一个完整 Codex 扩展体验交付，可以再封装为 Codex Plugin。

两者不要混淆：

- npm 包解决的是 Node 程序安装和启动。
- MCP 定义 Client 与 Server 的协议和工具契约。
- Plugin 可以把 MCP Server、Skills 和其他能力组合成一个安装单元。

第一阶段建议先把 MCP Server 本身做稳定，再考虑 Plugin 包装。

## 15. 发布检查清单

### 功能

- [ ] `npm ci` 能从空环境安装。
- [ ] `npm run build` 成功。
- [ ] 测试全部通过。
- [ ] MCP Client 能列出 Tool。
- [ ] 每个 Tool 的成功、无结果和非法输入都已测试。
- [ ] Server 重启后索引可恢复。

### 契约

- [ ] Tool 名称稳定、语义明确。
- [ ] description 说明了调用时机。
- [ ] 输入和输出都有 Schema。
- [ ] 返回同时兼顾结构化消费和人类阅读。
- [ ] annotations 与真实副作用一致。

### 安全

- [ ] 不读取允许范围外的路径。
- [ ] 不把 `.env`、Token、证书或业务源码打进发布包。
- [ ] stdout 不输出普通日志。
- [ ] 远程服务具有认证、授权和 HTTPS。
- [ ] Embedding 数据流符合公司代码安全要求。

### 分发

- [ ] `files` 白名单正确。
- [ ] `npm pack --dry-run` 内容正确。
- [ ] `bin` 指向真实编译产物。
- [ ] 入口包含 shebang。
- [ ] README 有完整安装和卸载说明。
- [ ] 版本号与变更记录已更新。

## 16. 常见错误

### `codex mcp list` 能看到，但 Server 无法启动

- 检查是否已经运行构建。
- 检查 `node` 和入口路径是否是绝对路径。
- 检查环境变量中的项目目录是否存在。
- 直接运行同一条 command，查看 stderr。

### `Unexpected token export` 或 ESM 错误

- `package.json` 是否有 `"type": "module"`。
- `tsconfig` 是否使用 NodeNext。
- 本地 import 是否写 `.js` 后缀。
- Node.js 是否满足 engines 要求。

### MCP 协议解析错误

检查 Server 是否把普通日志写到了 stdout。STDIO Server 使用 `console.error` 输出日志。

### npm 安装后找不到命令

- 检查 `bin` 路径是否匹配 `outDir`。
- 检查编译产物是否包含在 `files` 中。
- 检查入口 shebang。
- 用 `npm pack --dry-run` 检查包内容。

### 发布后读取不到用户项目

npm 包的安装目录不是用户前端仓库。通过环境变量、`cwd` 或经过安全校验的 Tool 参数传入工作区路径，不要用包目录当项目目录。

## 17. 推荐的实际落地顺序

1. 先用固定内存数据跑通最小 `search_component`。
2. 接入 Codex，确认 Tool 能被识别和调用。
3. 增加本地 CLI，把检索逻辑与 MCP 协议分开测试。
4. 定义稳定的组件数据结构。
5. 接入 React AST 和 Vue SFC AST。
6. 建立项目隔离缓存和增量索引。
7. 用真实查询集评测关键词检索。
8. 接入 Embedding 与混合排序。
9. 用 `.tgz` 交给少量同事试用。
10. 稳定后发布私有 npm；需要集中服务时再做 HTTP 与鉴权。

## 18. 官方参考

- [OpenAI：构建 MCP Server](https://developers.openai.com/plugins/build/mcp-server)
- [OpenAI：在 Codex 中配置 MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
