# Agent接口契约迁移

## 必须兼容的输入

```json
{
  "message": "请计算125乘以8",
  "conversationId": "UUID v4",
  "clientMessageId": "UUID v4"
}
```

## 必须兼容的接口

- `POST /api/agent/chat`
- `POST /api/agent/chat/stream`
- `POST /api/agent/intent`
- `GET /api/agent/conversations/{conversationId}/messages`

## 迁移顺序

1. 从当前TypeScript测试中提取请求响应样例。
2. 在Python中写契约测试。
3. 先返回固定模拟数据让测试通过。
4. 后续章节再逐步接入数据库、Redis和模型。

## 关键原则

接口兼容指字段、类型、状态码和事件顺序兼容，不要求内部类名或目录结构相同。

## 验收

现有React无需修改即可在开发代理切换后显示模拟回答；非法请求行为与旧接口一致。
