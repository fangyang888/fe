import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { createHash } from 'crypto';

type Period = { year: number; No: number };
type Draw = Period & { numbers: number[] };
type Pick = { key: string; prediction: { number: number; selectedBase: string } };
type Snapshot = { version: string; target: Period; source: Period; savedAt: string; inputHash: string; picks: Pick[] };
const VERSION = 'l14-2x15_l100-48x_d2-1_w2-05_tie-l100_v1';

/** Immutable per-period snapshots and settlements. Multiple processes use exclusive creates. */
@Injectable()
export class DualLinearLedgerService {
  private readonly directory: string;
  constructor() {
    this.directory = resolve(process.env.DUAL_LINEAR_LEDGER_DIR || join(process.cwd(), 'data', 'dual-linear-ledger'), VERSION);
  }
  private async create(name: string, value: unknown) {
    // Write a complete temporary file first, then publish with an atomic exclusive link.
    const temp = join(this.directory, `.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.writeFile(temp, JSON.stringify(value), { flag: 'wx' });
    try { await fs.link(temp, join(this.directory, name)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    finally { await fs.unlink(temp); }
  }
  async observe(draws: Draw[], next?: { target: Period; algorithms: Pick[] }) {
    if (draws.some(row => !Number.isInteger(row.year) || !Number.isInteger(row.No) || row.No < 1 || row.numbers.length !== 7 || new Set(row.numbers).size !== 7 || row.numbers.some(n => !Number.isInteger(n) || n < 1 || n > 49))) throw new Error('无法使用无效开奖结算实战');
    await fs.mkdir(this.directory, { recursive: true });
    const key = (p: Period) => `${p.year}-${String(p.No).padStart(3, '0')}`;
    const current = new Map(draws.map(row => [key(row), row]));
    if (next && !current.has(key(next.target))) {
      const source = draws.at(-1)!;
      const snapshot: Snapshot = { version: VERSION, target: next.target, source: { year: source.year, No: source.No },
        savedAt: new Date().toISOString(), inputHash: createHash('sha256').update(JSON.stringify(draws)).digest('hex'),
        picks: next.algorithms.map(a => ({ key: a.key, prediction: { number: a.prediction.number, selectedBase: a.prediction.selectedBase } })) };
      await this.create(`${key(next.target)}.prediction.json`, snapshot);
    }
    const names = (await fs.readdir(this.directory)).filter(name => name.endsWith('.prediction.json')).sort();
    const records: Array<Snapshot & { settlement: { actual: number[]; settledAt: string } | null; revised: boolean }> = [];
    for (const name of names) {
      const snapshot: Snapshot = JSON.parse(await fs.readFile(join(this.directory, name), 'utf8'));
      if (snapshot.version !== VERSION || !Array.isArray(snapshot.picks) || snapshot.picks.some(p => !Number.isInteger(p.prediction.number) || p.prediction.number < 1 || p.prediction.number > 49)) throw new Error('实战留档文件无效');
      const actual = current.get(key(snapshot.target));
      const settlementName = `${key(snapshot.target)}.result.json`;
      if (actual) await this.create(settlementName, { actual: actual.numbers, settledAt: new Date().toISOString() });
      let settlement: { actual: number[]; settledAt: string } | null = null;
      try { settlement = JSON.parse(await fs.readFile(join(this.directory, settlementName), 'utf8')); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      records.push({ ...snapshot, settlement, revised: !!(actual && settlement && JSON.stringify(actual.numbers) !== JSON.stringify(settlement.actual)) });
    }
    return { status: 'ok', start: records[0]?.target ?? null, version: VERSION,
      message: '只统计数据库收录开奖前已保存的预测；未访问页面的期次不补录。数据源若滞后，留档时间不等于已核验的实际开奖前时间。',
      algorithms: ['L14', 'L100', 'D2', 'W2'].map(key => {
        const entries = records.flatMap(record => {
          const pick = record.picks.find(p => p.key === key);
          if (!pick) return [];
          const actual = record.settlement?.actual;
          return [{ target: record.target, savedAt: record.savedAt, number: pick.prediction.number,
            actual: actual ?? null, success: actual ? !actual.includes(pick.prediction.number) : null,
            specialCodeMiss: actual ? actual[6] !== pick.prediction.number : null, revised: record.revised }];
        });
        const settled = entries.filter(e => e.actual);
        return { key, count: settled.length, successCount: settled.filter(e => e.success).length,
          specialCodeMissCount: settled.filter(e => e.specialCodeMiss).length,
          pendingCount: entries.length - settled.length, rows: entries.reverse() };
      }) };
  }
}
