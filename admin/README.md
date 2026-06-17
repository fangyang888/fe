# 商城管理后台 (admin)

基于 Vite + React + TypeScript + react-router-dom 的后台管理脚手架,已完成**账号密码登录**与**用户管理**接入。

## 运行

```bash
cd admin
npm install
npm run dev      # 启动在 http://localhost:5173
```

开发时 `/api` 请求通过 Vite 代理转发到后端 `http://127.0.0.1:3000`(见 `vite.config.ts`),无需处理跨域。

## 前置:创建管理员账号

后端需先建好 admin 账号(账号密码登录):

```bash
cd ../server
npm run seed:admin              # 默认账号 admin / 密码 admin123
# 或自定义:npm run seed:admin myname mypass
```

## 已实现

- `登录页` — `/login`,调 `POST /api/auth/admin-login`,token 存 localStorage
- `路由守卫` — 未登录自动跳登录页
- `用户管理` — `/users`,调 `GET /api/user` 分页列表,支持启用/禁用(`PUT /api/user/:id/status`)
- `退出登录` — 清 token 返回登录页

## 目录

```
src/
  api/        client(请求封装+token)、auth(登录/用户接口)、types
  components/ Layout(侧边栏+顶栏)、RequireAuth(路由守卫)
  pages/      Login、Users
  App.tsx     路由
  main.tsx    入口
```

## 接口依赖(后端)

| 接口 | 用途 |
|---|---|
| `POST /api/auth/admin-login` | 账号密码登录 |
| `GET /api/user?page=&pageSize=` | 用户分页列表(需 user:list 权限) |
| `PUT /api/user/:id/status` | 启用/禁用用户(需 user:update 权限) |

管理员账号挂的是 `admin` 角色,守卫里 admin 全放行,所以以上接口都能访问。
