#!/usr/bin/env node
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {CallToolRequestSchema, ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {createVectorAnalysis, vectorTools} from './lib/vector-analysis.js';
const server = new Server({name: 'lottery-vector-analysis', version: '1.0.0'}, {capabilities: {tools: {}}});
const call = createVectorAnalysis();
server.setRequestHandler(ListToolsRequestSchema, async () => ({tools: vectorTools}));
server.setRequestHandler(CallToolRequestSchema, async request => {
  try {
    const result = await call(request.params.name, request.params.arguments);
    return {content: [{type: 'text', text: JSON.stringify(result)}]};
  } catch (error) {return {isError: true, content: [{type: 'text', text: error.message || '调用失败'}]};}
});
await server.connect(new StdioServerTransport());
console.error('Vector analysis MCP ready (stdio, read-only).');
