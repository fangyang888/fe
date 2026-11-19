# Coding Agent

`langgraph.json` 中的 `conding_agent` 指向 `langgraph_py.coding_agent:agent`。
在工程根目录执行 `uv run langgraph dev`，在 Studio 选择该图，输入例如：

> 创建一个带按钮交互的计数器页面，检查后部署，并提供 HTML 和源码压缩包链接。

模型沿用现有 `.env` 的 `OPENAI_*` 配置，也支持 `DEEPAGENT_MODEL`。
沙箱沿用 `SANDBOX_API_KEY`、`SANDBOX_BASE_URL`、`ALI_YUN_UID`；
挂载使用 `OSS_BUCKET_NAME`、`OSS_ENDPOINT` 和 `OSS_ROLE_ARN`。
依赖已包含在工程中，不需要新增依赖。

默认访问域名：`https://fy-ag.oss-cn-beijing.aliyuncs.com`。
可在 `.env` 中通过 `OSS_PUBLIC_BASE_URL` 覆盖，例如设置为已绑定 OSS 的自定义域名。
该配置只改变返回链接的前缀，不会自动绑定域名或修改云端权限。

每个会话通过 `configurable.thread_id` 隔离：

| 沙箱目录 | OSS 对象路径 |
| --- | --- |
| `/home/user/workspace` | `/{thread_id}/workspace/` |
| `/home/user/output` | `/{thread_id}/output/` |

`deploy` 将最终文件或构建目录复制到 `/home/user/output/{工程名}/`，
检查入口文件后返回不带签名的 URL，例如：
`https://fy-ag.oss-cn-beijing.aliyuncs.com/{thread_id}/output/my-app/index.html`。
部署成功后关闭沙箱，后续调用可重新创建沙箱并挂载原会话的 OSS 文件。

无签名链接需要对应产物具备匿名读取权限。建议只公开最终产物的 `output` 路径；
如果 Bucket 设置为公共读，继承权限的 `workspace` 源码也会公开。
默认 Bucket 域名访问 HTML 会触发下载，网页预览需要绑定自定义域名。

结果在 `structured_response` 中，包含 `status`、`summary`、`artifacts`。
仅支持异步执行；Studio/API 已支持。Python 独立调用示例：

```python
from langgraph.store.memory import InMemoryStore
from langgraph_py.coding_agent import build_coding_agent

agent = build_coding_agent(store=InMemoryStore())
result = await agent.ainvoke(
    {"messages": [{"role": "user", "content": "创建并部署一个计数器 HTML 页面"}]},
    config={"configurable": {"thread_id": "counter-demo"}},
)
print(result["structured_response"])
```

离线检查：`uv run python -m unittest discover -s tests -p 'test_coding_agent.py' -v`。
离线测试使用假模型和沙箱 SDK，不请求模型或创建云端沙箱。
