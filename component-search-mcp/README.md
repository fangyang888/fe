# Component Search MCP：技术实现与价值

## 1. 它解决什么问题

前端项目发展一段时间后，通常会积累大量业务组件。开发者可能不知道组件是否已经存在，也很难只靠文件名判断它是否满足当前需求，最终容易出现重复开发、交互不一致和维护成本增加。

Component Search MCP 把项目源码转换为可检索的组件知识，并通过 MCP 提供给 Codex 等 AI 编程工具。开发者可以直接使用自然语言提问：

```text
有没有适合审批流程、支持远程搜索和多选的人员选择组件？
```

系统会返回相关组件、描述、Props、导入方式、源码路径和项目内使用次数，帮助开发者先复用已有实现，再决定是否新建组件。

## 2. 整体技术架构

```text
React / Vue / HarmonyOS ArkUI 项目源码
        ↓
源码目录自动发现
        ↓
TypeScript AST / ArkTS AST / Vue SFC 解析
        ↓
结构化组件索引
        ↓
关键词检索 + Embedding 向量检索
        ↓
混合排序与结果去重
        ↓
STDIO MCP Tool
        ↓
Codex 等本地 MCP 客户端
```

设计原则是：确定性的组件信息由源码分析获得，语义模型只负责理解查询意图和辅助排序，不让模型猜测组件的 Props、路径或导出方式。

## 3. 使用的主要技术

| 技术                           | 当前用途                                  | 带来的价值                                              |
| ------------------------------ | ----------------------------------------- | ------------------------------------------------------- |
| Node.js + TypeScript           | MCP Server、索引和搜索实现                | 与前端技术栈一致，方便维护和扩展                        |
| Model Context Protocol SDK     | 向 Codex 暴露 `search_internal_component` | 使用统一协议接入 AI 编程工具                            |
| Zod                            | Tool 输入、输出 Schema 校验               | 减少参数错误，保证结果结构稳定                          |
| TypeScript Compiler AST        | 分析 React、TSX 和 JSX                    | 精确提取组件、Props、JSDoc、import/export、Hooks 和 JSX |
| ArkTS 兼容 AST                 | 分析 HarmonyOS `.ets` 和 ArkUI 组件       | 提取装饰器、Props、状态字段、`build()` 和 UI 组件调用   |
| Vue SFC 启发式解析             | 分析 `.vue` 文件                          | 在不引入完整 Vue 编译器的情况下提供基础支持             |
| Transformers.js                | 在本地生成 Embedding                      | 不需要 API Key，也不需要独立模型服务                    |
| `Xenova/multilingual-e5-small` | 中英文语义向量模型                        | 支持中文需求与英文组件名之间的语义匹配                  |
| ONNX Runtime + q8 量化         | 本地模型推理                              | 降低模型体积和推理资源消耗                              |
| 余弦相似度                     | 比较查询与组件文档向量                    | 找到文字不同但含义相近的组件                            |
| SHA-256 文件指纹               | 判断源码和组件文档是否变化                | 避免每次查询都完整重建索引                              |
| 本地 JSON 索引                 | 保存组件元数据和向量                      | 无需部署数据库，适合本地开发场景                        |
| Node.js Test Runner            | 自动化测试                                | 覆盖 AST、搜索、缓存、MCP 和 npm bin 启动链路           |

## 4. 源码如何变成可搜索数据

### 4.1 自动发现源码目录

只需要提供项目根目录，系统会自动寻找常见结构：

```text
src
modules
components
pages
apps/*/src
packages/*/src
feature/*/src
common/*/src
product/*/src
package.json workspaces
```

扫描过程会忽略 `.git`、`node_modules`、`oh_modules`、`.hvigor`、`dist`、`.next`、`.nuxt`、`.cache` 等无关目录。

### 4.2 AST 组件抽取

React 和 TypeScript 文件使用 TypeScript Compiler AST 解析。HarmonyOS `.ets` 会先进行保持字符位置不变的 ArkTS 兼容转换，再由同一套 AST 能力识别 `@Component`、`@ComponentV2`、`@Entry`、`@CustomDialog`、Props、状态字段和 `build()` / `@Builder` 中的 ArkUI 组件调用。它不要求使用者安装 DevEco Studio。每个组件会生成结构化数据：

```ts
interface ComponentMetadata {
  name: string;
  description: string;
  props: ComponentProp[];
  imports: string[];
  hooks: string[];
  renderedElements: string[];
  exportPath: string;
  sourcePath: string;
  useCases: string[];
  usageCount: number;
  usedBy: string[];
}
```

这些字段既用于搜索，也用于向 Codex 返回可靠的组件详情。

### 4.3 Embedding 文档生成

系统会把组件的确定性信息组合成标准文本：

```text
Component: UserSelectModal
Description: 企业人员远程选择器
Use cases: 选择审批人; 添加项目成员
Props: multiple?: boolean, remote?: boolean
Source path: src/components/UserSelectModal.tsx
```

随后使用 `multilingual-e5-small` 生成 384 维向量。组件文本使用 `passage:` 前缀，用户查询使用 `query:` 前缀，符合 E5 检索模型的输入方式。

## 5. 为什么使用混合搜索

单独使用关键词和单独使用语义检索都有局限。

### 关键词检索擅长

- 精确组件名，例如 `UserSelectModal`。
- Props、路径、关键词和 `@use-case` 的确定性匹配。
- 给出可解释的匹配原因。

