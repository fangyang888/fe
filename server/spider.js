const fs = require('fs');
const https = require('https');
const zlib = require('zlib');

function parseYear(value) {
  const year = parseInt(value, 10);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error('年份参数不合法');
  }
  return year;
}

const COLOR_LABELS = {
  red: '红',
  blue: '蓝',
  green: '绿',
};

const VALID_ZODIACS = new Set([
  '鼠',
  '牛',
  '虎',
  '兔',
  '龙',
  '蛇',
  '马',
  '羊',
  '猴',
  '鸡',
  '狗',
  '猪',
]);

function repairInvalidZodiacs(results) {
  const validByNumber = new Map();

  for (const record of results) {
    for (const info of record.numberInfos || []) {
      if (!VALID_ZODIACS.has(info.zodiac)) continue;
      const entries = validByNumber.get(info.number) || [];
      entries.push({ No: record.No, zodiac: info.zodiac });
      validByNumber.set(info.number, entries);
    }
  }

  for (const record of results) {
    for (const info of record.numberInfos || []) {
      if (VALID_ZODIACS.has(info.zodiac)) continue;
      const nearest = (validByNumber.get(info.number) || [])
        .slice()
        .sort(
          (a, b) => Math.abs(a.No - record.No) - Math.abs(b.No - record.No),
        )[0];
      if (nearest) info.zodiac = nearest.zodiac;
    }
  }
}

function parseStructuredLotteryHtml(html, year) {
  const headerRegex =
    /(\d{4})年(\d{1,2})月(\d{1,2})日\s*第\s*<span[^>]*>\s*(\d{1,3})\s*<\/span>\s*期/gi;
  const headers = [];
  let headerMatch;

  while ((headerMatch = headerRegex.exec(html)) !== null) {
    headers.push({
      index: headerMatch.index,
      contentStart: headerRegex.lastIndex,
      date: `${headerMatch[1]}-${headerMatch[2].padStart(2, '0')}-${headerMatch[3].padStart(2, '0')}`,
      event: `第${headerMatch[4].padStart(3, '0')}期`,
      No: parseInt(headerMatch[4], 10),
      year: parseInt(headerMatch[1], 10) || year,
    });
  }

  const results = [];
  const ballRegex =
    /<dt[^>]*class=["'][^"']*ball-(red|blue|green)[^"']*["'][^>]*>\s*(\d{1,2})\s*<\/dt>\s*<dd[^>]*>\s*([^<\s]+)/gi;

  for (let index = 0; index < headers.length; index++) {
    const current = headers[index];
    const nextIndex =
      index + 1 < headers.length ? headers[index + 1].index : html.length;
    const block = html.slice(current.contentStart, nextIndex);
    const numberInfos = [];
    let ballMatch;

    ballRegex.lastIndex = 0;
    while ((ballMatch = ballRegex.exec(block)) !== null) {
      numberInfos.push({
        number: parseInt(ballMatch[2], 10),
        color: COLOR_LABELS[ballMatch[1]],
        zodiac: ballMatch[3],
      });
      if (numberInfos.length === 7) break;
    }

    if (numberInfos.length === 7) {
      results.push({
        date: current.date,
        event: current.event,
        year: current.year,
        No: current.No,
        items: numberInfos.map((info) => info.number),
        numberInfos,
      });
    }
  }

  repairInvalidZodiacs(results);
  return results.sort((a, b) => a.No - b.No);
}

function parseLotteryHtml(html, year) {
  const structuredResults = parseStructuredLotteryHtml(html, year);
  if (structuredResults.length > 0) return structuredResults;

  const results = [];
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const htmlBody = bodyMatch ? bodyMatch[1] : html;
  const textContent = htmlBody
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
  const dateEventRegex =
    /(\d{4})年(\d{1,2})月(\d{1,2})日\s+第\s*(\d{1,3})\s*期/g;

  const matches = [];
  let match;
  while ((match = dateEventRegex.exec(textContent)) !== null) {
    matches.push({
      index: match.index,
      matchLength: match[0].length,
      date: `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`,
      event: `第${match[4].padStart(3, '0')}期`,
      No: parseInt(match[4], 10),
      year: parseInt(match[1], 10) || year,
    });
  }

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const nextIndex =
      i + 1 < matches.length ? matches[i + 1].index : textContent.length;
    const blockContent = textContent.slice(
      current.index + current.matchLength,
      nextIndex,
    );
    const numsRegex = /\b(0?[1-9]|[1-4][0-9])\b/g;
    const items = [];
    let numMatch;

    while ((numMatch = numsRegex.exec(blockContent)) !== null) {
      const n = parseInt(numMatch[1], 10);
      if (n >= 1 && n <= 49) items.push(n);
      if (items.length === 7) break;
    }

    if (items.length === 7) {
      results.push({
        date: current.date,
        event: current.event,
        year: current.year,
        No: current.No,
        items,
      });
    }
  }

  return results.sort((a, b) => a.No - b.No);
}

function requestText(url, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        rejectUnauthorized: false,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Encoding': 'gzip, deflate, br',
        },
        timeout,
      },
      (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}`));
          res.resume();
          return;
        }

        const chunks = [];
        res.on('data', (chunk) => {
          chunks.push(chunk);
        });
        res.on('end', () => {
          try {
            let data = Buffer.concat(chunks);
            const encoding = String(
              res.headers['content-encoding'] || '',
            ).toLowerCase();
            if (encoding === 'gzip') {
              data = zlib.gunzipSync(data);
            } else if (encoding === 'deflate') {
              data = zlib.inflateSync(data);
            } else if (encoding === 'br') {
              data = zlib.brotliDecompressSync(data);
            }
            resolve(data.toString('utf8'));
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    req.on('timeout', () => {
      req.destroy(new Error('请求超时'));
    });
    req.on('error', reject);
  });
}
const LOTTERY_SOURCES = {
  default: (year) =>
    `https://zeijpd.d23p7-1eavj-pqsgfz.work:16633/kj/3/${year}.html`,
  hk: (year) =>
    `https://zeijpd.d23p7-1eavj-pqsgfz.work:16633/kj/1/${year}.html`,
};

function parseSourceType(value = 'default') {
  if (value === 'default' || value === 'hk') {
    return value;
  }
  throw new Error(`数据类型不合法：${value}`);
}

function buildLotteryUrl(year, type = 'default') {
  const sourceType = parseSourceType(type);
  return LOTTERY_SOURCES[sourceType](year);
}

async function fetchLotteryData(yearInput, options = {}) {
  const year = parseYear(yearInput);
  const type = parseSourceType(options.type);
  const url = buildLotteryUrl(year, type);

  const html = await requestText(url, options.timeout || 20000);
  const results = parseLotteryHtml(html, year);
  if (options.writeFile) {
    fs.writeFileSync(
      `lottery_${year}.json`,
      JSON.stringify(results, null, 2),
      'utf-8',
    );
  }
  return results;
}

module.exports = {
  fetchLotteryData,
  buildLotteryUrl,
  parseLotteryHtml,
  parseStructuredLotteryHtml,
  parseSourceType,
  requestText,
};

if (require.main === module) {
  const year = parseYear(process.argv[2] || new Date().getFullYear());
  fetchLotteryData(year, { writeFile: true })
    .then((results) => {
      console.log(`✅ 成功抓取 ${results.length} 期数据！`);
      console.log(`📄 文件已保存至当前目录下的 lottery_${year}.json`);
    })
    .catch((error) => {
      console.error('❌ 抓取失败:', error.message);
      process.exitCode = 1;
    });
}
