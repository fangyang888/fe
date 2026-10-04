import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {fileURLToPath} from 'node:url';
const client = new Client({name:'vector-mcp-smoke',version:'1.0.0'});
const env = Object.fromEntries(['LOTTERY_HISTORY_URL','LOTTERY_HISTORY_FILE'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
const transport = new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../index.js',import.meta.url))],env,stderr:'inherit'});
try {
  await client.connect(transport);
  const tools = await client.listTools();
  const response = await client.callTool({name:'backtest_vector_models',arguments:{window:20,include_rows:false}},undefined,{timeout:120000});
  if (response.isError) throw new Error(response.content[0].text);
  const result = JSON.parse(response.content[0].text);
  console.log(JSON.stringify({status:'PASS',tools:tools.tools.map(t=>t.name),through:result.through,historyCount:result.historyCount,comparisons:result.comparisons},null,2));
} finally {await client.close();}
