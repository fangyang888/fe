from typing import Annotated

from fastapi import APIRouter, Depends

from python_agent.core.config import Settings, get_settings
from python_agent.schemas.health import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health(
    settings: Annotated[Settings, Depends(get_settings)],
) -> HealthResponse:
    """最小健康检查；绝不返回密码、API Key 等敏感配置。"""
    return HealthResponse(
        status="ok",
        service=settings.app_name,
        environment=settings.app_env,
    )
