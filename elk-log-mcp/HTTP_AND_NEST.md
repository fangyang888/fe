# HTTP MCP → Nest Agent

## 现在的结构

```text
调用方携带项目登录 JWT
  → POST /api/agent/elk/chat
  → JwtAuthGuard + 唯一操作者校验
  → ElkAgentService（现有本地 tools + ELK tools）
  → ElkMcpClientService（HTTP URL + 服务端令牌）
  → http://127.0.0.1:3101/mcp
  → MCP 进程持有的临时 Chromium → Kibana
```

MCP HTTP 使用 Streamable HTTP，不是旧式单独 `/sse` + `/messages` 接口，也不是普通 REST 查询接口。
`/mcp` 是 MCP 协议地址；`/api/agent/elk/chat` 是 Nest 的自然语言问答接口；Kibana 地址是被浏览器访问的日志平台。三者不要混用。

当前专用问答接口返回 JSON，不是 SSE；FE 聊天页已增加“ELK 日志助手”模式，登录项目账号后会调用该 JSON 接口，普通模式仍走原来的公开接口。

## 1. 启动 HTTP MCP

在终端进入目录，使用 Node 22.15.0：

```bash
cd /Users/yang/fe/fe/elk-log-mcp
nvm use
pnpm install
pnpm exec playwright install chromium
cp -n .env.example .env
```

生成一个随机服务令牌，将结果自行填入 `.env` 的 `ELK_MCP_TOKEN`。不要把生成值发到聊天或提交 Git：

```bash
node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
```

配置项：

```dotenv
# 填入上一步随机生成的值，不是 Kibana 密码或 Cookie
ELK_MCP_TOKEN=
ELK_MCP_PORT=3101
# 可选；默认 ./browser-profile/kibana，保存独立 Kibana 登录状态
ELK_MCP_PROFILE_DIR=./browser-profile/kibana
```

然后运行：

```bash
pnpm run start:http
```

保持这个进程运行。在同目录另开终端，用 Node 22 运行：

```bash
pnpm run check:http
```

应显示四个工具和浏览器状态 `not_open`。自检不打开浏览器、不读取业务日志。
`pnpm start` 仍是原来的 stdio 入口，不会监听 HTTP；HTTP 模式必须使用 `start:http`。

## 2. 配置 Nest

在现有 `server/.env` 中自行增加以下配置，不要覆盖原有数据库、模型等配置：

```dotenv
ELK_MCP_ENABLED=true
ELK_MCP_URL=http://127.0.0.1:3101/mcp
# 与 MCP 服务 .env 中的令牌相同，只存在后端
ELK_MCP_TOKEN=
# 项目已登录用户的 userId，填入本次 Kibana 登录者对应的唯一账号 ID
ELK_MCP_OPERATOR_USER_ID=
# 可选：用户未提供 host 时优先使用；必须同时出现在白名单中
ELK_MCP_DEFAULT_HOST=
# 精确匹配，逗号分隔；业务查询前加入你有权访问的真实域名
ELK_MCP_ALLOWED_HOSTS=elk-mcp-check.invalid,elk-mcp-repeat.invalid
```

另外必须配置：

- 原有模型配置 `OPENAI_API_KEY`、`OPENAI_MODEL` 和可选 `OPENAI_BASE_URL`。
- 至少 32 位随机 `JWT_SECRET`，不能使用开发默认密钥。它与 MCP 服务令牌是两个独立密钥；如更换 JWT 密钥，旧登录令牌失效，需要重新登录。
- 正常运行 Nest 所需的数据库等既有配置。

在 `server` 目录安装依赖并启动：

```bash
nvm use 22.15.0
pnpm install
pnpm run start:dev
```

Nest 不负责启动 HTTP MCP，也不会在启动时打开 Kibana；它在调用工具时连接 URL，并复用客户端连接。
URL 只能由后端配置指定，问答请求不能传入 URL、令牌或任意工具名。远程 URL 只允许 HTTPS；本机允许 HTTP。
客户端禁止重定向，避免将服务端认证信息带到其他地址。

## 3. 在 Nest 中使用

先通过项目已有登录流程取得操作者的登录 JWT，再向下列接口发请求。
**HTTP Authorization 中放项目登录 JWT，不是 `ELK_MCP_TOKEN`，也不是 `JWT_SECRET`。**

```http
POST /api/agent/elk/chat
Authorization: Bearer <项目登录JWT>
Content-Type: application/json

{"message":"请打开 Kibana 登录窗口"}
```

MCP 所在机器会弹出独立 Chromium。你需要在那个窗口中手动登录，进入 Discover，设置：

```text
logstash-* / KQL / 默认 _source；时间范围由工具按问题自动设置（最近 15 分钟、最近 1 小时、最近 24 小时、今天或昨天）
清空旧查询及筛选标签，停止自动刷新，点击更新，关闭弹出菜单
```

完成后再提交新请求。`search_logs` 需要明确给出业务域名；`count_path_visits` 只需给出 `url_path`，后端有 `ELK_MCP_ALLOWED_HOSTS` 时限制在其中，没有配置时按当前 Kibana 登录权限查询：

```json
{"message":"查询 elk-mcp-check.invalid 最近 15 分钟的 5xx，最多返回 1 条，并说明结果。"}
```

