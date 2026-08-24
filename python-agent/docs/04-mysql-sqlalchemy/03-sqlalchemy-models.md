# SQLAlchemy模型

## 核心概念

SQLAlchemy Model描述Python类与数据库表的映射。学习`DeclarativeBase`、`Mapped`、`mapped_column`、主键、索引、Enum、JSON和时间字段。

Model不是HTTP响应模型：

- SQLAlchemy Model代表数据库记录。
- Pydantic Model代表边界数据契约。
- Domain对象代表稳定业务概念。

三者可以字段相似，但职责不同。

## 练习

为conversation和message建立模型，对照现有TypeORM实体逐项记录表名、列名、类型、可空性和索引。

## 验收

在没有修改生产表的前提下，模型元数据能准确描述现有结构；不随意依赖自动建表。
