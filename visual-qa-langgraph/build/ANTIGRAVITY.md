# Antigravity 插件打包与管理

本包按 [Antigravity 官方插件格式](https://antigravity.google/docs/build-plugins) 生成，使用 `.antigravity-plugin/plugin.json` 和 `skills/visual-qa-langgraph/SKILL.md`。运行逻辑与 Codex 版共用同一份 Python 源码和锁文件。管理脚本只需要 Python 3.11+，不依赖 `agy`、Node 或 Codex CLI；实际视觉验收需要 Python 3.13+、uv 和 Chrome。

## 在源码目录打包

```sh
python3 scripts/package_plugin.py --target antigravity
# 同时生成两种宿主的包：
python3 scripts/package_plugin.py --target all
# 或使用 make：
make build-antigravity
```

产物放在 `build/`：

```text
antigravity-plugin.py                     管理脚本（源码文件，保留）
ANTIGRAVITY.md                            本说明（源码文件，保留）
latest-antigravity.json                   最新文件名、版本与 SHA-256
visual-qa-langgraph-antigravity-<版本>.zip
visual-qa-langgraph-antigravity-<版本>.zip.sha256
visual-qa-langgraph-antigravity/           已展开的独立插件
  .antigravity-plugin/plugin.json
  skills/visual-qa-langgraph/SKILL.md
  src/visual_qa_graph/
  pyproject.toml
  uv.lock
  bundle.json                            所有分发文件的校验和
  antigravity-plugin.py
```

版本含源码内容指纹，相同内容重复打包得到相同 ZIP。包内保留 Skill 的相对运行路径、全部 references、Python 实现、示例和工作流文档；排除 `.env`、虚拟环境、缓存、运行结果和 Codex 专用的 `agents/openai.yaml`。Antigravity 版生成 `disable-model-invocation: true`，延续现有 Skill 的显式调用策略；不会修改 Codex Skill 的源文件。

## 安装、更新、状态和卸载

在源码项目目录运行：

```sh
python3 build/antigravity-plugin.py install --dry-run
python3 build/antigravity-plugin.py install
python3 build/antigravity-plugin.py status

# 修改源码后，先打包再更新：
python3 scripts/package_plugin.py --target antigravity
python3 build/antigravity-plugin.py update

python3 build/antigravity-plugin.py remove
```

默认复制到 `~/.gemini/config/plugins/visual-qa-langgraph/`，供所有工作区使用。仅为某个项目安装时，所有管理命令都加同一个 `--project`：

```sh
python3 build/antigravity-plugin.py install --project /path/to/project
python3 build/antigravity-plugin.py status --project /path/to/project
python3 build/antigravity-plugin.py remove --project /path/to/project
```

项目安装位置是 `<project>/.agents/plugins/visual-qa-langgraph/`。这些加载路径依据 [Antigravity 官方本地插件说明](https://antigravity.google/docs/plugins)。`--config-dir /path/to/config` 可替换全局配置根目录，便于隔离验证；不能与 `--project` 同用。`--bundle /path/to/extracted/plugin` 可指定输入包。`inject` 是 `install` 的别名，`uninstall` 是 `remove` 的别名，所有修改操作支持 `--dry-run`。

安装和更新先校验全部文件，再在目标文件系统暂存并替换；不覆盖没有本工具 `bundle.json` 标记的已有目录。更新会替换整个旧插件目录，包括其中的 `.venv`，首次使用时需重新 `uv sync`。卸载只删除本工具管理的插件目录。源码目录、分发 ZIP、业务项目和其他插件不受影响。

安装或更新后刷新／重启 Antigravity，并新建对话，输入 `/visual-qa-langgraph`。Skill 会从自身路径定位 Python 项目，首次运行执行 `uv sync`。读取远端设计时需要用户自己的 Pixso MCP；自动模型修正需要自己的模型凭据，包内不附带凭据。

如已安装 Antigravity CLI，也可以直接用官方命令验证或安装展开目录：

```sh
agy plugin validate --strict build/visual-qa-langgraph-antigravity
agy plugin install ./build/visual-qa-langgraph-antigravity
agy plugin list --json
```

上面的 `agy plugin` 命令由 Antigravity CLI 管理登记状态；Python 管理脚本采用官方支持的手动目录安装方式，`status` 检查文件版本和完整性，不代表宿主已经加载。使用 CLI 安装的副本请通过 CLI 管理卸载，避免混用两种管理方式。

## 分发给其他机器

将 ZIP 整体解压，在解压后的 `visual-qa-langgraph-antigravity/` 中运行：

```sh
python3 antigravity-plugin.py install --dry-run
python3 antigravity-plugin.py install
python3 antigravity-plugin.py status
```

收到新 ZIP 时，解压并运行新版目录中的 `antigravity-plugin.py update`。安装复制的是完整包，因此后续运行不依赖原仓库位置；管理时使用分发目录中的脚本。构建支持 `--output-dir /path/to/build`，且不会改写 Codex 的 `latest.json` 或现有市场目录。
