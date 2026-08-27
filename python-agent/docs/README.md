# Python Agent 学习中心

这里是整个学习项目的总入口。课程按依赖关系排列，请顺序学习，不建议跳章。

第一次运行项目前，请先阅读：[脚手架使用与目录结构](./00-overview/05-scaffold-usage-and-structure.md)。

## 使用方法

每学习一个知识点，都完成下面五步：

1. 阅读对应 Markdown，并亲手运行示例。
2. 不看答案，独立完成练习。
3. 给练习补正常、边界和异常测试。
4. 用自己的话回答文件末尾的自测题。
5. 满足验收标准后，在[总进度表](./00-overview/02-progress-checklist.md)打勾。

建议每天 1～2 小时，每周学习 6 天：四天学新知识，一天综合练习，一天复盘。

## 章节目录

| 章节                                            | 主题                          | 学完后的项目成果                       |
| ----------------------------------------------- | ----------------------------- | -------------------------------------- |
| [第0章](./00-overview/README.md)                | 路线、规则和进度              | 知道学什么、为什么学                   |
| [第1章](./01-python-foundations/README.md)      | Python核心语法                | 独立编写三个纯Python工具               |
| [第2章](./02-python-engineering/README.md)      | 工程化和测试                  | 获得可维护、可测试的项目               |
| [第3章](./03-fastapi-pydantic/README.md)        | FastAPI和Pydantic             | 复刻HTTP DTO与协议                     |
| [第4章](./04-mysql-sqlalchemy/README.md)        | MySQL、PostgreSQL和SQLAlchemy | 保存和查询会话历史，掌握两种数据库差异 |
| [第5章](./05-redis-state/README.md)             | Redis与短期状态               | 实现TTL、幂等和Checkpoint              |
| [第6章](./06-llm-agent/README.md)               | 模型、Tool和Agent             | 迁移核心客服Agent                      |
| [第7章](./07-streaming-observability/README.md) | SSE和可观测性                 | 兼容现有前端流式协议                   |
| [第8章](./08-migration-deployment/README.md)    | 双轨迁移和部署                | 灰度切换到Python Agent                 |

## 贯穿全程的原则

- 先理解Python，再迁移TypeScript。
- 生产数据只使用MySQL，Redis不代替长期数据库。
- 模型输出、HTTP输入、Redis数据和第三方数据都不可信，进入业务前必须校验。
- Tool先从只读操作开始；退款、取消订单等写操作必须有权限和人工确认。
- 每次只改一个小功能，始终保持旧版可运行、可回退。
- 不追求框架数量，只掌握一套主流栈并理解底层原理。

## 固定技术主线

Python 3.14 → uv → Ruff/Pyright/pytest → FastAPI/Pydantic → MySQL（项目主线）
→ PostgreSQL（并行进阶）→ SQLAlchemy/Alembic → Redis → LangChain
→ 必要时使用LangGraph → Docker/Nginx/GitHub Actions。
