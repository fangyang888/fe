# ELK Log MCP

位于 `fe` 仓库内的独立 Node.js 项目，目标是提供基于 Kibana 页面的只读日志查询 MCP 服务。
使用自己的 `package.json` 和依赖，不修改现有 React、NestJS 或 `mcp-server` 项目。

## 当前阶段

已实现本地 **stdio / HTTP MCP 服务**：浏览器连接状态、打开登录窗口、受限日志查询和路径访问量统计工具。

stdio 入口是 `server.mjs`；URL 连接入口是 `http-server.mjs`，默认 `http://127.0.0.1:3101/mcp`，必须携带服务端令牌。
Nest 已新增独立、受保护的 ELK Agent 入口；FE 聊天页通过“ELK 日志助手”模式调用该入口，原有普通助手行为保持不变。

**需要“链接式 MCP → Nest Agent”，请先看 [HTTP 与 Nest 接入指南](./HTTP_AND_NEST.md)。**
下面的“现在怎么用”保留原有 stdio 用法，不要把 stdio 启动配置与 HTTP URL 混用。

## 现在怎么用

先在本目录运行自检（不打开浏览器，不读取日志）：

```bash
nvm use
pnpm run check:mcp
```

自检应显示握手成功，以及 `get_connection_status`、`open_kibana`、`search_logs`、`count_path_visits` 四个工具。

然后把 [mcp.config.example.json](./mcp.config.example.json) 的内容加入支持 stdio MCP 的客户端配置。示例使用你本机的 Node 22 和服务入口绝对路径，换电脑时需要修改；不要把整个 JSON 直接粘贴进格式不同的客户端配置。
**这里只提供配置示例，不会自动改动你的客户端设置。**

客户端会启动服务进程，不需要另开终端先运行 `pnpm start`。如果手动执行 `node server.mjs` 后没有输出，是在等待 MCP 输入，不是卡住。
客户端配置请直接运行 `node` 和脚本，不要把交互式 `query:logs` 作为 MCP 入口，也不要让包管理器的启动提示进入协议 stdout。

### 工具调用顺序

| 工具 | 参数 | 用途 |
| --- | --- | --- |
| `get_connection_status` | `{}` | 查看是否已打开浏览器、是否忙碌、Discover 查询框是否可见 |
| `open_kibana` | `{}` | 打开独立 Chromium，等待你手动登录；已打开时保留当前页面 |
| `search_logs` | `{"host":"elk-mcp-check.invalid","limit":10,"range":"last_15m"}` | 查询具体域名指定范围的 5xx，支持最近 15 分钟、最近 1 小时、最近 24 小时、今天和昨天；默认 10 条、最多 50 条 |
| `count_path_visits` | `{"url_path":"/puzzle/template.html","range":"today"}` | 在后端允许的域名范围内统计路径指定时间范围的命中文档数；若 `exact=false` 只能视为页面样本 |

1. 调用 `open_kibana`，在**它打开的窗口**中手动登录、进入 Discover。
2. 选择 `logstash-*` / KQL / 默认 `_source`；时间范围由工具根据问题自动设置（最近 15 分钟、最近 1 小时、最近 24 小时、今天或昨天）。清空旧查询和筛选标签、停止自动刷新，点击更新并关闭弹出菜单。
3. 先调用上表的 `.invalid` 测试查询。`search_logs` 的 `host` 是业务域名，不能填 Kibana 登录地址；`count_path_visits` 只需提供 `url_path`。
4. 再使用获准查询的真实业务域名。连续调用会自动替换本进程上次填写的查询，不需要每次清空；手动改过查询则需要先清空并更新。

`discover_available` **只表示查询框可见**，不保证登录仍有效或页面设置全部正确；查询前会再次校验。
查询期间不要手动操作这个窗口。并发打开/查询会返回 `BUSY`，不会排队覆盖彼此的条件。
建议 MCP 客户端工具调用超时设为 **120 秒**；服务单次浏览器操作上限为 90 秒。
支持取消；取消或整体超时会关闭本服务创建的浏览器，以终止页面操作，下次需重新打开和登录。

工具失败返回 `isError: true`，安全错误内容中含 `code`、`message`；失败不返回伪造的零条日志。
典型错误：`NOT_OPEN`（未打开）、`BUSY`（忙碌）、`QUERY_PRECONDITION`（页面设置不满足）、`BROWSER_ERROR`（浏览器异常）。参数错误由 SDK 在调用前拒绝。

