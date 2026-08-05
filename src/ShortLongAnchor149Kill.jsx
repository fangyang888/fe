import QuadraticAnchor49SevenKill from './QuadraticAnchor49SevenKill.jsx';

const period = (year, no) => `${year}-${String(no).padStart(3, '0')}`;

export default function ShortLongAnchor149Kill() {
  return <QuadraticAnchor49SevenKill
    endpoint="/api/kill/short-long-anchor-1-49"
    title="1+49期短长双锚点"
    subtitle="固定读取上一期第1位 x 与49期前第3位 y，计算 −2x + y + 39，再循环回绕至1～49。策略以2026年第198期为观察截止点冻结，第199期起只记录前瞻验证。"
    formulaLabel="−2x + y + 39"
    renderEquation={(p) => <>
      <span className="q49-op">−2 ×</span><div className="q49-ball">{p.firstDisplay}</div>
      <span className="q49-op">+</span><div className="q49-ball">{p.secondDisplay}</div>
      <span className="q49-op">+ 39 →</span><div className="q49-ball result">{p.display}</div>
    </>}
    renderTags={(p) => <>
      <span className="q49-tag">原始值 {p.rawValue}</span>
      <span className="q49-tag">{p.wrapFormula}</span>
      <span className="q49-tag">上一期锚点 {period(p.firstSource.year, p.firstSource.No)}</span>
      <span className="q49-tag">49期锚点 {period(p.secondSource.year, p.secondSource.No)}</span>
    </>}
    renderCalculation={(p) => <>
      <div><span>上一期第1位 x</span><strong>{p.firstNumber}</strong></div>
      <div><span>49期前第3位 y</span><strong>{p.secondNumber}</strong></div>
      <div><span>短长双锚点公式</span><strong>−2 × {p.firstNumber} + {p.secondNumber} + 39 = {p.rawValue}</strong></div>
      <div><span>循环回绕</span><strong>{p.wrapFormula}</strong></div>
    </>}
    renderTableHead={() => <tr><th>开奖期</th><th>上一期锚点</th><th>49期锚点</th><th>x / y</th><th>完整公式</th><th>结果</th></tr>}
    renderTableRow={(row) => <tr key={`${row.year}-${row.No}`}>
      <td>{period(row.year, row.No)}</td><td>{period(row.firstYear, row.firstNo)}</td>
      <td>{period(row.secondYear, row.secondNo)}</td><td>{row.firstDisplay} / {row.secondDisplay}</td>
      <td>{row.formula}</td><td className={row.success ? 'q49-ok' : 'q49-bad'}>{row.success ? '成功' : '失败'}</td>
    </tr>}
  />;
}
