import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import KillBacktestMetric from './KillBacktestMetric';

describe('KillBacktestMetric', () => {
  const summary = {
    count: 20, successCount: 18, successRate: 0.9,
    specialCodeMissCount: 19, specialCodeMissRate: 0.95,
  };

  it('renders separate seven-number and special-code statistics', () => {
    const html = renderToStaticMarkup(<KillBacktestMetric label="近20期" data={summary} className="sr-stat" />);
    expect(html).toContain('近20期');
    expect(html).toContain('18/20 期7码未出现');
    expect(html).toContain('特别码未出现 95.0% · 19/20');
    expect(html).toContain('n7');
    expect(html).toContain('kill-backtest-metric sr-stat');
  });

  it('keeps a real zero rate visible', () => {
    const html = renderToStaticMarkup(<KillBacktestMetric label="近20期" data={{ ...summary, specialCodeMissCount: 0, specialCodeMissRate: 0 }} />);
    expect(html).toContain('特别码未出现 0.0% · 0/20');
  });

  it.each([undefined, { count: 0, successCount: 0, successRate: 0, specialCodeMissCount: 0, specialCodeMissRate: 0 }])('does not show a percentage without settled samples', (data) => {
    const html = renderToStaticMarkup(<KillBacktestMetric label="近20期" data={data} />);
    expect(html).toContain('暂无已开奖样本');
    expect(html).toContain('特别码未出现 --');
    expect(html).not.toContain('0.0%');
  });

  it('does not fabricate special-code statistics for an older API response', () => {
    const html = renderToStaticMarkup(<KillBacktestMetric label="近20期" data={{ count: 20, successCount: 18, successRate: 0.9 }} />);
    expect(html).toContain('18/20 期7码未出现');
    expect(html).toContain('特别码未出现 --');
    expect(html).not.toContain('NaN');
  });
});
