import express from 'express';
import cors from 'cors';
import * as algorithms from './lib/algorithms.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// 首页
app.get('/', (req, res) => {
  res.json({
    name: 'Lottery Predictor API',
    version: '1.0.0',
    endpoints: {
      'POST /predict': '综合预测',
      'POST /kill': '杀码推荐',
      'POST /hot-cold': '热号冷号分析',
    },
    usage: '发送 POST 请求，body 为 { "history": [[1,2,3,4,5,6,7], ...] }'
  });
});

// 综合预测
app.post('/predict', (req, res) => {
  const { history } = req.body;
  if (!history || !Array.isArray(history) || history.length < 2) {
    return res.status(400).json({ error: '需要至少2行历史数据' });
  }
  
  try {
    const results = {
      B: algorithms.predictB(history),
      C: algorithms.predictC(history),
      I: algorithms.predictI(history),
      M: algorithms.predictM(history),
    };
    res.json({ message: '预测结果', predictions: results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 杀码推荐
app.post('/kill', (req, res) => {
  const { history } = req.body;
  if (!history || !Array.isArray(history) || history.length < 5) {
    return res.status(400).json({ error: '需要至少5行历史数据' });
  }
  
  try {
    const killResult = algorithms.predictKillNumbers(history);
    const k1 = algorithms.predictK1(history);
    const k2 = algorithms.predictK2(history);
    const k3 = algorithms.predictK3(history);
    res.json({
      message: '杀码推荐',
      综合推荐: killResult,
      K1_马尔可夫: k1,
      K2_周期性: k2,
      K3_连续排除: k3
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 热号冷号
app.post('/hot-cold', (req, res) => {
  const { history } = req.body;
  if (!history || !Array.isArray(history) || history.length < 2) {
    return res.status(400).json({ error: '需要至少2行历史数据' });
  }
  
  try {
    const hotCold = algorithms.computeHotCold(history);
    res.json({
      message: '热号冷号分析',
      热号: hotCold.hot,
      冷号: hotCold.cold
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 API 服务已启动: http://localhost:${PORT}`);
});
