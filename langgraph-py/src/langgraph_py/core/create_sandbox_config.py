import os
from pathlib import Path

from dotenv import load_dotenv


ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


def get_sandbox_config():
    load_dotenv(ENV_FILE, override=False)

    api_key = os.environ.get("SANDBOX_API_KEY")
    base_url = os.environ.get("SANDBOX_BASE_URL")
    ali_uid = os.environ.get("ALI_YUN_UID")

    if not api_key or not base_url:
        raise ValueError(
            "SANDBOX_API_KEY and SANDBOX_BASE_URL must be set in the environment or .env file."
        )

    return {
        "api_key": f"e2b_{ali_uid}",
        "api_url": base_url,
        "template": "576c678a-1fe2-4b0c-9294-d83a09755ff4",
        "headers": {"Authorization": f"Bearer {api_key}"},
        "timeout": 1200,
    }


def get_oss_config():
    load_dotenv(ENV_FILE, override=False)

    oss_bucket_name = os.environ.get("OSS_BUCKET_NAME")
    oss_endpoint = os.environ.get("OSS_ENDPOINT")
    oss_role_arn = os.environ.get("OSS_ROLE_ARN")

    if not oss_bucket_name or not oss_endpoint:
        raise ValueError(
            "OSS_BUCKET_NAME and OSS_ENDPOINT must be set in the environment or .env file."
        )

    return {
        "oss_bucket_name": oss_bucket_name,
        "oss_endpoint": oss_endpoint,
        "oss_role_arn": oss_role_arn
    }

sandbox_config_settings = get_sandbox_config()
oss_config_settings = get_oss_config()
