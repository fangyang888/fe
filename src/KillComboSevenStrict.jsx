import KillComboSeven from './KillComboSeven.jsx';

export default function KillComboSevenStrict() {
  return (
    <KillComboSeven
      endpoint="/api/kill/combo-seven/strict"
      title="四页组合 7 杀 · 严格滚动"
      subtitle="每一期只使用此前历史，重新评估并选择 98/99 策略，再生成组合 7 杀；结果按历史数据自动缓存。"
    />
  );
}
