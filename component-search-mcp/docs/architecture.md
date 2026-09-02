# 组件语义检索 MCP 架构

## 目标体验

开发者在 Cursor、Codex 或 Claude 中输入自然语言需求，Agent 可以搜索公司公共组件和当前项目组件，并继续查看详情、相似组件与真实使用位置。

```text
React / Vue 源码与组件文档
              ↓
AST / SFC 分析
              ↓
ComponentDocument
  - 组件名与描述
  - Props
  - import / export
  - Hooks
  - JSX / template
  - 源码路径与使用位置
              ↓
Embedding Provider
              ↓
Vector Store
              ↓
MCP Server
  - search_component
  - find_similar_component
  - get_component
  - find_usage
```

## 为什么先定义 ComponentDocument

向量数据库只负责召回。组件名称、导出方式、Props 和使用位置必须来自 AST 等确定性分析，不能依赖大模型猜测。Embedding 使用的是从结构化数据生成的 `embeddingText`，MCP 返回的详情仍然使用原始结构化字段。

## 技术选择

| 层 | 第一阶段 | 目标实现 |
|---|---|---|
| React/TSX | TypeScript Compiler AST | TypeScript Program + 类型解析 |
| Vue | SFC 启发式抽取 | `@vue/compiler-sfc` AST |
| 关键词召回 | 本地加权搜索 | 与向量召回混合排序 |
| Embedding | 尚未接入 | 可插拔 OpenAI / Azure OpenAI / 本地模型 |
| Vector DB | 尚未接入 | 本地 LanceDB，生产可换 Qdrant/pgvector |
| MCP | STDIO、只读 | STDIO + Streamable HTTP |

选择 TypeScript AST 而不是强制使用 Tree-sitter，是因为前端 TypeScript 项目需要读取 Props 类型、export 和 JSDoc。Tree-sitter 仍可作为多语言或不完整代码解析的补充。

## 实现阶段

### Phase 1：AST 数据层（当前）

- 扫描 `.tsx`、`.jsx`、`.vue`。
- React 使用 TypeScript AST。
- 支持在允许范围内动态选择项目根目录。
- 自动发现普通项目与 workspace 的常见源码目录。
- 为动态选择的项目生成独立缓存。
- 生成 schema version 3 的组件索引，保存源码文件指纹。
- 每次搜索前校验指纹，变化时懒更新索引。
- 为每个组件生成 `embeddingText`。
- 保留关键词搜索，验证数据正确性。

### Phase 2：语义检索

- 定义 `EmbeddingProvider` 接口。
- 接入一个中英文 Embedding 模型。
- 使用 LanceDB 保存向量和组件元数据。
- 实现关键词分数与向量分数的混合排序。

### Phase 3：完整 MCP Tools

- `search_component`：混合搜索。
- `find_similar_component`：根据组件 ID 找相似组件。
- `get_component`：返回完整 Props、源码摘要和用法。
- `find_usage`：返回项目内引用位置。

### Phase 4：团队化

- 接入远程组件文档和多个仓库。
- Git 增量索引。
- Streamable HTTP、鉴权和权限隔离。
- 查询评测集、Top-K 命中率和使用数据统计。
