# Python Agent 脚手架使用与目录结构

这份文档介绍如何启动当前脚手架、如何进行日常开发，以及每个目录和文件分别负责什么。

## 一、脚手架是什么

脚手架是一个已经搭好基础结构的项目起点。它提前准备了：

- Python版本约束；
- 依赖管理配置；
- FastAPI应用入口；
- API路由分层；
- Pydantic配置和响应模型；
- pytest测试目录；
- Ruff格式化和代码检查；
- Pyright类型检查；
- 分章节学习文档。

当前脚手架故意保持简单，只实现健康检查。数据库、Redis和Agent会在学完对应章节后逐步加入。

## 二、第一次使用

### 1. 让当前终端识别uv

如果刚安装完uv，执行：

```bash
source "$HOME/.local/bin/env"
```

验证安装：

```bash
uv --version
```

只要能显示版本号，就说明uv已经可以使用。

### 2. 进入Python项目

```bash
cd /Users/yang/fe/fe/python-agent
```

后续命令原则上都在这个目录中执行。

确认位置：

```bash
pwd
```

应该输出：

```text
/Users/yang/fe/fe/python-agent
```

### 3. 同步项目依赖

```bash
uv sync
```

这条命令会：

1. 读取`pyproject.toml`；
2. 确认项目需要的Python版本；
3. 创建`.venv`虚拟环境；
4. 安装FastAPI、pytest、Ruff和Pyright等依赖；
5. 创建或更新`uv.lock`锁文件。

`.venv`是uv管理的项目环境，不需要提交到Git，也不应该手工修改里面的文件。

### 4. 创建本地配置

```bash
cp .env.example .env
```

`.env.example`是可以提交的配置模板；`.env`用于保存本机配置和Secret，不会提交到Git。

当前健康接口不依赖MySQL、Redis和模型Key，所以暂时不需要填写这些配置。

禁止把真实密码和API Key写进：

- Python源码；
- 测试代码；
- Markdown文档；
- `.env.example`；
- Git提交。

## 三、启动和停止脚手架

### 启动开发服务

```bash
uv run fastapi dev src/python_agent/main.py
```

`uv run`表示在当前项目的`.venv`环境里执行命令。不要直接使用系统环境中的`python`或`fastapi`。

正常启动后可以访问：

- Swagger API文档：`http://127.0.0.1:8000/docs`
- 健康检查：`http://127.0.0.1:8000/api/agent/health`

健康检查预期返回：

```json
{
  "status": "ok",
  "service": "Python Agent",
  "environment": "development"
}
```

开发模式会监听源码变化。保存Python文件后，服务会自动重新加载。

### 停止开发服务

回到正在运行服务的终端，按：

```text
Control + C
```

不要通过关闭整个电脑或强制结束所有Python进程来停止单个开发服务。

## 四、测试和代码质量检查

### 运行全部测试

```bash
uv run pytest
```

显示`passed`代表测试通过。测试失败时先阅读第一段错误和最后的断言差异，不要只看最后一行。

### 自动格式化

```bash
uv run ruff format .
```

### 检查格式但不修改

```bash
uv run ruff format --check .
```

### 检查代码问题

```bash
uv run ruff check .
```

部分安全的机械问题可以自动修复：

```bash
uv run ruff check --fix .
```

执行自动修复后仍然需要查看改动并重新运行测试。

### 静态类型检查

```bash
uv run pyright
```

Pyright通过不代表业务逻辑正确；pytest通过也不代表所有类型都正确。因此两个检查都必须保留。

### 每次学习或提交前的完整顺序

```bash
uv run ruff format .
uv run ruff check .
uv run pyright
uv run pytest
```

## 五、当前目录结构

```text
python-agent/
├── .env.example
├── .gitignore
├── .python-version
├── README.md
├── pyproject.toml
├── uv.lock                         uv sync后生成
├── .venv/                          uv sync后生成，不提交Git
├── docs/
│   ├── README.md                   学习资料总入口
│   ├── 00-overview/                路线、进度和脚手架说明
│   ├── 01-python-foundations/      Python核心基础
│   ├── 02-python-engineering/      工程化和测试
│   ├── 03-fastapi-pydantic/        Web API和数据校验
│   ├── 04-mysql-sqlalchemy/        MySQL与ORM
│   ├── 05-redis-state/             Redis和短期状态
│   ├── 06-llm-agent/               模型、Tool和Agent
│   ├── 07-streaming-observability/ SSE和可观测性
│   └── 08-migration-deployment/    迁移、灰度和部署
├── src/
│   └── python_agent/
│       ├── __init__.py
│       ├── main.py
│       ├── api/
│       │   ├── __init__.py
│       │   ├── router.py
│       │   └── routes/
│       │       ├── __init__.py
│       │       └── health.py
│       ├── core/
│       │   ├── __init__.py
│       │   └── config.py
│       └── schemas/
│           ├── __init__.py
│           └── health.py
└── tests/
    ├── __init__.py
    └── test_health.py
```

## 六、根目录文件说明

### `.python-version`

记录这个项目使用的Python主版本。uv进入项目后会读取它，减少不同开发者使用不同Python版本的问题。

### `pyproject.toml`

项目最重要的配置文件，主要保存：

- 项目名称和版本；
- Python版本范围；
- 正式依赖；
- 开发和测试依赖；
- Ruff规则；
- Pyright规则；
- pytest配置；
- Python包构建配置。

