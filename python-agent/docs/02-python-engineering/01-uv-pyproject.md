# uv与pyproject.toml

## uv负责什么

uv负责Python版本、虚拟环境、依赖解析、锁文件和命令运行。当前项目统一使用uv，不再混用Poetry、Pipenv或手工维护requirements.txt。

常用命令：

```bash
uv sync
uv add package-name
uv add --dev package-name
uv remove package-name
uv run python -m python_agent.main
uv lock
```

## pyproject.toml

它同时记录：项目名称、Python版本范围、正式依赖、开发依赖，以及pytest、Ruff和Pyright配置。

`uv.lock`负责锁定精确版本，应提交到Git；`.venv`是本机环境，不提交。

## 练习

解释当前`pyproject.toml`每一个区块的用途，并新增一个只在测试中使用的依赖，再正确移除。

## 验收

能够从空目录创建可复现项目，并说明“版本范围”和“锁定版本”的区别。
