import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '../../auth/decorators';

// 必须在 JwtAuthGuard 之后运行；只能使用已验证 JWT 的身份，不能相信请求体中的 userId。
@Injectable()
export class ElkOperatorGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.config.get<string>('ELK_MCP_ENABLED') !== 'true') {
      throw new ServiceUnavailableException('ELK Agent 尚未启用。');
    }
    if ((this.config.get<string>('JWT_SECRET') ?? '').length < 32) {
      throw new ServiceUnavailableException(
        '启用 ELK 前必须配置至少 32 位随机 JWT_SECRET，不能使用开发默认密钥。',
      );
    }
    const owner = Number(this.config.get<string>('ELK_MCP_OPERATOR_USER_ID'));
    if (!Number.isSafeInteger(owner) || owner <= 0) {
      throw new ServiceUnavailableException('尚未配置 ELK 会话的唯一操作者。');
    }
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (request.user?.userId !== owner)
      throw new ForbiddenException('当前账号无权使用此 Kibana 会话。');
    return true;
  }
}
