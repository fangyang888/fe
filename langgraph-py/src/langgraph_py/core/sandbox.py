"""按 LangGraph thread_id 复用阿里云沙箱，工作目录和产物目录挂载到 OSS。"""

import json

from e2b import AsyncSandbox
from langgraph.store.base import BaseStore

from langgraph_py.core.create_sandbox_config import (
    oss_config_settings,
    sandbox_config_settings,
)

_STORE_NAMESPACE = ("coding_agent", "sandbox")


def _metadata(key: str) -> dict:
    role = oss_config_settings.get("oss_role_arn")
    if not role:
        raise ValueError("请在 .env 中设置 OSS_ROLE_ARN，以便沙箱挂载 OSS")
    return {
        "fc.sandbox.storage.oss": json.dumps({
            "mountPoints": [
                {
                    "bucketName": oss_config_settings["oss_bucket_name"],
                    "mountDir": f"/home/user/{directory}",
                    "bucketPath": f"/{key}/{directory}",
                    "endpoint": oss_config_settings["oss_endpoint"],
                    "readOnly": False,
                }
                for directory in ("workspace", "output")
            ]
        }),
        "fc.sandbox.auth.role": role,
    }


async def get_sandbox(*, key: str, store: BaseStore) -> AsyncSandbox:
    """连接当前会话的沙箱；沙箱失效时，用相同 OSS 路径创建新沙箱。"""
    if not key or key in {".", ".."} or any(c in key for c in "/\\\x00"):
        raise ValueError("thread_id 必须是非空的单个路径名称")

    config = dict(sandbox_config_settings)
    template = config.pop("template")
    metadata = _metadata(key)
    item = await store.aget(_STORE_NAMESPACE, key)
    sandbox_id = item.value.get("sandbox_id") if item and item.value else None
    if sandbox_id:
        try:
            sandbox = await AsyncSandbox.connect(sandbox_id=sandbox_id, **config)
        except Exception:
            # 过期或主动关闭的沙箱可以重新创建，文件仍保存在 OSS 中。
            pass
        else:
            return sandbox

    sandbox = await AsyncSandbox.create(template=template, metadata=metadata, **config)
    await store.aput(_STORE_NAMESPACE, key, {"sandbox_id": sandbox.sandbox_id})
    return sandbox
