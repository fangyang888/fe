# HTTPX接口测试

## 测试内容

- 正确method和path。
- 请求验证。
- HTTP状态码。
- 响应JSON结构。
- 响应Header。
- 依赖异常映射。
- 不泄露敏感数据。

简单同步测试可使用FastAPI TestClient；异步数据库或流式接口使用HTTPX AsyncClient。

## 练习

为健康接口补：正常响应、测试环境覆盖、错误method返回405、响应不存在敏感字段。

## 验收

测试不依赖端口、不需要手工启动服务，并能在任意顺序下独立运行。
