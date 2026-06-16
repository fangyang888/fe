import { View, Text, Input, Switch } from '@tarojs/components'
import Taro, { useRouter, useLoad } from '@tarojs/taro'
import { useState } from 'react'
import {
  apiGetAddresses,
  apiCreateAddress,
  apiUpdateAddress,
} from '../../api/address'
import './index.scss'

interface Form {
  name: string
  phone: string
  province: string
  city: string
  district: string
  detail: string
  isDefault: boolean
}

const EMPTY: Form = {
  name: '',
  phone: '',
  province: '',
  city: '',
  district: '',
  detail: '',
  isDefault: false,
}

export default function AddressEdit() {
  const router = useRouter()
  const editId = router.params.id ? Number(router.params.id) : undefined
  const [form, setForm] = useState<Form>(EMPTY)

  useLoad(() => {
    if (editId) {
      // 列表接口拿到后回填（地址量小，直接复用列表）
      apiGetAddresses()
        .then((list) => {
          const a = list.find((x) => x.id === editId)
          if (a) {
            setForm({
              name: a.name,
              phone: a.phone,
              province: a.province || '',
              city: a.city || '',
              district: a.district || '',
              detail: a.detail,
              isDefault: a.isDefault === 1,
            })
          }
        })
        .catch(() => {})
    }
  })

  const setField = (key: keyof Form, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const submit = async () => {
    if (!form.name.trim()) {
      Taro.showToast({ title: '请填写收货人', icon: 'none' })
      return
    }
    if (!/^1\d{10}$/.test(form.phone)) {
      Taro.showToast({ title: '手机号格式不正确', icon: 'none' })
      return
    }
    if (!form.detail.trim()) {
      Taro.showToast({ title: '请填写详细地址', icon: 'none' })
      return
    }

    try {
      if (editId) {
        await apiUpdateAddress(editId, form)
      } else {
        await apiCreateAddress(form)
      }
      Taro.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 600)
    } catch {
      // 统一提示
    }
  }

  return (
    <View className='address-edit-page'>
      <View className='form-card'>
        <View className='form-row'>
          <Text className='label'>收货人</Text>
          <Input
            className='input'
            placeholder='请输入姓名'
            value={form.name}
            onInput={(e) => setField('name', e.detail.value)}
          />
        </View>
        <View className='form-row'>
          <Text className='label'>手机号</Text>
          <Input
            className='input'
            type='number'
            placeholder='请输入手机号'
            value={form.phone}
            onInput={(e) => setField('phone', e.detail.value)}
          />
        </View>
        <View className='form-row'>
          <Text className='label'>省份</Text>
          <Input
            className='input'
            placeholder='如 广东省'
            value={form.province}
            onInput={(e) => setField('province', e.detail.value)}
          />
        </View>
        <View className='form-row'>
          <Text className='label'>城市</Text>
          <Input
            className='input'
            placeholder='如 深圳市'
            value={form.city}
            onInput={(e) => setField('city', e.detail.value)}
          />
        </View>
        <View className='form-row'>
          <Text className='label'>区/县</Text>
          <Input
            className='input'
            placeholder='如 南山区'
            value={form.district}
            onInput={(e) => setField('district', e.detail.value)}
          />
        </View>
        <View className='form-row'>
          <Text className='label'>详细地址</Text>
          <Input
            className='input'
            placeholder='街道、楼牌号等'
            value={form.detail}
            onInput={(e) => setField('detail', e.detail.value)}
          />
        </View>
        <View className='form-row switch-row'>
          <Text className='label'>设为默认地址</Text>
          <Switch
            checked={form.isDefault}
            color='#ff5000'
            onChange={(e) => setField('isDefault', e.detail.value)}
          />
        </View>
      </View>

      <View className='save-btn' onClick={submit}>
        <Text className='save-text'>保存</Text>
      </View>
    </View>
  )
}
