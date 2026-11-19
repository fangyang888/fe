import asyncio

from deepagents.backends.protocol import (
    DeleteResult,
    ExecuteResponse,
    FileDownloadResponse,
    FileUploadResponse,
)
from deepagents.backends.sandbox import BaseSandbox
from e2b import AsyncSandbox, CommandExitException
from e2b.exceptions import FileNotFoundException
from langgraph.config import get_config
from langgraph.runtime import get_runtime

from langgraph_py.core.command_validation import command_validation_error
from langgraph_py.core.sandbox import get_sandbox

WORKSPACE_DIR = "/home/user/workspace"


class AliyunSandboxBackend(BaseSandbox):
    """阿里云异步沙箱；通用文件操作由 BaseSandbox 提供。"""

    @property
    def id(self) -> str:
        thread_id = get_config().get("configurable", {}).get("thread_id")
        if thread_id is None:
            raise RuntimeError("AliyunSandboxBackend requires configurable.thread_id")
        return str(thread_id)

    async def _get_sandbox(self) -> AsyncSandbox:
        store = get_runtime().store
        if store is None:
            raise RuntimeError("AliyunSandboxBackend requires a runtime store")
        return await get_sandbox(key=self.id, store=store)

    # BaseSandbox 要求实现这些同步抽象方法；本工程沿用异步 SDK 和异步调用。
    def execute(self, command: str, *, timeout: int | None = None) -> ExecuteResponse:
        raise NotImplementedError("AliyunSandboxBackend 仅支持异步执行，请使用 aexecute")

    def upload_files(self, files: list[tuple[str, bytes]]) -> list[FileUploadResponse]:
        raise NotImplementedError("AliyunSandboxBackend 仅支持异步上传，请使用 aupload_files")

    def download_files(self, paths: list[str]) -> list[FileDownloadResponse]:
        raise NotImplementedError("AliyunSandboxBackend 仅支持异步下载，请使用 adownload_files")

    async def aexecute(
        self,
        command: str,
        *,
        timeout: int | None = None,
    ) -> ExecuteResponse:
        error = command_validation_error(command)
        if error:
            return ExecuteResponse(output=f"Error: {error}。命令未执行。", exit_code=2)
        try:
            sandbox = await self._get_sandbox()
            # 阿里云不支持 set_timeout，保留创建沙箱时配置的生命周期。
            result = await sandbox.commands.run(
                command,
                cwd=WORKSPACE_DIR,
                timeout=timeout if timeout is not None else 60,
            )
            return ExecuteResponse(
                output=result.stdout + result.stderr,
                exit_code=result.exit_code,
            )
        except CommandExitException as exc:
            # BaseSandbox 依赖真实退出码判断文件检查和命令是否成功。
            return ExecuteResponse(output=exc.stdout + exc.stderr, exit_code=exc.exit_code)
        except Exception as exc:
            return ExecuteResponse(output=f"Error executing command: {exc}", exit_code=1)

    async def aupload_files(
        self,
        files: list[tuple[str, bytes]],
    ) -> list[FileUploadResponse]:
        sandbox = await self._get_sandbox()

        async def upload(file_path: str, content: bytes) -> FileUploadResponse:
            try:
                await sandbox.files.write(file_path, content)
                return FileUploadResponse(path=file_path)
            except Exception as exc:
                return FileUploadResponse(path=file_path, error=str(exc))

        return list(await asyncio.gather(*(upload(path, content) for path, content in files)))

    async def adownload_files(self, paths: list[str]) -> list[FileDownloadResponse]:
        sandbox = await self._get_sandbox()

        async def download(file_path: str) -> FileDownloadResponse:
            try:
                content = bytes(await sandbox.files.read(file_path, format="bytes"))
                return FileDownloadResponse(path=file_path, content=content)
            except FileNotFoundException:
                return FileDownloadResponse(path=file_path, error="file_not_found")
            except Exception as exc:
                return FileDownloadResponse(path=file_path, error=str(exc))

        return list(await asyncio.gather(*(download(path) for path in paths)))

    async def adelete(self, file_path: str) -> DeleteResult:
        # 基类的 adelete 会调用同步 delete/execute，因此这里保留异步 SDK 适配。
        try:
            sandbox = await self._get_sandbox()
            if not await sandbox.files.exists(file_path):
                return DeleteResult(error=f"Error: File {file_path!r} not found")
            await sandbox.files.remove(file_path)
            return DeleteResult(path=file_path)
        except Exception as exc:
            return DeleteResult(error=f"Error deleting {file_path!r}: {exc}")


class MySandBoxBackend(BaseSandbox):
    """示例：继承 AliyunSandboxBackend 并覆盖部分方法。"""

    async def aexecute(
        self,
        command: str,
        *,
        timeout: int | None = None,
    ) -> ExecuteResponse:
        # 可以在这里添加自定义的命令前处理逻辑，例如记录日志或修改命令。
        print(f"Executing command in MySandBoxBackend: {command}")
        return await super().aexecute(command, timeout=timeout)