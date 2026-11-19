export enum PAY_CHANNEL {
    WECHAT = 1,
    ALIPAY = 2,
}

export interface PayChannelItem {
    type: PAY_CHANNEL;
    name: string;
    icon: string;
    is_default: boolean;
}

export interface ProductDetail {
    id: number;
    name: string;
    product_key: string;
    price: number;
    btn_text: string;
    pay_channels: PayChannelItem[];
}

export interface OrderParams {
    product_id: number;
    product_key: string;
    pay_channel: PAY_CHANNEL;
    price: number;
    scene_key: string;
}

export interface OrderData {
    trade_no: string;
    pay_uri: string;
    sign: string;
    pay_channel: PAY_CHANNEL;
}

export interface VerifyParams {
    trade_no: string;
    product_key: string;
    pay_channel: PAY_CHANNEL;
    amount: number;
}
