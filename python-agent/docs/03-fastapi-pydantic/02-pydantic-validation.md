# Pydantic模型与验证

## 作用

Python类型注解主要服务静态检查；Pydantic负责在运行时把不可信数据验证成可信对象。

重点学习：

- `BaseModel`
- `Field`长度和数值范围
- UUID、日期、Enum和Literal
- 嵌套模型
- `field_validator`与`model_validator`
- 严格模式
- 判别联合类型
- `model_validate`、`model_dump`

## 对应当前项目

- class-validator `AgentChatDto` → Pydantic `AgentChatRequest`
- Zod `CustomerIntentSchema` → Pydantic `CustomerIntent`
- Zod SSE union → Pydantic判别联合

## 练习

创建聊天请求模型：message先去空格，长度1～8000；conversationId和clientMessageId必须是UUID v4；多余字段拒绝。

## 验收

为缺字段、空白消息、超长消息、错误UUID和多余字段分别写验证测试。
