import { View, Text, Image, Button } from '@tarojs/components'
import { useState } from 'react'
import { icons, IconName } from './icons'
import { hasProductImage, resolveImage } from '../../utils/media'
import './index.scss'

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return <Image className={`ui-icon ${className}`} src={icons[name]} mode='aspectFit' />
}

export function PageHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return <View className='page-heading'><Text className='page-heading-title'>{title}</Text>{subtitle && <Text className='page-heading-subtitle'>{subtitle}</Text>}</View>
}

export function EmptyState({ icon = 'bag', title, description, action, onAction }: {
  icon?: IconName; title: string; description?: string; action?: string; onAction?: () => void
}) {
  return <View className='ui-empty'><View className='ui-empty-symbol'><Icon name={icon} /></View><Text className='ui-empty-title'>{title}</Text>{description && <Text className='ui-empty-description'>{description}</Text>}{action && onAction && <Button className='ui-empty-action' onClick={onAction}>{action}</Button>}</View>
}

export function ProductImage({ src, className = '', onClick }: { src?: string; className?: string; onClick?: () => void }) {
  const [failedSrc, setFailedSrc] = useState<string>()
  return hasProductImage(src) && failedSrc !== src
    ? <Image className={className} src={resolveImage(src) || ''} mode='aspectFill' lazyLoad onError={() => setFailedSrc(src)} onClick={onClick} />
    : <View className={`ui-image-placeholder ${className}`} onClick={onClick}><Icon name='bag' /><Text>商品图片</Text></View>
}
