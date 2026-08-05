import QuadraticAnchor49SevenKill from './QuadraticAnchor49SevenKill.jsx';

export default function LinearAnchor63FirstKill() {
  return <QuadraticAnchor49SevenKill
    endpoint="/api/kill/linear-anchor-63-first"
    title="63期首位线性锚点"
    subtitle="固定读取63期前第1位 x，计算 3x + 38，再循环回绕至1～49。策略以2026年第198期为观察截止点冻结，第199期起只记录前瞻验证，不再调整参数。"
    formulaLabel="3x + 38"
    renderCalculation={(p) => <>
      <div><span>63期前第1位 x</span><strong>{p.anchorNumber}</strong></div>
      <div><span>线性公式</span><strong>3 × {p.anchorNumber} + 38</strong></div>
      <div><span>原始结果</span><strong>{p.rawValue}</strong></div>
      <div><span>循环回绕</span><strong>{p.wrapFormula}</strong></div>
    </>}
  />;
}
