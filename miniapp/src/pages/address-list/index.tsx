import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import {
  apiGetAddresses,
  apiSetDefaultAddress,
  apiRemoveAddress,
  Address,
} from '../../api/address'
import './index.scss'

export default function AddressList() {
  const [list, setList] = useState<Address[]>([])

  const load = async () => {
    try {
      setList(await apiGetAddresses())
    } catch {
      // 统一提示
    }
  }

  useDidShow(() => {
    load()
  })

  const goEdit = (id?: number) => {
    Taro.navigateTo({
      url: `/pages/address-edit/index${id ? `?id=${id}` : ''}`,
    })
  }

  const setDefault = async (id: number) => {
    await apiSetDefaultAddress(id)
    load()
  }

  const remove = async (id: number) => {
    const res = await Taro.showModal({ title: '提示', content: '确定删除该地址?' })
    if (res.confirm) {
      await apiRemoveAddress(id)
      load()
    }
  }

  return (
    <View className='address-list-page'>
      {list.length === 0 ? (
        <View className='empty'>
          <Text className='empty-icon'>📍</Text>
          <Text className='empty-text'>还没有收货地址</Text>
        </View>
      ) : (
        <View className='list'>
          {list.map((addr) => (
            <View className='addr-card' key={addr.id}>
              <View className='addr-main' onClick={() => goEdit(addr.id)}>
                <View className='addr-line1'>
                  <Text className='addr-name'>{addr.name}</Text>
                  <Text className='addr-phone'>{addr.phone}</Text>
                  {addr.isDefault === 1 && (
                    <View className='default-tag'>
                      <Text className='default-tag-text'>默认</Text>
                    </View>
                  )}
                </View>
                <Text className='addr-detail'>
                  {[addr.province, addr.city, addr.district, addr.detail]
                    .filter(Boolean)
                    .join(' ')}
                </Text>
              </View>
              <View className='addr-actions'>
                <Text
                  className='action-btn'
                  onClick={() => setDefault(addr.id)}
                >
                  {addr.isDefault === 1 ? '✅ 默认' : '设为默认'}
                </Text>
                <Text className='action-btn' onClick={() => goEdit(addr.id)}>
                  编辑
                </Text>
                <Text
                  className='action-btn danger'
                  onClick={() => remove(addr.id)}
                >
                  删除
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <View className='add-btn' onClick={() => goEdit()}>
        <Text className='add-text'>+ 新增收货地址</Text>
      </View>
    </View>
  )
}
