# 组件搜索 MCP：当前实现、工作原理与学习路线

> 对应项目版本：`internal-component-search-mcp@0.1.0`  
> 当前阶段：可运行的本地 MVP，不是最终的向量检索版本。

## 1. 这个项目解决什么问题

前端仓库中的组件通常散落在公共组件目录、业务页面目录和多个子应用中。开发者只知道自己想实现“手机号输入”“九宫格”“带远程搜索的人员选择”等需求，却不一定知道已有组件的名字和路径。

这个 MCP 的目标是让 Codex、Cursor、Claude 等 MCP Client 可以用自然语言查询当前项目中的组件，例如：

```text
项目里有没有手机号输入组件？
```

MCP 返回候选组件、文件路径、匹配原因、Props、导入示例和真实使用位置，帮助开发者先复用、再创建。

当前工具名是：

```text
search_internal_component
```

当前代码已经能完成：

- 扫描 `.tsx`、`.jsx`、`.vue` 文件。
- 使用 TypeScript Compiler AST 分析 React/TSX 组件。
- 提取组件名、导出方式、JSDoc、Props、Hooks、JSX 元素、import 和源码片段。
- 通过文件内容统计组件在哪些文件中被使用。
- 把组件信息保存为本地 JSON 索引。
- 使用中英文同义词和可解释权重进行关键词搜索。
- 通过 STDIO 暴露只读 MCP Tool。
- 提供独立 CLI，在接入 MCP Client 前先测试索引和搜索。
- 在 Tool 调用中选择允许范围内的项目根目录。
- 自动发现普通项目和 monorepo 的常见源码目录。
- 搜索前检查目标项目指纹，变化时先更新索引再返回结果。
- 通过 Transformers.js 在 Node.js 进程内生成真实 Embedding。
- 将向量写入本地增量 JSON 索引，并提供独立语义搜索与评测 CLI。

当前还没有完成：

- 没有把向量写入 LanceDB、Qdrant 或 pgvector。
- MCP Tool 当前仍走关键词主链路，尚未融合语义召回。
- `matchScore` 不是余弦相似度，只是关键词总分的归一化结果。
- Vue 暂时使用正则和文件约定进行启发式抽取，不是 Vue Compiler AST。
- 还没有 `get_component`、`find_similar_component`、`find_usage` 等独立工具。
- 还没有远程组件文档、Git 增量索引、团队权限和远程 HTTP 服务。

## 2. 整体工作流程

```text
用户自然语言问题
       ↓
MCP Client（Codex / Cursor / Claude）
       ↓ 调用 search_internal_component
MCP Server
       ↓ 加载或创建索引
文件扫描 → React AST / Vue 启发式解析 → ComponentMetadata
       ↓
关键词拆分 + 中英文同义词扩展 + 加权排序
       ↓
structuredContent + 文本摘要
       ↓
Agent 根据路径、Props、usedBy 决定是否复用
```

索引阶段和查询阶段是分开的：

1. 索引阶段把源码转换为统一的结构化组件数据。
2. 查询阶段只在结构化数据中检索，不需要每次让大模型阅读整个仓库。

这也是这个项目最重要的设计思想：**确定性信息由代码分析得到，语义召回只负责寻找候选，不让模型猜组件路径和 Props。**

## 3. 项目目录与职责

```text
component-search-mcp/
├── package.json
├── tsconfig.json
├── README.md
├── docs/
│   ├── architecture.md
│   ├── current-implementation-and-learning-guide.md
│   └── build-and-distribute-an-mcp-server.md
├── src/
│   ├── server.ts                 # MCP Server 与 Tool 定义
│   ├── scanner.ts                # 扫描源码、组装索引、统计使用位置
│   ├── search.ts                 # 查询拆词、同义词扩展、加权排序
│   ├── types.ts                  # ComponentDocument 数据结构
│   ├── config.ts                 # 项目根目录、源码目录、索引路径
│   ├── embedding-document.ts     # 生成未来用于 Embedding 的标准文本
│   ├── extractors/
│   │   ├── react.ts              # React/TSX AST 抽取器
│   │   ├── vue.ts                # Vue SFC 启发式抽取器
│   │   └── types.ts              # 抽取器的中间数据结构
│   └── cli/
│       ├── args.ts               # 简单命令行参数读取
│       ├── build-index.ts        # 手动构建索引
│       └── search.ts             # 不经过 MCP 的搜索测试入口
└── test/
    ├── component-search.test.ts
    └── fixtures/                 # 测试用小型前端项目
```

