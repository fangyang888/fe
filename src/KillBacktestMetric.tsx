import './KillBacktestMetric.css';

type BacktestSummary = {
  count: number;
  successCount: number;
  successRate: number;
  specialCodeMissCount?: number;
  specialCodeMissRate?: number;
};

type Props = {
  label: string;
  data?: BacktestSummary | null;
  className?: string;
};

function percentage(value: number | undefined, count: number) {
  return count > 0 && typeof value === 'number' && Number.isFinite(value)
    ? `${(value * 100).toFixed(1)}%`
    : '--';
}

export default function KillBacktestMetric({ label, data, className = '' }: Props) {
  const count = data?.count ?? 0;
  const hasSpecialStats = count > 0 && Number.isFinite(data?.specialCodeMissRate)
    && Number.isFinite(data?.specialCodeMissCount);

  return (
    <article className={`kill-backtest-metric ${className}`}>
      <span>{label}</span>
      <strong>{percentage(data?.successRate, count)}</strong>
      <small>{count > 0 ? `${data?.successCount ?? 0}/${count} 期7码未出现` : '暂无已开奖样本'}</small>
      <em className="kill-backtest-special" title="预测号码不等于当期第7个开奖号码（n7），记为特别码未出现。">
        特别码未出现 {hasSpecialStats ? percentage(data?.specialCodeMissRate, count) : '--'}
        {hasSpecialStats ? ` · ${data?.specialCodeMissCount}/${count}` : ''}
      </em>
    </article>
  );
}
