"""使用本地临时文件和真实命令，验证 BaseSandbox 的文件操作适配。"""

import asyncio
import importlib
import os
from pathlib import Path
import shutil
import sys
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from deepagents.backends.sandbox import BaseSandbox
from e2b import CommandExitException
from e2b.exceptions import FileNotFoundException

backend_module = importlib.import_module("langgraph_py.backends.aliyun_sandbox_backend")


class BackendTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = TemporaryDirectory(prefix="aliyun-base-sandbox-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.sandbox = SimpleNamespace(
            commands=SimpleNamespace(run=AsyncMock(side_effect=self.run_command)),
            files=SimpleNamespace(
                write=AsyncMock(side_effect=self.write_file),
                read=AsyncMock(side_effect=self.read_file),
                exists=AsyncMock(side_effect=lambda path: Path(path).exists()),
                remove=AsyncMock(side_effect=self.remove_file),
            ),
        )
        self.backend = backend_module.AliyunSandboxBackend()
        for patcher in (
            patch.object(self.backend, "_get_sandbox", new=AsyncMock(return_value=self.sandbox)),
            patch.object(backend_module, "WORKSPACE_DIR", str(self.root)),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

    async def write_file(self, path, content):
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content if isinstance(content, bytes) else content.encode())

    async def read_file(self, path, *, format):
        try:
            return Path(path).read_bytes()
        except FileNotFoundError as exc:
            raise FileNotFoundException(str(exc)) from exc

    async def remove_file(self, path):
        path = Path(path)
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink()

    async def run_command(self, command, *, cwd, timeout):
        env = dict(os.environ)
        env["PATH"] = str(Path(sys.executable).parent) + os.pathsep + env.get("PATH", "")
        process = await asyncio.create_subprocess_exec(
            "/bin/bash", "-c", command, cwd=cwd, env=env,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()
        result = dict(stdout=stdout.decode(), stderr=stderr.decode(), exit_code=process.returncode, error=None)
        if process.returncode:
            raise CommandExitException(**result)
        return SimpleNamespace(**result)

    async def test_inherited_file_operations(self):
        self.assertIsInstance(self.backend, BaseSandbox)
        path = str(self.root / "nested" / "你好.txt")
        self.assertIsNone((await self.backend.awrite(path, "first\nsecond\nthird")).error)
        page = await self.backend.aread(path, offset=1, limit=1)
        self.assertIsNone(page.error)
        self.assertEqual(page.file_data["content"].splitlines(), ["second"])
        edited = await self.backend.aedit(path, "second", "updated")
        self.assertIsNone(edited.error)
        self.assertEqual(edited.occurrences, 1)
        listing = await self.backend.als(str(self.root / "nested"))
        self.assertIsNone(listing.error)
        self.assertIn(path, [entry["path"] for entry in listing.entries])
        matches = await self.backend.agrep("updated", path=str(self.root), glob="**/*.txt")
        self.assertIsNone(matches.error)
        self.assertEqual([(m["path"], m["line"]) for m in matches.matches], [(path, 2)])
        files = await self.backend.aglob("**/*.txt", path=str(self.root))
        self.assertIsNone(files.error)
        self.assertIn(path, [entry["path"] for entry in files.matches])

    async def test_binary_transfer_and_missing_download(self):
        path = str(self.root / "assets" / "image.bin")
        content = b"\x89PNG\x00\xff"
        self.assertIsNone((await self.backend.aupload_files([(path, content)]))[0].error)
        downloaded = await self.backend.adownload_files([path, str(self.root / "missing")])
        self.assertEqual(downloaded[0].content, content)
        self.assertEqual(downloaded[1].error, "file_not_found")
        read = await self.backend.aread(path)
        self.assertIsNone(read.error)
        self.assertEqual(read.file_data["encoding"], "base64")

    async def test_async_delete(self):
        path = str(self.root / "file.txt")
        await self.backend.awrite(path, "content")
        self.assertIsNone((await self.backend.adelete(path)).error)
        self.assertFalse(Path(path).exists())
        self.assertIsNotNone((await self.backend.adelete(path)).error)

    async def test_nonzero_command_preserves_output_and_exit_code(self):
        result = await self.backend.aexecute("printf output; printf error >&2; exit 7", timeout=15)
        self.assertEqual(result.exit_code, 7)
        self.assertEqual(result.output, "outputerror")
        self.assertEqual(self.sandbox.commands.run.await_args.kwargs["timeout"], 15)

    async def test_protocol_leak_is_rejected_before_contacting_sandbox(self):
        result = await self.backend.aexecute('echo hi</parameter>\n<｜｜DSML｜｜ calls>')
        self.assertEqual(result.exit_code, 2)
        self.assertIn("命令未执行", result.output)
        self.backend._get_sandbox.assert_not_awaited()
        self.sandbox.commands.run.assert_not_awaited()

    async def test_ordinary_xml_content_remains_valid(self):
        result = await self.backend.aexecute("printf '%s' '<parameter>value</parameter>'")
        self.assertEqual(result.exit_code, 0)
        self.assertEqual(result.output, "<parameter>value</parameter>")


if __name__ == "__main__":
    unittest.main()