建议按以下顺序阅读代码：

1. `src/types.ts`：先理解系统保存了什么数据。
2. `src/extractors/react.ts`：理解源码如何变成结构化数据。
3. `src/scanner.ts`：理解多文件如何组成项目索引。
4. `src/search.ts`：理解查询为什么会命中某个组件。
5. `src/server.ts`：理解这些能力如何暴露为 MCP Tool。
6. `src/cli/*.ts` 和 `test/*.ts`：理解如何验证。

## 4. 实现过程详解

### 4.1 定义组件数据结构

核心类型是 `ComponentMetadata`。每个被识别的组件都会变成一条类似下面的数据：

```json
{
  "id": "my-project:src/components/PhoneInput.tsx#PhoneInput",
  "name": "PhoneInput",
  "description": "手机号输入组件",
  "scope": "project",
  "framework": "react",
  "parser": "typescript-ast",
  "projectName": "my-project",
  "sourcePath": "src/components/PhoneInput.tsx",
  "exportPath": "./src/components/PhoneInput",
  "exportKind": "named",
  "status": "stable",
  "keywords": ["phone", "input"],
  "useCases": ["用户手机号录入"],
  "props": [],
  "imports": [],
  "hooks": [],
  "renderedElements": ["input"],
  "sourceSnippet": "...",
  "embeddingText": "...",
  "usageCount": 2,
  "usedBy": ["src/pages/Profile.tsx"]
}
```

为什么先定义这个结构：

- AST 解析器、关键词搜索、向量搜索和 MCP 输出都使用同一份数据。
- 将来更换向量数据库，不需要重写源码解析逻辑。
- 结果中保留确定的 `sourcePath`、`props`、`exportKind`，避免大模型产生不存在的 API。
- `schemaVersion` 能支持以后升级索引格式。

### 4.2 扫描源码文件

`src/scanner.ts` 从一个项目根目录和若干源码目录开始递归扫描。

当前扫描扩展名：

```text
.tsx  .jsx  .vue
```

当前会忽略：

```text
.git  node_modules  dist  build  coverage
.next .nuxt .output .turbo .cache out
```

测试、Storybook、配置和类型声明文件也会被排除，例如：

```text
Button.test.tsx
Button.spec.tsx
Button.stories.tsx
vite.config.ts
global.d.ts
```

扫描得到的文件会先整体读入内存，然后分别交给 React 或 Vue 抽取器。

### 4.3 使用 TypeScript AST 抽取 React 组件

`src/extractors/react.ts` 调用：

```ts
ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true, scriptKind)
```

这会把源码文本转换成语法树。程序遍历顶层声明，目前把以下内容识别为组件：

- 名称以大写字母开头。
- 被 `export` 或 `export default` 导出。
- 声明形式是函数、类或变量。

可识别的典型写法：

```tsx
export function UserCard(props: UserCardProps) {
  return <section />;
}

export const UserCard: React.FC<UserCardProps> = (props) => {
  return <section />;
};

export default class UserCard extends React.Component<UserCardProps> {
  render() {
    return <section />;
  }
}
```

Props 当前支持：

- 函数第一个参数的内联类型。
- 参数引用的 interface/type literal。
- `React.FC<Props>` 和 `FunctionComponent<Props>`。
- 类组件 `React.Component<Props>`。
- `ComponentNameProps` 和通用 `Props` 命名。

AST 遍历还会收集：

- `useState`、`useMemo` 等以 `use` 开头的 Hook 调用。
- JSX 中出现的 HTML 标签和子组件名。
- 当前文件的 import。
- JSDoc 描述、`@use-case` 和 `@deprecated`。

推荐给公共组件补充业务语义：

