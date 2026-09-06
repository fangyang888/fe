# 安装 Visual QA 插件

插件源码就是此目录，不需要额外的 MCP Server。安装由你手动完成。

## 1. 准备个人插件

在本目录执行：

```bash
python3 scripts/prepare-personal-plugin.py
```

此步骤调用 Codex 内置 plugin-creator helper，复制源码到 `~/plugins/visual-qa`，并在 `~/.agents/plugins/marketplace.json` 登记插件；**不会安装或启用插件**。不会复制 node_modules、dist、业务截图和验收缓存，也不会修改业务项目。

需要本机存在 `${CODEX_HOME:-$HOME/.codex}/skills/.system/plugin-creator/scripts/`。缺少 helper 时脚本会退出且不修改文件；可在具有 plugin-creator 的 Codex 环境请求按个人 marketplace 流程登记此插件。已有同名目录时脚本不会覆盖。

## 2. 安装到 Codex

执行准备脚本末尾打印的命令。新建的默认个人列表通常为：

```bash
codex plugin add visual-qa@personal
```

若已有个人列表的名称不同，以脚本输出为准。默认个人列表不需要运行 `codex plugin marketplace add`。

## 3. 在新任务中使用

安装后新建任务，输入：

> 使用 Visual QA 根据这个 Pixso 设计实现页面，先查本地组件，internal-components MCP 不可用就跳过，最后进行视觉验收。

首次使用，Skill 会检查**实际安装副本**的 CLI。在该副本根目录运行 `npm ci`、`npm run build` 后可用；需要 Node.js 18+ 和本机 Chrome，或用 CLI 指定支持的浏览器。依赖按 package-lock.json 安装，初始化可能需要网络和目录写权限。插件不会自动安装 Pixso 或 internal-components。

也可直接在源码目录执行 `npm ci`、`npm run build`、`node scripts/run.mjs help`，单独使用 CLI；源码目录初始化不代表 Codex 安装副本已初始化。

## 更新

源码目录与个人插件副本独立。更新时将变更同步到 `~/plugins/visual-qa`，使用 plugin-creator 的 `update_plugin_cachebuster.py` 更新副本版本后，重新执行步骤 2 的命令，并新建任务。不要重新运行准备脚本覆盖已有目录或手动改写 marketplace。
