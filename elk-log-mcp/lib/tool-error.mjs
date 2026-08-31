// 只有主动构造的安全提示可以返回给模型；不透传浏览器异常中的页面内容。
export class ToolError extends Error {
  constructor(message, code = 'QUERY_PRECONDITION') {
    super(message);
    this.name = 'ToolError';
    this.code = code;
  }
}
