import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser, Public } from './decorators';

class LoginDto {
  code: string;
}
class AdminLoginDto {
  username: string;
  password: string;
}
class PhoneDto {
  code: string;
}

@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** POST /api/auth/login — 小程序登录，无需鉴权 */
  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.code);
  }

  /** POST /api/auth/admin-login — 后台账号密码登录 */
  @Public()
  @Post('admin-login')
  adminLogin(@Body() dto: AdminLoginDto) {
    return this.auth.adminLogin(dto.username, dto.password);
  }

  /** POST /api/auth/phone — 绑定手机号，需登录 */
  @UseGuards(JwtAuthGuard)
  @Post('phone')
  bindPhone(@CurrentUser('userId') userId: number, @Body() dto: PhoneDto) {
    return this.auth.bindPhone(userId, dto.code);
  }

  /** POST /api/auth/logout — 无状态 JWT 由前端丢弃 token 即可，这里仅占位 */
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout() {
    return { ok: true };
  }
}
