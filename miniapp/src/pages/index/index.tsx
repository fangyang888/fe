import { View, Text, Input, ScrollView, Swiper, SwiperItem, Image, Button } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { useRef, useState } from 'react'
import { apiGetHome, apiGetProducts, HomeData, Product } from '../../api/home'
import { addToCart } from '../../store/cartStore'
import { track, trackPageView } from '../../utils/tracker'
import { PageHeading, Icon, EmptyState, ProductImage } from '../../components/ui'
import { hasProductImage } from '../../utils/media'
import hero from '../../assets/images/lifestyle-hero.jpg'
import './index.scss'

export default function Index() {
  const [home, setHome] = useState<HomeData>({ banners: [], categories: [], recommendProducts: [] })
  const [products, setProducts] = useState<Product[]>([])
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState<number>()
  const [browsing, setBrowsing] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [adding, setAdding] = useState<number>()
  const requestId = useRef(0)

  const loadHome = async () => {
    const id = ++requestId.current
    setLoading(true)
    setFailed(false)
    try {
      const data = await apiGetHome()
      if (id !== requestId.current) return
      setHome(data)
      setProducts(data.recommendProducts)
      setTotal(data.recommendProducts.length)
      setBrowsing(false)
    } catch { if (id === requestId.current) setFailed(true) }
    finally { if (id === requestId.current) setLoading(false) }
  }
  useLoad(() => { loadHome(); trackPageView('/pages/index/index') })

  const browse = async (categoryId: number | undefined, term = keyword, nextPage = 1) => {
    const id = ++requestId.current
    setCategory(categoryId)
    setBrowsing(true)
    setLoading(true)
    setPage(nextPage)
    setFailed(false)
    try {
      const result = await apiGetProducts({ categoryId, keyword: term.trim() || undefined, page: nextPage, pageSize: 20 })
      if (id !== requestId.current) return
      setProducts(prev => nextPage === 1 ? result.list : [...prev, ...result.list])
      setTotal(result.total)
      setPage(nextPage)
    } catch { if (id === requestId.current) setFailed(true) }
    finally { if (id === requestId.current) setLoading(false) }
  }
  const goDetail = (id: number) => {
    track('product_click', { productId: id, from: 'home' })
    Taro.navigateTo({ url: `/pages/product-detail/index?id=${id}` })
  }
  const add = async (product: Product) => {
    if (adding !== undefined || product.stock === 0) return
    setAdding(product.id)
    try { track('add_to_cart', { productId: product.id, price: product.price, from: 'home' }); await addToCart(product.id) }
    finally { setAdding(undefined) }
  }
  const openBanner = (link?: string) => {
    if (!link || !/^\/pages\/[a-z-]+\/index(?:\?|$)/.test(link)) return
    const route = link.split('?')[0]
    if (['/pages/index/index', '/pages/cart/index', '/pages/mine/index'].includes(route)) Taro.switchTab({ url: route })
    else Taro.navigateTo({ url: link })
  }

  const banners = home.banners.filter(banner => hasProductImage(banner.image))

  return <View className='home-page'>
    <PageHeading title='把喜欢，带进生活' subtitle='发现日常里的好东西' />
    <View className='search-bar'>
      <Icon name='search' />
      <Input className='search-input' value={keyword} placeholder='搜索心仪好物' confirmType='search' onInput={e => setKeyword(e.detail.value)} onConfirm={() => browse(category)} />
      {keyword && <Button className='search-clear' onClick={() => { setKeyword(''); browse(category, '') }}>清除</Button>}
      <Button className='search-submit' onClick={() => browse(category)}>搜索</Button>
    </View>
    <Swiper className='banner-swiper' current={0} autoplay={false} circular indicatorDots={banners.length > 1} indicatorColor='rgba(255,255,255,.65)' indicatorActiveColor='#244a3d'>
      {banners.length === 0 && <SwiperItem><Image className='banner-image' src={hero} mode='aspectFill' /></SwiperItem>}
      {banners.map(banner => <SwiperItem key={banner.id}><View className='banner-content' onClick={() => openBanner(banner.link)}><ProductImage className='banner-image' src={banner.image} />{banner.title && <Text className='banner-title'>{banner.title}</Text>}</View></SwiperItem>)}
    </Swiper>
    <ScrollView className='category-tabs' scrollX showScrollbar={false}>
      <View className={`category-tab ${category === undefined ? 'active' : ''}`} onClick={() => browse(undefined, keyword)}><Text>全部</Text></View>
      {home.categories.map(item => <View className={`category-tab ${category === item.id ? 'active' : ''}`} key={item.id} onClick={() => browse(item.id)}><Text>{item.name}</Text></View>)}
    </ScrollView>
    <View className='recommend-section'>
      <View className='section-title'><Text className='title-text'>{browsing ? '发现好物' : '为你推荐'}</Text>{!browsing ? <View className='more-link' onClick={() => browse(category)}><Text>查看全部</Text><Icon name='chevron' /></View> : <Text className='result-count'>共 {total} 件</Text>}</View>
      {loading && page === 1 ? <View className='loading'>正在寻找好物…</View> : failed ? <EmptyState title='暂时未能加载' description='请检查网络后重试' action='重新加载' onAction={() => browsing ? browse(category) : loadHome()} /> : products.length === 0 ? <EmptyState icon='search' title='还没有找到合适的好物' description='换个关键词，或看看其他分类' /> : <View className='product-grid'>
        {products.map(product => <View className='product-card' key={product.id}>
          <ProductImage className='product-image' src={product.image} onClick={() => goDetail(product.id)} />
          <View className='product-info'><Text className='product-name' onClick={() => goDetail(product.id)}>{product.name}</Text>
            <Text className='product-sales'>{product.stock === 0 ? '暂时缺货' : '已售 ' + (product.sales >= 10000 ? `${(product.sales / 10000).toFixed(1)}万` : product.sales)}</Text>
            <View className='product-bottom'><View className='product-price-row'><Text className='price-value'>¥{product.price}</Text>{!!product.originalPrice && product.originalPrice > product.price && <Text className='original-price'>¥{product.originalPrice}</Text>}</View><Button ariaLabel={`添加${product.name}到购物车`} className={`home-add-cart-btn ${product.stock === 0 ? 'is-disabled' : ''}`} disabled={adding !== undefined || product.stock === 0} onClick={() => add(product)}><Icon name='plus' /></Button></View>
          </View>
        </View>)}
      </View>}
      {browsing && products.length < total && !failed && <Button className='load-more' disabled={loading} onClick={() => browse(category, keyword, page + 1)}>{loading ? '加载中…' : '加载更多'}</Button>}
      {products.length > 0 && !loading && <Text className='end-note'>把日常，过成喜欢的模样</Text>}
    </View>
  </View>
}
