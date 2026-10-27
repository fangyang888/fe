from dataclasses import dataclass, field
from typing import Any

from langgraph_py.core.config import openai_settings
from langgraph_py.core.create_model import Provider
from typing import NotRequired, TypedDict


class AssistantConfig(TypedDict):
    provider: NotRequired[Provider]
    model_name: NotRequired[str]

@dataclass
class ModelConfig:
    """模型配置，最终透传给 create_model"""

    model_name: str = openai_settings.default_model
    provider: Provider = "openai"
    kwargs: dict[str, Any] = field(default_factory=dict)

    def to_kwargs(self) -> dict[str, Any]:
        return {
            "model_name": self.model_name,
            "provider": self.provider,
            **self.kwargs,
        }