### 语义检索擅长

- 查询与源码没有相同词语的场景。
- 中文需求匹配英文组件名。
- 理解“挑选流程负责人”和“人员选择器”表达的是相近意图。

当前实现采用以下混合权重：

```text
最终分数 = 60% 关键词分数 + 40% 语义相似度
```

这样可以保护精确名称和 Props 匹配，同时允许语义候选进入结果。在当前 24 条小型检索评估集中，关键词 Top-1 命中率为 37.5%，混合搜索为 62.5%。该数据只用于验证技术方向，不代表所有真实项目的最终效果。

如果模型缺失、下载失败或本地推理不可用，系统会自动退回关键词搜索，并返回 `keyword-fallback`，不会让整个 MCP Tool 失效。

## 6. 索引和缓存机制

### 懒加载与自动刷新

MCP 不要求使用者提前手动建立索引。第一次搜索时会扫描源码并创建索引；后续查询会检查文件路径、大小和修改时间生成的源码指纹。发现新增、修改、删除或重命名后才会刷新。

### 向量增量复用

每个组件的 Embedding 文档都有独立 SHA-256 哈希。组件没有变化时复用旧向量，只为发生变化的组件重新生成 Embedding。

### 用户级稳定缓存

缓存不放在 `npx` 的临时安装目录，而是放到操作系统的用户缓存目录：

- macOS：`~/Library/Caches/internal-component-search-mcp`
- Linux：`${XDG_CACHE_HOME:-~/.cache}/internal-component-search-mcp`
- Windows：`%LOCALAPPDATA%/internal-component-search-mcp`

因此升级 npm 包不会重复下载约 129 MB 的量化模型。不同项目使用哈希后的独立索引文件，避免相互覆盖。

## 7. MCP 接入方式

当前推荐使用本地 STDIO MCP：

```bash
codex mcp add internal-components \
  --env COMPONENT_MCP_PROJECT_ROOT=/absolute/path/to/project \
  --env COMPONENT_MCP_ALLOWED_ROOTS=/absolute/path/to/workspaces \
  --env COMPONENT_MCP_SEARCH_MODE=hybrid \
  -- npx -y internal-component-search-mcp@0.1.2
```

选择 STDIO 的原因是组件源码位于使用者电脑上。本地 MCP 可以读取本地项目；部署在服务器上的 HTTP MCP 只能读取服务器文件系统，无法直接看到开发者尚未提交的代码。

MCP 当前提供的核心 Tool：

```text
search_internal_component
```

Tool 是只读的，并使用 `COMPONENT_MCP_ALLOWED_ROOTS` 限制可选择的项目范围。

## 8. 主要好处

### 减少重复开发

在新建组件前先搜索已有实现，避免同一个业务能力出现多套组件。

### 提高组件复用率

不仅通过组件名查找，还可以通过业务场景、Props 和自然语言需求发现组件。

### 改善 AI 生成代码的准确性

Codex 可以获得真实组件路径、导出方式和 Props，而不是根据通用知识虚构项目内部 API。

### 支持中英文混合项目

中文业务描述可以检索英文组件名，降低命名差异造成的搜索失败。

### 本地运行，保护源码

默认 Embedding 在本机通过 Transformers.js 运行，不需要把组件源码发送给远程模型 API。

### 无需维护额外服务

索引、向量和模型都在本地缓存，不依赖 Elasticsearch、向量数据库或常驻 Ollama 服务。

### 结果可解释

结构化索引保留名称、描述、Props、使用场景和使用次数。即使使用了语义检索，最终展示的信息仍来自源码分析。

### 适合团队标准化

通过 npm 固定版本发布后，团队成员可以使用相同的扫描规则、搜索权重和 MCP Tool，减少个人脚本差异。

## 9. 当前边界

- Vue 目前使用 SFC 启发式抽取，复杂类型解析弱于 React/TypeScript AST。
- 否定表达仍可能误判，例如“展示员工列表，但不要选择人员”。
- 首次安装 Transformers/ONNX 运行库较大，首次语义查询还需要下载量化模型。
- 当前向量索引是本地 JSON 文件，不适合直接承担大型团队级、多仓库集中检索。
- ArkTS 使用兼容预处理加 TypeScript AST，适合组件检索和元数据提取，但不是完整的 ArkTS 编译器或类型检查器。
- 评估集规模仍较小，需要持续加入团队真实查询并调整混合权重。

## 10. 后续可扩展方向

- 使用 `@vue/compiler-sfc` 增强 Vue AST 解析。
- 增加组件详情、相似组件和引用查询 Tool。
- 建立更大的真实查询评估集，持续跟踪 Top-1、Top-3 命中率。
- 根据查询类型动态调整关键词与语义权重。
- 支持 Storybook、组件文档和测试用例作为使用示例。
- 大规模场景可把本地 JSON 向量索引替换为 LanceDB、Qdrant 或 pgvector。

## 11. 总结

Component Search MCP 的核心价值不是简单地“搜索文件名”，而是把源码中的确定性结构与语义检索结合起来，再通过 MCP 交给 AI 编程工具使用。

它让 Codex 能够回答：项目里是否已经有合适组件、组件在哪里、如何导入、有哪些 Props、是否已经被使用。这样可以把 AI 从“根据经验猜项目代码”提升为“基于当前项目真实组件进行开发”。
