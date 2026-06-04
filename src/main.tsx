import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
// fabu
createRoot(document.getElementById('root')!).render(
  <BrowserRouter basename="/fe">
    <Routes>
      <Route path="/" element={<KillPredictorHK />} />
      <Route path="/kill" element={<KillPredictor />} />
      <Route path="/kill/new" element={<NewKillPredictor />} />
      <Route path="/kill/math3" element={<MathKillPredictor />} />
      <Route path="/hot-pick" element={<HotPickPredictor />} />
      <Route path="/hot-pick/opt" element={<HotPickPredictorOpt />} />
      <Route path="/kill/seven" element={<KillSevenStats />} />
      <Route path="/kill/hk" element={<KillPredictorHK />} />
      <Route path="/crawler" element={<Crawler />} />
      <Route path="/history" element={<HistoryManager />} />
      <Route path="/kill/two" element={<KillTwoPredictor />} />
      <Route path="/kill/five-period" element={<FivePeriodKill />} />
    </Routes>
  </BrowserRouter>,
);
