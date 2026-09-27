import { View, Text } from '@tarojs/components'
import { useState } from 'react'
import { PageHeading } from '../../components/ui'
import './index.scss'

const FAQ = [
  {
    q: '如何修改收货地址?',
    a: '进入「我的 - 收货地址」，可新增、编辑、删除地址，也可设置默认地址。',
  },
  {
    q: '下单后多久发货?',
    a: '付款后可在「我的订单」查看发货状态，具体发货时间以商家实际安排为准。',
  },
  {
    q: '如何申请退款/售后?',
    a: '请先在「我的订单」中找到对应订单，保留订单编号，与商家确认退款或售后处理方式。',
  },
  {
    q: '优惠券怎么使用?',
    a: '在「我的 - 优惠券」查看使用门槛与有效期，实际优惠与抵扣金额以订单结算结果为准。',
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
      <PageHeading title='很高兴为你解答' subtitle='关于购物，你想了解的都在这里' />

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

      <View className='contact'><Text className='contact-info'>更多问题，可通过订单信息与商家沟通</Text></View>
    </View>
  )
}
