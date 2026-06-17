import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 后端地址，开发时通过代理转发，避免跨域
const API_TARGET = 'http://127.0.0.1:3000'

export default defineConfig({
  plugins: [react()],
  // 生产部署在 nginx 的 /admin 子路径下，静态资源需带前缀
  base: '/admin/',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
})
