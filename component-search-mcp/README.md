# Internal Component Search MCP

这是一个本地、只读的前端组件检索 MCP。目标架构是“AST 抽取 → Embedding → Vector DB → MCP Tools”。当前第一阶段已经支持 React/TypeScript AST，能提取组件名、JSDoc、Props、import/export、Hooks、JSX、源码路径和项目内使用位置，并为后续 Embedding 生成标准文本。

相关文档：

- [架构与阶段拆分](docs/architecture.md)
- [当前实现、工作原理与学习路线](docs/current-implementation-and-learning-guide.md)
- [从零创建、接入与导出 MCP Server](docs/build-and-distribute-an-mcp-server.md)

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
