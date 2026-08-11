import { memo, useEffect, useMemo, useState } from 'react';
import './SpectralCancellationKill.css';

const pct = (value, count) => count > 0 && Number.isFinite(value)
  ? `${(value * 100).toFixed(1)}%`
  : '—';

function RefreshIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 8.2A7 7 0 0 1 18.7 10M17.9 15.8A7 7 0 0 1 5.3 14"/></svg>;
}

function WaveMark() {
  return <svg viewBox="0 0 64 32" aria-hidden="true"><path d="M2 16h8l4-10 7 22 7-19 7 13 6-17 7 20 5-9h9"/></svg>;
}

const Metric = memo(function Metric({ label, data }) {
  return <div className="sc-metric">
    <span>{label}</span>
    <strong>{pct(data?.successRate, data?.count)}</strong>
    <small>{data?.count ? `${data.successCount}/${data.count} 成功` : '暂无样本'}</small>
  </div>;
});

function SuccessChart({ points = [] }) {
  const chart = useMemo(() => {
    if (!points.length) return { line: '', area: '' };
    const coords = points.map((point, index) => {
      const x = points.length === 1 ? 0 : index / (points.length - 1) * 1000;
      const y = 260 - Math.max(0, Math.min(1, point.rate)) * 240;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return {
      line: coords.join(' '),
      area: `M ${coords[0]} L ${coords.join(' L ')} L 1000 280 L 0 280 Z`,
    };
  }, [points]);

  return <div className="sc-chart-frame">
    <div className="sc-chart-axis" aria-hidden="true"><span>100%</span><span>90%</span><span>80%</span><span>70%</span></div>
    <svg className="sc-chart" viewBox="0 0 1000 280" preserveAspectRatio="none" role="img" aria-label="最近120期的20期滚动成功率">
      <defs><linearGradient id="sc-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#36d9ef" stopOpacity=".24"/><stop offset="1" stopColor="#36d9ef" stopOpacity="0"/></linearGradient></defs>
      <g className="sc-grid"><line x1="0" y1="20" x2="1000" y2="20"/><line x1="0" y1="68" x2="1000" y2="68"/><line x1="0" y1="116" x2="1000" y2="116"/><line x1="0" y1="164" x2="1000" y2="164"/><line x1="0" y1="212" x2="1000" y2="212"/></g>
      {chart.area ? <path className="sc-chart-area" d={chart.area}/> : null}
      {chart.line ? <polyline className="sc-chart-line" points={chart.line}/> : null}
    </svg>
    <div className="sc-chart-range"><span>{points[0] ? `${points[0].year}-${String(points[0].No).padStart(3, '0')}` : '—'}</span><span>{points.at(-1) ? `${points.at(-1).year}-${String(points.at(-1).No).padStart(3, '0')}` : '—'}</span></div>
  </div>;
}

function MethodStep({ index, title, children }) {
  return <li><span>{index}</span><div><strong>{title}</strong><p>{children}</p></div></li>;
}

export default function SpectralCancellationKill() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    fetch('/api/kill/spectral-cancellation', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || `HTTP ${response.status}`);
        return payload;
      })
      .then(setData)
      .catch((reason) => {
        if (reason.name !== 'AbortError') setError(reason.message || '加载失败');
      });
    return () => controller.abort();
  }, [reloadKey]);

  const prediction = data?.prediction;
  const backtests = data?.backtests || {};
  const validation = data?.validation;
  const latest = data?.historyMeta?.latest;

  return <main className="sc-page">
    <div className="sc-wave-bg" aria-hidden="true"><WaveMark/><WaveMark/><WaveMark/></div>
    <div className="sc-shell">
      <header className="sc-header">
        <div>
          <h1>多分辨率频谱相消</h1>
          <p>把每个号码编码成0/1时间信号，用固定周期的相位外推寻找下一期预测能量最低的号码。</p>
        </div>
        <div className="sc-updated">
          <span>最新数据</span>
          <strong>{latest ? `${latest.year}-${String(latest.No).padStart(3, '0')}` : '—'}</strong>
          <button type="button" onClick={() => setReloadKey((value) => value + 1)} aria-label="重新计算"><RefreshIcon/></button>
        </div>
      </header>

      {error ? <div className="sc-message sc-error">加载失败：{error}</div> : null}
      {!error && !data ? <div className="sc-message">正在生成严格走步频谱…</div> : null}
      {data?.status === 'insufficient-history' ? <div className="sc-message">{data.message}</div> : null}

      {prediction ? <>
        <section className="sc-overview">
          <article className="sc-current">
            <div className="sc-section-title"><h2>当前推荐</h2><span>研究观察</span></div>
            <div className="sc-current-body">
              <strong className="sc-number">{prediction.display}</strong>
              <div className="sc-current-copy">
                <b>预测能量最低</b>
                <span>{prediction.actionLabel}</span>
                <small>标准化分离度 {prediction.separation.toFixed(3)}</small>
              </div>
            </div>
            <p>{prediction.reason}</p>
            <div className={`sc-action ${prediction.action === 'release' ? 'is-release' : ''}`}>
              {prediction.action === 'release' ? '信号已通过证据门槛' : '本期仅记录候选，不作为95%信号'}
            </div>
          </article>

          <article className="sc-performance">
            <div className="sc-section-title"><h2>走步成功率</h2><span>只读目标期之前</span></div>
            <div className="sc-metrics">
              <Metric label="近20期" data={backtests.backtest20}/>
              <Metric label="近50期" data={backtests.backtest50}/>
              <Metric label="近100期" data={backtests.backtest100}/>
              <Metric label="近200期" data={backtests.backtest200}/>
            </div>
            <div className="sc-benchmarks">
              <div><span>理论基线</span><strong>85.71%</strong><small>随机单杀码</small></div>
              <div><span>前瞻冻结验证</span><strong>{pct(validation?.successRate, validation?.count)}</strong><small>自2026-199期 · {validation?.count || 0}期</small></div>
              <div><span>95%证据门</span><strong>{data.calibration.release ? '通过' : '未通过'}</strong><small>{data.calibration.comparableCount}个相近信号</small></div>
            </div>
          </article>
        </section>

        <section className="sc-panel sc-chart-panel">
          <div className="sc-section-title"><h2>走步成功率</h2><span>20期滚动 · 最近120期</span></div>
          <SuccessChart points={data.walkForwardCurve}/>
        </section>

        <section className="sc-panel sc-spectrum-panel">
          <div className="sc-section-title"><h2>预测能量谱</h2><span>越低越优 · 当前选中 {prediction.display}</span></div>
          <div className="sc-spectrum" role="list" aria-label="01至49号预测能量">
            {data.spectrum.map((item) => <div className={`sc-spectrum-cell ${item.selected ? 'is-selected' : ''}`} key={item.number} role="listitem" title={`号码${item.display}，归一化能量${item.energy.toFixed(3)}`}>
              <strong>{item.display}</strong><span>{item.energy.toFixed(2)}</span>
            </div>)}
          </div>
          <div className="sc-spectrum-scale"><span>高能量</span><i/><span>低能量</span></div>
        </section>

        <section className="sc-lower">
          <article className="sc-panel sc-method">
            <div className="sc-section-title"><h2>方法论</h2><span>全新信号处理方向</span></div>
            <ol>
              <MethodStep index="1" title="二值信号">每个号码在每期开奖中出现记为1，否则记为0，形成49条独立信号。</MethodStep>
              <MethodStep index="2" title="多周期投影">固定投影到3、5、7、11、17、23、31、47期周期，不临时搜索最优参数。</MethodStep>
              <MethodStep index="3" title="相消排序">外推两个主周期的下一相位，经收缩后按预测能量从低到高排序。</MethodStep>
            </ol>
            <div className="sc-evidence">
              <span>证据门状态</span>
              <strong>{data.calibration.message}</strong>
              <small>相近信号成功率 {pct(data.calibration.successRate, data.calibration.comparableCount)} · Wilson下界 {pct(data.calibration.wilsonLower95, data.calibration.comparableCount)} · 覆盖率 {pct(data.calibration.coverage, 1)}</small>
            </div>
          </article>

          <article className="sc-panel sc-table-panel">
            <div className="sc-section-title"><h2>近20期逐期核验</h2><span>{backtests.backtest20.successCount}/{backtests.backtest20.count} 成功</span></div>
            <div className="sc-table-wrap">
              <table>
                <thead><tr><th>开奖期</th><th>预测</th><th>相消得分</th><th>实际号码</th><th>结果</th></tr></thead>
                <tbody>{backtests.backtest20.rows.map((row) => <tr key={`${row.year}-${row.No}`}>
                  <td>{row.year}-{String(row.No).padStart(3, '0')}</td>
                  <td><b>{row.predictedDisplay}</b></td>
                  <td>{row.energy.toFixed(3)}</td>
                  <td>{row.actualNumbers.map((number) => String(number).padStart(2, '0')).join(' · ')}</td>
                  <td className={row.success ? 'sc-success' : 'sc-failure'}>{row.success ? '成功' : '失败'}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </article>
        </section>
      </> : null}
    </div>
  </main>;
}
