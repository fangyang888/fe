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
  await app.listen(port);
  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log(`📡 API: http://localhost:${port}/api/history`);
  console.log(`🌐 Frontend: http://localhost:${port}/fe`);
}
bootstrap();
