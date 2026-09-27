# 商城图片上传

后台「商品管理」「轮播管理」的新增/编辑弹窗支持选择本地图片，上传成功后会自动填入 URL 并预览。点击表单「保存」才会更新商品或轮播。上传失败会保留原图片地址，可重新选择文件重试。

## 接口与存储

- `POST /api/admin/uploads/images`：Bearer 登录，要求 `admin` 角色或 `media:upload` 权限；multipart 字段名为 `file`。
- `GET /api/media/images/:filename`：公开读取，供小程序和后台展示，使用独立随机文件名及 30 天缓存。
- 单张最大 5 MiB，支持 JPG、PNG、WebP 静态图片。服务端实际解码校验，限制 2500 万像素，调整到最长边 2000 像素并重新编码、去除元数据。
- 默认存储目录为后端工作目录的 `../uploads/images`，生产部署对应 `/home/deploy/fe/uploads/images`，不放进构建产物 `dist`。应将此目录纳入服务器备份；重新发布不得删除。
- `UPLOAD_DIR` 可指定绝对存储目录；`PUBLIC_BASE_URL` 指定图片 URL 的站点前缀，默认 `https://fzmall.xyz`。开发测试可设置为本地后端地址。
- 反向代理需允许至少 6 MiB 请求体，为 multipart 留出空间；项目 Nginx 的 `/api` 配置已包含该限制，若另有 HTTPS 网关也需检查其限制。

首批演示图片源文件位于 `public/catalog/lifestyle-v1/`。前端构建会将其复制到 `dist/catalog/lifestyle-v1/`，与数据库现有 `/fe/catalog/lifestyle-v1/*.jpg` 地址对应。

## 验证

在 `server` 目录执行 `npm test -- --runInBand upload.controller.spec.ts`，涵盖未登录/非管理员拒绝、实际图片上传与读取、格式伪装、损坏图片、大小限制、多文件限制及文件路径限制。

在 `admin` 目录执行 `npm run build`。本地代理可通过 `API_PROXY_TARGET` 指向隔离的测试后端。
