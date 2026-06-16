import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TokenService } from './token.service';
import { IS_PUBLIC_KEY, AuthUser } from './decorators';

/**
 * 校验 Authorization: Bearer <token>，验证通过后把解析出的用户挂到 request.user。
 * 标了 @Public() 的接口直接放行。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly token: TokenService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const auth: string | undefined = req.headers['authorization'];
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('未登录');
    }
    const payload = this.token.verify<AuthUser>(auth.slice(7));
    req.user = payload;
    return true;
  }
}
