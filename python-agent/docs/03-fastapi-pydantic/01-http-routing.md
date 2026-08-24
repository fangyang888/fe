# HTTP与FastAPI路由

## HTTP基础

理解method、path、query、header、body、status code和content type。

- GET读取资源，通常不产生业务副作用。
- POST提交命令或创建资源。
- 400表示请求语义或格式错误。
- 401未认证，403无权限，404资源不存在。
- 409状态冲突，422字段验证失败。
- 502上游错误，503暂不可用，504上游超时。

## FastAPI路由

使用`APIRouter`拆分模块，使用响应模型约束输出。路由函数只做解析、调用Service和映射响应。

```python
@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", service="Python Agent", environment="development")
```

## 练习

增加`GET /api/agent/version`，返回版本和Python版本，但不返回本机路径和敏感配置。

## 验收

能使用浏览器文档、curl和测试客户端调用接口，并解释每个状态码由哪一层决定。
