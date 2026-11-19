"""离线验证：真实执行部署复制命令，沙箱生命周期使用假 SDK。"""

import asyncio
import importlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from langchain_core.tools import ToolException
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage
from langchain.agents.middleware.types import ModelRequest, ModelResponse
from langchain_openai import ChatOpenAI
from e2b.exceptions import SandboxException
from langgraph.store.memory import InMemoryStore
from pydantic import ValidationError

from langgraph_py.core import sandbox as sandbox_module

deploy_module = importlib.import_module("langgraph_py.tools.deploy")


class DeployInputTests(unittest.TestCase):
    def test_rejects_output_or_its_ancestors_as_source(self):
        for value in ("/", "/home", "/home/user", "/home/user/output", "//home/user/output/x"):
            with self.subTest(path=value), self.assertRaises(ValidationError):
                deploy_module.DeployInput(path=value, target_dirname="demo", entry_files=["index.html"])

    def test_rejects_unsafe_targets_and_entry_files(self):
        for target in ("..", "x/y", "x\\y", ""):
            with self.subTest(target=target), self.assertRaises(ValidationError):
                deploy_module.DeployInput(path="/tmp/dist", target_dirname=target, entry_files=["index.html"])
        for entries in (["../secret"], ["/secret"], [""], ["a", "./a"], []):
            with self.subTest(entries=entries), self.assertRaises(ValidationError):
                deploy_module.DeployInput(path="/tmp/dist", target_dirname="demo", entry_files=entries)

    def test_urls_encode_paths_and_have_no_signature(self):
        with patch.object(deploy_module, "PUBLIC_BASE_URL", "https://fy-ag.oss-cn-beijing.aliyuncs.com"):
            self.assertEqual(
                deploy_module._public_url("thread-1", "my app", "页面/a #?.txt"),
                "https://fy-ag.oss-cn-beijing.aliyuncs.com/thread-1/output/my%20app/%E9%A1%B5%E9%9D%A2/a%20%23%3F.txt",
            )

    def test_custom_domain_and_invalid_signed_base(self):
        with patch.object(deploy_module, "PUBLIC_BASE_URL", "https://files.example.com"):
            self.assertEqual(deploy_module._public_url("t", "demo", "index.html"),
                             "https://files.example.com/t/output/demo/index.html")
        with patch.object(deploy_module, "PUBLIC_BASE_URL", "https://files.example.com?Signature=x"):
            with self.assertRaises(ValueError):
                deploy_module._public_url("t", "demo", "index.html")


class DeployTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = TemporaryDirectory(prefix="coding-agent-test-")
        self.root = Path(self.temp.name)
        self.source = self.root / "dist with ' quotes"
        self.source.mkdir()
        (self.source / "index.html").write_text("<h1>Hello</h1>")
        (self.source / "assets").mkdir()
        (self.source / "assets" / "a.txt").write_text("asset")
        self.output = self.root / "output"
        self.sandbox = SimpleNamespace(
            files=SimpleNamespace(exists=AsyncMock(side_effect=lambda p: Path(p).exists())),
            commands=SimpleNamespace(run=AsyncMock(side_effect=self.run_command)),
            kill=AsyncMock(),
        )
        patches = [
            patch.object(deploy_module, "OUTPUT_DIR", str(self.output)),
            patch.object(deploy_module, "get_config", return_value={"configurable": {"thread_id": "test-thread"}}),
            patch.object(deploy_module, "get_runtime", return_value=SimpleNamespace(store=InMemoryStore())),
            patch.object(deploy_module, "get_sandbox", new=AsyncMock(return_value=self.sandbox)),
        ]
        for patcher in patches:
            patcher.start()
            self.addCleanup(patcher.stop)
        self.addCleanup(self.temp.cleanup)

    async def run_command(self, command, **kwargs):
        process = await asyncio.create_subprocess_exec(
            "/bin/sh", "-c", command,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()
        return SimpleNamespace(exit_code=process.returncode, stdout=stdout.decode(), stderr=stderr.decode())

    async def test_directory_deploy_copies_assets_and_replaces_old_files(self):
        destination = self.output / "demo"
        destination.mkdir(parents=True)
        (destination / "old.txt").write_text("old")
        urls = await deploy_module.deploy.coroutine(str(self.source), "demo", ["index.html"])
        self.assertEqual((destination / "index.html").read_text(), "<h1>Hello</h1>")
        self.assertEqual((destination / "assets/a.txt").read_text(), "asset")
        self.assertFalse((destination / "old.txt").exists())
        self.assertEqual(urls, [deploy_module._public_url("test-thread", "demo", "index.html")])
        self.sandbox.kill.assert_awaited_once()

    async def test_single_file_deploy(self):
        urls = await deploy_module.deploy.coroutine(str(self.source / "index.html"), "single", ["index.html"])
        self.assertTrue((self.output / "single/index.html").is_file())
        self.assertEqual(len(urls), 1)

    async def test_missing_entry_preserves_previous_deploy(self):
        destination = self.output / "demo"
        destination.mkdir(parents=True)
        (destination / "index.html").write_text("previous")
        with self.assertRaises(ToolException):
            await deploy_module.deploy.coroutine(str(self.source), "demo", ["missing.html"])
        self.assertEqual((destination / "index.html").read_text(), "previous")
        self.assertEqual(sorted(p.name for p in self.output.iterdir()), ["demo"])
        self.sandbox.kill.assert_not_awaited()

    async def test_missing_source_does_not_execute_or_close_sandbox(self):
        with self.assertRaises(ToolException):
            await deploy_module.deploy.coroutine(str(self.root / "missing"), "demo", ["index.html"])
        self.sandbox.commands.run.assert_not_awaited()
        self.sandbox.kill.assert_not_awaited()


class SandboxTests(unittest.IsolatedAsyncioTestCase):
    async def test_mount_paths_use_thread_id(self):
        metadata = sandbox_module._metadata("thread-1")
        mounts = json.loads(metadata["fc.sandbox.storage.oss"])["mountPoints"]
        self.assertEqual([m["bucketPath"] for m in mounts],
                         ["/thread-1/workspace", "/thread-1/output"])

    async def test_create_reconnect_and_recreate_expired_sandbox(self):
        store = InMemoryStore()
        first = SimpleNamespace(sandbox_id="first", set_timeout=AsyncMock(
            side_effect=SandboxException("501: set sandbox timeout is not supported yet", status_code=501)
        ))
        second = SimpleNamespace(sandbox_id="second", set_timeout=AsyncMock())
        sdk = SimpleNamespace(create=AsyncMock(side_effect=[first, second]), connect=AsyncMock(return_value=first))
        with patch.object(sandbox_module, "AsyncSandbox", sdk):
            self.assertIs(await sandbox_module.get_sandbox(key="thread-1", store=store), first)
            self.assertIs(await sandbox_module.get_sandbox(key="thread-1", store=store), first)
            sdk.connect.side_effect = RuntimeError("expired")
            self.assertIs(await sandbox_module.get_sandbox(key="thread-1", store=store), second)
            saved = await store.aget(sandbox_module._STORE_NAMESPACE, "thread-1")
            self.assertEqual(saved.value["sandbox_id"], "second")
            self.assertEqual(sdk.create.await_count, 2)
            first.set_timeout.assert_not_awaited()
            second.set_timeout.assert_not_awaited()

    async def test_invalid_thread_id(self):
        for key in ("", "..", "a/b", "a\\b"):
            with self.subTest(key=key), self.assertRaises(ValueError):
                await sandbox_module.get_sandbox(key=key, store=InMemoryStore())


class ToolCallingModel(FakeMessagesListChatModel):
    def bind_tools(self, tools, **kwargs):
        return self


class MiddlewareTests(unittest.IsolatedAsyncioTestCase):
    async def test_deepseek_v4_disables_thinking_with_supported_parameter(self):
        from langgraph_py.coding_agent import ExecuteArgumentsMiddleware

        request = ModelRequest(
            model=ChatOpenAI(model="deepseek-v4.1-flash", api_key="offline-test", extra_body={"custom": "preserved"}),
            messages=[], tools=[],
        )
        response = ModelResponse(result=[AIMessage(content="ready")])
        handler = AsyncMock(return_value=response)
        await ExecuteArgumentsMiddleware().awrap_model_call(request, handler)
        self.assertEqual(handler.await_args.args[0].model_settings["extra_body"],
                         {"custom": "preserved", "thinking": {"type": "disabled"}})

    async def test_protocol_markers_require_regeneration(self):
        from langgraph_py.coding_agent import ExecuteArgumentsMiddleware

        request = ModelRequest(
            model=ChatOpenAI(model="offline-test", api_key="offline-test"), messages=[], tools=[],
        )
        bad = ModelResponse(result=[AIMessage(content="", tool_calls=[{
            "name": "execute", "id": "bad", "args": {"command": 'echo hi</parameter>\n<｜｜DSML｜｜ calls>'},
        }])])
        good = ModelResponse(result=[AIMessage(content="", tool_calls=[{
            "name": "execute", "id": "good", "args": {"command": "echo hi"},
        }])])
        handler = AsyncMock(side_effect=[bad, good])
        self.assertIs(await ExecuteArgumentsMiddleware().awrap_model_call(request, handler), good)
        self.assertEqual(handler.await_count, 2)
        self.assertIn("工具或思考协议标记", handler.await_args.args[0].system_message.content)

    async def test_openai_tool_binding_uses_strict_schema_and_single_call(self):
        from langgraph_py.coding_agent import ExecuteArgumentsMiddleware

        request = ModelRequest(
            model=ChatOpenAI(model="offline-test", api_key="offline-test"),
            messages=[], tools=[], model_settings={"temperature": 0},
        )
        response = ModelResponse(result=[AIMessage(content="ready")])
        handler = AsyncMock(return_value=response)
        self.assertIs(await ExecuteArgumentsMiddleware().awrap_model_call(request, handler), response)
        settings = handler.await_args.args[0].model_settings
        self.assertEqual(settings, {"temperature": 0, "strict": True, "parallel_tool_calls": False})

    async def test_malformed_json_is_given_back_to_model_for_correction(self):
        from langgraph_py.coding_agent import ExecuteArgumentsMiddleware

        malformed = '{"command">cd: "echo hi"}'
        request = ModelRequest(
            model=ChatOpenAI(model="offline-test", api_key="offline-test"), messages=[], tools=[],
        )
        corrected = ModelResponse(result=[AIMessage(
            content="", tool_calls=[{"name": "execute", "args": {"command": "node --version"}, "id": "fixed"}],
        )])
        handler = AsyncMock(side_effect=[
            ModelResponse(result=[AIMessage(content="", invalid_tool_calls=[{
                "name": "execute", "args": malformed, "id": "bad", "error": "Invalid JSON",
            }])]),
            corrected,
        ])
        self.assertIs(await ExecuteArgumentsMiddleware().awrap_model_call(request, handler), corrected)
        self.assertEqual(handler.await_count, 2)
        self.assertIn(malformed, handler.await_args.args[0].system_message.content)


class AgentTests(unittest.IsolatedAsyncioTestCase):
    async def test_write_execute_deploy_and_structured_response(self):
        await self._run_workflow()

    async def test_missing_command_is_regenerated_before_tool_execution(self):
        await self._run_workflow(invalid_execute_calls=2)

    async def _run_workflow(self, invalid_execute_calls=0):
        from langgraph_py.coding_agent import build_coding_agent

        calls = [
            ("write_file", {"file_path": "/home/user/workspace/demo/index.html", "content": "<h1>Hello</h1>"}),
            ("execute", {"command": "node --version"}),
            ("deploy", {"path": "/home/user/workspace/demo", "target_dirname": "demo", "entry_files": ["index.html"]}),
            ("CodingAgentResponse", {
                "status": "completed", "summary": "已交付 HTML 文件",
                "artifacts": [{"name": "HTML", "mime_type": "text/html", "url": deploy_module._public_url("integration", "demo", "index.html")}],
            }),
        ]
        responses = [
            AIMessage(content="", tool_calls=[{"id": str(i), "name": name, "args": args}])
            for i, (name, args) in enumerate(calls)
        ]
        responses[1:1] = [
            AIMessage(content="", tool_calls=[{"id": f"invalid-{i}", "name": "execute", "args": {}}])
            for i in range(invalid_execute_calls)
        ]
        model = ToolCallingModel(responses=responses)
        sandbox = SimpleNamespace(
            sandbox_id="fake", set_timeout=AsyncMock(
                side_effect=SandboxException("501: set sandbox timeout is not supported yet", status_code=501)
            ), kill=AsyncMock(),
            files=SimpleNamespace(write=AsyncMock(), exists=AsyncMock(return_value=True)),
            commands=SimpleNamespace(run=AsyncMock(return_value=SimpleNamespace(exit_code=0, stdout="ok", stderr=""))),
        )
        sdk = SimpleNamespace(create=AsyncMock(return_value=sandbox), connect=AsyncMock(return_value=sandbox))
        with patch.object(sandbox_module, "AsyncSandbox", sdk):
            agent = build_coding_agent(model, store=InMemoryStore())
            result = await agent.ainvoke(
                {"messages": [{"role": "user", "content": "创建并部署 HTML"}]},
                config={"configurable": {"thread_id": "integration"}},
            )
        self.assertEqual(result["structured_response"].status, "completed")
        sandbox.files.write.assert_awaited_once_with("/home/user/workspace/demo/index.html", b"<h1>Hello</h1>")
        self.assertEqual(
            sum(call.args[0] == "node --version" for call in sandbox.commands.run.await_args_list), 1,
        )
        sandbox.kill.assert_awaited_once()
        sandbox.set_timeout.assert_not_awaited()
        self.assertEqual([m.name for m in result["messages"] if m.type == "tool"],
                         ["write_file", "execute", "deploy", "CodingAgentResponse"])

    async def test_repeated_missing_command_stops_without_executing(self):
        from langgraph_py.coding_agent import build_coding_agent

        model = ToolCallingModel(responses=[
            AIMessage(content="", tool_calls=[{"id": f"invalid-{i}", "name": "execute", "args": {}}])
            for i in range(4)
        ])
        with patch.object(sandbox_module, "AsyncSandbox") as sdk:
            agent = build_coding_agent(model, store=InMemoryStore())
            with self.assertRaisesRegex(RuntimeError, "连续三次"):
                await agent.ainvoke(
                    {"messages": [{"role": "user", "content": "检查 Node.js 版本"}]},
                    config={"configurable": {"thread_id": "invalid-args"}},
                )
        self.assertEqual(model.i, 3)
        sdk.create.assert_not_called()
        sdk.connect.assert_not_called()


if __name__ == "__main__":
    unittest.main()
