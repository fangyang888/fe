import { Injectable, Optional } from '@nestjs/common';
import { HistoryService } from '../history/history.service';
import { DualLinearLedgerService } from './dual-linear-ledger.service';

@Injectable()
export class DualLinearAnchorService {
  constructor(private readonly history: HistoryService, @Optional() private readonly ledger?: DualLinearLedgerService) {}

  async getPrediction(latest = false) {
    const raw = (await this.history.findAll()).map(r => ({
      year: Number(r.year), No: Number(r.No),
      numbers: [r.n1, r.n2, r.n3, r.n4, r.n5, r.n6, r.n7].map(Number),
    })).sort((a, b) => a.year - b.year || a.No - b.No);
    const selected = latest ? raw : raw.filter(r => r.year < 2026 || (r.year === 2026 && r.No <= 243));
    const rows: typeof selected = [];
    let notice = '';
    for (const row of selected) {
      const previous = rows.at(-1);
      if (!Number.isInteger(row.year) || row.year < 1 || !Number.isInteger(row.No) || row.No < 1 ||
          row.numbers.some(n => !Number.isInteger(n) || n < 1 || n > 49) || new Set(row.numbers).size !== 7) {
        notice = '发现无效开奖记录，统计已停在该记录之前。'; break;
      }
      if (previous && ((row.year === previous.year && row.No !== previous.No + 1) ||
          (row.year !== previous.year && (row.year !== previous.year + 1 || row.No !== 1 || previous.No !== (new Date(Date.UTC(previous.year, 1, 29)).getUTCMonth() === 1 ? 366 : 365))))) {
        notice = `发现缺期或重复期号，统计停在 ${previous.year}-${previous.No}；请先补齐历史。`; break;
      }
      rows.push(row);
    }
    const end = rows.at(-1);
    const period = (r: { year: number; No: number }) => ({ year: r.year, No: r.No });
    const meta = { mode: latest ? 'latest' : 'research', notice, availableLatest: raw.length ? period(raw.at(-1)!) : null, evaluatedThrough: end ? period(end) : null };
    if (rows.length < 103) return { ...meta, status: 'insufficient-history', message: '至少需要103期连续有效记录，才能计算双公式、前两期择优及回测。' };
    const summarize = (records: Array<{ success: boolean; number: number; actual: number[] }>) => ({ count: records.length, successCount: records.filter(r => r.success).length, specialCodeMissCount: records.filter(r => r.number !== r.actual[6]).length });
    const definitions = [
      { key: 'L14', name: '14期前第1位', lag: 14, position: 1, multiplier: 2, offset: 15, formula: '2x + 15' },
      { key: 'L100', name: '100期前第7位', lag: 100, position: 7, multiplier: 48, offset: 0, formula: '48x' },
    ];
    const basePredict = (def: typeof definitions[number], t: number) => {
        const source = rows[t - def.lag];
        const anchor = source.numbers[def.position - 1];
        const value = def.multiplier * anchor + def.offset;
        return { number: ((value - 1) % 49 + 49) % 49 + 1, anchor, value, source: period(source), selectedBase: def.key, position: def.position, multiplier: def.multiplier, offset: def.offset };
      };
    const algorithms = definitions.map(def => {
      const predict = (t: number) => basePredict(def, t);
      const records = rows.slice(100).map((row, i) => {
        const prediction = predict(i + 100);
        return { ...period(row), ...prediction, actual: row.numbers, success: !row.numbers.includes(prediction.number) };
      });
      const research = records.filter(r => r.year < 2026 || (r.year === 2026 && r.No <= 243));
      return { ...def, prediction: predict(rows.length),
        windows: [10, 20, 50, 100, 200].map(window => ({ window, ...summarize(records.slice(-window)) })),
        researchWindows: [50, 100, 200].map(window => ({ window, ...summarize(research.slice(-window)) })),
        afterResearch: summarize(records.filter(r => r.year > 2026 || (r.year === 2026 && r.No > 243))),
        recent: records.slice(-200).reverse(),
      };
    });
    const dynamicAlgorithms = [
      { key: 'D2', name: '按前两期失败数择优', weight: 1, formula: '上一期失败 + 上上期失败；分低者优先，同分选100期公式。' },
      { key: 'W2', name: '两期加权择优', weight: 0.5, formula: '0.5 × 上一期失败 + 上上期失败；分低者优先，同分选100期公式。' },
    ].map(def => {
      const predict = (t: number) => {
        const evidence = definitions.map(base => {
          const previous = [1, 2].map(lag => {
            const prediction = basePredict(base, t - lag);
            return { ...period(rows[t - lag]), number: prediction.number, failed: rows[t - lag].numbers.includes(prediction.number) };
          });
          return { key: base.key, previous, score: def.weight * Number(previous[0].failed) + Number(previous[1].failed) };
        });
        const index = evidence[0].score < evidence[1].score ? 0 : 1;
        return { ...basePredict(definitions[index], t), evidence };
      };
      const records = rows.slice(102).map((row, i) => {
        const prediction = predict(i + 102);
        return { ...period(row), ...prediction, actual: row.numbers, success: !row.numbers.includes(prediction.number) };
      });
      const research = records.filter(r => r.year < 2026 || (r.year === 2026 && r.No <= 243));
      return { ...def, dynamic: true, prediction: predict(rows.length),
        windows: [10, 20, 50, 100, 200].map(window => ({ window, ...summarize(records.slice(-window)) })),
        researchWindows: [50, 100, 200].map(window => ({ window, ...summarize(research.slice(-window)) })),
        afterResearch: summarize(records.filter(r => r.year > 2026 || (r.year === 2026 && r.No > 243))),
        recent: records.slice(-200).reverse(),
      };
    });
    const yearLength = new Date(Date.UTC(end!.year, 1, 29)).getUTCMonth() === 1 ? 366 : 365;
    const target = end!.No >= yearLength ? { year: end!.year + 1, No: 1 } : { year: end!.year, No: end!.No + 1 };
    const allAlgorithms = [...algorithms, ...dynamicAlgorithms];
    let live: Awaited<ReturnType<DualLinearLedgerService['observe']>> | { status: string; message: string } = { status: 'unavailable', message: '实战留档未启用。' };
    if (this.ledger) {
      try {
        // Never capture predictions aimed at already imported or discontinuous periods.
        live = await this.ledger.observe(raw, latest && !notice ? { target, algorithms: allAlgorithms } : undefined);
      } catch { live = { status: 'error', message: '实战留档读取或保存失败，未展示实战成功率，请检查服务器数据目录。' }; }
    }
    return { ...meta, status: 'ok', target, algorithms: allAlgorithms, live };
  }
}
