const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const https = require('https');
const year = 2023;
async function fetchLotteryData() {
  const url = `https://zeijpd.d23p7-1eavj-pqsgfz.work:16633/kj/3/${year}.html`;

  try {
    console.log('正在请求数据，请稍候...');
    const response = await axios.get(url, {
      // 忽略非标准域名可能带来的证书报错
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    const $ = cheerio.load(response.data);
    const results = [];

    // 提取 body 内的纯文本进行区块分割解析
    // 这种方式比依赖未知的 DOM Class (如 <li>, <div>) 更稳定
    const textContent = $('body').text().replace(/\s+/g, ' ');

    // 匹配格式：2025年12月31日 第365期
    const dateEventRegex = /(\d{4})年(\d{2})月(\d{2})日\s+(第\d{3}期)/g;

    let matches = [];
    let match;
    while ((match = dateEventRegex.exec(textContent)) !== null) {
      matches.push({
        index: match.index,
        matchLength: match[0].length,
        date: `${match[1]}-${match[2]}-${match[3]}`,
        event: match[4],
      });
    }

    // 截取两期文本之间的内容，提取前 7 个号码
    for (let i = 0; i < matches.length; i++) {
      const current = matches[i];
      const nextIndex =
        i + 1 < matches.length ? matches[i + 1].index : textContent.length;

      const blockContent = textContent.slice(
        current.index + current.matchLength,
        nextIndex,
      );

      // 匹配 01-49 之间的数字
      const numsRegex = /\b(0?[1-9]|[1-4][0-9])\b/g;
      const items = [];
      let numMatch;

      while ((numMatch = numsRegex.exec(blockContent)) !== null) {
        // 排除年份等误伤数据
        const n = parseInt(numMatch[1], 10);
        if (n >= 1 && n <= 49) {
          items.push(n);
        }
        // 仅收集前 7 个号码（平码+特码）
        if (items.length === 7) break;
      }

      if (items.length === 7) {
        results.push({
          date: current.date,
          event: current.event,
          items: items,
        });
      }
    }

    // 按照要求保存为 JSON
    fs.writeFileSync(
      `lottery_${year}.json`,
      JSON.stringify(results, null, 2),
      'utf-8',
    );
    console.log(`✅ 成功抓取 ${results.length} 期数据！`);
    console.log(`📄 文件已保存至当前目录下的 lottery_${year}.json`);
  } catch (error) {
    console.error('❌ 抓取失败:', error.message);
  }
}

fetchLotteryData();
