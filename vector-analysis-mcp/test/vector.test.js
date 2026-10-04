import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {createVectorAnalysis, cutoffHistory, validateArgs, vectorTools} from '../lib/vector-analysis.js';
import engine from '../generated/vector/likely32Lab.js';

function fixture(count) {
  let seed = 94173;
  return Array.from({length: count}, (_, i) => {
    const numbers = [];
    while (numbers.length < 7) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const n = seed % 49 + 1;
      if (!numbers.includes(n)) numbers.push(n);
    }
    return {year: 2026, No: i + 1, ...Object.fromEntries(numbers.map((n, j) => [`n${j + 1}`, n]))};
  });
}
const stable = value => {const {fetchedAt, ...rest} = value; return rest;};

test('validates arguments before accessing history and rejects missing cutoff periods', async () => {
  const call = createVectorAnalysis({loadHistory: () => {throw new Error('must not fetch');}});
  for (const [name, args] of [['unknown', {}], ['get_vector_forecast', {pick_count: 35}], ['get_draw_history', {limit: 0}], ['backtest_vector_models', {window: 25}], ['get_vector_forecast', {url: 'https://example.com'}], ['explain_vector_forecast', {as_of: {year: 2026, No: 0}}]]) {
    await assert.rejects(call(name, args), error => !error.message.includes('must not fetch'));
  }
  assert.throws(() => cutoffHistory(fixture(20), {year: 2026, No: 21}), /不存在/);
  assert.throws(() => cutoffHistory([], undefined), /为空/);
  assert.throws(() => validateArgs('get_draw_history', []), /对象/);
});

test('cuts off future data before parsing, learning, or caching', async () => {
  let history = fixture(251);
  const call = createVectorAnalysis({loadHistory: async () => history});
  const args = {as_of: {year: 2026, No: 250}, pick_count: 36};
  const before = await call('get_vector_forecast', args);
  history = history.map(r => r.No === 251 ? {...r, n7: 500} : r);
  const after = await call('get_vector_forecast', args);
  assert.deepEqual(stable(after), stable(before));
  assert.equal(before.historyCount, 250);
  assert.equal(before.through.No, 250);
  await assert.rejects(call('get_vector_forecast', {}), /无效/);
  const limited = await call('get_draw_history', {as_of: {year: 2026, No: 250}, limit: 5});
  assert.deepEqual(limited.draws.map(r => r.No), [246,247,248,249,250]);
});

test('uses the frontend engine exactly and keeps 36 as a superset of each causal 32', async () => {
  const history = fixture(251), result = engine.buildLikely32Lab(history);
  const call = createVectorAnalysis({loadHistory: async () => history});
  const report = await call('backtest_vector_models', {window: 20});
  assert.equal(report.rows.length, 20);
  const prefix = await call('get_vector_forecast', {as_of: {year: 2026, No: 250}, pick_count: 36});
  for (const row of report.rows) {
    const expected = result.rows.find(r => r.No === row.No);
    const order = engine.originalRanking(engine.parseLabHistory(history.slice(0, row.No - 1)));
    for (const m of row.models) {
      assert.deepEqual(m.picks32, [...expected.picks[m.model]].sort((a,b)=>a-b));
      const additions = order.filter(n => !m.picks32.includes(n)).slice(0,4);
      assert.deepEqual(m.picks36, [...m.picks32,...additions].sort((a,b)=>a-b));
      assert.equal(new Set(m.picks36).size,36);
      assert.equal(m.hit32,m.picks32.includes(row.special));
      assert.equal(m.hit36,m.picks36.includes(row.special));
      if(row.No===251) assert.deepEqual(prefix.predictions.find(p=>p.model===m.model).picks,m.picks36);
    }
  }
  for(const summary of report.comparisons) {
    assert.equal(summary.hits,report.rows.filter(r=>r.models.find(m=>m.model===summary.model)[summary.pickCount===32?'hit32':'hit36']).length);
    assert.equal(summary.equalProbabilityBaseline,summary.pickCount/49);
  }
  const explanation=await call('explain_vector_forecast', {});
  assert.deepEqual(explanation.vector,result.current.vector);
  assert.deepEqual(explanation.learning,result.current.vectorLearning);
  const forecast=await call('get_vector_forecast', {});
  for(const p of forecast.predictions) assert.deepEqual(p.picks,[...result.current.picks[p.model]].sort((a,b)=>a-b));
});

test('excludes learning warmup and invalidates cache when already-known history changes', async () => {
  let history=fixture(105);
  const call=createVectorAnalysis({loadHistory: async()=>history});
  const before=await call('backtest_vector_models', {include_rows:false});
  assert.equal(before.rows,undefined);
  for(const summary of before.comparisons.filter(m=>m.model==='vectorLearn')) {
    assert.equal(summary.sampleCount,0);assert.equal(summary.rate,null);assert.equal(summary.warmupExcluded,20);
  }
  assert.equal((await call('get_vector_forecast', {})).predictions[0].ready,false);
  history=history.map(r=>r.No===105?{...r,n1:r.n7,n7:r.n1}:r);
  const after=await call('backtest_vector_models', {include_rows:false});
  assert.notEqual(after.historySha256,before.historySha256);
});

test('MCP stdio handshake, tools/list, tools/call and isError work with a real client', async () => {
  const folder=await mkdtemp(join(tmpdir(),'vector-mcp-test-'));
  const file=join(folder,'history.json');await writeFile(file,JSON.stringify(fixture(140)));
  const client=new Client({name:'vector-integration-test',version:'1.0.0'});
  const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../index.js',import.meta.url))],env:{LOTTERY_HISTORY_FILE:file},stderr:'pipe'});
  try {
    await client.connect(transport);
    assert.deepEqual((await client.listTools()).tools.map(t=>t.name),vectorTools.map(t=>t.name));
    const history=await client.callTool({name:'get_draw_history',arguments:{limit:20}});
    assert.equal(JSON.parse(history.content[0].text).draws.length,20);
    const forecast=await client.callTool({name:'get_vector_forecast',arguments:{pick_count:36}});
    assert.equal(forecast.isError,undefined);assert.equal(JSON.parse(forecast.content[0].text).predictions[0].picks.length,36);
    const invalid=await client.callTool({name:'get_vector_forecast',arguments:{pick_count:50}});
    assert.equal(invalid.isError,true);
  } finally {await client.close();await rm(folder,{recursive:true,force:true});}
});
