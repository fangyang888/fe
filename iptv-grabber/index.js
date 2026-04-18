const axios = require('axios');
const fs = require('fs');
const path = require('path');

const SOURCES = require('./sources');

// 缓存已抓取的源
const sourceCache = new Map();

// ============ M3U 解析器 ============

/**
 * 解析 M3U 格式文本，提取频道信息
 */
function parseM3U(text) {
  const channels = [];
  const lines = text.split('\n').map((l) => l.trim());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#EXTINF:')) {
      // 解析 #EXTINF 行中的属性
      const info = parseExtInf(line);
      // 下一行非空且不以 # 开头的是 URL
      let url = '';
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j] && !lines[j].startsWith('#')) {
          url = lines[j];
          break;
        }
      }
      if (url) {
        channels.push({ ...info, url });
      }
    }
  }
  return channels;
}

/**
 * 解析 #EXTINF 行
 * 格式: #EXTINF:-1 tvg-id="..." tvg-name="..." tvg-logo="..." group-title="...",频道名称
 */
function parseExtInf(line) {
  const result = {
    name: '',
    tvgId: '',
    tvgName: '',
    tvgLogo: '',
    groupTitle: '',
  };

  // 提取频道名称（逗号后的部分）
  const commaIndex = line.lastIndexOf(',');
  if (commaIndex !== -1) {
    result.name = line.substring(commaIndex + 1).trim();
  }

  // 提取属性
  const tvgIdMatch = line.match(/tvg-id="([^"]*)"/);
  if (tvgIdMatch) result.tvgId = tvgIdMatch[1];

  const tvgNameMatch = line.match(/tvg-name="([^"]*)"/);
  if (tvgNameMatch) result.tvgName = tvgNameMatch[1];

  const tvgLogoMatch = line.match(/tvg-logo="([^"]*)"/);
  if (tvgLogoMatch) result.tvgLogo = tvgLogoMatch[1];

  const groupTitleMatch = line.match(/group-title="([^"]*)"/);
  if (groupTitleMatch) result.groupTitle = groupTitleMatch[1];

  return result;
}

// ============ 直播源检测 ============

/**
 * 检测单个直播源是否可用（HEAD 请求，超时 5 秒）
 */
async function checkStream(url, timeout = 5000) {
  try {
    const response = await axios.head(url, {
      timeout,
      maxRedirects: 3,
      validateStatus: (status) => status < 400,
    });
    return { alive: true, status: response.status };
  } catch {
    return { alive: false, status: 0 };
  }
}

/**
 * 批量检测直播源（并发控制）
 */
async function checkStreams(channels, concurrency = 50) {
  const results = [];
  const total = channels.length;

  for (let i = 0; i < total; i += concurrency) {
    const batch = channels.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (ch) => {
        const { alive } = await checkStream(ch.url, 3000);
        return { ...ch, alive };
      })
    );
    results.push(...batchResults);

    const progress = Math.min(i + concurrency, total);
    process.stdout.write(`\r  ⏳ 检测进度: ${progress}/${total}`);
  }

  process.stdout.write('\n');
  return results;
}

// ============ 生成 M3U 文件 ============

/**
 * 将频道列表生成 M3U 格式文本
 */
function generateM3U(channels) {
  let content = '#EXTM3U\n';

  for (const ch of channels) {
    const attrs = [];
    if (ch.tvgId) attrs.push(`tvg-id="${ch.tvgId}"`);
    if (ch.tvgName) attrs.push(`tvg-name="${ch.tvgName}"`);
    if (ch.tvgLogo) attrs.push(`tvg-logo="${ch.tvgLogo}"`);
    if (ch.groupTitle) attrs.push(`group-title="${ch.groupTitle}"`);

    const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
    content += `#EXTINF:-1${attrStr},${ch.name}\n`;
    content += `${ch.url}\n`;
  }

  return content;
}

// ============ 主流程 ============

