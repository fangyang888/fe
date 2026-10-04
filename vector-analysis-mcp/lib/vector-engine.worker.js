import {parentPort, workerData} from 'node:worker_threads';
import engine from '../generated/vector/likely32Lab.js';
import {runSchedulerLab} from './scheduler.js';
import {runNumberLearning} from './number-learning.js';
try {
  const history = engine.parseLabHistory(workerData.history);
  const result = engine.buildLikely32Lab(workerData.history);
  if (workerData.analysis === 'number') {
    parentPort.postMessage({result:{...result,rows:result.rows.slice(-100),numberLearning:runNumberLearning(history,result)}});
  } else {
  // Preserve each 32-pick forecast and add four excluded original-ranking numbers.
  const expand = (picks, order) => [...picks, ...order.filter(n => !picks.includes(n)).slice(0, 4)];
  const keys = ['vectorLearn', 'vector'];
  const recent = result.rows.slice(-100).map(row => {
    const index = history.findIndex(r => r.year === row.year && r.No === row.No);
    const order = engine.originalRanking(history.slice(0, index));
    return {...row, picks36: Object.fromEntries(keys.map(key => [key, expand(row.picks[key], order)]))};
  });
  const order = engine.originalRanking(history);
  parentPort.postMessage({result: {...result, rows: recent, scheduler: runSchedulerLab(result),
    current36: Object.fromEntries(keys.map(key => [key, expand(result.current.picks[key], order)]))}});
  }
} catch (error) {parentPort.postMessage({error: error.message});}
