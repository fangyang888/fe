import { Injectable } from '@nestjs/common';
import { TokenService } from './token.service';
import { WechatService } from './wechat.service';
import { UserService } from '../user/user.service';
import { User } from '../user/user.entity';
import { AuthUser } from './decorators';

@Injectable()
export class AuthService {
  constructor(
    private readonly wechat: WechatService,
    private readonly users: UserService,
    private readonly token: TokenService,
  ) {}

  /** 小程序登录：code → openid → 查/建用户 → 签发 token */
  async login(code: string) {
    const session = await this.wechat.code2Session(code);
    const user = await this.users.findOrCreateByOpenid(
      session.openid,
      session.unionid,
    );
    const token = this.signToken(user);
    return { token, userInfo: this.toUserInfo(user) };
  }

  /** 绑定手机号 */
  async bindPhone(userId: number, code: string) {
    const phone = await this.wechat.getPhoneNumber(code);
    await this.users.update(userId, { phone });
    return { phone };
  }

  /** 把角色和权限拍平进 JWT 载荷，守卫无需再查库 */
  signToken(user: User): string {
    const roles = (user.roles || []).map((r) => r.code);
    const permissions = [
      ...new Set(
        (user.roles || []).flatMap((r) =>
          (r.permissions || []).map((p) => p.code),
        ),
      ),
    ];
    const payload: AuthUser = {
      userId: user.id,
      openid: user.openid,
      roles,
      permissions,
    };
    return this.token.sign(payload);
  }

  private toUserInfo(user: User) {
    return {
      id: user.id,
      openid: user.openid,
      nickname: user.nickname,
      avatar: user.avatar,
      gender: user.gender,
      phone: user.phone,
      roles: (user.roles || []).map((r) => ({ code: r.code, name: r.name })),
    };
  }
}
