# TypeScript到Python映射

学习Python时不要逐字翻译，要理解两边解决的是同一类问题。

| 当前技术 | Python对应方案 | 主要差异 |
| --- | --- | --- |
| `interface`、`type` | 类型注解、Protocol、TypedDict | Python类型默认不在运行时强制执行 |
| Zod | Pydantic | 都能运行时校验并生成Schema |
| class-validator DTO | Pydantic请求模型 | FastAPI自动调用Pydantic |
| NestJS Controller | FastAPI APIRouter | 路由使用普通函数和装饰器 |
| Injectable Service | 普通类、工厂、Depends | 不需要所有类都进入DI容器 |
| TypeORM Entity | SQLAlchemy Declarative Model | Session和事务管理方式不同 |
| TypeORM Repository | SQLAlchemy Repository + AsyncSession | Repository由我们明确设计 |
| Jest | pytest | fixture和参数化是pytest重点 |
| ESLint + Prettier | Ruff | 一套工具完成格式化和大部分检查 |
| TypeScript编译检查 | Pyright | Python仍会运行，类型检查需单独执行 |
| Promise | coroutine、Task | coroutine必须await或创建任务 |
| Promise.all | `asyncio.gather`或TaskGroup | TaskGroup有结构化并发语义 |
| AsyncIterator | AsyncIterator/async generator | Python使用`async for`和`yield` |
| Express Response SSE | StreamingResponse/事件响应 | 常用异步生成器逐条产生事件 |
| ConfigService | pydantic-settings | 从环境变量构建强类型配置 |

## 当前文件迁移目标

- `server/src/agent/agent.dto.ts` → `schemas/chat.py`
- `server/src/agent/agent.intent.ts` → `schemas/intent.py`
- `server/src/agent/agent.tools.ts` → `agent/tools.py`
- `server/src/agent/agent-model.factory.ts` → `agent/model_factory.py`
- `server/src/agent/agent.service.ts` → `services/agent_service.py`
- `server/src/agent/stream/agent.stream-protocol.ts` → `schemas/events.py`
- `server/src/agent/persistence/*` → `db/models.py`与Repository

每迁移一个文件，先写契约测试，再实现Python版本。
