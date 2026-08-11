import { Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';

type DrawRow = {
  id: number;
  year?: number;
  No?: number;
  numbers: number[];
  numberSet: Set<number>;
};

type Harmonic = { period: number; energy: number; forecast: number };
type SpectrumItem = {
  number: number;
  display: string;
  rawForecast: number;
  energy: number;
  cancellation: number;
  harmonics: Harmonic[];
};

type EvaluationRow = {
  year?: number;
  No?: number;
  actualNumbers: number[];
  predictedNumber: number;
  predictedDisplay: string;
  energy: number;
  separation: number;
  success: boolean;
};

@Injectable()
export class SpectralCancellationKillService {
  private readonly window = 192;
  private readonly periods = [3, 5, 7, 11, 17, 23, 31, 47];
  private readonly harmonicCount = 2;
  private readonly shrink = 0.5;
  private readonly validationYear = 2026;
  private readonly validationStartNo = 199;
  private cache?: { key: string; value: any };

  constructor(private readonly historyService: HistoryService) {}

  async getPrediction() {
    const history = this.normalizeRows(await this.historyService.findAll());
    const minimumHistory = this.window + 500;
    if (history.length < minimumHistory) {
      return {
        status: 'insufficient-history',
        historyCount: history.length,
        message: `多分辨率频谱相消至少需要${minimumHistory}期历史，才能展示完整500期走步回测。`,
      };
    }

    const latest = history[history.length - 1];
    const cacheKey = `${history.length}:${latest.id}:${latest.year}:${latest.No}:${latest.numbers.join('.')}:spectral-v1`;
    if (this.cache?.key === cacheKey) return { ...this.cache.value, cache: 'hit' };

    const timeline = this.buildTimeline(history);
    const current = this.pick(history, history.length);
    const calibration = this.buildCalibration(timeline, current.separation);
    const validationRows = timeline.filter(
      (row) =>
        Number(row.year) > this.validationYear ||
        (Number(row.year) === this.validationYear && Number(row.No) >= this.validationStartNo),
    );
    const backtest20 = this.summarize(timeline.slice(-20));
    const backtest50 = this.summarize(timeline.slice(-50));
    const backtest100 = this.summarize(timeline.slice(-100));
    const backtest200 = this.summarize(timeline.slice(-200));
    const backtest500 = this.summarize(timeline.slice(-500));
    const validation = this.summarize(validationRows);

    const value = {
      status: calibration.release ? 'qualified-signal' : 'research-watch',
      strategy: {
        key: 'multiResolutionSpectralCancellationV1',
        name: '多分辨率频谱相消',
        family: 'signal-processing',
        directionNovelty:
          '独立使用二值时间信号的固定周期正交投影，不读取锚点公式、冷热遗漏、状态风险、贝叶斯选择器、共现矩阵或旧策略投票。',
        window: this.window,
        periods: this.periods,
        harmonicCount: this.harmonicCount,
        shrink: this.shrink,
        theoreticalBaseline: 42 / 49,
        targetRate: 0.95,
        frozenAt: { year: 2026, No: 198 },
        description:
          '把每个号码编码成逐期0/1信号，在固定周期上做正弦/余弦投影，取能量最强的两个周期外推下一期，并选择相消后预测能量最低的号码。',
      },
      prediction: {
        number: current.number,
        display: current.display,
        energy: current.energy,
        rawForecast: current.rawForecast,
        separation: current.separation,
        harmonics: current.harmonics,
        action: calibration.release ? 'release' : 'observe',
        actionLabel: calibration.release ? '达到证据门槛，可记录信号' : '研究观察，暂不作为95%信号',
        reason: `号码${current.display}的多周期外推能量最低；与第二低风险号码的标准化间隔为${current.separation.toFixed(3)}。`,
      },
      spectrum: current.spectrum,
      backtests: { backtest20, backtest50, backtest100, backtest200, backtest500 },
      calibration,
      validation: {
        ...validation,
        kind: 'prospective',
        start: { year: this.validationYear, No: this.validationStartNo },
      },
      walkForwardCurve: this.buildCurve(timeline.slice(-120), 20),
      methodology: [
        { key: 'binary', title: '二值信号', description: '每个号码每期出现记为1，否则记为0，形成49条独立时间信号。' },
        { key: 'projection', title: '多周期投影', description: '只使用固定的3、5、7、11、17、23、31、47期周期，不按回测结果临时搜索周期。' },
        { key: 'cancel', title: '相消排序', description: '外推主周期下一相位，按收缩后的预测能量从低到高排序。' },
      ],
      historyMeta: { count: history.length, latest: this.publicRow(latest) },
      generatedAt: new Date().toISOString(),
      cache: 'miss',
    };
    this.cache = { key: cacheKey, value };
    return value;
  }

  private buildTimeline(history: DrawRow[]): EvaluationRow[] {
    const rows: EvaluationRow[] = [];
    for (let t = this.window; t < history.length; t++) {
      const prediction = this.pick(history, t);
      rows.push({
        year: history[t].year,
        No: history[t].No,
        actualNumbers: history[t].numbers,
        predictedNumber: prediction.number,
        predictedDisplay: prediction.display,
        energy: prediction.rawForecast,
        separation: prediction.separation,
        success: !history[t].numberSet.has(prediction.number),
      });
    }
    return rows;
  }

  private pick(history: DrawRow[], t: number) {
    const spectrum: SpectrumItem[] = [];
    const start = t - this.window;
    for (let number = 1; number <= 49; number++) {
      const signal: number[] = [];
      let appearances = 0;
      for (let s = start; s < t; s++) {
        const value = history[s].numberSet.has(number) ? 1 : 0;
        signal.push(value);
        appearances += value;
      }
      const mean = appearances / this.window;
      const projections = this.periods
        .map((period) => this.project(signal, mean, period))
        .sort((a, b) => b.energy - a.energy || a.period - b.period);
      const harmonics = projections.slice(0, this.harmonicCount);
      const harmonicForecast =
        harmonics.reduce((sum, item) => sum + item.forecast, 0) /
        Math.sqrt(this.harmonicCount);
      const rawForecast = mean + this.shrink * harmonicForecast;
      const cancellation =
        harmonics.reduce((sum, item) => sum + Math.abs(item.forecast), 0) /
        this.harmonicCount;
      spectrum.push({
        number,
        display: String(number).padStart(2, '0'),
        rawForecast,
        energy: 0,
        cancellation,
        harmonics: harmonics.map((item) => ({
          period: item.period,
          energy: this.round(item.energy),
          forecast: this.round(item.forecast),
        })),
      });
    }

    spectrum.sort(
      (a, b) =>
        a.rawForecast - b.rawForecast ||
        b.cancellation - a.cancellation ||
        a.number - b.number,
    );
    const min = spectrum[0].rawForecast;
    const max = spectrum[spectrum.length - 1].rawForecast;
    const range = Math.max(1e-9, max - min);
    for (const item of spectrum) item.energy = this.round((item.rawForecast - min) / range);
    const meanRisk = spectrum.reduce((sum, item) => sum + item.rawForecast, 0) / spectrum.length;
    const variance =
      spectrum.reduce((sum, item) => sum + (item.rawForecast - meanRisk) ** 2, 0) /
      spectrum.length;
    const separation =
      (spectrum[1].rawForecast - spectrum[0].rawForecast) /
      Math.max(1e-9, Math.sqrt(variance));
    return {
      ...spectrum[0],
      rawForecast: this.round(spectrum[0].rawForecast),
      separation: this.round(separation),
      spectrum: spectrum
        .map((item) => ({
          number: item.number,
          display: item.display,
          energy: item.energy,
          rawForecast: this.round(item.rawForecast),
          selected: item.number === spectrum[0].number,
        }))
        .sort((a, b) => a.number - b.number),
    };
  }

  private project(signal: number[], mean: number, period: number): Harmonic {
    let cosine = 0;
    let sine = 0;
    for (let index = 0; index < signal.length; index++) {
      const centered = signal[index] - mean;
      const angle = (2 * Math.PI * index) / period;
      cosine += centered * Math.cos(angle);
      sine += centered * Math.sin(angle);
    }
    const nextAngle = (2 * Math.PI * signal.length) / period;
    return {
      period,
      energy: cosine ** 2 + sine ** 2,
      forecast:
        (2 / signal.length) *
        (cosine * Math.cos(nextAngle) + sine * Math.sin(nextAngle)),
    };
  }

  private buildCalibration(rows: EvaluationRow[], currentSeparation: number) {
    const recent = rows.slice(-200);
    const comparable = recent.filter((row) => row.separation >= currentSeparation);
    const summary = this.summarize(comparable);
    const lowerBound = this.wilsonLower(summary.successCount, summary.count);
    const release = summary.count >= 40 && summary.successRate >= 0.95 && lowerBound >= 0.9;
    return {
      kind: 'separation-matched-walk-forward',
      targetRate: 0.95,
      minimumSamples: 40,
      currentSeparation,
      comparableCount: summary.count,
      successCount: summary.successCount,
      successRate: summary.successRate,
      wilsonLower95: lowerBound,
      coverage: recent.length ? summary.count / recent.length : 0,
      release,
      message: release
        ? '相近或更强频谱分离度的历史信号达到研究发布门槛。'
        : '尚未达到95%证据门槛；保留研究候选，但本期不发布为高置信信号。',
    };
  }

  private summarize(rows: EvaluationRow[]) {
    const successCount = rows.filter((row) => row.success).length;
    return {
      kind: 'strict-walk-forward',
      count: rows.length,
      successCount,
      failureCount: rows.length - successCount,
      successRate: rows.length ? successCount / rows.length : 0,
      rows: rows.slice().reverse(),
      failureRows: rows.filter((row) => !row.success).reverse(),
    };
  }

  private buildCurve(rows: EvaluationRow[], window: number) {
    return rows.map((row, index) => {
      const sample = rows.slice(Math.max(0, index - window + 1), index + 1);
      const successCount = sample.filter((item) => item.success).length;
      return {
        year: row.year,
        No: row.No,
        rate: successCount / sample.length,
        count: sample.length,
      };
    });
  }

  private wilsonLower(successes: number, samples: number) {
    if (!samples) return 0;
    const z = 1.96;
    const p = successes / samples;
    const denominator = 1 + (z * z) / samples;
    const center = p + (z * z) / (2 * samples);
    const margin =
      z * Math.sqrt((p * (1 - p)) / samples + (z * z) / (4 * samples * samples));
    return (center - margin) / denominator;
  }

  private publicRow(row: DrawRow) {
    return { id: row.id, year: row.year, No: row.No, numbers: row.numbers };
  }

  private normalizeRows(rows: any[]): DrawRow[] {
    return rows
      .map((row) => {
        const numbers = [row.n1, row.n2, row.n3, row.n4, row.n5, row.n6, row.n7].map(Number);
        return {
          id: Number(row.id || 0),
          year: row.year,
          No: row.No,
          numbers,
          numberSet: new Set(numbers),
        };
      })
      .filter(
        (row) =>
          row.numbers.length === 7 &&
          new Set(row.numbers).size === 7 &&
          row.numbers.every((number) => Number.isInteger(number) && number >= 1 && number <= 49),
      )
      .sort(
        (a, b) =>
          (a.year || 0) - (b.year || 0) ||
          (a.No || 0) - (b.No || 0) ||
          a.id - b.id,
      );
  }

  private round(value: number) {
    return Number(value.toFixed(6));
  }
}
