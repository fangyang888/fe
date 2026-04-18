# 📺 IPTV 直播源抓取工具

抓取公开的 IPTV 直播源并输出为 M3U 格式文件。

## 安装

```bash
cd iptv-grabber
npm install
```

## 使用方式

### 基础用法 - 抓取所有源

```bash
npm start
```

### 只抓取特定分类

```bash
node index.js --category=china     # 只抓中国频道
node index.js --category=hongkong  # 只抓香港频道
node index.js --category=sports    # 只抓体育频道
node index.js --category=news      # 只抓新闻频道
node index.js --category=movies    # 只抓电影频道
node index.js --category=chinese   # 只抓中文频道
```

### 抓取并检测可用性

```bash
node index.js --check                    # 全部抓取并检测
node index.js --category=china --check   # 只抓中国频道并检测
```

> ⚠️ 检测可用性会逐个测试每个直播源，会较慢。

## 可用分类

| 分类 key        | 说明         |
| --------------- | ------------ |
| `global`        | 全球所有频道 |
| `china`         | 中国频道     |
| `hongkong`      | 香港频道     |
| `taiwan`        | 台湾频道     |
| `news`          | 新闻频道     |
| `sports`        | 体育频道     |
| `entertainment` | 娱乐频道     |
| `movies`        | 电影频道     |
| `music`         | 音乐频道     |
| `kids`          | 儿童频道     |
| `chinese`       | 中文频道     |
| `english`       | 英文频道     |
| `japanese`      | 日文频道     |
| `korean`        | 韩文频道     |

## 输出结构

运行后会在 `output/` 目录下生成：

```
output/
├── all.m3u              # 所有频道合并
├── china.m3u            # 按数据源分类
├── sports.m3u
├── ...
├── channels.json        # JSON 格式的频道列表
└── by-group/            # 按频道 group-title 分组
    ├── News.m3u
    ├── Sports.m3u
    └── ...
```

## 自定义数据源

编辑 `sources.js` 文件，添加你自己的 M3U 源地址即可。
