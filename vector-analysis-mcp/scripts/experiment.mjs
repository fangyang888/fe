import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {SCHEDULER_PROTOCOL,CANDIDATES,SCHEDULERS} from '../lib/scheduler.js';
const output = process.env.SCHEDULER_REPORT_PATH;
if(output) await writeFile(`${output}.protocol.json`,JSON.stringify({createdAt:new Date().toISOString(),protocol:SCHEDULER_PROTOCOL,candidates:CANDIDATES},null,2));
const client=new Client({name:'agent-scheduler-experiment',version:'1.0.0'});
const env=Object.fromEntries(['LOTTERY_HISTORY_URL','LOTTERY_HISTORY_FILE'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../index.js',import.meta.url))],env,stderr:'inherit'});
async function call(name,args){const r=await client.callTool({name,arguments:args},undefined,{timeout:120000});if(r.isError)throw new Error(r.content[0].text);return JSON.parse(r.content[0].text);}
try {
  await client.connect(transport);
  const backtest=await call('backtest_scheduler',{window:100,include_rows:true});
  const current=Object.fromEntries(await Promise.all(SCHEDULERS.map(async scheduler=>[scheduler,await call('get_scheduled_forecast',{scheduler,as_of:backtest.through})])));
  const report={createdAt:new Date().toISOString(),backtest,current};
  if(output)await writeFile(output,JSON.stringify(report,null,2));
  console.log(JSON.stringify({through:backtest.through,protocol:backtest.protocol,windows:backtest.windows,earlier:backtest.earlier,all:backtest.all,
    current:Object.fromEntries(Object.entries(current).map(([k,v])=>[k,{selected:v.selected,parameters:v.parameters,members:v.members,picks:v.picks,trainingFrom:v.trainingFrom,trainingThrough:v.trainingThrough}]))},null,2));
}finally{await client.close();}
