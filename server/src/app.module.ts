import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { HistoryModule } from './history/history.module';
import { History } from './history/history.entity';
import { AppController } from './app.controller';

@Module({
  imports: [
    // 加载 .env 配置
    ConfigModule.forRoot({
      envFilePath: join(__dirname, '..', '.env'),
      isGlobal: true,
    }),

    // MySQL 连接（TypeORM）
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      username: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'fe_prediction',
      entities: [History],
      synchronize: true, // 开发环境自动同步表结构，生产环境建议关闭
    }),

    // 生产环境：托管前端 dist 静态文件
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'dist'),
      serveRoot: '/fe',
      exclude: ['/api/(.*)'],
    }),

    // History 模块
    HistoryModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
