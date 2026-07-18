import QuadraticAnchor49SevenKill from './QuadraticAnchor49SevenKill.jsx';

const period = (year, no) => `${year}-${String(no).padStart(3, '0')}`;

export default function DualTimeAnchorKill() {
  return <QuadraticAnchor49SevenKill
    endpoint="/api/kill/dual-time-anchor"
    title="双时间尺度锚点"
    subtitle="固定读取22期前第6位 x 与34期前第6位 y，计算 x + 2y + 47，再循环回绕至1～49。参数以2026年第180期为截止点封存，181期以后单独作为样本外验证。"
    formulaLabel="x + 2y + 47"
    renderEquation={(p) => <><div className="q49-ball">{p.nearDisplay}</div><span className="q49-op">+ 2 ×</span><div className="q49-ball">{p.farDisplay}</div><span className="q49-op">+ 47 →</span><div className="q49-ball result">{p.display}</div></>}
    renderTags={(p) => <><span className="q49-tag">原始值 {p.rawValue}</span><span className="q49-tag">{p.wrapFormula}</span><span className="q49-tag">22期锚点 {period(p.nearSource.year, p.nearSource.No)}</span><span className="q49-tag">34期锚点 {period(p.farSource.year, p.farSource.No)}</span></>}
    renderCalculation={(p) => <><div><span>22期前第6位 x</span><strong>{p.nearNumber}</strong></div><div><span>34期前第6位 y</span><strong>{p.farNumber}</strong></div><div><span>双锚点公式</span><strong>{p.nearNumber} + 2 × {p.farNumber} + 47 = {p.rawValue}</strong></div><div><span>循环回绕</span><strong>{p.wrapFormula}</strong></div></>}
    renderTableHead={() => <tr><th>开奖期</th><th>22期锚点</th><th>34期锚点</th><th>x / y</th><th>完整公式</th><th>结果</th></tr>}
    renderTableRow={(row) => <tr key={`${row.year}-${row.No}`}><td>{period(row.year, row.No)}</td><td>{period(row.nearYear, row.nearNo)}</td><td>{period(row.farYear, row.farNo)}</td><td>{row.nearDisplay} / {row.farDisplay}</td><td>{row.formula}</td><td className={row.success ? 'q49-ok' : 'q49-bad'}>{row.success ? '成功' : '失败'}</td></tr>}
  />;
}
