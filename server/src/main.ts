import * as crypto from 'crypto';
Object.defineProperty(globalThis, 'crypto', {
  value: {
    randomUUID: crypto.randomUUID,
  },
});

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 允许跨域（开发环境）shi
  app.enableCors();

  const port = process.env.PORT || 3000;
  const server = await app.listen(port);
  
  // 设置 HTTP 服务端超时时间为 300 秒 (5分钟)，匹配 Nginx 设置
  server.setTimeout(300000);

  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log(`📡 API: http://localhost:${port}/api/history`);
  console.log(`🌐 Frontend: http://localhost:${port}/fe`);
}
bootstrap();
