import { View, Text, Image, Button, Input, Picker } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useRef, useState } from 'react'
import { apiBindPhone, apiUpdateProfile, apiUploadAvatar, UserInfo } from '../../api/user'
import { cacheUserInfo, getUserInfo, getToken, isLoggedIn, refreshUserInfo } from '../../store/userStore'
import { EmptyState, PageHeading, Icon } from '../../components/ui'
import './index.scss'

const GENDERS = ['保密', '男', '女']
const maskPhone = (phone?: string) => phone ? phone.replace(/^(\d{3})\d+(\d{4})$/, '$1****$2') : '未绑定'

export default function Profile() {
  const [user, setUser] = useState<UserInfo | null>(getUserInfo())
  const [nickname, setNickname] = useState(user?.nickname || '')
  const [avatar, setAvatar] = useState(user?.avatar?.startsWith('https://') ? user.avatar : '')
  const [gender, setGender] = useState(user?.gender || 0)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const operation = useRef(false)
  const initialized = useRef(false)
  const dirty = useRef(false)

  useDidShow(() => {
    if (!isLoggedIn()) { setUser(null); return }
    if (initialized.current) return
    initialized.current = true
    refreshUserInfo().then((latest) => {
      if (!latest) return
      setUser(latest)
      if (!dirty.current) {
        setNickname(latest.nickname || '')
        setAvatar(latest.avatar?.startsWith('https://') ? latest.avatar : '')
        setGender(latest.gender || 0)
      }
    })
  })

  const chooseAvatar = async (event: { detail: { avatarUrl: string } }) => {
    if (!event.detail.avatarUrl || operation.current) return
    operation.current = true
    setBusy('avatar')
    setError('')
    dirty.current = true
    try { setAvatar(await apiUploadAvatar(event.detail.avatarUrl)) }
    catch (err) { setError(err instanceof Error ? err.message : '头像上传失败，请重试') }
    finally { operation.current = false; setBusy('') }
  }

  const bindPhone = async (event: { detail: { code?: string; errMsg?: string } }) => {
    if (operation.current) return
    if (!event.detail.code) {
      setError(event.detail.errMsg?.includes('deny') || event.detail.errMsg?.includes('cancel') ? '已取消授权，手机号未改变' : '未获取到授权，请在微信中重试')
      return
    }
    operation.current = true
    setBusy('phone')
    setError('')
    const token = getToken()
    try {
      const { phone } = await apiBindPhone(event.detail.code)
      if (getToken() !== token) return
      const cached = getUserInfo()
      if (cached) cacheUserInfo({ ...cached, phone }, token)
      setUser((current) => current ? { ...current, phone } : current)
      Taro.showToast({ title: '手机号已绑定', icon: 'success' })
    } catch { setError('绑定未完成，请重新授权') }
    finally { operation.current = false; setBusy('') }
  }

  const save = async () => {
    if (operation.current) return
    const name = nickname.trim()
    if (!name || Array.from(name).length > 30) { setError('昵称须为 1–30 个字符'); return }
    operation.current = true
    setBusy('save')
    setError('')
    const token = getToken()
    try {
      const updated = await apiUpdateProfile({ nickname: name, gender, ...(avatar ? { avatar } : {}) })
      if (getToken() !== token) return
      cacheUserInfo(updated, token)
      setUser(updated)
      setNickname(updated.nickname || name)
      dirty.current = false
      Taro.showToast({ title: '资料已保存', icon: 'success' })
    } catch { setError('保存失败，请检查网络后重试') }
    finally { operation.current = false; setBusy('') }
  }

  return (
    <View className='profile-page'>
      <PageHeading title='关于你的日常' subtitle='让每一次相遇，更熟悉一点' />
      {!user ? <EmptyState icon='user' title='登录后完善资料' description='管理你的头像、昵称和手机号' action='去登录' onAction={() => Taro.switchTab({ url: '/pages/mine/index' })} /> : <>
        <View className='profile-card'>
          <View className='profile-avatar-row'>
            <View><Text className='profile-label'>头像</Text><Text className='profile-hint'>{busy === 'avatar' ? '正在上传…' : '点击头像更换，保存后生效'}</Text></View>
            <Button className='profile-avatar-button' openType='chooseAvatar' onChooseAvatar={chooseAvatar} disabled={!!busy}>
              {avatar ? <Image className='profile-avatar' src={avatar} mode='aspectFill' /> : <Icon name='user' />}
            </Button>
          </View>
          <View className='profile-row'><Text className='profile-label'>昵称</Text><Input className='profile-input' type='nickname' value={nickname} maxlength={30} disabled={!!busy} placeholder='填写你喜欢的名字' onInput={(event) => { dirty.current = true; setNickname(event.detail.value); setError('') }} /></View>
          <View className='profile-row'><Text className='profile-label'>性别</Text><Picker className='profile-picker' mode='selector' range={GENDERS} value={gender} disabled={!!busy} onChange={(event) => { dirty.current = true; setGender(Number(event.detail.value)) }}><Text>{GENDERS[gender]}　›</Text></Picker></View>
        </View>
        <View className='profile-card profile-phone'>
          <View><Text className='profile-label'>手机号</Text><Text className='profile-phone-number'>{maskPhone(user.phone)}</Text></View>
          {process.env.TARO_ENV === 'weapp' ? <Button className='profile-bind' openType='getPhoneNumber' onGetPhoneNumber={bindPhone} disabled={!!busy} loading={busy === 'phone'}>{user.phone ? '更换手机号' : '授权绑定'}</Button> : <Text className='profile-hint'>请在微信小程序内授权绑定</Text>}
        </View>
        <Text className='profile-note'>手机号仅在你同意微信授权后绑定；取消授权不会修改现有号码。</Text>
        {!!error && <Text className='profile-error'>{error}</Text>}
        <Button className='profile-save' disabled={!!busy} loading={busy === 'save'} onClick={save}>{busy === 'save' ? '正在保存…' : '保存资料'}</Button>
      </>}
    </View>
  )
}
