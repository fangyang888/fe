# 结构化输出

## 目的

自由文本适合展示，不适合直接控制业务分支。意图识别应让模型返回Pydantic结构，再由确定性代码做路由。

计划结构包括：intent、confidence、entities、missingFields和normalizedQuery。

## 安全边界

- Schema合法不等于业务真实。
- 模型不得猜订单号、userId、价格或权限。
- confidence不是安全凭证。
- 低置信度或unknown应追问或走通用路径。
- Schema解析失败应有有限重试或明确错误。

## 练习

迁移当前客服意图Schema；用fake模型覆盖正常商品查询、缺商品名、退款缺订单号、未知意图和非法结构。

## 验收

所有模型输出都经过Pydantic验证，业务代码不直接读取未经验证的原始JSON。
