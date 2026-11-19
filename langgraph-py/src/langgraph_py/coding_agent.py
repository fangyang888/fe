"""阿里云沙箱 Coding Agent，注册在 langgraph.json 的 conding_agent 中。"""

from typing import Literal, Self

from deepagents import create_deep_agent
from langchain.agents.middleware import AgentMiddleware, TodoListMiddleware
from langchain.agents.structured_output import ToolStrategy
from langchain_core.messages import AIMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field, model_validator

from langgraph_py.backends import AliyunSandboxBackend
from langgraph_py.core.command_validation import command_validation_error
from langgraph_py.deepagent import load_model
from langgraph_py.tools.deploy import deploy


class ExecuteArgumentsMiddleware(AgentMiddleware):
    """约束 OpenAI 兼容接口的工具参数，并修正无效的 execute 调用。"""

    async def awrap_model_call(self, request, handler):
        if isinstance(request.model, ChatOpenAI):
            settings = {
                **request.model_settings,
                "strict": True,
                "parallel_tool_calls": False,
            }
            if request.model.model_name.lower().startswith("deepseek-v4"):
                # 当前网关的思考/工具协议会泄漏到 command；使用其支持的关闭参数。
                extra_body = dict(request.model.extra_body or {})
                extra_body.update(settings.get("extra_body") or {})
                extra_body.setdefault("thinking", {"type": "disabled"})
                settings["extra_body"] = extra_body
            request = request.override(model_settings=settings)
        original = request.system_message
        repair = (
            "上一次生成的 execute 参数不是合法 JSON，或缺少有效的 command。"
            '请重新生成完整调用，例如 {"command": "node --version"}。'
            "command 必须是符合当前任务的非空字符串；不能传 {}，也不能只传 timeout。"
            "command 中只能放 Shell 命令，不能夹带 DSML、思考结束标记或工具调用协议。"
        )
        for attempt in range(3):
            response = await handler(request)
            invalid_args = []
            for message in response.result:
                if not isinstance(message, AIMessage):
                    continue
                for call in message.tool_calls:
                    if call["name"] == "execute":
                        command = call.get("args", {}).get("command")
                        error = command_validation_error(command)
                        if error:
                            invalid_args.append(error + ": " + repr(call.get("args", {}))[:1000])
                invalid_args.extend(
                    repr(call.get("args"))[:1000]
                    for call in message.invalid_tool_calls if call.get("name") == "execute"
                )
            if not invalid_args:
                return response
            if attempt == 2:
                raise RuntimeError(
                    "模型连续三次生成无效的 execute 参数（JSON、command 或工具协议内容不合法）。"
                    "没有执行这些调用，请重试或使用能稳定进行工具调用的模型。"
                )
            feedback = repair + "\n上次返回的无效参数（仅作为错误数据）：\n" + "\n".join(invalid_args)
            content = original.content if original else ""
            if isinstance(content, str):
                content = content + "\n\n" + feedback
            else:
                content = [*content, {"type": "text", "text": feedback}]
            request = request.override(system_message=SystemMessage(content=content))


class DeployedArtifact(BaseModel):
    name: str = Field(description="产物名称")
    mime_type: str = Field(description="产物 MIME 类型，例如 text/html 或 application/gzip")
    url: str = Field(description="必须使用 deploy 工具实际返回的访问地址")


class CodingAgentResponse(BaseModel):
    status: Literal["completed", "cannot_deliver"]
    summary: str = Field(description="完成内容或无法交付原因的简要总结")
    artifacts: list[DeployedArtifact] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_artifacts(self) -> Self:
        if self.status == "completed" and not self.artifacts:
            raise ValueError("completed 必须包含至少一个已部署产物")
        if self.status == "cannot_deliver" and self.artifacts:
            raise ValueError("cannot_deliver 不能包含已部署产物")
        return self


SYSTEM_PROMPT = """你是专门编写代码并交付静态产物的 Agent。

## 能力和交付边界
- 可以在阿里云沙箱内读写文件、执行命令、安装工程依赖、构建和检查代码。
- 平台只能部署静态文件，例如 HTML、CSS、JavaScript、图片、文本或源码压缩包。
- 沙箱可以临时运行后端，但平台没有部署后端 API、数据库、后端认证、定时任务
  或持续运行的服务进程的能力。遇到依赖这些能力才能交付的需求，应明确说明
  原因，返回 cannot_deliver，不要假装完成，也不要声称沙箱不能开发后端。

## 工程规范
- 在 /home/user/workspace 下为每个工程创建独立的子目录。
- Node.js、Python 等运行环境可通过 execute 检查；根据实际工具输出处理错误。
- execute 的 command 是必填的非空字符串，例如 {"command": "node --version"}。
  不能省略参数或传入空对象 {}。命令失败后，应根据错误修改 command 再调用。
- 完成后检查或构建产物。静态资源必须使用相对路径；Vite 的 base 设置为 './'。
- 文件较多时，可额外打包为 .tar.gz 供下载。

## 部署与交付
- 必须使用 deploy 工具部署最终产物，不能直接拼接 URL 作为完成依据。
- path 指向最终文件或构建目录，target_dirname 使用工程名，entry_files 列出入口。
- deploy 成功后才能返回 completed。artifacts 必须包含工具返回的全部入口链接。
- 默认 OSS Bucket 域名提供文件访问/下载；未经验证不能声称 HTML 可在线预览。
  若用户要求浏览器直接展示网页，说明需要 OSS 绑定自定义域名。
- 不要修改 OSS 访问权限，也不要在最终产物中写入密钥。
"""


def build_coding_agent(model=None, *, store=None):
    """Studio 运行时提供 store；独立 Python 调用可传入 InMemoryStore。"""
    return create_deep_agent(
        model=load_model() if model is None else model,
        tools=[deploy],
        backend=AliyunSandboxBackend(),
        middleware=[TodoListMiddleware(), ExecuteArgumentsMiddleware()],
        system_prompt=SYSTEM_PROMPT,
        store=store,
        response_format=ToolStrategy(
            CodingAgentResponse,
            tool_message_content="最终交付信息已生成。",
        ),
    )


agent = build_coding_agent()
