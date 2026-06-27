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
import NewKillPredictor from './NewKillPredictor.jsx';
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
import TailTenKill from './TailTenKill.jsx';
// @ts-ignore
import MultiDimKill from './MultiDimKill.jsx';
// @ts-ignore
import ExperimentalKill98 from './ExperimentalKill98.jsx';
// @ts-ignore
import SpecialTailPredictor from './SpecialTailPredictor.jsx';

const routes = [
  // { path: '/', label: '首页香港预测', section: '预测', element: <KillPredictorHK /> },
  { path: '/kill', label: '基础杀码', section: '杀码', element: <KillPredictor /> },
  { path: '/kill/new', label: 'NewKill 多模型', section: '杀码', element: <NewKillPredictor /> },
  {
    path: '/kill/h47',
    label: 'Hybrid 4-7 固定策略',
    section: '杀码',
    element: <FixedHybridKillPredictor />,
  },
  { path: '/kill/math3', label: '数学 3 杀', section: '杀码', element: <MathKillPredictor /> },
  // { path: '/kill/seven', label: '七码统计', section: '杀码', element: <KillSevenStats /> },
  // { path: '/kill/hk', label: '香港杀码', section: '杀码', element: <KillPredictorHK /> },
  { path: '/kill/two', label: '二杀码', section: '杀码', element: <KillTwoPredictor /> },
  { path: '/kill/five-period', label: '五期杀码', section: '杀码', element: <FivePeriodKill /> },
  // { path: '/kill/ten', label: '十码全杀', section: '杀码', element: <KillTen /> },
  { path: '/kill/one', label: '一杀（单杀）', section: '杀码', element: <KillOne /> },
  { path: '/kill/tail-ten', label: '尾数十位单杀', section: '杀码', element: <TailTenKill /> },
  { path: '/kill/multi-dim', label: '多维单杀择优', section: '杀码', element: <MultiDimKill /> },
  { path: '/kill/experimental-98', label: '98实验单杀', section: '杀码', element: <ExperimentalKill98 /> },
  { path: '/kill/p_one', label: '前五期选一杀', section: '杀码', element: <POneKill /> },
  { path: '/kill/combo', label: '6杀组合回测', section: '杀码', element: <KillComboBacktest /> },
  { path: '/special-tail', label: '特别号尾数预测', section: '预测', element: <SpecialTailPredictor /> },
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