```tsx
/**
 * 支持远程搜索的企业人员选择器。
 * @use-case 选择审批人
 * @use-case 添加项目成员
 */
export function UserSelectModal(props: UserSelectModalProps) {
  // ...
}
```

`@use-case` 在当前关键词排序中权重较高，将来还会进入 Embedding 文本。

当前 React AST 的限制：

- 使用的是单文件语法 AST，没有建立完整的 TypeScript `Program` 和类型检查器。
- 无法完整解析跨文件继承、复杂泛型、类型别名链和 HOC 包装后的组件。
- `memo(...)`、`forwardRef(...)`、动态导出等复杂形式还需要新增识别规则。

### 4.4 抽取 Vue 组件

`src/extractors/vue.ts` 当前采用启发式实现：

- 用 `.vue` 文件名作为组件名，且要求首字母大写。
- 从注释中读取描述、`@use-case` 和 `@deprecated`。
- 从 `<template>` 中提取标签名。
- 使用模式匹配提取 import 和 Hook 风格调用。
- 当前不提取 Vue Props。

这适合作为 MVP 验证，但不能代替真正的 SFC AST。下一阶段应使用：

```text
@vue/compiler-sfc
```

并解析 `defineProps`、`withDefaults`、Options API、template AST 和组件注册关系。

### 4.5 统计项目内使用位置

扫描器会使用组件名在其他源码文件中搜索，返回：

- `usageCount`：包含该名称的其他文件数量。
- `usedBy`：最多 10 个相关文件路径。

它的价值是：搜索结果不只告诉 Agent “组件存在”，还告诉 Agent “项目中哪里真的使用过它”，便于继续阅读正确用法。

但目前它是文本级统计，不是 import 关系 AST：

- 注释或字符串中的同名文本可能产生误报。
- 别名 import、重导出链可能无法正确关联。
- `usageCount` 代表文件数，不代表 JSX 渲染次数。

长期应建立 import/export 图，再分析 JSX/template 的真实引用关系。

### 4.6 生成 `embeddingText`

`src/embedding-document.ts` 把结构化字段组合成稳定文本：

```text
Component: UserSelectModal
Framework: react
Description: 支持远程搜索的企业人员选择器
Use cases: 选择审批人; 添加项目成员
Props: multiple?: boolean, onChange: (users: User[]) => void
Hooks: useMemo
Rendered elements: div, input, button
Source path: src/components/UserSelectModal.tsx
Export: named from ./src/components/UserSelectModal
```

这里需要区分两个概念：

1. `embeddingText` 是准备送给 Embedding 模型的文本。
2. Embedding 是模型把这段文本转换成一组数字向量的过程。

当前项目已经完成这两步：默认由 Transformers.js 的多语言 E5 模型生成 384 维向量，并保存到独立的本地向量索引。关键词 MCP 主链路尚未直接替换；可以使用 `pnpm search:semantic` 单独验证语义召回，再根据评测结果实现 Hybrid Search。

### 4.7 当前关键词检索算法

`src/search.ts` 的查询过程分为四步。

第一步：规范化文本。

- CamelCase 被拆开，例如 `PhoneInput` → `phone input`。
- 路径分隔符、下划线、点和连字符转换为空格。
- 英文转小写。

第二步：去除无信息词。

例如“项目”“有没有”“组件”“find”“current”不会参与排序。

第三步：扩展同义词。

例如：

```text
手机号 → phone / mobile / telephone / tel
输入框 → input / field / textbox
人员   → user / person / member / employee
弹窗   → modal / dialog / popup
```

第四步：按字段加权。

| 匹配位置 | 当前加分 |
|---|---:|
| 组件名与完整查询完全一致 | 120 |
| 组件名包含完整查询 | 60 |
| 名称匹配单个词 | 30 |
| `@use-case` 匹配 | 24 |
| 位于 `components/` 目录 | 20 |
| keywords 匹配 | 18 |
| 描述匹配 | 15 |
| Props 匹配 | 12 |
| 路径匹配 | 6 |
| 已有项目使用记录 | 最多 10 |
| 已废弃组件 | -100 |

最终按照总分降序排列。`matchScore` 使用以下公式把正分压缩到 0～1：

```text
matchScore = 1 - exp(-score / 60)
```

