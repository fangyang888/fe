import QuadraticAnchor49SevenKill from './QuadraticAnchor49SevenKill.jsx';

const period = (year, no) => `${year}-${String(no).padStart(3, '0')}`;

export default function TripleAnchorLinearKill() {
  return <QuadraticAnchor49SevenKill
    endpoint="/api/kill/triple-anchor-linear"
    title="三锚点线性回绕"
    subtitle="固定读取53期前第4位 x、52期前第2位 y 与95期前第6位 z，计算 −3x − 6y − 4z + 17，再循环回绕至1～49。199～224期为历史留出回放；公式于224期冻结，225期起只记录真实前瞻结果。"
    formulaLabel="−3x − 6y − 4z + 17"
    validationLabel="真实前瞻观察"
    renderEquation={(p) => <>
      <span className="q49-op">−3 ×</span><div className="q49-ball">{p.firstDisplay}</div>
      <span className="q49-op">− 6 ×</span><div className="q49-ball">{p.secondDisplay}</div>
      <span className="q49-op">− 4 ×</span><div className="q49-ball">{p.thirdDisplay}</div>
      <span className="q49-op">+ 17 →</span><div className="q49-ball result">{p.display}</div>
    </>}
    renderTags={(p) => <>
      <span className="q49-tag">原始值 {p.rawValue}</span>
      <span className="q49-tag">{p.wrapFormula}</span>
      <span className="q49-tag">53期锚点 {period(p.firstSource.year, p.firstSource.No)}</span>
      <span className="q49-tag">52期锚点 {period(p.secondSource.year, p.secondSource.No)}</span>
      <span className="q49-tag">95期锚点 {period(p.thirdSource.year, p.thirdSource.No)}</span>
    </>}
    renderCalculation={(p) => <>
      <div><span>53期前第4位 x</span><strong>{p.firstNumber}</strong></div>
      <div><span>52期前第2位 y</span><strong>{p.secondNumber}</strong></div>
      <div><span>95期前第6位 z</span><strong>{p.thirdNumber}</strong></div>
      <div><span>三锚点线性公式</span><strong>−3 × {p.firstNumber} − 6 × {p.secondNumber} − 4 × {p.thirdNumber} + 17 = {p.rawValue}</strong></div>
      <div><span>循环回绕</span><strong>{p.wrapFormula}</strong></div>
    </>}
    renderTableHead={() => <tr><th>开奖期</th><th>53期锚点</th><th>52期锚点</th><th>95期锚点</th><th>x / y / z</th><th>完整公式</th><th>结果</th></tr>}
    renderTableRow={(row) => <tr key={`${row.year}-${row.No}`}>
      <td>{period(row.year, row.No)}</td>
      <td>{period(row.firstYear, row.firstNo)}</td>
      <td>{period(row.secondYear, row.secondNo)}</td>
      <td>{period(row.thirdYear, row.thirdNo)}</td>
      <td>{row.firstDisplay} / {row.secondDisplay} / {row.thirdDisplay}</td>
      <td>{row.formula}</td>
      <td className={row.success ? 'q49-ok' : 'q49-bad'}>{row.success ? '成功' : '失败'}</td>
    </tr>}
  />;
}
