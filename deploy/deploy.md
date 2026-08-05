# 阿里云 ECS 部署指南 (针对 Alibaba Cloud Linux 3 / CentOS)

> ## 一键发布（GitHub Actions）
>
> push 到 `main` / `feat/v4` 会自动:构建前端 + 后端 + **admin 后台** → scp 上传 → 生成 `.env` → **初始化商城数据库表** → 创建管理员账号 → 重启 PM2 + reload Nginx。
>
> **需要在 GitHub 仓库 Settings → Secrets 配置:**
>
> | Secret | 说明 |
> |---|---|
> | `ECS_HOST` / `ECS_USER` / `ECS_PASSWORD` | 服务器 SSH(已有) |
> | `DB_HOST` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | MySQL(已有) |
> | `REDIS_URL` | 可选(已有) |
> | `JWT_SECRET` | **必填**,后台/小程序登录签名密钥,换成随机长字符串 |
> | `WX_APPID` / `WX_SECRET` | 小程序真实登录(没有可留空,走 dev 兜底) |
> | `ADMIN_USER` / `ADMIN_PASSWORD` | 后台管理员账号密码,部署时自动创建/更新 |
> | `OPENAI_API_KEY` | **必填**，LangChain Agent 使用的模型 API Key |
>
> `OPENAI_MODEL` 和 `OPENAI_BASE_URL` 可以像下表放在 Variables，也可以放在 Secrets。部署工作流会优先读取 Secrets，再回退到 Variables：
>
> | Variable | 说明 |
> |---|---|
> | `OPENAI_MODEL` | 可选，默认 `gpt-5.6-sol` |
> | `OPENAI_BASE_URL` | OpenAI 兼容接口地址；使用 OpenAI 官方接口时可留空。自建/代理接口建议放在 Secrets |
>
> GitHub Actions 会通过 SSH 环境变量传递 Agent 配置，在 ECS 上生成权限为 `600` 的 `/home/deploy/fe/server/.env`。真实 Key 不会写入仓库文件。
>
> 部署后访问:小程序后端 `http://你的IP/api`、**管理后台 `http://你的IP/admin`**、预测前端 `http://你的IP/fe`。
>
> 注:数据库建表用 `server/sql/init-tables.sql`(幂等),首批演示数据可登录服务器手动跑 `seed-test-data.sql`。


## 1. 购买 ECS

- 推荐配置：2C4G Alibaba Cloud Linux 3
- 安全组开放端口：22 (SSH), 80 (HTTP), 443 (HTTPS), 3306 (MySQL, 仅内网)

## 2. 安装基础环境

```bash
# 更新系统
sudo dnf update -y

# 安装 Node.js 和 npm
sudo dnf install -y nodejs npm

# 安装 PM2
sudo npm install -g pm2

# 安装 Nginx
sudo dnf install -y nginx

# 安装 MySQL 8
sudo dnf install -y mysql-server
sudo systemctl start mysqld
sudo systemctl enable mysqld
# sudo mysql_secure_installation  # 可选：初始化数据库安全设置
```

## 3. 配置 MySQL

```bash
mysql

# 创建数据库和用户
CREATE DATABASE fe_prediction CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'fe_user'@'localhost' IDENTIFIED BY 'your_strong_password';
GRANT ALL PRIVILEGES ON fe_prediction.* TO 'fe_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

## 4. 部署项目

```bash
# 创建部署目录
sudo mkdir -p /home/deploy
cd /home/deploy

# 克隆项目
git clone https://github.com/fangyang888/fe.git
cd fe

# 安装前端依赖并构建
npm install
npm run build

# 安装后端依赖并构建
cd server
cp .env.example .env
# 编辑 .env 填入 MySQL 配置
nano .env

npm install
npm run build

# 初始化数据库（导入 history.txt）
npx ts-node scripts/init-db.ts
```

## 5. 启动服务

```bash
# 回到项目根目录
cd /home/deploy/fe

# PM2 启动
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup  # 设置开机自启
```

## 6. 配置 Nginx

```bash
# 复制配置
sudo cp deploy/nginx.conf /etc/nginx/sites-available/fe
sudo ln -s /etc/nginx/sites-available/fe /etc/nginx/sites-enabled/

# 编辑配置，修改 server_name 为你的域名或 IP
sudo nano /etc/nginx/sites-available/fe

# 删除默认配置
sudo rm /etc/nginx/sites-enabled/default

# 测试并重启
sudo nginx -t
sudo systemctl restart nginx
```

## 7. 验证

```bash
# 测试 API
curl http://localhost:3000/api/history

# 测试 Nginx 代理
curl http://localhost/api/history

# 浏览器访问
# http://your_ip/fe
```

## 常用运维命令

```bash
# 查看日志
pm2 logs fe-server

# 重启服务
pm2 restart fe-server

# 更新代码后重新部署
cd /home/deploy/fe
git pull
npm run build              # 前端
cd server && npm run build # 后端
pm2 restart fe-server
```


```
2
6

组件能力新增 导航滑块banner  - 6
导航滑块和图标导航banner - 8
静态和导航预览 4
会员中心 - 10

```
