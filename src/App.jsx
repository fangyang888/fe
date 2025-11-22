
// @ts-ignore
import React, { useState } from 'react';

export default function LotteryPredictor() {
  const [input, setInput] = useState('');
  const [results, setResults] = useState(null);
  const [metrics, setMetrics] = useState([]);

  const clamp = (v) => {
    v = Math.round(v);
    return v < 1 ? 1 : v > 49 ? 49 : v;
  };

  const linearFit = (xs, ys) => {
    const n = xs.length;
    const meanX = xs.reduce((a,b)=>a+b)/n;
    const meanY = ys.reduce((a,b)=>a+b)/n;
    let num=0, den=0;
    for (let i=0;i<n;i++){
      num+=(xs[i]-meanX)*(ys[i]-meanY);
      den+=(xs[i]-meanX)**2;
    }
    const a = den===0?0:num/den;
    const b = meanY - a*meanX;

    let ssTot=0, ssRes=0;
    for (let i=0;i<n;i++){
      const pred=a*xs[i]+b;
      ssTot+=(ys[i]-meanY)**2;
      ssRes+=(ys[i]-pred)**2;
    }
    const r2 = ssTot===0?1:1-ssRes/ssTot;

    return { a,b,r2, residual:Math.sqrt(ssRes/n) };
  };

  const parseInput = () => {
    return input.trim().split(/\n/).map(l => l.split(/[, ]+/).map(Number));
  };

  const predictB = (history) => {
    const rows=history.length, xs=[...Array(rows).keys()];
    const cols=7,res=[];
    for (let c=0;c<cols;c++){
      const ys=history.map(r=>r[c]);
      const {a,b}=linearFit(xs,ys);
      res.push(clamp(a*rows+b));
    }
    return res;
  };

  const predictC = (history) => {
    const rows=history.length, cols=7, res=[];
    const last=history[rows-1], prev=history[rows-2];
    for (let c=0;c<cols;c++){
      const diff=last[c]-prev[c];
      res.push(clamp(last[c]+diff));
    }
    return res;
  };

  const predictI = (history) => {
    const rows=history.length, cols=7, res=[];
    const last=history[rows-1];
    for (let c=0;c<cols;c++){
      const avg = history.reduce((s,r)=>s+r[c],0)/rows;
      const trend = last[c] - history[rows-2][c];
      res.push(clamp(avg + trend));
    }
    return res;
  };

  const runPrediction = () => {
    const history=parseInput();
    if (!history.length || history[0].length!==7){
      alert("数据格式错误！");
      return;
    }

    const rows=history.length;
    const xs=[...Array(rows).keys()];
    const metricsTemp=[];
    for (let c=0;c<7;c++){
      const ys=history.map(r=>r[c]);
      metricsTemp.push(linearFit(xs,ys));
    }
    setMetrics(metricsTemp);

    setResults({
      B: predictB(history),
      C: predictC(history),
      I: predictI(history)
    });
  };

  return (
    <div style={{padding:20,fontFamily:'Arial'}}>
      <h2>（React版 B/C/I 三模型）</h2>
      <textarea
        style={{width:'100%',height:160,fontSize:14}}
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder="每行一组，用逗号分隔"
      />
      <br/>
      <button onClick={runPrediction} style={{padding:'8px 20px',marginTop:10}}>开始预测</button>

      {results && (
        <div style={{marginTop:20,fontSize:16}}>
          <div><b>方法 B：</b>{results.B.join(', ')}</div>
          <div><b>方法 C：</b>{results.C.join(', ')}</div>
          <div><b>方法 I：</b>{results.I.join(', ')}</div>
        </div>
      )}

      {metrics.length>0 && (
        <table style={{width:'100%',borderCollapse:'collapse',marginTop:20}}>
          <thead>
            <tr>
              <th>列</th><th>斜率a</th><th>截距b</th><th>R²</th><th>残差</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m,i)=>(
              <tr key={i}>
                <td>{i+1}</td>
                <td>{m.a.toFixed(4)}</td>
                <td>{m.b.toFixed(4)}</td>
                <td>{m.r2.toFixed(4)}</td>
                <td>{m.residual.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
