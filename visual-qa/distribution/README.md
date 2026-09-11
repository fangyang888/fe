# Visual QA 本地插件安装包

1. 将 ZIP 完整解压到一个长期保留的目录，不要只提取 install.py。
2. 在解压后的 visual-qa-local 目录打开终端，执行：

```bash
python3 install.py
```

Windows 可以执行 `py -3 install.py`。需要 Python 3.9+ 和支持插件的 Codex CLI；macOS 脚本也会尝试查找 /Applications 中的 Codex/ChatGPT app 内置 CLI。

脚本会登记当前目录为本地插件市场 `visual-qa-local`，然后安装 `visual-qa`；不会修改业务项目，不依赖 plugin-creator。若已有同名本地市场，请先确认它指向的目录。仅检查内容和命令可运行 `python3 install.py --dry-run`，不会安装。

也可以在此目录手动执行：

```bash
codex plugin marketplace add .
codex plugin add visual-qa@visual-qa-local
```

安装后新建 Codex 任务，输入：

> 使用 Visual QA 根据这个 Pixso 设计实现页面，优先复用本地组件，internal-components 不可用就跳过，最后做视觉验收。

## 首次使用

这不是完全离线包。CLI 运行需要 Node.js 18+、npm 和 Chrome；首次使用时按 Skill 指引，在实际安装的插件副本根目录执行 `npm ci` 和 `npm run build`。安装副本路径由 Codex 当前加载的 Skill 位置确定，不要误在业务项目里安装依赖。包内包含 dist/src 编译代码和锁文件，不携带 node_modules 或浏览器二进制。

Pixso 读取需要接收者自己的 Pixso MCP；也可以提供本地参考图进行验收。internal-components 为可选 MCP，不可用直接跳过，不会自动安装。

## 更新与卸载

请保留解压目录。收到新版本后解压到新目录，重新运行安装脚本；包中插件版本会按打包时间生成 Codex cachebuster。安装后用新任务加载。

卸载可通过 Codex 插件界面操作。该包是自建本地插件市场，不表示已发布到官方插件市场。
