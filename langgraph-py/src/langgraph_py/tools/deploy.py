"""将沙箱中的最终产物复制到 OSS 挂载目录，并返回无签名的访问地址。"""

import os
import posixpath
import shlex
from urllib.parse import quote, urlsplit

from langchain.tools import tool
from langchain_core.tools import ToolException
from langgraph.config import get_config
from langgraph.runtime import get_runtime
from pydantic import BaseModel, Field, field_validator

from langgraph_py.core.sandbox import get_sandbox

OUTPUT_DIR = "/home/user/output"
PUBLIC_BASE_URL = os.environ.get(
    "OSS_PUBLIC_BASE_URL", "https://fy-ag.oss-cn-beijing.aliyuncs.com"
).rstrip("/")


class DeployInput(BaseModel):
    path: str = Field(description="已检查或构建完成的沙箱绝对路径，可以是文件或目录")
    target_dirname: str = Field(description="部署目标的单个目录名称，建议使用工程名")
    entry_files: list[str] = Field(
        min_length=1,
        description="部署目录内的入口文件相对路径，例如 ['index.html', 'source.tar.gz']",
    )

    @field_validator("path")
    @classmethod
    def validate_path(cls, value: str) -> str:
        value = posixpath.normpath(value.strip())
        if not value.startswith("/") or "\x00" in value:
            raise ValueError("path 必须是沙箱中的绝对路径")
        value = "/" + value.lstrip("/")
        if value == "/" or value == OUTPUT_DIR or value.startswith(OUTPUT_DIR + "/"):
            raise ValueError("path 不能是根目录或位于部署输出目录内")
        if OUTPUT_DIR.startswith(value.rstrip("/") + "/"):
            raise ValueError("path 不能包含部署输出目录")
        return value

    @field_validator("target_dirname")
    @classmethod
    def validate_target_dirname(cls, value: str) -> str:
        value = value.strip()
        if not value or value in {".", ".."} or any(c in value for c in "/\\\x00"):
            raise ValueError("target_dirname 必须是单个目录名称")
        return value

    @field_validator("entry_files")
    @classmethod
    def validate_entry_files(cls, values: list[str]) -> list[str]:
        entries = []
        for value in values:
            value = posixpath.normpath(value.strip())
            if value in {".", ".."} or value.startswith(("/", "../")):
                raise ValueError("入口文件必须是部署目录内的相对路径")
            if "\\" in value or "\x00" in value:
                raise ValueError("入口文件包含非法字符")
            entries.append(value)
        if len(entries) != len(set(entries)):
            raise ValueError("入口文件不能重复")
        return entries


def _public_url(thread_id: str, target_dirname: str, entry_file: str) -> str:
    base = urlsplit(PUBLIC_BASE_URL)
    if base.scheme not in {"http", "https"} or not base.netloc or base.query or base.fragment:
        raise ValueError("OSS_PUBLIC_BASE_URL 必须是不带查询参数的 HTTP(S) 访问地址")
    entry = "/".join(quote(part, safe="") for part in entry_file.split("/"))
    return (
        f"{PUBLIC_BASE_URL}/{quote(thread_id, safe='')}/output/"
        f"{quote(target_dirname, safe='')}/{entry}"
    )


@tool(args_schema=DeployInput)
async def deploy(path: str, target_dirname: str, entry_files: list[str]) -> list[str]:
    """部署静态文件或目录到 OSS，返回各入口文件不带签名的访问链接。

    例如 deploy(path='/home/user/workspace/my-app/dist',
    target_dirname='my-app', entry_files=['index.html'])。
    该工具只部署静态文件，不会部署后端进程，也不会修改 OSS 访问权限。
    """
    thread_id = get_config().get("configurable", {}).get("thread_id")
    store = get_runtime().store
    if thread_id is None or store is None:
        raise RuntimeError("deploy 需要 configurable.thread_id 和 runtime store")
    # 在复制前检查域名配置。
    urls = [_public_url(str(thread_id), target_dirname, entry) for entry in entry_files]
    sandbox = await get_sandbox(key=str(thread_id), store=store)
    if not await sandbox.files.exists(path):
        raise ToolException(f"待部署的产物不存在：{path}")

    destination = posixpath.join(OUTPUT_DIR, target_dirname)
    # 先复制并检查入口，再替换旧产物；失败时保留原部署。
    checks = "\n".join(
        f'test -f "$staging"/{shlex.quote(entry)} || '
        f'{{ echo {shlex.quote("入口文件不存在：" + entry)} >&2; exit 1; }}'
        for entry in entry_files
    )
    source = shlex.quote(path)
    command = (
        "set -eu\n"
        f"mkdir -p -- {shlex.quote(OUTPUT_DIR)}\n"
        f"staging=$(mktemp -d {shlex.quote(OUTPUT_DIR + '/.deploy-XXXXXXXX')})\n"
        "trap 'rm -rf -- \"$staging\"' EXIT\n"
        f"if [ -d {source} ]; then\n"
        f'  cp -R -- {source}/. "$staging"/\n'
        "else\n"
        f'  cp -- {source} "$staging"/\n'
        "fi\n"
        f"{checks}\n"
        f"rm -rf -- {shlex.quote(destination)}\n"
        f'mv -- "$staging" {shlex.quote(destination)}'
    )
    result = await sandbox.commands.run(command, timeout=300)
    if result.exit_code != 0:
        detail = (result.stderr or result.stdout).strip()
        raise ToolException(f"部署失败，请检查产物路径和入口文件：{detail}")
    await sandbox.kill()
    return urls


deploy.handle_tool_error = True
