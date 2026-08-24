from fastapi import FastAPI

from python_agent.api.router import api_router
from python_agent.core.config import get_settings


def create_app() -> FastAPI:
    """创建应用实例，方便测试时获得一个干净的 FastAPI 应用。"""
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description="用于学习 Python 并迁移现有 TypeScript Agent 的 API",
    )
    app.include_router(api_router)
    return app


app = create_app()