async function fetchSource(source) {
  console.log(`  📡 正在抓取: ${source.name}`);
  console.log(`     ${source.url}`);

  // 检查缓存
  if (sourceCache.has(source.url)) {
    console.log(`  ⚡ 使用缓存\n`);
    return sourceCache.get(source.url);
  }

  try {
    const response = await axios.get(source.url, {
      timeout: 30000,
      responseType: 'text',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    const channels = parseM3U(response.data);
    const result = channels.map((ch) => ({
      ...ch,
      source: source.name,
      category: source.category,
    }));
    
    // 缓存结果
    sourceCache.set(source.url, result);
    console.log(`  ✅ 成功获取 ${channels.length} 个频道\n`);
    return result;
  } catch (error) {
    console.log(`  ❌ 抓取失败: ${error.message}\n`);
    return [];
  }
}

async function main() {
  const doCheck = process.argv.includes('--check');
  const filterCategory = process.argv
    .find((a) => a.startsWith('--category='))
    ?.split('=')[1];

  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║       📺 IPTV 直播源抓取工具 v2.0       ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  // 过滤源
  let sources = SOURCES;
  if (filterCategory) {
    sources = SOURCES.filter((s) => s.category === filterCategory);
    if (sources.length === 0) {
      console.log(`❌ 未找到分类: ${filterCategory}`);
      console.log(
        `可用分类: ${[...new Set(SOURCES.map((s) => s.category))].join(', ')}`
      );
      return;
    }
    console.log(`🔍 筛选分类: ${filterCategory}\n`);
  }

  // 并发抓取所有源（10 个并发）
  console.log(`🚀 开始并发抓取 ${sources.length} 个源...\n`);

  let allChannels = [];
  const concurrency = 10;
  for (let i = 0; i < sources.length; i += concurrency) {
    const batch = sources.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fetchSource));
    allChannels = allChannels.concat(...batchResults);
  }

  // 智能去重（按 URL + 名称组合）
  const dedupeMap = new Map();
  for (const ch of allChannels) {
    const key = `${ch.url}|${ch.name}`;
    if (!dedupeMap.has(key)) {
      dedupeMap.set(key, ch);
    }
  }
  const uniqueChannels = Array.from(dedupeMap.values());

  console.log('────────────────────────────────────────');
  console.log(`📊 总计获取: ${allChannels.length} 个频道`);
  console.log(`📊 去重后:   ${uniqueChannels.length} 个频道`);
  console.log('────────────────────────────────────────\n');

  // 可选: 检测可用性
  let finalChannels = uniqueChannels;
  if (doCheck) {
    console.log('🔍 正在检测直播源可用性 (这可能需要几分钟)...\n');
    const checked = await checkStreams(uniqueChannels);
    finalChannels = checked.filter((ch) => ch.alive);
    console.log(`\n✅ 可用频道: ${finalChannels.length}/${uniqueChannels.length}\n`);
  }

  // 输出目录
  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 并发生成和写入所有文件
  const writePromises = [];

  // 生成合并的 M3U
  const allM3U = generateM3U(finalChannels);
  const allFile = path.join(outputDir, 'all.m3u');
  writePromises.push(
    fs.promises.writeFile(allFile, allM3U, 'utf-8').then(() => {
      console.log(`💾 已保存合并文件: output/all.m3u (${finalChannels.length} 个频道)`);
    })
  );

  // 按分类分别保存
  const categories = [...new Set(finalChannels.map((ch) => ch.category))];
  for (const cat of categories) {
    const catChannels = finalChannels.filter((ch) => ch.category === cat);
    const catM3U = generateM3U(catChannels);
    const catFile = path.join(outputDir, `${cat}.m3u`);
    writePromises.push(
      fs.promises.writeFile(catFile, catM3U, 'utf-8').then(() => {
        console.log(`💾 已保存分类文件: output/${cat}.m3u (${catChannels.length} 个频道)`);
      })
    );
  }

  // 按 group-title 分别保存
  const groups = [
    ...new Set(finalChannels.map((ch) => ch.groupTitle).filter(Boolean)),
  ];
  if (groups.length > 0) {
    const groupDir = path.join(outputDir, 'by-group');
    if (!fs.existsSync(groupDir)) {
      fs.mkdirSync(groupDir, { recursive: true });
    }
    for (const group of groups) {
      const groupChannels = finalChannels.filter(
        (ch) => ch.groupTitle === group
      );
      const groupM3U = generateM3U(groupChannels);
      const safeName = group.replace(/[/\\?%*:|"<>]/g, '_');
      const groupFile = path.join(groupDir, `${safeName}.m3u`);
      writePromises.push(
        fs.promises.writeFile(groupFile, groupM3U, 'utf-8')
      );
    }
    writePromises.push(
      Promise.resolve().then(() => {
        console.log(`💾 已按频道分组保存到: output/by-group/ (${groups.length} 个分组)`);
      })
    );
  }

  // 生成频道列表 JSON
  const jsonData = finalChannels.map((ch) => ({
    name: ch.name,
    url: ch.url,
    logo: ch.tvgLogo,
    group: ch.groupTitle,
    category: ch.category,
    source: ch.source,
  }));
  const jsonFile = path.join(outputDir, 'channels.json');
  writePromises.push(
    fs.promises.writeFile(jsonFile, JSON.stringify(jsonData, null, 2), 'utf-8').then(() => {
      console.log(`💾 已保存 JSON: output/channels.json`);
    })
  );

  // 等待所有文件写入完成
  await Promise.all(writePromises);

  console.log('\n✨ 全部完成！');
  console.log(
    '提示: 使用 --check 参数可检测源是否可用 (较慢)'
  );
  console.log(
    '提示: 使用 --category=china 可只抓取指定分类'
  );
  console.log('');
}

main().catch((err) => {
  console.error('程序出错:', err.message);
  process.exit(1);
});
