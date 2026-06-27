import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Order } from './order.entity';

/** 前端 wx.requestPayment 所需参数 */
export interface JsapiPayParams {
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: 'RSA';
  paySign: string;
  /** 本地开发兜底标记：为 true 时前端跳过真实拉起、直接当作支付成功 */
  mock?: boolean;
}

const WXPAY_HOST = 'https://api.mch.weixin.qq.com';
const JSAPI_PATH = '/v3/pay/transactions/jsapi';

/**
 * 微信支付 V3（小程序 JSAPI）。
 * 文档: https://pay.weixin.qq.com/docs/merchant/apis/mini-program-payment/mini-prepay.html
 *
 * 本地开发兜底：未配齐商户参数且非生产环境时，返回 { mock: true }，
 * 前端据此跳过真实支付、直接走成功流程，方便没有商户号时联调。
 */
@Injectable()
export class PayService {
  private readonly logger = new Logger(PayService.name);

  constructor(private readonly config: ConfigService) {}

  private get cfg() {
    return {
      appid: this.config.get<string>('WX_APPID'),
      mchid: this.config.get<string>('WXPAY_MCHID'),
      apiV3Key: this.config.get<string>('WXPAY_API_V3_KEY'),
      serialNo: this.config.get<string>('WXPAY_SERIAL_NO'),
      // 商户 API 私钥（PEM）。支持直接放内容或放文件路径里读出来的内容。
      privateKey: this.config
        .get<string>('WXPAY_PRIVATE_KEY', '')
        .replace(/\\n/g, '\n'),
      notifyUrl: this.config.get<string>('WXPAY_NOTIFY_URL'),
    };
  }

  private isConfigured(): boolean {
    const c = this.cfg;
    return Boolean(
      c.appid && c.mchid && c.apiV3Key && c.serialNo && c.privateKey && c.notifyUrl,
    );
  }

  /** 生成 JSAPI 支付参数（含本地兜底） */
  async createJsapiPayment(order: Order, openid: string): Promise<JsapiPayParams> {
    const c = this.cfg;

    if (!this.isConfigured()) {
      if (process.env.NODE_ENV === 'production') {
        throw new BadRequestException('微信支付未配置，无法发起支付');
      }
      this.logger.warn(
        `[PayService] 未配置微信支付参数，使用开发兜底（mock）orderNo=${order.orderNo}`,
      );
      return {
        timeStamp: String(Math.floor(Date.now() / 1000)),
        nonceStr: crypto.randomBytes(16).toString('hex'),
        package: 'prepay_id=mock',
        signType: 'RSA',
        paySign: 'mock',
        mock: true,
      };
    }

    const prepayId = await this.unifiedOrder(order, openid);

    // 用 prepay_id 组装并签名前端调起参数
    const timeStamp = String(Math.floor(Date.now() / 1000));
    const nonceStr = crypto.randomBytes(16).toString('hex');
    const packageStr = `prepay_id=${prepayId}`;
    const signMessage = `${c.appid}\n${timeStamp}\n${nonceStr}\n${packageStr}\n`;
    const paySign = this.rsaSign(signMessage, c.privateKey!);

    return { timeStamp, nonceStr, package: packageStr, signType: 'RSA', paySign };
  }

  /** JSAPI 统一下单，返回 prepay_id */
  private async unifiedOrder(order: Order, openid: string): Promise<string> {
    const c = this.cfg;
    const body = JSON.stringify({
      appid: c.appid,
      mchid: c.mchid,
      description: `订单 ${order.orderNo}`,
      out_trade_no: order.orderNo,
      notify_url: c.notifyUrl,
      // 单位：分。订单 totalAmount 以元(int)存储。
      amount: { total: Math.round(order.totalAmount * 100), currency: 'CNY' },
      payer: { openid },
    });

    const authorization = this.buildAuthHeader('POST', JSAPI_PATH, body);

    const res = await fetch(`${WXPAY_HOST}${JSAPI_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: authorization,
      },
      body,
    });

    const text = await res.text();
    if (res.status !== 200) {
      this.logger.error(`微信下单失败 ${res.status}: ${text}`);
      throw new BadRequestException('微信下单失败');
    }
    const data = JSON.parse(text) as { prepay_id?: string };
    if (!data.prepay_id) {
      throw new BadRequestException('微信下单未返回 prepay_id');
    }
    return data.prepay_id;
  }

  /** 构造 V3 接口的 Authorization 头 */
  private buildAuthHeader(method: string, urlPath: string, body: string): string {
    const c = this.cfg;
    const nonce = crypto.randomBytes(16).toString('hex');
    const timestamp = String(Math.floor(Date.now() / 1000));
    const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`;
    const signature = this.rsaSign(message, c.privateKey!);
    return (
      `WECHATPAY2-SHA256-RSA2048 ` +
      `mchid="${c.mchid}",` +
      `nonce_str="${nonce}",` +
      `signature="${signature}",` +
      `timestamp="${timestamp}",` +
      `serial_no="${c.serialNo}"`
    );
  }

  private rsaSign(message: string, privateKeyPem: string): string {
    return crypto
      .createSign('RSA-SHA256')
      .update(message)
      .sign(privateKeyPem, 'base64');
  }

  /**
   * 解密回调通知里的 resource（AES-256-GCM）。
   * 返回明文 JSON 字符串，调用方自行解析出 out_trade_no / trade_state。
   */
  decryptNotifyResource(resource: {
    ciphertext: string;
    associated_data?: string;
    nonce: string;
  }): any {
    const key = this.cfg.apiV3Key;
    if (!key) throw new BadRequestException('缺少 APIv3 密钥，无法解密回调');

    const data = Buffer.from(resource.ciphertext, 'base64');
    const authTag = data.subarray(data.length - 16);
    const cipherData = data.subarray(0, data.length - 16);

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(key, 'utf8'),
      Buffer.from(resource.nonce, 'utf8'),
    );
    decipher.setAuthTag(authTag);
    if (resource.associated_data) {
      decipher.setAAD(Buffer.from(resource.associated_data, 'utf8'));
    }
    const decrypted = Buffer.concat([
      decipher.update(cipherData),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(decrypted);
  }
}
