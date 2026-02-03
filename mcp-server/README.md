# Lottery Predictor MCP Server

彩票预测 MCP Server，供 AI Agent 调用。

## 快速开始

```bash
# 安装依赖
npm install

# 运行
node index.js
```

## 配置到 Claude Desktop

编辑 `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "lottery-predictor": {
      "command": "node",
      "args": ["/Users/yang/fe/fe/mcp-server/index.js"]
    }
  }
}
```

## 可用工具

| 工具               | 描述             |
| ------------------ | ---------------- |
| `predict_numbers`  | 综合预测下期号码 |
| `kill_numbers`     | 杀码推荐         |
| `analyze_hot_cold` | 热号冷号分析     |
