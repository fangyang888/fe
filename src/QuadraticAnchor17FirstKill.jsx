import QuadraticAnchor49SevenKill from './QuadraticAnchor49SevenKill.jsx';

export default function QuadraticAnchor17FirstKill() {
  return <QuadraticAnchor49SevenKill
    endpoint="/api/kill/quadratic-anchor-17-first"
    title="17期首位二次锚点"
    subtitle="固定读取17期前第1位 x，计算 8x² − 7x + 18，再循环回绕至1～49。参数以2026年第180期为截止点封存，181期以后单独作为样本外验证。"
    formulaLabel="8x² − 7x + 18"
    anchorLabel="17期前第1位 x"
    calculation={(x) => `8 × ${x}² − 7 × ${x} + 18`}
  />;
}
