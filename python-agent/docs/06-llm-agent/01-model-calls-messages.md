# 模型调用与消息

## 先理解模型，不急着用Agent

模型调用是：准备system/user/assistant消息，发送请求，等待结果，解析文本或结构化内容。Agent是在模型调用外面增加工具选择和循环。

必须学习：

- system、user、assistant、tool角色
- token与上下文窗口
- temperature及确定性边界
- 请求超时和有限重试
- 401、404、429、5xx和网络错误
- 流式与非流式响应

## 客户端生命周期

模型客户端应复用；配置来自环境变量；真实Key只在服务端；日志不记录Authorization Header。

## 练习

使用fake模型先实现`ModelClient`协议，模拟正常、超时、限流和错误格式，为Service写测试。

## 验收

能解释普通模型调用与Agent调用的差异，并保证依赖不可用时请求在规定时间内结束。
