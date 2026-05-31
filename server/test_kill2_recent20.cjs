const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/src/app.module.js');
const { PredictorKill2Service } = require('./dist/src/predictor/predictor-kill2.service.js');

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const service = app.get(PredictorKill2Service);

  console.log('\n======================================');
  console.log('   默认数据源 (Default) 近20期回测');
  console.log('======================================');
  const resDefault = await service.getHotPickKill2PredictionResponse('default', { forceRefresh: true });
  console.log('当前推荐排除:', resDefault.predictions.map(p => `${p.n} (置信度:${p.killProbability}%)`).join(', ') || '当前无推荐');
  console.log('诊断结论:', resDefault.note);
  
  if (resDefault.backtest) {
    const details20 = resDefault.backtest.details.slice(0, 20);
    const correctPeriods = details20.filter(d => d.failed.length === 0).length;
    const accuracy20 = (correctPeriods / 20) * 100;
    
    let totalPredicted = 0;
    let totalCorrect = 0;
    details20.forEach(d => {
      totalPredicted += d.predicted.length;
      totalCorrect += d.correctCount;
    });
    const singleAccuracy20 = totalPredicted > 0 ? (totalCorrect / totalPredicted) * 100 : 0;

    console.log(`近 20 期滚动双排除全中率 (0误杀率): ${accuracy20.toFixed(1)}% (${correctPeriods}/20)`);
    console.log(`近 20 期滚动单号杀码准确率: ${singleAccuracy20.toFixed(1)}% (${totalCorrect}/${totalPredicted})`);
    console.log('\n--- 默认数据源近20期每日明细 ---');
    details20.forEach(d => {
      console.log(`倒数第 ${String(d.periodOffset).padStart(2, ' ')} 期: 排除 [${d.predicted.map(p => p.n).join(', ')}] | 实际开奖: [${d.actual.join(', ')}] | 状态: ${d.failed.length > 0 ? `误杀: [${d.failed.join(', ')}] ❌` : '成功 (0误杀) ✅'}`);
    });
  }

  console.log('\n======================================');
  console.log('   香港数据源 (Hong Kong) 近20期回测');
  console.log('======================================');
  const resHk = await service.getHotPickKill2PredictionResponse('hk', { forceRefresh: true });
  console.log('当前推荐排除:', resHk.predictions.map(p => `${p.n} (置信度:${p.killProbability}%)`).join(', ') || '当前无推荐');
  console.log('诊断结论:', resHk.note);
  
  if (resHk.backtest) {
    const details20 = resHk.backtest.details.slice(0, 20);
    const correctPeriods = details20.filter(d => d.failed.length === 0).length;
    const accuracy20 = (correctPeriods / 20) * 100;
    
    let totalPredicted = 0;
    let totalCorrect = 0;
    details20.forEach(d => {
      totalPredicted += d.predicted.length;
      totalCorrect += d.correctCount;
    });
    const singleAccuracy20 = totalPredicted > 0 ? (totalCorrect / totalPredicted) * 100 : 0;

    console.log(`近 20 期滚动双排除全中率 (0误杀率): ${accuracy20.toFixed(1)}% (${correctPeriods}/20)`);
    console.log(`近 20 期滚动单号杀码准确率: ${singleAccuracy20.toFixed(1)}% (${totalCorrect}/${totalPredicted})`);
    console.log('\n--- 香港数据源近20期每日明细 ---');
    details20.forEach(d => {
      console.log(`倒数第 ${String(d.periodOffset).padStart(2, ' ')} 期: 排除 [${d.predicted.map(p => p.n).join(', ')}] | 实际开奖: [${d.actual.join(', ')}] | 状态: ${d.failed.length > 0 ? `误杀: [${d.failed.join(', ')}] ❌` : '成功 (0误杀) ✅'}`);
    });
  }

  await app.close();
}

bootstrap().catch(err => {
  console.error('测试运行失败:', err);
  process.exit(1);
});
