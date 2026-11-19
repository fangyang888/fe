
from pydantic_settings import BaseSettings


class _BaseSettingsWithEnv(BaseSettings):
    # 配置读取方式
    model_config = {"env_file": ".env"}  # env文件的位置

class _DBSettings(_BaseSettingsWithEnv):
    host: str = ""
    port: str = ""
    name: str = ""
    user: str = ""
    password: str = ""

    model_config = {"env_prefix": "DB_", "extra": "ignore"}

db_settings = _DBSettings()