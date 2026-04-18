/**
 * IPTV 公开直播源列表 - 数据源配置
 * 这里收录了多个知名的公开 IPTV 源地址
 */

const SOURCES = [
  // iptv-org 项目 - 全球最大的公开 IPTV 源
  {
    name: 'IPTV-ORG 全部频道',
    url: 'https://iptv-org.github.io/iptv/index.m3u',
    category: 'global',
  },
  {
    name: 'IPTV-ORG 中国频道',
    url: 'https://iptv-org.github.io/iptv/countries/cn.m3u',
    category: 'china',
  },
  {
    name: 'IPTV-ORG 香港频道',
    url: 'https://iptv-org.github.io/iptv/countries/hk.m3u',
    category: 'hongkong',
  },
  {
    name: 'IPTV-ORG 台湾频道',
    url: 'https://iptv-org.github.io/iptv/countries/tw.m3u',
    category: 'taiwan',
  },
  // 按分类
  {
    name: 'IPTV-ORG 新闻频道',
    url: 'https://iptv-org.github.io/iptv/categories/news.m3u',
    category: 'news',
  },
  {
    name: 'IPTV-ORG 体育频道',
    url: 'https://iptv-org.github.io/iptv/categories/sports.m3u',
    category: 'sports',
  },
  {
    name: 'IPTV-ORG 娱乐频道',
    url: 'https://iptv-org.github.io/iptv/categories/entertainment.m3u',
    category: 'entertainment',
  },
  {
    name: 'IPTV-ORG 电影频道',
    url: 'https://iptv-org.github.io/iptv/categories/movies.m3u',
    category: 'movies',
  },
  {
    name: 'IPTV-ORG 音乐频道',
    url: 'https://iptv-org.github.io/iptv/categories/music.m3u',
    category: 'music',
  },
  {
    name: 'IPTV-ORG 儿童频道',
    url: 'https://iptv-org.github.io/iptv/categories/kids.m3u',
    category: 'kids',
  },
  // 按语言
  {
    name: 'IPTV-ORG 中文频道',
    url: 'https://iptv-org.github.io/iptv/languages/zho.m3u',
    category: 'chinese',
  },
  {
    name: 'IPTV-ORG 英文频道',
    url: 'https://iptv-org.github.io/iptv/languages/eng.m3u',
    category: 'english',
  },
  {
    name: 'IPTV-ORG 日文频道',
    url: 'https://iptv-org.github.io/iptv/languages/jpn.m3u',
    category: 'japanese',
  },
  {
    name: 'IPTV-ORG 韩文频道',
    url: 'https://iptv-org.github.io/iptv/languages/kor.m3u',
    category: 'korean',
  },

  // fanmingming - 国内社区维护，稳定性较高
  {
    name: 'fanmingming 直播源(IPv6)',
    url: 'https://live.fanmingming.com/tv/m3u/ipv6.m3u',
    category: 'china',
  },
  {
    name: 'fanmingming 直播源(IPv4)',
    url: 'https://live.fanmingming.com/tv/m3u/index.m3u',
    category: 'china',
  },

  // YueChan - 社区维护
  {
    name: 'YueChan 全部频道',
    url: 'https://ghproxy.com/https://raw.githubusercontent.com/YueChan/Live/main/IPTV.m3u',
    category: 'china',
  },

  // suxuang myIPTV
  {
    name: 'suxuang myIPTV(IPv6)',
    url: 'https://ghproxy.com/https://raw.githubusercontent.com/suxuang/myIPTV/main/ipv6.m3u',
    category: 'china',
  },

  // vbskycn - 定期更新
  {
    name: 'vbskycn 直播源(iptv4)',
    url: 'https://ghproxy.com/https://raw.githubusercontent.com/vbskycn/iptv/master/tv/iptv4.m3u',
    category: 'china',
  },
  {
    name: 'vbskycn 直播源(iptv6)',
    url: 'https://ghproxy.com/https://raw.githubusercontent.com/vbskycn/iptv/master/tv/iptv6.m3u',
    category: 'china',
  },

  // Guovin iptv-api - 自动更新，质量较高
  {
    name: 'Guovin IPTV API 直播源',
    url: 'https://ghproxy.com/https://raw.githubusercontent.com/Guovin/iptv-api/gd/output/result.m3u',
    category: 'china',
  },
];

module.exports = SOURCES;
