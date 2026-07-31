import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { HistoryModule } from './history/history.module';
import { History } from './history/history.entity';
import { HistoryHkModule } from './history-hk/history-hk.module';
import { HistoryHk } from './history-hk/history-hk.entity';
import { AppController } from './app.controller';
import { PredictorModule } from './predictor/predictor.module';
import { CrawlerModule } from './crawler/crawler.module';
import { User } from './user/user.entity';
import { Role } from './role/role.entity';
import { Permission } from './permission/permission.entity';
import { UserModule } from './user/user.module';
import { RoleModule } from './role/role.module';
import { PermissionModule } from './permission/permission.module';
import { AuthModule } from './auth/auth.module';
import { Product } from './product/product.entity';
import { Category } from './category/category.entity';
import { Banner } from './banner/banner.entity';
import { ProductModule } from './product/product.module';
import { CategoryModule } from './category/category.module';
import { BannerModule } from './banner/banner.module';
import { HomeModule } from './home/home.module';
import { CartItem } from './cart/cart-item.entity';
import { CartModule } from './cart/cart.module';
import { Order } from './order/order.entity';
import { OrderItem } from './order/order-item.entity';
import { Address } from './address/address.entity';
import { OrderModule } from './order/order.module';
import { AddressModule } from './address/address.module';
import { Coupon } from './coupon/coupon.entity';
import { UserCoupon } from './coupon/user-coupon.entity';
import { CouponModule } from './coupon/coupon.module';
import { Favorite } from './favorite/favorite.entity';
import { FavoriteModule } from './favorite/favorite.module';
import { Event } from './track/event.entity';
import { TrackModule } from './track/track.module';
import { StockModule } from './stock/stock.module';

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
        entities: [
          History,
          HistoryHk,
          User,
          Role,
          Permission,
          Product,
          Category,
          Banner,
          CartItem,
          Order,
          OrderItem,
          Address,
          Coupon,
          UserCoupon,
          Favorite,
          Event,
        ],
        synchronize: process.env.NODE_ENV !== 'production', // 生产环境关闭自动同步
      }),
    }),

    // 生产环境：托管前端 dist 静态文件
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), '..', 'dist'),
      serveRoot: '/fe',
      exclude: ['/api/(.*)'],
    }),

    // History 模块
    HistoryModule,
    HistoryHkModule,
    PredictorModule,
    CrawlerModule,

    // 用户 / 角色 / 权限 / 鉴权
    AuthModule,
    UserModule,
    RoleModule,
    PermissionModule,

    // 商城：首页 / 商品 / 分类 / 轮播
    HomeModule,
    ProductModule,
    CategoryModule,
    BannerModule,
    CartModule,
    OrderModule,
    AddressModule,
    CouponModule,
    FavoriteModule,
    TrackModule,
    StockModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
