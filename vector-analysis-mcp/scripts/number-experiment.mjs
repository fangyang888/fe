import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {NUMBER_PROTOCOL,FEATURE_NAMES} from '../lib/number-learning.js';
const output=process.env.NUMBER_REPORT_PATH;
if(output)await writeFile(`${output}.protocol.json`,JSON.stringify({createdAt:new Date().toISOString(),protocol:NUMBER_PROTOCOL,features:FEATURE_NAMES},null,2));
const client=new Client({name:'number-learning-experiment',version:'1.0.0'});
const env=Object.fromEntries(['LOTTERY_HISTORY_URL','LOTTERY_HISTORY_FILE'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../index.js',import.meta.url))],env,stderr:'inherit'});
const call=async(name,args)=>{const r=await client.callTool({name,arguments:args},undefined,{timeout:120000});if(r.isError)throw Error(r.content[0].text);return JSON.parse(r.content[0].text);};
const started=Date.now();
try{
  await client.connect(transport);
  const backtest=await call('backtest_number_learner',{window:100,include_rows:true});
  const current=await call('get_number_forecast',{as_of:backtest.through});
  const report={createdAt:new Date().toISOString(),runtimeMs:Date.now()-started,backtest,current};
  if(output)await writeFile(output,JSON.stringify(report,null,2));
  console.log(JSON.stringify({runtimeMs:report.runtimeMs,through:backtest.through,windows:backtest.windows,earlier:backtest.earlier,all:backtest.all,
    current:{ready:current.prediction?.ready,trainingFrom:current.prediction?.trainingFrom,trainingThrough:current.prediction?.trainingThrough,picks:current.prediction?.picks,weights:current.prediction?.weights}},null,2));
}finally{await client.close();}
