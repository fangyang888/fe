/**
 * Node.js 爬虫脚本
 * 使用方法: node crawler.js <URL>
 * 示例: node crawler.js https://example.com
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';

// 配置请求头，模拟浏览器
const headers = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

/**
 * 爬取网页内容
 * @param {string} url - 要爬取的 URL
 * @returns {Promise<{html: string, $: cheerio.CheerioAPI}>}
 */
async function fetchPage(url) {
  try {
    console.log(`🕷️  正在爬取: ${url}`);
    const response = await axios.get(url, { 
      headers,
      timeout: 10000,
    });
    const html = response.data;
    const $ = cheerio.load(html);
    console.log(`✅ 爬取成功! 状态码: ${response.status}`);
    return { html, $ };
  } catch (error) {
    console.error(`❌ 爬取失败: ${error.message}`);
    throw error;
  }
}

/**
 * 提取页面信息
 * @param {cheerio.CheerioAPI} $ - Cheerio 实例
 */
function extractInfo($) {
  const title = $('title').text().trim();
  const description = $('meta[name="description"]').attr('content') || '';
  const h1List = [];
  const links = [];
  const images = [];

  $('h1').each((i, el) => {
    h1List.push($(el).text().trim());
  });

  $('a[href]').each((i, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
      links.push({ href, text: text.slice(0, 50) });
    }
  });

  $('img[src]').each((i, el) => {
    const src = $(el).attr('src');
    const alt = $(el).attr('alt') || '';
    if (src) {
      images.push({ src, alt });
    }
  });

  return {
    title,
    description,
    h1List,
    linksCount: links.length,
    links: links.slice(0, 20), // 只显示前20个链接
    imagesCount: images.length,
    images: images.slice(0, 10), // 只显示前10张图片
  };
}

/**
 * 保存结果到文件
 * @param {string} filename - 文件名
 * @param {any} data - 数据
 */
function saveToFile(filename, data) {
  fs.writeFileSync(filename, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`💾 结果已保存到: ${filename}`);
}

/**
 * 主函数
 */
async function main() {
  const url = process.argv[2];
  
  if (!url) {
    console.log('🕷️  Node.js 爬虫工具');
    console.log('');
    console.log('使用方法:');
    console.log('  node crawler.js <URL>');
    console.log('');
    console.log('示例:');
    console.log('  node crawler.js https://example.com');
    console.log('  node crawler.js https://github.com');
    process.exit(1);
  }

  try {
    const { html, $ } = await fetchPage(url);
    const info = extractInfo($);

    console.log('\n📊 页面信息:');
    console.log('━'.repeat(50));
    console.log(`📌 标题: ${info.title}`);
    console.log(`📝 描述: ${info.description.slice(0, 100)}...`);
    console.log(`📑 H1标签: ${info.h1List.join(', ') || '无'}`);
    console.log(`🔗 链接数量: ${info.linksCount}`);
    console.log(`🖼️  图片数量: ${info.imagesCount}`);
    console.log('━'.repeat(50));

    // 保存完整结果
    const result = {
      url,
      crawledAt: new Date().toISOString(),
      info,
      htmlLength: html.length,
    };
    
    const filename = `crawl_result_${Date.now()}.json`;
    saveToFile(filename, result);

    // 如果需要保存原始 HTML
    // fs.writeFileSync(`page_${Date.now()}.html`, html, 'utf-8');

  } catch (error) {
    console.error('爬取过程中发生错误:', error.message);
    process.exit(1);
  }
}

main();
