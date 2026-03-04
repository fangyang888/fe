# 阿里云 ECS 部署指南

## 1. 购买 ECS

- 推荐配置：2C4G Ubuntu 22.04
- 安全组开放端口：22 (SSH), 80 (HTTP), 443 (HTTPS), 3306 (MySQL, 仅内网)

## 2. 安装基础环境

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装 Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 安装 PM2
sudo npm install -g pm2

# 安装 Nginx
sudo apt install -y nginx

# 安装 MySQL 8
sudo apt install -y mysql-server
sudo mysql_secure_installation
```

## 3. 配置 MySQL

```bash
sudo mysql

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