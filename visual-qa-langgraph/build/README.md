# Codex 插件打包与管理

源码项目在 `visual-qa-langgraph` 目录执行以下命令。构建脚本只使用 Python 3.11+ 标准库；插件运行需要 Python 3.13+、uv 和 Chrome。安装和管理还需要支持 `codex plugin` 的 Codex CLI。

## 打包

```sh
python3 scripts/package_plugin.py
# 系统已具备可用的 make 时，也可以：
make build
```

产物放在 `build/`：

```text
build/
  codex-plugin.py                         管理脚本（源码文件，保留）
  README.md                               本说明（源码文件，保留）
  latest.json                             最新包的文件名、版本及 SHA-256
  visual-qa-langgraph-<版本+内容指纹>.zip   可分发 ZIP
  visual-qa-langgraph-<版本+内容指纹>.zip.sha256
  visual-qa-langgraph-local/               已展开的最新插件市场
    .agents/plugins/marketplace.json
    plugins/visual-qa-langgraph/            Python 源码、锁文件、Skill、示例及说明
    bundle.json                           包内文件校验和
    codex-plugin.py                        接收者可直接运行的管理脚本
    README.md
```

每次打包将源码版本与内容指纹组合成插件版本，例如 `0.1.0+build.abc123...`。相同内容重复打包得到相同 ZIP；源码或 Skill 改动后，内容版本随之改变。源码中的 `pyproject.toml`、锁文件与插件清单不会被改写。需要发布新的源码版本时，保持 `pyproject.toml`、`uv.lock` 和 `.codex-plugin/plugin.json` 的版本同步。

包中包含完整 Python 实现、`uv.lock`、Skill、示例、工作流图和开发入口。真实 `.env`、虚拟环境、缓存、运行证据、Studio 数据和示例输出不进入 ZIP；`.env.example` 提供空配置模板。包不含 Python 依赖或浏览器二进制，首次运行按 Skill 执行 `uv sync`。

可以用 `python3 scripts/package_plugin.py --output-dir /path/to/build` 指定其他输出目录；管理时加 `--bundle /path/to/build/visual-qa-langgraph-local`。

## 安装、更新、状态和删除

系统具备可用的 make 时，在源码项目中：

```sh
make install     # 先打包，再注入 Codex
make update      # 重新打包并更新 Codex 中的插件
make status      # 查看本插件市场的插件版本、安装和启用状态
make remove      # 卸载本插件及 Codex 安装缓存，保留本地市场和构建包
```

也可以直接使用 Python 脚本，不依赖 make（macOS 的 make 可能需要先安装 Command Line Tools）：

```sh
python3 build/codex-plugin.py install
# 源码改动后，重新打包，再更新：
python3 scripts/package_plugin.py
python3 build/codex-plugin.py update
python3 build/codex-plugin.py status
python3 build/codex-plugin.py remove
python3 build/codex-plugin.py remove --purge-marketplace
```

`inject` 是 `install` 的别名，`uninstall` 是 `remove` 的别名。删除操作只处理 `visual-qa-langgraph@visual-qa-langgraph-local`；`--purge-marketplace` 额外取消该市场的登记，不删除源码、ZIP 或业务项目。

安装与更新会先验证包内文件校验和，再调用：

```sh
codex plugin marketplace add /绝对路径/visual-qa-langgraph-local
codex plugin add visual-qa-langgraph@visual-qa-langgraph-local
```

更新使用新内容版本重新执行安装命令；本地目录无需调用面向 Git 市场的 `marketplace upgrade`。重新打包后务必执行 `update`，不要只修改 Codex 安装缓存。管理脚本在任一命令失败时停止并返回非零退出码。

所有操作支持 `--dry-run`，只验证文件和打印命令；Codex 不在 PATH 中时使用 `--codex /path/to/codex`。macOS 会自动查找 `/Applications` 和 `~/Applications` 中 Codex/ChatGPT 的内置 CLI，同时兼容 `Contents/Resources/codex` 和新版 `Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`，无需为此激活 Python 虚拟环境：

```sh
python3 build/codex-plugin.py install --dry-run
python3 build/codex-plugin.py update --codex /path/to/codex
```

安装或更新后，刷新或重启 Codex，再开新聊天，使用 `$visual-qa-langgraph` 调用。此安装方式使用独立本地市场，已有 `personal` 市场中的同名插件会作为另一个安装项存在；若不需要旧项，可在 Codex 中单独卸载。

## 分发 ZIP 给其他机器

将 ZIP 整体解压到长期保留的目录。在解压后的 `visual-qa-langgraph-local/` 中运行：

```sh
python3 codex-plugin.py install --dry-run
python3 codex-plugin.py install
python3 codex-plugin.py status
python3 codex-plugin.py update
python3 codex-plugin.py remove --purge-marketplace
```

上述包内命令不依赖原仓库或作者机器路径。收到新版 ZIP 后，解压到新目录并运行其中的 `update`，市场登记会指向该目录。安装期间及后续更新时保留登记的目录；首次使用还需接收者自己的模型凭据（仅模型修正需要）和 Pixso MCP（仅远端设计读取需要）。如需 Studio，将 `.env.example` 复制为 `.env` 并按自己的环境填写。

插件市场布局和命令依据 [OpenAI 官方插件打包文档](https://developers.openai.com/plugins/build/plugins) 及本机 `codex plugin --help`。
