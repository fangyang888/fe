export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/cart/index',
    'pages/mine/index',
    'pages/order-list/index',
    'pages/order-detail/index',
    'pages/address-list/index',
    'pages/address-edit/index',
    'pages/coupon/index',
    'pages/favorite/index',
    'pages/help/index',
    'pages/settings/index',
    'pages/profile/index',
    'pages/checkout/index',
    'pages/product-detail/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#f7f6f2',
    navigationBarTitleText: 'FZ 商城',
    navigationBarTextStyle: 'black'
  },
  tabBar: {
    color: '#7f8983',
    selectedColor: '#244a3d',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '首页',
        iconPath: 'assets/tabbar/home.png',
        selectedIconPath: 'assets/tabbar/home-active.png'
      },
      {
        pagePath: 'pages/cart/index',
        text: '购物车',
        iconPath: 'assets/tabbar/cart.png',
        selectedIconPath: 'assets/tabbar/cart-active.png'
      },
      {
        pagePath: 'pages/mine/index',
        text: '我的',
        iconPath: 'assets/tabbar/mine.png',
        selectedIconPath: 'assets/tabbar/mine-active.png'
      }
    ]
  }
})
