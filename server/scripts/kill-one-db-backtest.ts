/**
 * 一杀 · 数据库直连回测脚本
 *
 * 直接连接 .env 配置的 MySQL（fe_prediction.history），读取真实开奖，
 * 调用与线上接口完全相同的 KillOneService 算法做近 N 期滚动回测并打印。
 *
 * 用法（在 server 目录下）：
 *   npx ts-node scripts/kill-one-db-backtest.ts            # 默认盘, 近50期
 *   npx ts-node scripts/kill-one-db-backtest.ts hk 80      # 香港盘, 近80期
 */
import 'reflect-metadata';
import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { KillOneService } from '../src/predictor/kill-one.service';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function main() {
  const source = (process.argv[2] === 'hk' ? 'hk' : 'default') as 'default' | 'hk';
  const backtest = parseInt(process.argv[3] || '50', 10);
  const table = source === 'hk' ? 'history_hk' : 'history';

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'fe_prediction',
  });

  const [rows] = await conn.query(
    `SELECT id, year, No, n1, n2, n3, n4, n5, n6, n7 FROM \`${table}\` ORDER BY year ASC, No ASC, id ASC`,
  );
  await conn.end();

  const data = rows as any[];
  console.log(`数据库表 ${table}：共 ${data.length} 期真实开奖`);
  if (data.length) {
    console.log('最新一期：', JSON.stringify(data[data.length - 1]));
  }

  // 用真实库数据驱动与线上完全相同的算法
  const histStub: any = { findAll: async () => data };
  const cfg: any = { get: (k: string) => process.env[k] };
  const svc = new KillOneService(histStub, histStub, cfg);

  const r: any = await svc.getKillOne(source, backtest);
  if (r.status === 'insufficient-history') {
    console.log('历史不足：', r.message);
    process.exit(0);
  }

  console.log(`\n=== 近${r.backtestCount}期真实回测（数据库口径）===`);
  console.log(
    `整体最优：${r.recommended.name}  命中 ${r.recommended.successCount}/${r.recommended.count} = ${(r.recommended.successRate * 100).toFixed(1)}%`,
  );
  for (const s of r.strategies) {
    console.log(
      `  ${s.key.padEnd(14)} ${(s.backtest.successRate * 100).toFixed(1)}%  (${s.backtest.successCount}/${s.backtest.count})  下期杀 ${s.prediction.display}`,
    );
  }

  const g = r.confidenceGate;
  console.log(`\n=== 置信门（出手才中）===`);
  console.log(
    `选定阈值 ≥${g.chosenThreshold} 票：出手 ${g.firedCount}/${g.total}，出手命中率 ${(g.firedAccuracy * 100).toFixed(1)}%，覆盖率 ${(g.coverage * 100).toFixed(1)}%`,
  );
  console.log(
    '阈值表：',
    g.thresholdStats
      .map((s: any) => `≥${s.threshold}:${s.fired}手/${(s.firedAccuracy * 100).toFixed(0)}%`)
      .join('  '),
  );
  console.log(
    `本期决定：${g.next.fire ? '出手 杀 ' + g.next.display : '弃一期'}（共识票 ${g.next.votes}/${g.baseStrategyCount}）`,
  );

  console.log(`\n=== 最优策略回测明细 ===`);
  for (const row of r.strategies[0].backtest.rows) {
    console.log(
      `${row.year || '-'}/${row.No || '-'}  杀 ${row.killDisplay}  开[${row.actualNumbers.join(',')}]  ${row.success ? '✅杀对' : '❌被开出'}`,
    );
  }

  console.log(
    `\n理论上限提醒：7/49 单杀真实命中上限 ≈ ${(r.theoreticalRate * 100).toFixed(1)}%/期，开奖随机独立，无法做到前瞻100%。`,
  );
}

main().catch((e) => {
  console.error('运行失败：', e.message || e);
  process.exit(1);
});
