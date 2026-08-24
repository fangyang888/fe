# 配置、日志和错误分层

## 配置

使用`pydantic-settings`从环境变量读取配置。`.env.example`只放字段名和安全示例，`.env`不提交。

配置按环境区分development、test、production，但代码主体不因环境复制多份。

## 日志

生产日志使用结构化字段：`event`、`run_id`、`conversation_id`、耗时、结果状态。禁止记录API Key、密码、完整订单隐私和不必要的完整对话。

## 错误分层

- Validation error：输入不合法，通常400或422。
- Domain error：业务规则不允许，通常409或明确业务码。
- Dependency error：数据库、Redis、模型不可用，通常502或503。
- Timeout：依赖超时，通常504。
- Unexpected error：程序缺陷，外部返回通用信息，内部保留堆栈。

## 练习

设计`AgentError`基础异常及`ModelUnavailableError`、`ToolInputError`，但不要让领域层直接依赖FastAPI的`HTTPException`。

## 验收

能够说明“在哪里捕获、在哪里记录、在哪里转换HTTP响应”，并保证用户看不到内部密钥和堆栈。
