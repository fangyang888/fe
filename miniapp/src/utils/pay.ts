import Taro from '@tarojs/taro'
import { apiPayOrder, apiUpdateOrderStatus } from '../api/order'

export type PayResult = 'success' | 'cancel' | 'fail'

/**
 * 发起微信支付。
 * 1. 向后端请求 wx.requestPayment 参数
 * 2. 调起微信收银台
 * 3. 返回支付结果
 *
 * 本地开发兜底：后端未配商户号时返回 { mock: true }，此处跳过真实拉起，
 * 直接调用状态接口把订单置为已付款，方便联调。
 */
export async function payOrder(orderId: number): Promise<PayResult> {
  let params
  try {
    params = await apiPayOrder(orderId)
  } catch {
    // request 封装里已弹 toast
    return 'fail'
  }

  // 开发兜底：模拟支付成功
  if (params.mock) {
    try {
      await apiUpdateOrderStatus(orderId, 'unshipped')
      Taro.showToast({ title: '支付成功(模拟)', icon: 'success' })
      return 'success'
    } catch {
      return 'fail'
    }
  }

  try {
    await Taro.requestPayment({
      timeStamp: params.timeStamp,
      nonceStr: params.nonceStr,
      package: params.package,
      signType: params.signType,
      paySign: params.paySign,
    })
    Taro.showToast({ title: '支付成功', icon: 'success' })
    return 'success'
  } catch (err: any) {
    // 用户取消
    if (err?.errMsg && /cancel/i.test(err.errMsg)) {
      Taro.showToast({ title: '已取消支付', icon: 'none' })
      return 'cancel'
    }
    Taro.showToast({ title: '支付失败', icon: 'none' })
    return 'fail'
  }
}
