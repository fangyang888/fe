# FE Prediction Server

基于 [NestJS](https://nestjs.com/) 构建的后端服务，提供历史数据管理、智能杀号预测和网页爬虫代理功能。

## 技术栈

- **框架**: NestJS + TypeScript
- **数据库**: MySQL (TypeORM)
- **运行时**: Node.js >= 18

## 快速开始

```bash
# 安装依赖
pnpm install

# 开发模式（热重载）
pnpm start:dev

# 生产构建
pnpm build

# 生产运行
pnpm start:prod
```

## 环境变量

在项目根目录创建 `.env` 文件：

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=fe_prediction
```

---

## API 接口文档

**Base URL**: `http://localhost:3000`

### 🏠 根路由

#### `GET /`

服务健康检查。

**响应示例：**
```json
{
  "status": "ok",
  "api": "/api/history"
}
```

---

### 📊 History 历史数据模块

管理开奖历史记录的 CRUD 接口。每条记录包含 7 个号码（n1 ~ n7）。

#### `GET /api/history`

获取全部历史记录，按 `id` 升序排列。

**响应示例：**
```json
[
  {
    "id": 1,
    "n1": 3,
    "n2": 12,
    "n3": 18,
    "n4": 25,
    "n5": 33,
    "n6": 41,
    "n7": 47,
    "year": 2025,
    "No": 1,
    "created_at": "2025-04-01T08:00:00.000Z"
  }
]
```

---

#### `GET /api/history/text`

以纯文本格式返回所有历史记录，兼容前端 `history.txt` 格式。

**Content-Type**: `text/plain`

**响应示例：**
```
3,12,18,25,33,41,47
5,9,16,22,30,38,44
```

---

#### `GET /api/history/:id`

获取单条历史记录。

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | `number` (path) | 记录 ID |

**响应示例：**
```json
{
  "id": 1,
  "n1": 3,
  "n2": 12,
  "n3": 18,
  "n4": 25,
  "n5": 33,
  "n6": 41,
  "n7": 47,
  "year": 2025,
  "No": 1,
  "created_at": "2025-04-01T08:00:00.000Z"
}
```

**错误响应（404）：**
```json
{
  "statusCode": 404,
  "message": "History #999 not found"
}
```

---

#### `POST /api/history`

新增一条历史记录。

**请求体：**
```json
{
  "numbers": [3, 12, 18, 25, 33, 41, 47],
  "year": 2025,
  "No": 50
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `numbers` | `number[]` | ✅ | 恰好 7 个号码 |
| `year` | `number` | ❌ | 年份 |
| `No` | `number` | ❌ | 期号 |

**响应：** 返回创建的完整记录对象。

---

#### `PUT /api/history/:id`

修改一条历史记录。

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | `number` (path) | 记录 ID |

**请求体：** 同 `POST /api/history`。

**响应：** 返回更新后的完整记录对象。

---

#### `DELETE /api/history/:id`

删除一条历史记录。

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | `number` (path) | 记录 ID |

**响应：** `200 OK`（无内容）

---

### 🎯 Predictor 预测模块

基于多算法引擎的智能杀号预测系统。

#### `GET /api/predictor/kill`

获取杀号预测结果。系统会自动执行以下流程：
1. 基于历史数据进行**自适应网格搜索**，寻找最优参数组合
2. 使用**指数衰减权重** + **遗漏回归分析** + **变异系数保护**生成初始杀号
3. 应用**跨期排斥矩阵**和 **Apriori 关联规则挖掘**增强排序
4. 通过**马尔可夫链转移概率**过滤高风险号码
5. 自动运行**回测评估**，返回近期准确率数据

**响应示例：**
```json
{
  "predictions": [
    { "n": 7,  "tier": "S1", "repulsionScore": 8.52, "aprioriScore": 6.3 },
    { "n": 14, "tier": "S1", "repulsionScore": 7.11, "aprioriScore": 5.8 },
    { "n": 28, "tier": "S2", "repulsionScore": 4.22, "aprioriScore": 3.1 },
    { "n": 35, "tier": "S2", "repulsionScore": 3.80, "aprioriScore": 2.9 },
    { "n": 42, "tier": "S3", "repulsionScore": 1.50, "aprioriScore": 1.2 }
  ],
  "repulsionInfo": {
    "optimizedParams": {
      "repulsionWeight": 0.5,
      "aprioriWeight": 0.7,
      "repulsionThreshold": 0.08
    },
    "topRepulsedNumbers": [
      { "n": 7,  "repulsionScore": 8.52, "aprioriScore": 6.3 },
      { "n": 14, "repulsionScore": 7.11, "aprioriScore": 5.8 }
    ],
    "aprioriRules": [
      {
        "pair": [10, 33],
        "target": 7,
        "support": 5,
        "confidence": 1.0
      }
    ]
  },
  "backtestStats": {
    "details": [
      {
        "periodOffset": 1,
        "predicted": [7, 14, 21, 28, 35, 42, 3, 9, 18, 44],
        "actual": [15, 46, 16, 10, 48, 33, 22],
        "failed": [],
        "correctCount": 10,
        "accuracy": 100
      }
    ],
    "overallAccuracy": 86.4,
    "totalCorrect": 432,
    "totalPredicted": 500,
    "calcPeriods": 50
  }
}
```

**响应字段说明：**

| 字段 | 说明 |
|------|------|
| `predictions` | 杀号预测列表（最多 10 个），`tier` 表示置信度等级（S1 > S2 > S3 > C2） |
| `repulsionInfo.optimizedParams` | 网格搜索得到的最优排斥参数 |
| `repulsionInfo.topRepulsedNumbers` | 排斥分数最高的 15 个号码 |
| `repulsionInfo.aprioriRules` | 触发的 Apriori 关联规则（前 30 条） |
| `backtestStats.overallAccuracy` | 近 50 期回测的总体准确率（%） |
| `backtestStats.details` | 最近 10 期的逐期回测详情 |

> ⚠️ **注意**：首次调用（冷启动）约需 10-12 秒完成网格搜索和回测计算，后续调用命中缓存仅需 ~10ms。

---

### 🕷️ Crawler 爬虫代理模块

通过后端代理请求外部网页，解决前端跨域问题。

#### `GET /api/crawler?url=<目标URL>`

获取指定 URL 的网页 HTML 内容。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `url` | `string` (query) | ✅ | 要爬取的目标网页地址 |

**Content-Type**: `text/html; charset=utf-8`

**请求示例：**
```
GET /api/crawler?url=https://example.com
```

**响应：** 返回目标网页的原始 HTML 字符串。

**错误响应（400）：**
```json
{
  "statusCode": 400,
  "message": "Query parameter \"url\" is required. Example: /api/crawler?url=https://example.com"
}
```

---

## 数据库结构

### `history` 表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `int` (PK, 自增) | 记录 ID |
| `n1` ~ `n7` | `int` | 7 个开奖号码 |
| `year` | `int` (可空) | 年份 |
| `No` | `int` (可空) | 期号 |
| `created_at` | `datetime` | 创建时间（自动生成） |

---

## 项目结构

```
server/
├── src/
│   ├── app.module.ts           # 根模块（MySQL 连接、静态文件托管）
│   ├── app.controller.ts       # 根路由（健康检查）
│   ├── history/
│   │   ├── history.entity.ts   # History 实体定义
│   │   ├── history.service.ts  # 数据库 CRUD 逻辑
│   │   ├── history.controller.ts # RESTful 路由
│   │   └── history.module.ts   # History 模块
│   ├── predictor/
│   │   ├── predictor.service.ts    # 杀号预测引擎核心
│   │   ├── predictor.controller.ts # 预测路由
│   │   └── predictor.module.ts     # Predictor 模块
│   └── crawler/
│       ├── crawler.service.ts      # 网页爬取逻辑
│       ├── crawler.controller.ts   # 爬虫路由
│       └── crawler.module.ts       # Crawler 模块
├── .env                        # 环境变量配置
├── nest-cli.json
├── tsconfig.json
└── package.json
```
