# Docker与CI

## Docker学习内容

- 镜像、容器、网络、Volume。
- 多阶段构建。
- 非root用户运行。
- 健康检查。
- 环境变量和Secret。
- MySQL、Redis与应用的本地编排。

不要把`.env`或Key复制进镜像。

## CI检查

每次提交执行：

```bash
uv sync --frozen
uv run ruff format --check .
uv run ruff check .
uv run pyright
uv run pytest
```

集成测试启动隔离MySQL和Redis；构建完成后运行最小启动与健康检查。

## 验收

本地和CI使用同一锁文件；干净环境可一次构建；测试失败时不会继续部署。