正常响应结构为：

```json
{"reply":"模型根据工具结果生成的回答","model":"配置的模型名","source":"elk_agent"}
```

这段是结构示例，不是真实日志结果。第一版每次问答独立，不保留聊天记忆；浏览器登录由 MCP 进程跨请求及重启后的持久化配置保留。

要接 FE，只需让获得授权的页面调用这个专用接口并携带登录 JWT；不要把 MCP 服务令牌写进 React、`VITE_*` 环境变量或 localStorage。
ELK 模式使用独立的 JSON 请求和项目登录 JWT，不把该接口直接替换为普通模式的 SSE 解析器；MCP 服务令牌不会进入 React 或 `localStorage`。

## 4. 自己的 tools 如何共存

`server/src/agent/elk/elk-agent.service.ts` 中注册的是：

```ts
tools: [...createAgentTools(), ...createElkTools(this.mcp)]
```

- `createAgentTools()` 保留计算器、时间查询和文本转换。
- `createElkTools()` 注册 `elk_connection_status`、`elk_open_kibana`、`elk_search_logs`、`elk_count_path_visits`，内部调用 HTTP MCP。
- 要新增自己的只读业务 tool，可继续增加本地 tool；读取代码、修改代码等能力没有在本次接入中实现。

MCP 的 `isError: true` 会转成模型能读到的 `ok:false`，不会被当作零条日志。
连接失败不会自动重放浏览器操作；下次调用可重新连接。工具调用上限 120 秒，MCP 浏览器操作上限 90 秒，Agent 另有图执行步数限制。

## 5. 权限、会话和部署限制

原有 `/api/agent/chat`、`/api/agent/chat/stream` 和历史接口目前没有用户鉴权，所以此次**没有给它们增加 ELK tools**。
专用 ELK 接口依次验证 JWT、唯一操作者和域名白名单；其他用户不能共享个人 Kibana 会话。路径统计没有配置域名白名单时，会按当前 Kibana 登录权限查询；生产环境建议仍配置 `ELK_MCP_ALLOWED_HOSTS` 做额外限制。新 Agent 不写入原有公开历史或 Checkpointer。
模型提供商及可选追踪服务仍可能处理工具数据，只能使用公司批准的服务，并按需关闭包含日志内容的追踪。

HTTP MCP 自身需要固定 Bearer Token，每个请求均校验；只绑定 `127.0.0.1`，校验 Host，拒绝携带 Origin 的网页请求，不开放 CORS。
这是一套手动配置令牌的本机、单用户服务，**不是完整 OAuth 授权服务器，也没有多租户隔离**。

浏览器运行在 MCP 进程所在机器上。将 URL 改为远程地址，不会让浏览器自动出现在你的电脑上。
要提供公网/团队服务，还需要 HTTPS、用户授权和撤销机制、各用户独立浏览器会话、限流与审计；本版没有直接开放公网监听开关。

HTTP 模式的浏览器生命周期独立于 Nest：Nest 重启或客户端断开不会关闭 MCP 浏览器；停止 HTTP MCP 进程才会清理。
MCP 会将登录状态保存在独立的 `browser-profile/kibana` 目录。首次登录后，重启 MCP 通常不需要再次登录；手动退出、登录失效、清理该目录或取消正在执行的浏览器操作后，可能需要重新登录。该目录含 Cookie，不得提交或共享。
新协议 HTTP 的客户端取消会中断对应请求；已测试其取消信号传递。旧协议仅验证了连接与调用，不保证相同的取消行为。

## 6. 验证命令和已验证范围

在 `elk-log-mcp`：

```bash
pnpm run check
pnpm test
```

在 `server`：

```bash
nvm use 22.15.0
pnpm exec jest --runInBand --testPathPattern=/agent/elk/
pnpm run check:elk-mcp
```

本机默认 Node 是 18，必须在执行这些命令的终端先切换到 Node 22。只用 Node 22 的绝对路径启动 pnpm，不会自动改变所有子进程的 `PATH`；否则自检中的 Playwright 会提示 Node 版本不足。

`check:elk-mcp` 构建 Nest 后启动临时 HTTP MCP，使用编译后的真实 Nest MCP 客户端及 LangChain tools 完成调用，再关闭服务。
测试令牌只存在内存中；该命令不读取 `.env`，不连接数据库，不调用模型或打开浏览器。

2026-08-28 验证记录：

- MCP 的 38 项测试通过（含原有 stdio、新增 HTTP、真实 HTTP 入口和路径访问量工具）。
- Nest ELK 的 11 项定向测试通过，包括 MCP 工具发现、路径查询范围注入、白名单域名校验、JWT/操作者权限及 DTO 校验；模型使用替身。
- Nest 构建及真实 HTTP MCP → Nest 客户端 → LangChain tool 烟测通过，原有计算器仍可用。
- 本轮没有执行“真实模型 → 独立 Chromium 登录 → 真实业务日志”的完整验收；没有修改你的 `.env`、生成永久令牌或自动打开登录窗口。
- 改动前已发现原有 `agent.service.spec.ts` 的 3 处构造调用缺少 `AgentCheckpointerService` 参数，无法编译；本次未修改这个已有问题，不能声称整个后端测试集通过。

实现依据：[官方 HTTP 工厂及 Node 适配说明](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28)。
