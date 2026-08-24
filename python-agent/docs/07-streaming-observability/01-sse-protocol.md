# SSE事件协议

## 协议目标

SSE是服务端通过一个HTTP响应持续发送事件。当前事件包含公共字段：version、runId、conversationId、turnId、seq和timestamp。

事件类型：

- run_started
- status
- assistant_delta
- tool_started
- tool_finished
- assistant_final
- run_failed
- run_cancelled
- done

## 不变量

- 同一run的seq严格递增。
- runId和turnId稳定。
- delta只用于页面草稿，数据库保存最终回答。
- assistant_final在数据库成功持久化后发送。
- done是流结束标记，不代表一定成功。

## 练习

使用Pydantic判别联合定义所有事件，并实现事件工厂自动生成公共字段和seq。

## 验收

Python生成的每种事件都能被当前前端解析，非法事件在发送前就被拒绝。
