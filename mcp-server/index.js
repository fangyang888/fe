#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as algorithms from "./lib/algorithms.js";

// 创建 MCP Server
const server = new Server(
  {
    name: "lottery-predictor",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 注册可用工具列表
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "predict_numbers",
        description: "综合预测下一期号码，使用多种算法（B、C、I、M、L）并返回最可能的7个数字",
        inputSchema: {
          type: "object",
          properties: {
            history: {
              type: "array",
              description: "历史开奖数据，每行7个数字的二维数组",
              items: {
                type: "array",
                items: { type: "number" }
              }
            }
          },
          required: ["history"]
        }
      },
      {
        name: "kill_numbers",
        description: "杀码推荐，预测下一期不会出现的号码，使用 K1-K5 等多种杀码算法",
        inputSchema: {
          type: "object",
          properties: {
            history: {
              type: "array",
              description: "历史开奖数据，每行7个数字的二维数组",
              items: {
                type: "array",
                items: { type: "number" }
              }
            }
          },
          required: ["history"]
        }
      },
      {
        name: "analyze_hot_cold",
        description: "分析热号和冷号，返回最近出现频率最高和最低的数字",
        inputSchema: {
          type: "object",
          properties: {
            history: {
              type: "array",
              description: "历史开奖数据",
              items: {
                type: "array",
                items: { type: "number" }
              }
            }
          },
          required: ["history"]
        }
      }
    ]
  };
});

// 处理工具调用
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const history = args.history;

  if (!history || !Array.isArray(history) || history.length < 2) {
    return {
      content: [{ type: "text", text: "错误：需要至少2行历史数据" }]
    };
  }

  try {
    switch (name) {
      case "predict_numbers": {
        const results = {
          B: algorithms.predictB(history),
          C: algorithms.predictC(history),
          I: algorithms.predictI(history),
          M: algorithms.predictM(history),
        };
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              message: "预测结果",
              predictions: results
            }, null, 2)
          }]
        };
      }

      case "kill_numbers": {
        const killResult = algorithms.predictKillNumbers(history);
        const k1 = algorithms.predictK1(history);
        const k2 = algorithms.predictK2(history);
        const k3 = algorithms.predictK3(history);
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              message: "杀码推荐（这些号码下期不太可能出现）",
              综合推荐: killResult,
              K1_马尔可夫: k1,
              K2_周期性: k2,
              K3_连续排除: k3
            }, null, 2)
          }]
        };
      }

      case "analyze_hot_cold": {
        const hotCold = algorithms.computeHotCold(history);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              message: "热号冷号分析（基于最近15期）",
              热号_频率最高: hotCold.hot,
              冷号_频率最低: hotCold.cold
            }, null, 2)
          }]
        };
      }

      default:
        return {
          content: [{ type: "text", text: `未知工具: ${name}` }]
        };
    }
  } catch (error) {
    return {
      content: [{ type: "text", text: `执行错误: ${error.message}` }]
    };
  }
});

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Lottery Predictor MCP Server is running...");
}

main().catch(console.error);
