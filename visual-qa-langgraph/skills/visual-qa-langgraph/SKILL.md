---
name: visual-qa-langgraph
description: 使用 visual-qa-langgraph 的 Python + LangGraph 流程实现和验收 Web 页面，包括 Pixso 设计读取、图片边界、Playwright 截图、DOM/CSS/结构/测量检查、视觉差异与可选自动修正；也用于保持外观不变的 SCSS 重构。当前不支持 Harmony/ArkUI。
metadata:
  short-description: Web 设计还原与 Python 视觉验收
---

# Visual QA LangGraph

## 定位运行环境

插件根目录是本文件所在目录的 `../..`。从实际 `SKILL.md` 路径解析根目录，不硬编码作者机器路径。目标项目、运行目录和报告目录都在目标项目中，不要写入插件目录。

优先使用 `<插件根目录>/.venv/bin/visual-qa-langgraph`。如果虚拟环境不存在，在插件根目录运行 `uv sync`，随后使用 `uv run --project <插件根目录> visual-qa-langgraph`。默认使用本机 Chrome；没有 Chrome 时可安装 Playwright Chromium，并在用例中设置 `browserChannel: "chromium"`。

不要回退到旧 `visual-qa` CLI、`node scripts/run.mjs`、Browser Server、adaptive 模式或 Node 构建。Python 实现只执行完整 `final` 验收。

## 选择流程

- 验收已有页面时，创建项目内的 case，运行 `doctor`，再运行 `verify`。多页面或多视口使用 `suite`。
- 从 Pixso 设计实现页面或处理红框图片时，使用无子命令的完整 LangGraph 入口。它会协调设计与源码准备、图片绑定、最终验收和可选修正；页面代码仍由你按目标框架实现。
- 保持现有 Web 外观的 SCSS 重构读取 [SCSS 重构验收](references/scss-refactor.md)。
- Web case、就绪检查、视口覆盖和失败诊断读取 [Web 验收](references/web.md)。
- Pixso 读取、红框图片、CSS 单位策略和生成前图片边界读取 [设计与图片流程](references/generation.md)。
- Harmony、ArkUI 和原生设备截图不受当前 Python 实现支持；不要用 Web 流程或旧 CLI 冒充原生验收。

## 基本约束

先读取目标项目的 `AGENTS.md`、页面规范、构建配置和现有样式。保持用户指定的框架、页面位置和读取范围，不创建替代项目。只做验收时不自动重写页面。

用户明确要求新建组件时，先搜索当前工具中可用的 `internal-components`。只能在获准的 `sourceRoots` 内读取候选；工具不可用、超时或无匹配时直接跳过，不要求安装 MCP。

设计稿、实现截图和未修图必须使用相同像素尺寸、DPR、页面状态、字体和裁切范围。每轮重新截图。不要复用过期的通过结果，也不要通过放宽阈值、替换基准或遮盖业务区域让验收通过。

项目明确声明 CSS 单位时，在项目自己的 Skill 中提供唯一的 `visual-qa-langgraph-policy` 配置，并把该文件传给 `--project-skill`。项目没有声明时不要猜测 rem 比例。

## 常用命令

将占位路径替换成当前项目和插件根目录的绝对路径：

```sh
<qa> doctor --case <项目>/artifacts/visual-qa-langgraph/case.json
<qa> verify --case <项目>/artifacts/visual-qa-langgraph/case.json --compact
<qa> suite --suite <项目>/artifacts/visual-qa-langgraph/suite.json --compact
```

从 Pixso 设计开始实现时：

```sh
<qa> \
  --case <项目>/artifacts/visual-qa-langgraph/case.json \
  --source <项目>/src/page/index.html \
  --source <项目>/src/page/styles.css \
  --pixso-endpoint <Pixso-MCP-endpoint> \
  --pixso-revision <可靠设计版本> \
  --project-skill <项目>/SKILL.md \
  --run-dir <项目>/artifacts/visual-qa-langgraph/runs/page-1
```

只有具备模型凭据和真实浏览器时才使用 `--model --auto-fix`。修改范围先通过 `--source` 限定，最多两轮；没有凭据时只报告失败和差异证据。

## 读取结果

完整图的结论在 `<run-dir>/summary.json`，每轮原始证据在 `evidence/round-N/report.json`。先读 `status`、`complete`、`rounds`、失败类别和 `differenceRegions`，再按需打开已有截图、diff、裁片和源码片段。`domCandidates` 是几何候选，不是已证实的根因。

失败时集中处理当前证据支持的问题并重新验收。只有在真实截图达到阈值、图片/字体/布局稳定性、控制台、CSS、结构和契约检查全部通过时才能报告 `final passed`。交付时给出实现位置、预览方式、指标和报告路径，并说明未接入的业务功能或无法验证的范围。

## 完成后必须显示 Token 与耗时

每次任务结束时，最终回复必须同时列出 **Token 消耗** 和 **时间消耗**，无论验收通过、失败或因限制未完成；不能只把统计留在报告文件中。统计必须有来源并注明范围，无法获取时明确写“不可获取”或“未记录”，不得估算、留空或省略。

- **Token**：读取完整图 `summary.json.modelUsage`，展示 `inputTokens`、`outputTokens`、`totalTokens`；有缓存或推理 token 时一并说明其为对应总量的子项，不重复累加。汇总多次运行时按独立运行去重，避免重复计算 summary、round report 与恢复运行中的同一调用。`modelCalls: 0` 时注明“工具内部未调用模型，工具 Token 为 0”。当前 Codex 对话或外部代理的用量只有在可读取真实统计时才能报告；无法读取时单独注明“当前对话 Token 不可获取”，不得用工具的 0 代表整个任务消耗。`verify` / `suite` 没有模型用量字段时，不凭字段缺失推断为 0。
- **工具耗时**：完整图读取 `summary.json.timings.activeWallMs`，需要解释中断恢复时另列 `elapsedWallMs`；独立验收读取 `report.json.timings.totalMs`。列出各轮或各用例及合计，换算为秒或分秒。不要重复累计父级汇总与子阶段；并行用例的耗时之和只能称“累计执行耗时”，不能称总墙钟时间。suite 没有总墙钟统计时明确说明，不将各 case 之和冒充 suite 墙钟耗时。
- **任务总耗时**：从开始工作时记录起止时间，统计开发、源码定位、修复、构建和验收的实际墙钟范围；若包含等待用户确认或中断，单独说明。缺少起止记录时写“任务总耗时未记录”，不得将验收耗时当作整个任务耗时。
- **修复耗时**：人工或当前对话完成的定位与修改若没有独立计时，写“未单独计时”；工具修复阶段的 0ms 只表示该工具阶段未执行，不能表示没有发生修复工作。

最终回复至少包含以下统计，数值与报告链接替换为实际结果：

```text
Token：工具输入 …，输出 …，合计 …；当前对话 …（不可获取时明确标注）。
时间：首轮验收 … 秒，修复后复验 … 秒，累计执行 … 秒；任务总耗时 …（未记录时明确标注）。
统计来源：…/summary.json、…/report.json。
```

