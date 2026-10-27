from typing import Literal, Union

from .config import  openai_settings
from langchain.chat_models import init_chat_model

Provider = Union[Literal["anthropic"], Literal["openai_reasoning"],Union[Literal["mock"]]]


def create_model(
    *,
    model_name: str = openai_settings.default_model,
    provider: Provider = "openai_reasoning",
    api_key: str | None = openai_settings.api_key,
    base_url: str | None = openai_settings.base_url,
   **kwargs,
):
    if provider == "mock":
        from .mock_model import mock_model

        return mock_model()
    if provider == "anthropic":
        kwargs.setdefault("thinking", {"type": "enabled"})
    return init_chat_model(model=model_name, model_provider=provider, api_key=api_key, base_url=base_url, **kwargs)
