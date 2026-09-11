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

源码、分发包和 Codex 安装缓存是独立副本。**只修改源码或重新打包，不会自动更新已安装插件。** 按最初的安装方式升级，不要在 `personal` 和 `visual-qa-local` 之间重复安装。

先查看安装来源及本地市场目录：

```bash
codex plugin list
codex plugin marketplace list
```

### 通过 ZIP / install.py 安装的版本

对应插件名称：`visual-qa@visual-qa-local`。你之前在 `artifacts/visual-qa-local` 执行过 `install.py`，就使用此流程。

1. 作者在最新源码目录重新打包；接收者直接获取新版 ZIP 即可：

   ```bash
   python3 scripts/package-plugin.py
   ```

   版本以源码 `package.json` 的 `version` 为准。例如改为 `0.2.0` 后，默认生成 `visual-qa-local-0.2.0.zip`，包内插件版本为 `0.2.0+codex.<时间戳>`，无需另改源码 `.codex-plugin/plugin.json`。预发布版本同样保留；若 package 版本带 `+` 构建元数据，包内插件会将其替换为 Codex 缓存标识。打包不自动递增版本；同一版本重新打包会覆盖同名 ZIP，但会更新包内缓存标识。

2. 退出正在使用插件的任务。备份旧解压目录，将新版 ZIP **完整解压到原市场路径**，使 `.agents/plugins/marketplace.json` 和 `plugins/visual-qa` 仍位于该路径下。避免多嵌套一层 `visual-qa-local`，也不要仅覆盖 `SKILL.md` 或在旧文件上零散合并。业务截图、用例和报告应存放在业务项目中。

3. 市场路径未变时，直接重新安装：

   ```bash
   codex plugin add visual-qa@visual-qa-local
   ```

   不必重复注册市场。如果改用新的解压路径，先确认旧市场只服务此插件，再切换登记并安装：

   ```bash
   codex plugin marketplace remove visual-qa-local
   codex plugin marketplace add "/新版解压路径/visual-qa-local"
   codex plugin add visual-qa@visual-qa-local
   ```

   任一步报错时先处理该错误，不继续认定升级成功。`marketplace upgrade` 用于刷新 Git 市场，不能替你更新本地 ZIP 的文件。

### 通过 personal 安装的版本

对应插件名称通常为 `visual-qa@personal`，若你的个人市场名称不同，用实际名称替换。

1. 备份 `~/plugins/visual-qa`，将最新源码中的 `.codex-plugin/`、`skills/`、`scripts/`、`src/`、`test/`、`cases/` 和 `distribution/`（如有）同步到该副本，清理这些目录内已从新版移除的旧文件；同时同步 `package.json`、`package-lock.json`、`tsconfig.json`、`README.md`、`INSTALL.md` 和 `.gitignore`。不复制 `node_modules`、旧 `dist`、业务截图和缓存。
2. 更新副本的缓存版本标识，然后重新安装：

   ```bash
   python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/plugin-creator/scripts/update_plugin_cachebuster.py" "$HOME/plugins/visual-qa"
   codex plugin add visual-qa@personal
   ```

不要重新运行 `prepare-personal-plugin.py`：它遇到已有目录会退出，不承担升级功能。不要直接修改 Codex 的 `plugins/cache` 安装缓存或手动改写 marketplace。

### 确认升级生效

1. 执行 `codex plugin list`，确认对应来源的插件为 `installed, enabled`，版本标识与新版市场副本的 `.codex-plugin/plugin.json` 一致。版本未变时检查是否同步到了实际登记路径、是否更新了缓存版本标识。
2. 新建 Codex 任务，要求使用 Visual QA，并检查实际加载的 `SKILL.md` 是否含新增内容。例如本次更新应包含“SCSS 变量抽取”入口和 `references/scss-refactor.md`。已有任务可能仍持有旧版技能上下文。
3. 新安装副本可能需要重新初始化依赖：按技能指引在**实际安装副本**运行 `npm ci`、`npm run build` 和 `node scripts/run.mjs help`。旧源码目录里的 `node_modules` 不代表新副本已准备好。

安装状态与 CLI 检查成功只表示升级可用，不代表业务页面已通过视觉验收。

## 分发给其他人（ZIP）

推荐给接收者发送打包后的本地市场 ZIP，而不是让他们运行依赖作者本机 helper 的 prepare-personal-plugin.py。

作者在源码目录执行 `python3 scripts/package-plugin.py`，生成 `artifacts/visual-qa-local-0.1.0.zip` 和 SHA-256 文件。接收者完整解压后运行包根目录的 `python3 install.py`（Windows：`py -3 install.py`），由脚本注册本地市场并安装插件。安装脚本无 plugin-creator 依赖；完整说明位于包根目录 README.md。

打包只收集插件文件和 dist/src，不包含 node_modules、业务截图或缓存。依赖仍需接收者首次使用时联网安装。作者无需运行包内安装脚本，也不需要将插件发布到服务器。

## Antigravity 版本

执行 `python3 scripts/package-antigravity.py` 生成独立的 `artifacts/visual-qa-antigravity-0.1.0.zip`。接收者完整解压，在包根目录执行 `python3 install.py`，会将插件复制到 Antigravity 的全局插件目录；不会调用 Codex。支持 `--workspace <项目路径>` 和 `--dry-run`。完整步骤见 [Antigravity 安装说明](distribution/antigravity/README.md)。
