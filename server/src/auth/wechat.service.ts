import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface WxSession {
  openid: string;
  session_key: string;
  unionid?: string;
}

/**
 * 封装微信小程序服务端接口调用。
 */
@Injectable()
export class WechatService {
  constructor(private readonly config: ConfigService) {}

  /**
   * 用 wx.login 返回的 code 换取 openid / session_key。
   * 文档: https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-login/code2Session.html
   */
  async code2Session(code: string): Promise<WxSession> {
    const appid = this.config.get<string>('WX_APPID');
    const secret = this.config.get<string>('WX_SECRET');

    // 本地开发兜底：未配微信密钥且非生产环境时，返回固定 dev openid，
    // 让前端无需真实小程序即可跑通登录。生产环境必须配齐，否则报错。
    if (!appid || !secret) {
      if (process.env.NODE_ENV === 'production') {
        throw new InternalServerErrorException('缺少 WX_APPID / WX_SECRET 配置');
      }
      const devOpenid =
        this.config.get<string>('DEV_OPENID') || 'dev_openid_0001';
      console.warn(
        `[WechatService] 未配置 WX_APPID/WX_SECRET，使用开发兜底 openid=${devOpenid}`,
      );
      return { openid: devOpenid, session_key: 'dev' };
    }

    const url =
      `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}` +
      `&secret=${secret}&js_code=${code}&grant_type=authorization_code`;

    const res = await fetch(url);
    const data = (await res.json()) as WxSession & {
      errcode?: number;
      errmsg?: string;
    };

    if (data.errcode) {
      throw new InternalServerErrorException(
        `微信登录失败: ${data.errcode} ${data.errmsg}`,
      );
    }
    return data;
  }

  /**
   * 用 getPhoneNumber 回调里的 code 换取手机号。
   * 需要 access_token，这里简化为每次现取；生产建议缓存 access_token。
   * 文档: https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-info/phone-number/getPhoneNumber.html
   */
  async getPhoneNumber(code: string): Promise<string> {
    const token = await this.getAccessToken();
    const res = await fetch(
      `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      },
    );
    const data = (await res.json()) as {
      errcode: number;
      errmsg: string;
      phone_info?: { phoneNumber: string };
    };
    if (data.errcode !== 0 || !data.phone_info) {
      throw new InternalServerErrorException(`获取手机号失败: ${data.errmsg}`);
    }
    return data.phone_info.phoneNumber;
  }

  private async getAccessToken(): Promise<string> {
    const appid = this.config.get<string>('WX_APPID');
    const secret = this.config.get<string>('WX_SECRET');
    const res = await fetch(
      `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`,
    );
    const data = (await res.json()) as {
      access_token?: string;
      errcode?: number;
      errmsg?: string;
    };
    if (!data.access_token) {
      throw new InternalServerErrorException(
        `获取 access_token 失败: ${data.errmsg}`,
      );
    }
    return data.access_token;
  }
}