这个数字方便展示，但它不是概率，也不是向量余弦相似度。判断结果时应该同时查看 `matchReason`、`sourcePath` 和 `usedBy`。

### 4.8 保存和加载索引

手动索引命令会把数据写入：

```text
.cache/components-index.json
```

MCP 第一次被调用时：

1. 为目标项目创建当前源码文件快照。
2. 检查内存索引的项目、源码目录和指纹是否一致。
3. 内存不可用时，再检查磁盘索引及其指纹。
4. 指纹一致就直接搜索；不一致才重新扫描、写入缓存并搜索。

默认项目继续使用这个兼容路径。通过 Tool 选择的其他项目会根据项目绝对路径和源码目录生成哈希，并保存独立缓存：

```text
.cache/projects/<hash>.json
```

schema version 3 会为每个源码文件保存：

```json
{
  "path": "src/components/PhoneInput.tsx",
  "size": 3250,
  "mtimeMs": 1788241821000
}
```

这些元数据按路径排序后生成 SHA-256 `sourceFingerprint`。每次搜索 A 项目时，Server 都会先创建一个轻量文件快照：

```text
搜索 A 项目
   ↓
重新发现 A 的 sourceRoots
   ↓
读取文件 path + size + mtimeMs
   ↓
生成 sourceFingerprint
   ↓
├─ 与内存/磁盘索引相同 → 直接搜索
└─ 不同 → 重新读取源码和运行 AST → 写入新索引 → 再搜索
```

所以新增、修改、删除、重命名组件后，不需要手动执行 `pnpm index`，也不需要重启 MCP。本次触发检查的搜索会等待索引刷新完成，并直接返回新结果。

当前变化后会整体重建该项目索引，还没有做到只解析变化文件。`mtimeMs + size` 能覆盖正常编辑、Git 切换和拉取代码；极少数“内容改变但大小和修改时间完全相同”的情况可能无法识别，后续可以对疑似变化文件增加内容 Hash。

### 4.9 暴露 MCP Tool

`src/server.ts` 使用官方 TypeScript SDK 创建 `McpServer`，并注册：

```text
search_internal_component
```

输入参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| `query` | string | 自然语言组件需求，必填 |
| `limit` | integer | 返回 1～20 条，默认 5 |
| `includeDeprecated` | boolean | 是否包含废弃组件，默认 false |
| `projectRoot` | string | 要搜索的项目；必须位于允许目录中，默认使用 Server 项目 |
| `sourceRoots` | string[] | 源码目录；省略时自动发现 |

输出同时包含：

- `structuredContent`：给 Agent 稳定消费的结构化 JSON。
- `content`：给人阅读的候选摘要。

Tool 还声明了：

```ts
annotations: {
  readOnlyHint: true,
  openWorldHint: false,
  destructiveHint: false,
}
```

这说明工具只读本地范围，不做删除、修改或外部开放世界操作。

### 4.10 STDIO 传输的关键规则

当前 MCP 使用 STDIO：MCP Client 启动 Node 子进程，通过标准输入/输出传递协议消息。

因此：

- MCP 协议消息占用 `stdout`。
- Server 日志必须写到 `stderr`，例如 `console.error(...)`。
- 不要在 `server.ts` 中使用普通 `console.log(...)`，否则可能污染协议数据并导致连接失败。
- CLI 工具不承载 MCP 协议，可以正常使用 `console.log(...)`。

## 5. 一次查询是怎样完成的

以“项目里有没有手机号输入组件？”为例：

1. Codex 判断需要搜索项目组件。
2. Codex 调用 `search_internal_component`，传入 query。
3. MCP Server 加载 JSON 索引，或扫描当前项目创建索引。
4. 查询规范化并去掉“项目”“有没有”“组件”。
5. “手机号”扩展为 `phone/mobile/telephone/tel`。
6. “输入”扩展为 `input/field/textbox`。
7. `PhoneInput` 的名称、关键词、Props 和路径参与加权。
8. 搜索结果返回 `PhoneInput`、路径、分数、匹配原因和导入示例。
9. Codex 可以继续读取 `sourcePath` 或 `usedBy`，确认真实 API 后再复用。

