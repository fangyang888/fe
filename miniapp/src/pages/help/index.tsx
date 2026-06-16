import { View, Text } from '@tarojs/components'
import { useState } from 'react'
import './index.scss'

const FAQ = [
  {
    q: '如何修改收货地址?',
    a: '进入「我的 - 收货地址」，可新增、编辑、删除地址，也可设置默认地址。',
  },
  {
    q: '下单后多久发货?',
    a: '付款成功后一般 48 小时内发货，节假日可能顺延，请以实际物流为准。',
  },
  {
    q: '如何申请退款/售后?',
    a: '在「我的订单」中找到对应订单，进入详情点击申请售后，按提示操作即可。',
  },
  {
    q: '优惠券怎么使用?',
    a: '结算时系统会自动匹配可用优惠券，满足使用门槛即可抵扣。',
  },
  {
    q: '收藏的商品在哪里查看?',
    a: '进入「我的 - 我的收藏」可查看全部收藏商品，并可直接加入购物车。',
  },
]

export default function HelpPage() {
  const [open, setOpen] = useState<number | null>(0)

  const toggle = (i: number) => setOpen(open === i ? null : i)

  return (
    <View className='help-page'>
      <View className='banner'>
        <Text className='banner-title'>常见问题</Text>
        <Text className='banner-sub'>遇到问题先看看这里</Text>
      </View>

      <View className='faq-list'>
        {FAQ.map((item, i) => (
          <View className='faq-item' key={i}>
            <View className='faq-q' onClick={() => toggle(i)}>
              <Text className='q-text'>{item.q}</Text>
              <Text className='q-arrow'>{open === i ? '−' : '+'}</Text>
            </View>
            {open === i && (
              <View className='faq-a'>
                <Text className='a-text'>{item.a}</Text>
              </View>
            )}
          </View>
        ))}
      </View>

      <View className='contact'>
        <Text className='contact-title'>还有疑问?</Text>
        <Text className='contact-info'>客服热线：400-000-0000</Text>
        <Text className='contact-info'>服务时间：09:00 - 21:00</Text>
      </View>
    </View>
  )
}
