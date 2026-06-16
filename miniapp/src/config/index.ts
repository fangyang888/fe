/**
 * 前端运行时配置。根据编译环境切换 API 地址。
 * Taro 用 process.env.NODE_ENV 区分 dev / production。
 */
const ENV = process.env.NODE_ENV;

const config = {
  development: {
    // 微信开发者工具里需在「详情-本地设置」勾选「不校验合法域名」才能连 localhost
    baseUrl: 'http://127.0.0.1:3000',
  },
  production: {
    baseUrl: 'http://47.106.103.79', // TODO: 换成线上后端地址
  },
};

export const BASE_URL =
  ENV === 'production' ? config.production.baseUrl : config.development.baseUrl;

/** 本地缓存 key */
export const STORAGE_KEYS = {
  TOKEN: 'auth_token',
  USER_INFO: 'user_info',
};