## 6. 本地运行与验证

### 6.1 安装、构建和测试

```bash
cd /Users/yang/fe/fe/component-search-mcp
pnpm install
pnpm build
pnpm test
```

当前测试覆盖：

- React AST 组件提取。
- Props、Hooks、JSX 和使用位置。
- 中文自然语言搜索英文组件名。
- “手机号输入组件”命中 `PhoneInput`。
- 普通项目自动发现 `src`。
- monorepo 自动发现 `apps/*/src` 和 `packages/*/src`。
- 拒绝项目根目录和源码目录越过允许范围。

### 6.2 为一个项目构建索引

例如扫描 `node-tools`。这里不传 `--source-root`，程序会自动发现 `modules`：

```bash
cd /Users/yang/fe/fe/component-search-mcp
pnpm index -- \
  --project-root /Users/yang/meiyou/node-tools
```

### 6.3 不接 MCP，先测试搜索

```bash
cd /Users/yang/fe/fe/component-search-mcp
pnpm search:components -- \
  --project-root /Users/yang/meiyou/node-tools \
  --query "title 组件"
```

实际验证中，该查询能够发现 `SubTitle`、`MealCardTitle`、`Nav` 等候选。查询“九宫格组件”没有返回结果，原因不是 MCP 协议失效，而是当前关键词词表和源码字面信息没有建立“九宫格”与实际组件名之间的语义关系。这正是下一阶段需要 Embedding 或更完整业务注释的地方。

### 6.4 接入 Codex

```bash
codex mcp add internal-components \
  --env COMPONENT_MCP_PROJECT_ROOT=/Users/yang/meiyou/node-tools \
  -- node /Users/yang/fe/fe/component-search-mcp/dist/src/server.js
```

检查：

```bash
codex mcp list
```

在 Codex 中可以输入：

```text
调用 search_internal_component 搜索当前项目的 title 组件
```

或者直接表达需求，让 Agent 自行决定是否调用：

```text
当前项目有没有能复用的手机号输入组件？
```

## 7. 怎样把它升级为真正通用的组件搜索 MCP

“同一份 MCP 可以搜索任意项目”需要解决配置、索引隔离、解析器和安全范围四类问题。

### 7.1 项目根目录不要写死

当前已经支持三层项目选择：

1. `COMPONENT_MCP_PROJECT_ROOT` 是默认项目。
2. `search_internal_component.projectRoot` 可以在每次调用时选择项目。
3. `COMPONENT_MCP_ALLOWED_ROOTS` 定义可以切换到哪些父目录。

Tool 输入现在包含：

```ts
{
  query: string;
  projectRoot?: string;
  sourceRoots?: string[];
  limit?: number;
  includeDeprecated?: boolean;
}
```

例如 Server 默认搜索 `node-tools`，同时允许搜索 `/Users/yang/meiyou` 下的其他仓库：

```bash
codex mcp add internal-components \
  --env COMPONENT_MCP_PROJECT_ROOT=/Users/yang/meiyou/node-tools \
  --env COMPONENT_MCP_ALLOWED_ROOTS=/Users/yang/meiyou \
  -- node /Users/yang/fe/fe/component-search-mcp/dist/src/server.js
```

之后可以调用：

```json
{
  "query": "title 组件",
  "projectRoot": "/Users/yang/meiyou/node-tools"
}
```

路径会经过 `path.resolve` 和允许目录检查。未配置 `COMPONENT_MCP_ALLOWED_ROOTS` 时，只允许默认项目及其子目录，防止 Tool 任意读取磁盘。

### 7.2 自动发现源码目录

当前 `src/source-roots.ts` 会按以下顺序发现源码：

1. 检查根目录下的 `src`、`modules`、`components`、`pages`。
2. 读取根 `package.json` 的 `workspaces` 数组或 `workspaces.packages`。
3. 展开 workspace 路径中的 `*`。
4. 检查 `apps/*` 和 `packages/*`，优先使用子包的 `src`。
5. 只保留实际包含 `.tsx`、`.jsx` 或 `.vue` 的目录。
6. 如果都没发现，退回项目根目录 `.`，由扫描器继续排除依赖和构建目录。

