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
  
  // 复杂预测首次冷启动可能很慢，允许通过环境变量和 Nginx 同步调大。
  const serverTimeoutMs = Number(process.env.SERVER_TIMEOUT_MS || 900000);
  server.setTimeout(serverTimeoutMs);

  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log(`📡 API: http://localhost:${port}/api/history`);
  console.log(`🌐 Frontend: http://localhost:${port}/fe`);
}
bootstrap();
