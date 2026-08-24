# 结构化日志、指标与追踪

## 日志字段

推荐记录：event、request_id、run_id、turn_id、conversation_id、stage、tool_name、duration_ms、error_code和retryable。

不记录：API Key、密码、Authorization、完整个人信息和不必要的原始模型输入输出。

## 关键指标

- 请求数和成功率。
- 首字时间。
- 总响应时间。
- 模型和工具耗时。
- 错误码分布。
- 取消率和重试率。
- Token和成本。
- 数据库、Redis连接池状态。

## 追踪

一次用户请求跨HTTP、模型、Tool、MySQL和Redis，需要用统一runId或traceId关联。

## 验收

只看一次失败请求的结构化日志，就能定位失败阶段和依赖，同时看不到敏感配置。
