# Visual QA — Antigravity 安装包

## 安装（全局，推荐）

1. 完整解压 ZIP，进入包含 install.py 和 visual-qa 文件夹的目录。
2. 在该目录打开终端，运行：

```bash
python3 install.py
```

Windows：`py -3 install.py`。需要 Python 3.9+，不需要 Codex CLI，也不需要 plugin-creator。

脚本将插件复制到当前用户的 `~/.gemini/config/plugins/visual-qa`，不修改 Codex 配置，不安装 npm 依赖，不覆盖已有同名插件。

3. 退出并重新打开 Antigravity，打开业务项目，新建对话，发送：

> 请检查 Visual QA 插件是否已加载，并读取它的 Skill。若缺少运行依赖，请在插件目录初始化 npm 依赖。先不要修改业务代码。

首次初始化需要 Node.js 18+、npm 和网络。在安装后的插件目录执行 `npm ci` 和 `npm run build`；Skill 会根据自身路径定位目录。浏览器截图默认使用本机 Chrome。

4. 然后发送实际需求：

> 使用 Visual QA 根据这个 Pixso 设计实现页面。设计地址：……。目标页面：……。优先搜索 internal-components，不可用就跳过，完成后运行视觉验收。

## 仅安装到一个项目

```bash
python3 install.py --workspace "/你的项目绝对路径"
```

会复制到 `<项目>/.agents/plugins/visual-qa`，只在打开该项目时加载。不要同时全局和项目安装同名插件。

仅检查、不写文件：`python3 install.py --dry-run`。

## 手动安装与更新

也可以把包里的整个 `visual-qa` 文件夹复制到 `~/.gemini/config/plugins/` 下，最终应能看到 `~/.gemini/config/plugins/visual-qa/plugin.json`。复制完成后可删除解压目录。

已有同名目录时脚本会退出。更新前把旧插件移到扫描目录以外备份，再运行新版本安装脚本，重新初始化依赖并重启 Antigravity。卸载时移除所安装的 visual-qa 文件夹。

## 支持范围

依据 Antigravity 官方 IDE 插件文档：根目录 plugin.json、skills/<name>/SKILL.md；支持全局 `~/.gemini/config/plugins/` 及项目 `.agents/plugins/` 自动发现。
文档：https://antigravity.google/docs/ide/plugins

插件不自动配置 Pixso 或 internal-components。设计读取需要使用者自己的 Pixso MCP；也可提供本地参考图。internal-components 不可用直接跳过。

这是本地插件，不是 VS Code 的 VSIX。若你的 Antigravity 版本不支持文档中的插件扫描目录，先升级或检查其版本文档。安装脚本只复制文件，不连接 Antigravity 检查激活状态；可让新对话中的 Agent 确认是否已加载。
