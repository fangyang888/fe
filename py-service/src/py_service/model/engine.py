
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from py_service.core.config import db_settings

_engine: AsyncEngine | None = None

def get_engine() -> AsyncEngine:
    """
    创建一个异步 SQLAlchemy 引擎。

    :return: 异步 SQLAlchemy 引擎。
    """
    global _engine
    if _engine is None:
        url = f"postgresql+asyncpg://{db_settings.user}:{db_settings.password}@{db_settings.host}:{db_settings.port}/{db_settings.name}"
        _engine = create_async_engine(url, echo=True)
    return _engine
