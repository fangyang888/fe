import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, AuthUser } from './decorators';

/**
 * 基于权限点的校验。须配合 JwtAuthGuard 使用（依赖 request.user）。
 * 接口未声明 @RequirePermissions 则放行；声明了则要求用户拥有全部所需权限。
 * 拥有 'admin' 角色直接放行（超级管理员）。
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const user: AuthUser = context.switchToHttp().getRequest().user;
    if (!user) throw new ForbiddenException('无权限');

    if (user.roles?.includes('admin')) return true;

    const owned = new Set(user.permissions || []);
    const ok = required.every((p) => owned.has(p));
    if (!ok) {
      throw new ForbiddenException(`缺少权限: ${required.join(', ')}`);
    }
    return true;
  }
}
