import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * 极简 JWT(HS256)实现，零外部依赖。
 * 仅依赖 Node 内置 crypto，避免引入 @nestjs/jwt。
 * 如需更完整功能（多算法、kid 等），可后续换成 @nestjs/jwt。
 */
@Injectable()
export class TokenService {
  constructor(private readonly config: ConfigService) {}

  private get secret(): string {
    return this.config.get<string>('JWT_SECRET', 'dev-secret-change-me');
  }

  /** 过期秒数，默认 7 天 */
  private get expiresInSec(): number {
    return Number(this.config.get<string>('JWT_EXPIRES_IN_SEC', '604800'));
  }

  private base64url(input: Buffer | string): string {
    return Buffer.from(input)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  sign(payload: Record<string, any>): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const body = { ...payload, iat: now, exp: now + this.expiresInSec };

    const encHeader = this.base64url(JSON.stringify(header));
    const encBody = this.base64url(JSON.stringify(body));
    const data = `${encHeader}.${encBody}`;
    const sig = this.base64url(
      crypto.createHmac('sha256', this.secret).update(data).digest(),
    );
    return `${data}.${sig}`;
  }

  verify<T = any>(token: string): T {
    const parts = token.split('.');
    if (parts.length !== 3) throw new UnauthorizedException('token 格式错误');
    const [encHeader, encBody, sig] = parts;
    const expected = this.base64url(
      crypto
        .createHmac('sha256', this.secret)
        .update(`${encHeader}.${encBody}`)
        .digest(),
    );
    // 防时序攻击的等长比较
    if (
      sig.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    ) {
      throw new UnauthorizedException('token 签名无效');
    }
    const payload = JSON.parse(
      Buffer.from(encBody, 'base64').toString('utf-8'),
    );
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      throw new UnauthorizedException('token 已过期');
    }
    return payload as T;
  }
}