CLI 和 MCP 使用相同的发现逻辑。因此下面命令不需要 `--source-root`：

```bash
pnpm index -- --project-root /Users/yang/meiyou/node-tools
```

在实际 `node-tools` 仓库中，程序会自动识别：

```json
{
  "sourceRoots": ["modules"]
}
```

并索引出 283 个组件。

仍然可以通过 Tool 的 `sourceRoots`、CLI 的多个 `--source-root` 或默认项目的 `COMPONENT_MCP_SOURCE_ROOTS` 显式覆盖。显式路径必须位于所选项目根目录内。

当前尚未读取 `pnpm-workspace.yaml`、`tsconfig.json` include、Vite/Next/Nuxt 配置；这些可以作为下一轮自动发现增强。

### 7.3 每个项目独立缓存

默认项目继续兼容 `.cache/components-index.json`。通过 Tool 选择的其他项目会根据 `projectRoot + sourceRoots` 生成哈希，保存到：

```text
.cache/projects/<hash>.json
```

这样不同项目不会互相覆盖缓存。下一步仍应把 `parserVersion + schemaVersion` 加入缓存键，并保存文件修改时间或内容哈希，只重建发生变化的文件。

### 7.4 使用真正的 AST 和依赖图

- React：从单文件 `SourceFile` 升级为 TypeScript `Program` + `TypeChecker`。
- Vue：接入 `@vue/compiler-sfc`。
- 建立 import、export、re-export、别名和使用关系图。
- 把文档站、Storybook stories 和组件测试作为使用示例来源。

### 7.5 接入混合检索

推荐检索链路：

```text
query
  ├─ 关键词/BM25 召回：名字、Props 和准确术语
  └─ Embedding 向量召回：业务语义和中英文表达
             ↓
          合并去重
             ↓
业务规则重排：deprecated、usageCount、scope、framework
             ↓
          Top-K 结果
```

不要只使用向量搜索。组件名、Props 名和路径是强关键词，关键词检索通常更准确；向量搜索适合解决“九宫格”与 `GridMenu` 这种字面不同但语义相关的问题。

### 7.6 拆分完整工具集

建议最终提供：

| Tool | 用途 |
|---|---|
| `search_component` | 通过自然语言进行混合搜索 |
| `get_component` | 通过稳定 ID 获取完整组件详情 |
| `find_similar_component` | 根据已有组件找相似组件 |
| `find_usage` | 获取真实引用位置和示例 |
| `refresh_component_index` | 显式刷新索引；这是写缓存操作，应正确标注 annotations |

搜索结果保持精简，再由 `get_component` 按需返回源码摘要，可以减少上下文占用。

## 8. 建议学习路线

不需要一次学完所有知识。按“能运行 → 看懂 → 修改 → 向量化 → 工程化”的顺序更有效。

### 阶段一：理解 MCP 最小模型（1～2 天）

学习目标：知道谁启动谁、Tool 如何声明、一次调用如何返回。

需要理解：

- MCP Host / Client / Server 的职责。
- Tool、Resource、Prompt 的区别。
- STDIO 与 Streamable HTTP 的区别。
- JSON Schema/Zod 输入输出校验。

练习：

1. 阅读 `src/server.ts`。
2. 新增一个只读 `get_component_count` Tool。
3. 用 `codex mcp list` 和 Codex 中的 `/mcp` 检查是否加载。

### 阶段二：掌握 Node.js 与 TypeScript 工程基础（2～4 天）

重点：

- ESM：`type: module`、编译后 `.js` import。
- `process.argv`、`process.env`、`process.cwd()`。
- `fs.promises`、`path.resolve`、递归目录扫描。
- TypeScript interface、union、泛型和 `satisfies`。
- Node 子进程的 stdin/stdout/stderr。

练习：

1. 给 CLI 增加 `--limit`。
2. 给索引增加 `fileCount`。
3. 故意在 Server 中加入 `console.log`，观察 STDIO 连接问题后移除。

### 阶段三：学习 TypeScript AST（3～7 天）

先理解这些节点：

