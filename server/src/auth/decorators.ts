import {
  SetMetadata,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';

/** 接口所需权限点的 metadata key */
export const PERMISSIONS_KEY = 'required_permissions';

/**
 * 声明接口需要的权限点。例：@RequirePermissions('user:delete')
 * 可传多个，默认“全部满足”才放行（在 PermissionGuard 里实现）。
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** 标记接口为公开，跳过 JWT 校验 */
export const IS_PUBLIC_KEY = 'is_public';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * 从 request 上取出当前登录用户（由 JwtAuthGuard 注入）。
 * 用法：findProfile(@CurrentUser() user: AuthUser)
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: AuthUser = request.user;
    return data ? user?.[data] : user;
  },
);

/** JWT 载荷解析后挂到 request.user 上的结构 */
export interface AuthUser {
  userId: number;
  openid: string;
  roles: string[];
  permissions: string[];
}
