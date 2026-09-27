import kettle from '../assets/catalog/kettle.jpg'
import blanket from '../assets/catalog/blanket.jpg'
import mug from '../assets/catalog/mug.jpg'
import bowls from '../assets/catalog/bowls.jpg'
import hero from '../assets/images/lifestyle-hero.jpg'

// 首批生活家居素材随小程序打包，避免初次部署时静态图片尚未同步。
// 后台换成其他图片 URL 后会直接使用新的远程图片。
const catalogAssets: Record<string, string> = { 'kettle.jpg': kettle, 'blanket.jpg': blanket, 'mug.jpg': mug, 'bowls.jpg': bowls, 'hero.jpg': hero }
const catalogPrefix = 'https://fzmall.xyz/fe/catalog/lifestyle-v1/'
export const resolveImage = (src?: string) => src?.startsWith(catalogPrefix) ? catalogAssets[src.slice(catalogPrefix.length)] || src : src
export const LEGACY_PLACEHOLDER_IMAGE = 'https://img14.360buyimg.com/imagetools/jfs/t1/167902/2/8762/791358/603742d7E9b4275e3/e09d8f9a8bf4c0ef.png'
export const hasProductImage = (src?: string) => !!src && src !== LEGACY_PLACEHOLDER_IMAGE