### 会话与接入边界

- 服务使用独立的 Playwright 配置目录保存 Kibana 登录状态；关闭窗口或重启服务后会尝试复用 Cookie，登录过期、手动退出或公司策略要求重新认证时仍需登录。不会继承你日常 Chrome 的登录。
- 不保存密码、Cookie 文件或浏览器个人资料；不读取现有 Chrome 配置，也不调用 Kibana 内部 API。服务断开、stdin 关闭或收到退出信号时清理自有浏览器。
- 这是**本机单用户工具**，运行机器必须有桌面环境并能访问公司网络。不能直接作为云端或多人共享服务使用。
- MCP 查询结果会返回调用方，可能进入模型上下文；仅在公司批准的客户端和模型环境中查询业务日志。白名单不代表所有业务信息都可公开。
- 后续接入关系为 `FE 聊天页 → Agent 后端（MCP 客户端）→ 本服务 → Kibana`；不要在 React 浏览器端启动 Node 服务或放入登录凭据。

实现参考官方 [MCP stdio 服务](https://ts.sdk.modelcontextprotocol.io/v2/serving/stdio.html) 与 [工具注册文档](https://ts.sdk.modelcontextprotocol.io/v2/servers/tools.html)，使用 SDK 2.0.0。stdio 入口保留 SDK 默认的旧协议兼容模式。

## 环境准备

- Node.js 22.15.0（`.nvmrc` 指定的版本）。
- 本机能访问公司 Kibana；如有需要，请先自行连接公司内网或 VPN。
- 使用有日志查询权限的账号手动登录，不在代码或聊天中填写密码。

在本目录的终端运行：

```bash
nvm use
pnpm install
pnpm exec playwright install chromium
```

如果尚未安装指定 Node.js 版本，可以先运行 `nvm install`。

若旧版 pnpm 7 在 Node 22 下安装时报 `ERR_INVALID_THIS`，是包管理器兼容问题，可升级 pnpm；本次依赖安装使用系统 Node 18 的 pnpm 7，服务和测试使用 Node 22，未升级你的全局工具。

## 第一步：验证连接

```bash
pnpm run check:kibana
```

1. 脚本会打开一个独立 Chromium 窗口，访问指定的 Kibana 首页。
2. 在这个窗口中手动登录并进入 **Discover**。
3. 等页面加载完毕后，回到终端按回车。
4. 看到 `找到日志查询框：true` 表示通过验证。
5. 再按回车结束验证并关闭浏览器。

这个浏览器不会自动继承日常 Chrome 的登录状态。`start:http` 使用独立的 `browser-profile/kibana` 配置目录保存登录状态；`check:kibana` 验证脚本仍使用临时会话，不保存登录状态。
它不提交搜索、不读取日志正文，也不修改 Kibana 配置。Discover 页面本身仍可能自动加载默认查询结果。

如果出现登录失效、验证码或证书警告，需要由使用者处理；脚本不会绕过认证或关闭 TLS 校验。
如果界面语言或版本发生变化，脚本中的查询框名称也可能需要调整。

仅检查 JavaScript 语法，不打开浏览器：

```bash
pnpm run check
```

## 第二步：验证一次受限查询

先用测试域名验证查询流程，不涉及真实业务域名：

```bash
pnpm run query:logs --host elk-mcp-check.invalid --limit 10
```

也可以把 `--host` 后的值换成你获准查询的**业务域名**，不是 Kibana 网站地址：

```bash
pnpm run query:logs --host api.example.com --limit 10
```

1. 在本次新打开的浏览器中手动登录并进入 Discover。
2. 选择 `logstash-*`，查询语言为 **KQL**；时间范围会由工具自动设置为命令指定的范围。
3. 保持默认 `_source` 表格，清空旧查询和筛选标签，并关闭自动刷新。修改后点击更新，等待页面加载完成；关闭账户菜单、时间菜单等弹出层。
4. 确认终端显示的查询范围后，按回车执行。
5. 脚本提交固定 KQL，等待本次查询完成，再输出 JSON。最后按回车关闭浏览器。

CLI 默认查询最近 15 分钟和 `500 <= status < 600`；可用 `--range last_15m|last_1h|last_24h|today|yesterday` 选择其他支持的时间范围。`--host` 必填，不接受 URL、通配符或任意 KQL；`--limit` 为 1–50，默认 10。
本版只支持已确认的中文旧版 Discover 页面，其他版本或布局会报错，不会尝试绕过页面去调用内部 API。

### 输出含义

- `query`：实际提交的查询条件。
- `returnedCount`：本次提取的样本数量。
- `totalMatches`：有结果时暂为 `null`；只有明确看到本次查询的空结果提示时才为 `0`。
- `truncated`：超过提取条数时为 `true`；有结果但无法判断是否完整时为 `null`。
- `logs`：只包含时间、域名、方法、状态码及两种耗时字段。

白名单在浏览器内就生效，不读取其他字段的值；输出层再次校验，拒绝与请求域名或 5xx 范围不符的数据。
暂不输出 URL 路径，因为路径也可能包含用户标识或令牌；IP、用户标识、认证头、请求体、原始消息也不会输出。
耗时单位和显示时区尚未核实，不能自行将数值解释为毫秒或秒。

测试域名正常应得到 `returnedCount: 0`、`totalMatches: 0`、`logs: []`。
加载失败、超时、登录失效、无法识别表格等情况会报错退出，不能解释为“没有错误日志”。
当前命令会在终端输出数据，不会自动调用大模型或写入日志文件；请勿把真实业务结果直接粘贴到不获准使用的服务。

### 本地检查

```bash
pnpm run check
pnpm test
pnpm run query:logs --help
```

自动测试使用合成数据检查参数限制、敏感字段过滤、样本截断和页面状态识别，同时通过官方 MCP 客户端测试协议和子进程生命周期；不连接真实 Kibana、不保存登录态。

### 已完成的验证（2026-08-28）

- 已通过已登录 Chrome 的浏览器连接适配层，直接调用项目的 `searchLogs()`，在真实 Kibana 上完成 `.invalid` 测试域名查询，得到明确的空结果和 `totalMatches: 0`。
- 实测发现时间菜单关闭动画会导致后续输入未生效；已增加菜单消失及查询框恢复可访问性的等待，并改用时间按钮的可访问名称点击。
- 已有弹出菜单时提前给出明确错误。回归测试覆盖菜单关闭动画、遮挡场景和路径统计结果；本地测试共 38 项通过。
- 上述真实测试覆盖核心查询函数，不等于已运行独立 Chromium 的整套 CLI 登录交互；真实业务域名的非空结果尚未实测。

### MCP 封装验证

- 2026-08-28：语法检查、`check:mcp` 及 **38 项自动测试**通过。自检启动真实 `server.mjs` 子进程，验证握手、工具发现和初始状态；测试同时覆盖默认旧协议与自动协商连接，以及路径访问量工具的参数、白名单范围和精确统计语义。
- 自动测试覆盖协议参数校验、安全错误、并发保护、连续查询所有权、MCP 取消信号、超时清理以及 EOF/SIGTERM 退出。涉及查询成功和浏览器生命周期的自动测试使用替身，不等同于真实业务查询。
- 在已登录 Chrome 的连接适配层上，实际调用更新后的 `searchLogs()`，连续查询 `elk-mcp-check.invalid` 和 `elk-mcp-repeat.invalid`，均得到明确的零条结果；第二次自动替换第一次查询，最后恢复空查询。
- 浏览器测试环境无法加载 MCP SDK，因此上述真实页面测试与协议测试分别进行；**未完成“独立 MCP 进程 → 自有 Chromium 登录 → 真实业务非空结果”的整套验收**，也未自动安装客户端配置。

## 后续步骤

1. 在选定 MCP 客户端配置本服务，完成独立窗口的手动登录和测试域名查询。
2. 使用获准查询的业务域名验证非空结果，再接入 FE 项目的 Agent 后端。
3. 根据实际需求逐项增加受限的状态码、时间范围等选项，并补充验证。

页面中的前 500 条文档不能当作全量统计；未知的总量必须标记为未知。
不要将个人登录会话直接共享给其他使用者；多人服务需要单独设计身份和权限隔离。
持久化配置目录可能包含 Cookie 和本地存储，只允许保存在受控本机，并已加入 `.gitignore`；不要复制、上传或提交到 Git。需要清除登录状态时停止 MCP 后删除该目录。

参考：[Playwright 登录状态说明](https://playwright.dev/docs/auth)、[Kibana KQL 语法](https://www.elastic.co/docs/reference/query-languages/kql)。
