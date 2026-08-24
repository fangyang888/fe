from fastapi import APIRouter

from python_agent.api.routes.health import router as health_router

api_router = APIRouter(prefix="/api/agent")
api_router.include_router(health_router)
