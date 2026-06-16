import { Module, Global } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { WechatService } from './wechat.service';
import { TokenService } from './token.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionGuard } from './permission.guard';
import { UserModule } from '../user/user.module';

/**
 * 全局模块：导出 TokenService 与两个守卫，其它模块可直接 @UseGuards 使用。
 */
@Global()
@Module({
  imports: [UserModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    WechatService,
    TokenService,
    JwtAuthGuard,
    PermissionGuard,
  ],
  exports: [TokenService, JwtAuthGuard, PermissionGuard, AuthService],
})
export class AuthModule {}
