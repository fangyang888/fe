# Python Agent 学习与迁移项目

这个目录有两个目标：

1. 从基础开始系统学习 Python 后端与 Agent 开发。
2. 在掌握对应知识后，逐步迁移现有 `server/src/agent`，而不是逐行翻译。

## 当前阶段

当前只建立最小 FastAPI 脚手架和健康检查接口。数据库、Redis、模型、LangChain
和 LangGraph 会在学完对应章节后逐步加入。

学习入口：[docs/README.md](./docs/README.md)

第一次启动和目录说明：[脚手架使用与目录结构](./docs/00-overview/05-scaffold-usage-and-structure.md)

## 计划中的架构

```text
React 前端
  └─ /api/agent/* → Python FastAPI :8000

Python FastAPI Agent
  ├─ MySQL + SQLAlchemy + Alembic
  ├─ Redis
  ├─ LangChain / LangGraph
  └─ 现有模型服务

原 NestJS :3000
  └─ 暂时继续负责商城和其他非 Agent API
```

## 安装命令

电脑目前还没有安装 `uv`。安装完成后，在本目录执行：

```bash
uv sync
cp .env.example .env
uv run fastapi dev src/python_agent/main.py
```

打开：

- API 文档：`http://127.0.0.1:8000/docs`
- 健康检查：`http://127.0.0.1:8000/api/agent/health`

## 每次提交前的检查

```bash
uv run ruff format --check .
uv run ruff check .
uv run pyright
uv run pytest
```

## 线上部署

本服务沿用仓库现有的阿里云 ECS 发布链路：GitHub Actions 校验并上传代码，
ECS 使用 `uv sync --frozen --no-dev` 创建隔离环境，PM2 以 `python-agent`
进程名运行 Uvicorn，监听 `127.0.0.1:8000`。

当前 Nginx 只将 `/api/agent/health` 转发到 Python；其余
`/api/agent/*` 仍转发到 NestJS，避免尚未迁移的接口中断。

## 学习纪律

- 没学过的模块先不迁移。
- 每次只增加一个小能力。
- 每个功能至少有一个正常测试和一个异常测试。
- 不把真实 API Key、密码或用户隐私提交到 Git。
- Python 版本正常工作前，不删除 TypeScript 版本。
