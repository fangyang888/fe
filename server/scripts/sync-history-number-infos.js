require('dotenv').config({ quiet: true });

const http = require('http');
const https = require('https');
const mysql = require('mysql2/promise');
const spider = require('../spider.js');

const VALID_COLORS = new Set(['红', '蓝', '绿']);
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

function parseArgs(argv) {
  const yearArg = argv.find((arg) => arg.startsWith('--year='));
  return {
    year: parseInt(
      yearArg?.split('=')[1] || String(new Date().getFullYear()),
      10,
    ),
    apply: argv.includes('--apply'),
  };
}

function requestText(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const request = client.get(
      url,
      {
        headers: {
          Accept: 'text/html,application/json',
          'Accept-Encoding': 'identity',
        },
        timeout,
      },
      (response) => {
        if (
          response.statusCode === undefined ||
          response.statusCode < 200 ||
          response.statusCode >= 300
        ) {
          reject(new Error(`HTTP ${response.statusCode || 'unknown'}`));
          response.resume();
          return;
        }
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () =>
          resolve(Buffer.concat(chunks).toString('utf8')),
        );
      },
    );
    request.on('timeout', () => request.destroy(new Error('请求超时')));
    request.on('error', reject);
  });
}

async function loadSourceRecords(year) {
  try {
    const records = await spider.fetchLotteryData(year);
    if (records.length > 0) return { records, source: 'direct' };
  } catch {
    // The upstream site uses a non-standard HTTPS port which may be blocked
    // locally. The deployed crawler endpoint provides the same raw HTML.
  }

  const sourceUrl = spider.buildLotteryUrl(year, 'default');
  const proxyUrl = new URL(
    process.env.HISTORY_CRAWLER_PROXY_URL || 'http://47.106.103.79/api/crawler',
  );
  proxyUrl.searchParams.set('url', sourceUrl);
  const html = await requestText(proxyUrl.toString());
  return {
    records: spider.parseLotteryHtml(html, year),
    source: 'crawler-proxy',
  };
}

function validateRecords(records, year) {
  const invalid = records.filter(
    (record) =>
      record.year !== year ||
      !Number.isInteger(record.No) ||
      record.items?.length !== 7 ||
      record.numberInfos?.length !== 7 ||
      record.numberInfos.some(
        (info, index) =>
          info.number !== record.items[index] ||
          !VALID_COLORS.has(info.color) ||
          !VALID_ZODIACS.has(info.zodiac),
      ),
  );
  if (invalid.length > 0) {
    throw new Error(
      `源数据校验失败：${invalid.length} 期（例：${invalid
        .slice(0, 5)
        .map((record) => record.No)
        .join(', ')}）`,
    );
  }
}

function normalizeJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return JSON.parse(value);
  return value;
}

async function main() {
  const { year, apply } = parseArgs(process.argv.slice(2));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error('请使用 --year=2026 指定合法年份');
  }

  const { records, source } = await loadSourceRecords(year);
  validateRecords(records, year);

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'fe_prediction',
  });

  try {
    const [columns] = await connection.execute('SHOW COLUMNS FROM history');
    const hasNumberInfos = columns.some(
      (column) => column.Field === 'number_infos',
    );
    const [duplicates] = await connection.execute(
      'SELECT `No`, COUNT(*) AS count FROM history WHERE year = ? GROUP BY `No` HAVING COUNT(*) > 1',
      [year],
    );
    if (duplicates.length > 0) {
      throw new Error(`数据库存在 ${duplicates.length} 个重复期号，已停止同步`);
    }

    const selectFields = hasNumberInfos
      ? 'id, n1, n2, n3, n4, n5, n6, n7, `No`, number_infos'
      : 'id, n1, n2, n3, n4, n5, n6, n7, `No`';
    const [existingRows] = await connection.execute(
      `SELECT ${selectFields} FROM history WHERE year = ? ORDER BY \`No\``,
      [year],
    );
    const existingByNo = new Map(existingRows.map((row) => [row.No, row]));
    const inserts = [];
    const updates = [];
    const conflicts = [];

    for (const record of records) {
      const existing = existingByNo.get(record.No);
      if (!existing) {
        inserts.push(record);
        continue;
      }
      const existingNumbers = [
        existing.n1,
        existing.n2,
        existing.n3,
        existing.n4,
        existing.n5,
        existing.n6,
        existing.n7,
      ];
      if (
        existingNumbers.some((number, index) => number !== record.items[index])
      ) {
        conflicts.push(record.No);
        continue;
      }
      const currentInfos = hasNumberInfos
        ? normalizeJson(existing.number_infos)
        : null;
      if (JSON.stringify(currentInfos) !== JSON.stringify(record.numberInfos)) {
        updates.push({ id: existing.id, numberInfos: record.numberInfos });
      }
    }

    const summary = {
      year,
      source,
      fetched: records.length,
      existing: existingRows.length,
      insert: inserts.length,
      update: updates.length,
      conflicts: conflicts.length,
      mode: apply ? 'apply' : 'dry-run',
    };
    console.log(JSON.stringify(summary, null, 2));

    if (conflicts.length > 0) {
      throw new Error(`号码冲突期号：${conflicts.slice(0, 20).join(', ')}`);
    }
    if (!apply) return;

    if (!hasNumberInfos) {
      await connection.execute(
        'ALTER TABLE history ADD COLUMN number_infos JSON NULL AFTER `No`',
      );
    }

    await connection.beginTransaction();
    try {
      for (const record of updates) {
        await connection.execute(
          'UPDATE history SET number_infos = ? WHERE id = ?',
          [JSON.stringify(record.numberInfos), record.id],
        );
      }
      for (const record of inserts) {
        await connection.execute(
          `INSERT INTO history
            (n1, n2, n3, n4, n5, n6, n7, year, \`No\`, number_infos)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ...record.items,
            year,
            record.No,
            JSON.stringify(record.numberInfos),
          ],
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }

    console.log(
      JSON.stringify(
        {
          applied: true,
          inserted: inserts.length,
          updated: updates.length,
        },
        null,
        2,
      ),
    );
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