新增依赖优先使用`uv add`，不要直接手工向虚拟环境安装后却不更新项目配置。

### `uv.lock`

第一次`uv sync`后生成，记录实际解析出的精确依赖版本。它应该提交到Git，让本地、CI和生产安装相同版本。

### `.env.example`与`.env`

`.env.example`是字段说明；`.env`是本机真实值。代码通过`pydantic-settings`读取环境变量。

### `.gitignore`

告诉Git忽略`.env`、`.venv`、缓存、覆盖率文件和构建产物。

## 七、源码目录说明

### `src/python_agent/main.py`

FastAPI应用入口。`create_app()`负责创建应用并安装总路由。

保留应用工厂的原因：

- 测试可以创建干净应用；
- 启动装配集中管理；
- 后续方便加入生命周期和中间件；
- 避免业务模块到处创建FastAPI实例。

### `api/router.py`

统一收集各个路由模块，并为Agent接口设置`/api/agent`前缀。

以后新增聊天接口时，应建立新的路由文件，再由`router.py`引入，而不是把所有接口都写进`main.py`。

### `api/routes/health.py`

健康检查HTTP入口，只负责：

1. 接收HTTP请求；
2. 获取需要的依赖；
3. 构建响应模型；
4. 返回结果。

健康接口不能返回API Key、密码和完整数据库地址。

### `core/config.py`

定义强类型配置和配置读取方式。配置对象由`get_settings()`复用，避免每次请求重复读取`.env`。

以后日志、中间件公共配置和跨模块错误类型也会放在`core/`。

### `schemas/health.py`

定义健康接口的Pydantic响应模型。Schema描述数据结构和边界，不负责复杂业务流程。

以后会增加：

- `chat.py`：聊天请求和响应；
- `intent.py`：客服意图和实体；
- `events.py`：SSE事件协议。

### `tests/test_health.py`

通过FastAPI TestClient调用真实路由，验证HTTP状态和JSON响应。

测试文件使用`test_`开头，测试函数也使用`test_`开头，pytest才能自动发现。

## 八、未来逐步增加的目录

下面是最终规划，不需要现在一次性创建：

```text
src/python_agent/
├── agent/
│   ├── model_factory.py           模型客户端和配置
│   ├── tools.py                   LangChain工具
│   └── workflow.py                Agent或LangGraph装配
├── domain/
│   ├── conversation.py            会话领域规则
│   └── errors.py                  领域错误
├── services/
│   ├── agent_service.py           Agent总调度
│   ├── intent_service.py          结构化意图识别
│   ├── product_customer.py        商品客服确定性业务
│   └── stream_service.py          流式执行编排
├── repositories/
│   ├── conversation.py            会话数据访问接口
│   ├── message.py                 消息数据访问接口
│   └── product.py                 商品数据访问接口
├── db/
│   ├── session.py                 SQLAlchemy引擎和Session
│   └── models.py                  数据库映射模型
├── redis/
│   ├── client.py                  Redis连接
│   └── conversation_state.py      短期业务状态
└── schemas/
    ├── chat.py
    ├── intent.py
    └── events.py
```

这些目录会随着课程逐章创建。提前创建大量空文件只会增加理解成本。

## 九、如何新增一个简单接口

以版本接口为例，推荐顺序是：

1. 在`schemas/`定义响应模型；
2. 在`api/routes/`创建路由；
3. 在`api/router.py`注册路由；
4. 在`tests/`写接口测试；
5. 运行Ruff、Pyright和pytest；
6. 浏览器打开`/docs`人工确认。

路由里不要直接写SQL、读取Redis或创建模型客户端。复杂逻辑应逐步下沉到Service和Repository。

## 十、如何管理依赖

增加正式运行依赖：

```bash
uv add sqlalchemy
```

增加只用于开发和测试的依赖：

```bash
uv add --dev pytest-cov
```

删除依赖：

```bash
uv remove sqlalchemy
```

查看依赖树：

```bash
uv tree
```

每次变更依赖后，需要一起检查`pyproject.toml`和`uv.lock`的改动。

## 十一、常见问题

### `zsh: command not found: uv`

当前终端还没有加载uv路径：

```bash
source "$HOME/.local/bin/env"
```

然后重新执行`uv --version`。

### `ModuleNotFoundError`

先确认在项目根目录，再执行：

```bash
uv sync
uv run pytest
```

不要通过全局`pip install`临时掩盖项目依赖缺失。

### 8000端口被占用

开发时可以临时换端口：

```bash
uv run fastapi dev src/python_agent/main.py --port 8001
```

然后访问`http://127.0.0.1:8001/docs`。

### 修改代码后没有生效

确认运行的是`fastapi dev`，终端没有报导入或语法错误，并且修改的是`python-agent/src/python_agent/`下的文件。

### `.env`修改后没有生效

确认命令从`python-agent`根目录运行，然后停止并重新启动服务。配置对象会在进程中缓存。

## 十二、推荐的日常学习流程

```text
阅读一个知识点Markdown
        ↓
亲手输入最小示例
        ↓
独立完成练习
        ↓
补正常、边界、异常测试
        ↓
运行Ruff、Pyright、pytest
        ↓
用自己的话写学习记录
        ↓
满足验收标准后更新进度表
```

遇到错误时保留完整报错，先判断它属于：命令路径、依赖安装、Python语法、类型检查、测试断言、HTTP、数据库还是外部服务问题。