```text
SourceFile
FunctionDeclaration
VariableStatement / VariableDeclaration
InterfaceDeclaration / TypeAliasDeclaration
ImportDeclaration
CallExpression
JsxOpeningElement / JsxSelfClosingElement
```

练习顺序：

1. 打印一个 TSX 文件的 AST 节点类型。
2. 提取所有 export 名称。
3. 提取 interface 属性和可选标记。
4. 支持 `memo` 和 `forwardRef`。
5. 再学习 `Program` 与 `TypeChecker`，处理跨文件类型。

### 阶段四：学习检索与 Embedding（3～5 天）

需要理解：

- 分词、同义词、倒排索引、BM25。
- Embedding 向量表示。
- 余弦相似度与 Top-K。
- 元数据过滤。
- Hybrid Search 和重排。

练习：

1. 为 20 个组件手工建立自然语言查询评测集。
2. 记录纯关键词搜索的 Top-1/Top-3 命中率。
3. 接入一个 `EmbeddingProvider` 接口，而不是把某家模型写死在搜索逻辑中。
4. 比较关键词、纯向量、混合检索三种效果。

### 阶段五：测试、评测与团队化（持续）

单元测试只能说明代码运行正确，检索系统还需要效果评测。

建议建立：

```json
{
  "query": "九宫格入口组件",
  "expectedComponentIds": ["project:src/components/GridMenu.tsx#GridMenu"]
}
```

关注指标：

- Top-1 命中率。
- Top-3 命中率。
- 无结果率。
- 废弃组件误推荐率。
- 索引耗时和增量更新时间。
- 被推荐组件最终是否被采用。

## 9. 常见问题排查

### MCP 在列表中，但调用失败

先直接运行编译后的入口：

```bash
node /Users/yang/fe/fe/component-search-mcp/dist/src/server.js
```

它会等待 STDIO 协议输入，这是正常的。若立即退出，查看 stderr 中的路径或构建错误。

### 搜索不到任何组件

检查：

- `COMPONENT_MCP_PROJECT_ROOT` 是否是仓库根目录。
- 自动发现结果是否覆盖真实源码目录；必要时再配置 `COMPONENT_MCP_SOURCE_ROOTS` 或显式 `sourceRoots`。
- 文件是否为 `.tsx`、`.jsx` 或 `.vue`。
- React 组件是否有大写名称并被 export。
- Vue 文件名是否以大写字母开头。

先运行 `pnpm index`，观察索引数量，再运行 CLI 搜索，把 MCP 协议问题和检索问题分开。

### 改了源码但结果没更新

正常情况下，下一次搜索会通过文件指纹自动更新。如果没有更新，检查：

- 修改的文件是否为 `.tsx`、`.jsx` 或 `.vue`。
- 文件是否位于本次返回的 `sourceRoots` 中。
- 文件是否落在 `dist`、`node_modules`、测试文件等忽略范围。
- 编辑工具是否保留了完全相同的文件大小和 `mtimeMs`。

必要时仍可以通过 `pnpm index` 强制重建磁盘索引；未来还可以增加独立的 `refresh_component_index` Tool。

### 搜索结果看起来相似度很高，但实际不相关

当前 `matchScore` 只是关键词权重的展示值。应查看 `matchReason`，并通过 `sourcePath`、Props 和 `usedBy` 进行二次确认。

## 10. 下一步推荐开发顺序

1. 给 Vue 接入真正的 SFC AST，并补充 Vue Props 测试。
2. 让 React 使用 `Program` 和 `TypeChecker`，支持跨文件 Props。
3. 从“指纹变化后整体重建”升级为只解析新增、修改和删除的文件。
4. 建立 30～50 条真实查询评测集。
5. 定义可插拔 `EmbeddingProvider` 和 `VectorStore` 接口。
6. 接入本地向量库并实现关键词 + 向量混合排序。
7. 拆出 `get_component` 和 `find_usage`，减少搜索结果体积。
8. 最后再做远程文档、多仓库和 Streamable HTTP。

## 11. 参考资料

- [OpenAI：构建 MCP Server](https://developers.openai.com/plugins/build/mcp-server)
- [OpenAI：在 Codex 中配置 MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [TypeScript Compiler API Wiki](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)
