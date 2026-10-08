from pydantic_settings import BaseSettings
from pathlib import Path


# config.py 位于 项目/src/langgraph_py/core/config.py
ENV_FILE = Path(__file__).resolve().parents[3] / ".env"

class BaseSettingsWithEnv(BaseSettings):
    model_config = {"env_file": ENV_FILE, "extra": "ignore"}


class OpenAISettings(BaseSettingsWithEnv):
    api_key: str = "sk-5NLl1dODVZfJUMK88ZmLt7NsSTfv7Vqgrvv48oM6JwUXiYar"
    base_url: str = "https://napi.xmmeiyou.com/v1"
    default_model: str = "deepseek-v4.1-flash"

    model_config = {"env_prefix": "OPENAI_"}


class AnthropicSettings(BaseSettingsWithEnv):
    api_key: str = ""
    base_url: str = ""
    default_model: str = ""

    model_config = {"env_prefix": "ANTHROPIC_"}


openai_settings = OpenAISettings()
anthropic_settings = AnthropicSettings()
