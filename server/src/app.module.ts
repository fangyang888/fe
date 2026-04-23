import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { HistoryModule } from './history/history.module';
import { History } from './history/history.entity';
import { AppController } from './app.controller';
import { CrawlerModule } from './crawler/crawler.module';

@Module({
  imports: [
    // 加载 .env 配置
    ConfigModule.forRoot({
      envFilePath: join(process.cwd(), '.env'),
      isGlobal: true,
    }),

    // MySQL 连接（TypeORM）
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 3306),
        username: configService.get<string>('DB_USER', 'root'),
        password: configService.get<string>('DB_PASSWORD', ''),
        database: configService.get<string>('DB_NAME', 'fe_prediction'),
        entities: [History],
        synchronize: process.env.NODE_ENV !== 'production', // 生产环境关闭自动同步
      }),
    }),

    // 生产环境：托管前端 dist 静态文件
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'dist'),
      serveRoot: '/fe',
      exclude: ['/api/(.*)'],
    }),

    // History 模块
    HistoryModule,

    CrawlerModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
