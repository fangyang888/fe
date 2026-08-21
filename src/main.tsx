import { useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import './index.css';
// @ts-ignore
import App from './App.jsx';
// @ts-ignore
import App2 from './App2.jsx';
// @ts-ignore
import NumberDigitPredictor from './NumberDigitPredictor.jsx';
// @ts-ignore
import Crawler from './Crawler.jsx';
// @ts-ignore
import KillPredictor from './KillPredictor.jsx';
// @ts-ignore
import KillTenPositionStats from './KillTenPositionStats.jsx';
// @ts-ignore
import Likely22PositionStats from './Likely22PositionStats.jsx';
// @ts-ignore
import BayesianPositionSelector from './BayesianPositionSelector.jsx';
// @ts-ignore
import NewKillPredictor from './NewKillPredictor.jsx';
// @ts-ignore
import Markov2PositionSixStats from './Markov2PositionSixStats.jsx';
// @ts-ignore
import SmartSevenPositionStats from './SmartSevenPositionStats.jsx';
// @ts-ignore
import FrequencyPositionFiveStats from './FrequencyPositionFiveStats.jsx';
// @ts-ignore
import FocusedModelPositionStats from './FocusedModelPositionStats.jsx';
// @ts-ignore
import HotPickPredictor from './HotPickPredictor.jsx';
// @ts-ignore
import HotPickPredictorOpt from './HotPickPredictorOpt.jsx';
// @ts-ignore
import HistoryManager from './HistoryManager.jsx';
// @ts-ignore
import KillTwoPredictor from './KillTwoPredictor.jsx';
// @ts-ignore
import KillPredictorHK from './KillPredictorHK.jsx';
// @ts-ignore
import KillSevenStats from './KillSevenStats.jsx';
// @ts-ignore
import MathKillPredictor from './MathKillPredictor.jsx';
// @ts-ignore
import FivePeriodKill from './FivePeriodKill.jsx';
// @ts-ignore
import FixedHybridKillPredictor from './FixedHybridKillPredictor.jsx';
// @ts-ignore
import KillTen from './KillTen.jsx';
// @ts-ignore
import KillOne from './KillOne.jsx';
// @ts-ignore
import POneKill from './POneKill.jsx';
// @ts-ignore
import KillComboBacktest from './KillComboBacktest.jsx';
// @ts-ignore
import KillComboSeven from './KillComboSeven.jsx';
// @ts-ignore
import KillComboSevenStrict from './KillComboSevenStrict.jsx';
// @ts-ignore
import TailTenKill from './TailTenKill.jsx';
// @ts-ignore
import MultiDimKill from './MultiDimKill.jsx';
// @ts-ignore
import ExperimentalKill98 from './ExperimentalKill98.jsx';
// @ts-ignore
import ExperimentalKill99 from './ExperimentalKill99.jsx';
// @ts-ignore
import ExperimentalGuardedKill from './ExperimentalGuardedKill.jsx';
// @ts-ignore
import GapScoreKill from './GapScoreKill.jsx';
// @ts-ignore
import StateRiskKill from './StateRiskKill.jsx';
// @ts-ignore
import TenAnchorShiftKill from './TenAnchorShiftKill.jsx';
// @ts-ignore
import PreviousSevenQuadKill from './PreviousSevenQuadKill.jsx';
// @ts-ignore
import QuadraticAnchor53Kill from './QuadraticAnchor53Kill.jsx';
// @ts-ignore
import AnchorPhase14Kill from './AnchorPhase14Kill.jsx';
// @ts-ignore
import TailGatedDualKill from './TailGatedDualKill.jsx';
// @ts-ignore
import QuadraticAnchor49SevenKill from './QuadraticAnchor49SevenKill.jsx';
// @ts-ignore
import QuadraticAnchor17FirstKill from './QuadraticAnchor17FirstKill.jsx';
// @ts-ignore
import DualTimeAnchorKill from './DualTimeAnchorKill.jsx';
// @ts-ignore
import LinearAnchor63FirstKill from './LinearAnchor63FirstKill.jsx';
// @ts-ignore
import SpectralCancellationKill from './SpectralCancellationKill.jsx';
// @ts-ignore
import LatentFactorKill from './LatentFactorKill.jsx';
// @ts-ignore
import LogisticDiffusionKill from './LogisticDiffusionKill.jsx';
// @ts-ignore
import RobustBlockKill from './RobustBlockKill.jsx';
// @ts-ignore
import ShortLongAnchor149Kill from './ShortLongAnchor149Kill.jsx';
// @ts-ignore
import DualAnchor4963Kill from './DualAnchor4963Kill.jsx';
// @ts-ignore
import TripleAnchorLinearKill from './TripleAnchorLinearKill.jsx';
// @ts-ignore
import AnchorInteractionSuite from './AnchorInteractionSuite.jsx';
// @ts-ignore
import GatedAnchorSuite from './GatedAnchorSuite.jsx';
// @ts-ignore
import EliteFourKill from './EliteFourKill.jsx';
// @ts-ignore
import SelectedAnchorSuite from './SelectedAnchorSuite.jsx';
// @ts-ignore
import AdaptiveAnchorSuite from './AdaptiveAnchorSuite.jsx';
// @ts-ignore
import DrawFingerprintControl from './DrawFingerprintControl.jsx';
// @ts-ignore
import TieredKillCombo from './TieredKillCombo.jsx';
// @ts-ignore
import RiskControlledFive from './RiskControlledFive.jsx';
// @ts-ignore
import RoughCopulaRqaKill from './RoughCopulaRqaKill.jsx';
// @ts-ignore
import DynamicSevenKill from './DynamicSevenKill.jsx';
// @ts-ignore
import SpecialTailPredictor from './SpecialTailPredictor.jsx';
// @ts-ignore
import StableFiveKill from './StableFiveKill.jsx';
// @ts-ignore
import SpecialCodeTracker from './SpecialCodeTracker.jsx';
// @ts-ignore
import AStockAnalyzer from './AStockAnalyzer.jsx';
import AgentChat from './AgentChat';

const routes = [
  {
    path: '/agent',
    label: 'AI 智能助手',
    section: 'AI 工具',
    element: <AgentChat />,
  },
  {
    path: '/stock-analyzer',
    label: 'A股研究助手',
    section: '股票研究',
    element: <AStockAnalyzer />,
  },
  // { path: '/', label: '首页香港预测', section: '预测', element: <KillPredictorHK /> },
  { path: '/kill', label: '基础杀码', section: '杀码', element: <KillPredictor /> },
  {
    path: '/kill/ten-position-stats',
    label: '10杀位置概率',
    section: '杀码',
    element: <KillTenPositionStats />,
  },
  {
    path: '/kill/likely22-position-stats',
    label: '22码反向未出现概率',
    section: '杀码',
    element: <Likely22PositionStats />,
  },
  {
    path: '/kill/bayesian-position-selector',
    label: '近10期冠军择位',
    section: '杀码',
    element: <BayesianPositionSelector />,
  },
  // { path: '/kill/new', label: 'NewKill 多模型', section: '杀码', element: <NewKillPredictor /> },
  {
    path: '/kill/markov2-position-six',
    label: '二阶马尔可夫第6位-1',
    section: '杀码',
    element: <Markov2PositionSixStats />,
  },
  {
    path: '/kill/frequency-position-five',
    label: '频率模型第5位',
    section: '杀码',
    element: <FrequencyPositionFiveStats />,
  },
  {
    path: '/kill/knn-position-five',
    label: '相似期KNN第5位-1',
    section: '杀码',
    element: (
      <FocusedModelPositionStats
        endpoint="/api/predictor/knn-position-five"
        title="相似期 KNN · 第5位"
        eyebrow="Similar-period KNN position statistics"
        description="从 NewKill 多模型中的相似期 KNN 排序取第5位，逐期滚动验证近10、20、50、100期杀码成功率。"
        accent="#22d3ee"
        accentSoft="#164e63"
      />
    ),
  },
  {
    path: '/kill/markov-position-eight',
    label: '一阶马尔可夫第8位',
    section: '杀码',
    element: (
      <FocusedModelPositionStats
        endpoint="/api/predictor/markov-position-eight"
        title="一阶马尔可夫 · 第8位"
        eyebrow="First-order Markov position statistics"
        description="从 NewKill 多模型中的一阶马尔可夫排序取第8位，逐期滚动验证近10、20、50、100期杀码成功率。"
        accent="#f59e0b"
        accentSoft="#78350f"
      />
    ),
  },
  // {
  //   path: '/kill/smart7-position-stats',
  //   label: '智能7码位置概率',
  //   section: '杀码',
  //   element: <SmartSevenPositionStats />,
  // },
  {
    path: '/kill/h47',
    label: 'Hybrid 4-7 固定策略',
    section: '杀码',
    element: <FixedHybridKillPredictor />,
  },
  // { path: '/kill/math3', label: '数学 3 杀', section: '杀码', element: <MathKillPredictor /> },
  // { path: '/kill/seven', label: '七码统计', section: '杀码', element: <KillSevenStats /> },
  // { path: '/kill/hk', label: '香港杀码', section: '杀码', element: <KillPredictorHK /> },
  // { path: '/kill/two', label: '二杀码', section: '杀码', element: <KillTwoPredictor /> },
  { path: '/kill/five-period', label: '五期杀码', section: '杀码', element: <FivePeriodKill /> },
  // { path: '/kill/ten', label: '十码全杀', section: '杀码', element: <KillTen /> },
  // { path: '/kill/one', label: '一杀（单杀）', section: '杀码', element: <KillOne /> },
  // { path: '/kill/tail-ten', label: '尾数十位单杀', section: '杀码', element: <TailTenKill /> },
  // { path: '/kill/multi-dim', label: '多维单杀择优', section: '杀码', element: <MultiDimKill /> },
  // {
  //   path: '/kill/experimental-98',
  //   label: '98实验单杀',
  //   section: '杀码',
  //   element: <ExperimentalKill98 />,
  // },
  {
    path: '/kill/experimental-99',
    label: '99组合实验',
    section: '杀码',
    element: <ExperimentalKill99 />,
  },
  // {
  //   path: '/kill/experimental-guarded',
  //   label: '候选换位实验',
  //   section: '杀码',
  //   element: <ExperimentalGuardedKill />,
  // },
  {
    path: '/kill/gap-score',
    label: 'Gap F20实验',
    section: '杀码',
    element: <GapScoreKill />,
  },
  // {
  //   path: '/kill/state-risk',
  //   label: '状态条件风险第5位',
  //   section: '杀码',
  //   element: <StateRiskKill />,
  // },
  // {
  //   path: '/kill/ten-anchor-shift',
  //   label: '十期锚点位移',
  //   section: '杀码',
  //   element: <TenAnchorShiftKill />,
  // },
  // {
  //   path: '/kill/previous-seven-quad',
  //   label: '上一期七码四倍映射',
  //   section: '杀码',
  //   element: <PreviousSevenQuadKill />,
  // },
  // {
  //   path: '/kill/quadratic-anchor-53',
  //   label: '53期二次锚点',
  //   section: '杀码',
  //   element: <QuadraticAnchor53Kill />,
  // },
  // {
  //   path: '/kill/anchor-phase-14',
  //   label: '14期锚点＋期号相位',
  //   section: '杀码',
  //   element: <AnchorPhase14Kill />,
  // },
  {
    path: '/kill/quadratic-anchor-49-seven',
    label: '49期七码二次锚点',
    section: '杀码',
    element: <QuadraticAnchor49SevenKill />,
  },
  {
    path: '/kill/quadratic-anchor-17-first',
    label: '17期首位二次锚点',
    section: '杀码',
    element: <QuadraticAnchor17FirstKill />,
  },
  {
    path: '/kill/dual-time-anchor',
    label: '双时间尺度锚点',
    section: '杀码',
    element: <DualTimeAnchorKill />,
  },
  {
    path: '/kill/linear-anchor-63-first',
    label: '63期首位线性锚点',
    section: '杀码',
    element: <LinearAnchor63FirstKill />,
  },
  {
    path: '/kill/rough-copula-rqa',
    label: '粗糙集·Copula·RQA',
    section: '杀码',
    element: <RoughCopulaRqaKill />,
  },
  // {
  //   path: '/kill/spectral-cancellation',
  //   label: '多分辨率频谱相消',
  //   section: '杀码',
  //   element: <SpectralCancellationKill />,
  // },
  // {
  //   path: '/kill/latent-factor',
  //   label: '低秩动态因子',
  //   section: '杀码',
  //   element: <LatentFactorKill />,
  // },
  // {
  //   path: '/kill/logistic-diffusion',
  //   label: '逻辑扩散粒子滤波',
  //   section: '杀码',
  //   element: <LogisticDiffusionKill />,
  // },
  // {
  //   path: '/kill/robust-block',
  //   label: '分布鲁棒块一致性',
  //   section: '杀码',
  //   element: <RobustBlockKill />,
  // },
  // {
  //   path: '/kill/short-long-anchor-1-49',
  //   label: '1+49期短长双锚点',
  //   section: '杀码',
  //   element: <ShortLongAnchor149Kill />,
  // },
  {
    path: '/kill/dual-anchor-49-63',
    label: '49+63期双锚点',
    section: '杀码',
    element: <DualAnchor4963Kill />,
  },
  {
    path: '/kill/triple-anchor-linear',
    label: '三锚点线性回绕',
    section: '杀码',
    element: <TripleAnchorLinearKill />,
  },
  {
    path: '/kill/draw-fingerprint-control',
    label: '开奖号指纹对照',
    section: '杀码',
    element: <DrawFingerprintControl />,
  },
  {
    path: '/kill/anchor-interaction-suite',
    label: '锚点交互四公式',
    section: '杀码',
    element: <AnchorInteractionSuite />,
  },
  // {
  //   path: '/kill/gated-anchor-suite',
  //   label: '门控锚点五公式',
  //   section: '杀码',
  //   element: <GatedAnchorSuite />,
  // },
  // {
  //   path: '/kill/elite-four',
  //   label: '四算法实战对照',
  //   section: '杀码',
  //   element: <EliteFourKill />,
  // },
  {
    path: '/kill/selected-anchor-suite',
    label: '新锚点 G～J',
    section: '杀码',
    element: <SelectedAnchorSuite />,
  },
  {
    path: '/kill/adaptive-anchor-suite',
    label: 'K/R50/R20/50/M10/A100',
    section: '杀码',
    element: <AdaptiveAnchorSuite />,
  },
  // {
  //   path: '/kill/tiered-combo',
  //   label: '分档组合杀码',
  //   section: '杀码',
  //   element: <TieredKillCombo />,
  // },
  // {
  //   path: '/kill/risk-controlled-five',
  //   label: '风险受控五码',
  //   section: '杀码',
  //   element: <RiskControlledFive />,
  // },
  // {
  //   path: '/kill/tail-gated-dual',
  //   label: '期号尾门控双公式',
  //   section: '杀码',
  //   element: <TailGatedDualKill />,
  // },
  // {
  //   path: '/kill/stable-five',
  //   label: '稳健5杀三连',
  //   section: '杀码',
  //   element: <StableFiveKill />,
  // },
  // {
  //   path: '/kill/dynamic-seven',
  //   label: '动态学习7杀',
  //   section: '杀码',
  //   element: <DynamicSevenKill />,
  // },
  // { path: '/kill/p_one', label: '前五期选一杀', section: '杀码', element: <POneKill /> },
  // { path: '/kill/combo', label: '6杀组合回测', section: '杀码', element: <KillComboBacktest /> },
  // { path: '/kill/combo-seven', label: '四页组合7杀', section: '杀码', element: <KillComboSeven /> },
  // {
  //   path: '/kill/combo-seven-strict',
  //   label: '严格滚动7杀',
  //   section: '杀码',
  //   element: <KillComboSevenStrict />,
  // },
  {
    path: '/special-tail',
    label: '特别号尾数预测',
    section: '预测',
    element: <SpecialTailPredictor />,
  },
  {
    path: '/special-code-tracker',
    label: '特别码跟踪',
    section: '预测',
    element: <SpecialCodeTracker />,
  },
  // { path: '/hot-pick', label: 'HotPick', section: '选号', element: <HotPickPredictor /> },
  // { path: '/hot-pick/opt', label: 'HotPick Opt', section: '选号', element: <HotPickPredictorOpt /> },
  // { path: '/crawler', label: '数据抓取', section: '管理', element: <Crawler /> },
  { path: '/history', label: '历史数据管理', section: '管理', element: <HistoryManager /> },
];

function MenuIcon() {
  return (
    <span className="app-menu-icon" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const sections = [...new Set(routes.map((route) => route.section))];

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.classList.toggle('app-drawer-open', open);
    return () => document.body.classList.remove('app-drawer-open');
  }, [open]);

  return (
    <>
      <button
        className="app-menu-button"
        type="button"
        onClick={() => setOpen(true)}
        aria-label="打开页面菜单"
        aria-expanded={open}
      >
        <MenuIcon />
        <span>菜单</span>
      </button>

      <div
        className={`app-drawer-backdrop ${open ? 'is-open' : ''}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <aside className={`app-drawer ${open ? 'is-open' : ''}`} aria-label="页面菜单">
        <div className="app-drawer-head">
          <div>
            <div className="app-drawer-title">功能菜单</div>
            <div className="app-drawer-subtitle">全部路由入口</div>
          </div>
          <button
            className="app-drawer-close"
            type="button"
            onClick={() => setOpen(false)}
            aria-label="关闭页面菜单"
          >
            ×
          </button>
        </div>

        <nav className="app-drawer-nav">
          {sections.map((section) => (
            <div className="app-drawer-section" key={section}>
              <div className="app-drawer-section-title">{section}</div>
              {routes
                .filter((route) => route.section === section)
                .map((route) => (
                  <NavLink
                    key={route.path}
                    to={route.path}
                    end={route.path === '/'}
                    className={({ isActive }) => `app-drawer-link ${isActive ? 'is-active' : ''}`}
                  >
                    <span>{route.label}</span>
                    <small>{route.path}</small>
                  </NavLink>
                ))}
            </div>
          ))}
        </nav>
      </aside>

      {children}
    </>
  );
}

// fabu
createRoot(document.getElementById('root')!).render(
  <BrowserRouter basename="/fe">
    <AppShell>
      <Routes>
        {routes.map((route) => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}
      </Routes>
    </AppShell>
  </BrowserRouter>,
);
