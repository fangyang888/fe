# 第 1 课：ChatOpenAI、model.invoke() 与 Tool

这节课只解决三个问题：

1. ChatOpenAI 到底是什么。
2. model.invoke() 调用时发生了什么。
3. calculatorTool 为什么这样写，以及如何自己增加一个字符串工具。

先不要急着学习 RAG、记忆、LangGraph 或多 Agent。把这一课完全理解后，再进入后面的内容。

## 学习完成标准

学完后，你应该能不用看答案解释：

- new ChatOpenAI() 和 model.invoke() 的区别。
- 模型、Agent、Tool 三者的关系。
- tool() 的两个参数分别是什么。
- Zod Schema 为什么不是普通 TypeScript 类型。
- 用户说“计算 2 × 3”之后，谁决定调用工具、谁执行工具。
- createAgentTools() 为什么返回一个数组。
- 如何自己增加一个 transform_text 工具。

---

## 一、先建立整体认识

把智能客服想象成一个公司：

| 程序概念 | 公司里的角色 |
| --- | --- |
| ChatOpenAI | 能联系大模型的电话 |
| 大模型 | 会理解语言和做决定的客服人员 |
| Tool | 客服人员可以使用的内部系统 |
| createAgent() | 管理客服人员使用内部系统的工作流程 |
| Zod | 内部系统入口处的参数检查员 |
| NestJS Controller | 对外接待客户的窗口 |

用户询问：

~~~text
请计算 125 × 8
~~~

系统内部大致发生：

~~~text
用户请求
  ↓
NestJS Controller
  ↓
Agent
  ↓
大模型判断：这是计算问题，需要 calculator
  ↓
Zod 验证 calculator 参数
  ↓
TypeScript 执行 calculator 函数
  ↓
工具返回 1000
  ↓
大模型组织中文回答
  ↓
用户看到“125 × 8 = 1000”
~~~

这里最重要的区别是：

- 大模型负责理解问题和决定下一步。
- Tool 负责执行确定的程序逻辑。
- Agent 负责让模型和 Tool 循环配合。

---

## 二、ChatOpenAI 是什么

项目中通过下面的代码导入它：

~~~ts
import { ChatOpenAI } from '@langchain/openai';
~~~

ChatOpenAI 是 LangChain 对 OpenAI Chat Model 接口的封装。它负责：

- 保存模型名称和调用配置。
- 读取 API Key。
- 把 LangChain 消息转换成模型供应商需要的请求。
- 向模型接口发送 HTTP 请求。
- 把供应商响应转换成 LangChain 的 AIMessage。
- 支持普通调用、流式调用、Tool Calling 和结构化输出。

### 1. 创建模型对象

当前 agent.service.ts 中有：

~~~ts
const model = new ChatOpenAI({
  apiKey,
  model: this.getModelName(),
  temperature: 0,
  ...(baseURL
    ? {
        configuration: { baseURL },
      }
    : {}),
});
~~~

下面逐项解释。

### 2. apiKey

~~~ts
apiKey,
~~~

用于模型供应商鉴权。它来自服务端 .env：

~~~dotenv
OPENAI_API_KEY=你的模型API密钥
~~~

API Key 只能存在后端，不能返回给前端，也不能提交到 Git。

### 3. model

~~~ts
model: this.getModelName(),
~~~

指定调用哪个模型。当前代码会优先读取：

~~~dotenv
OPENAI_MODEL=模型名称
~~~

如果没有配置，就使用代码中的默认模型。

### 4. temperature

~~~ts
temperature: 0,
~~~

控制回答的随机性。对客服、分类和工具调用，一般希望结果稳定，所以通常设置得比较低。

不要把它理解为“正确率”：

- 低 temperature：回答倾向稳定、一致。
- 高 temperature：回答倾向多样、有创造性。
- temperature 再低也不能保证模型不出错。

### 5. configuration.baseURL

~~~ts
configuration: { baseURL }
~~~

指定模型接口地址：

- 使用官方 OpenAI 接口时，可以使用官方 Base URL。
- 使用 OpenAI 兼容网关时，填写网关的 /v1 地址。

当前代码的展开写法：

~~~ts
...(baseURL ? { configuration: { baseURL } } : {})
~~~

表示：

- baseURL 有值，就加入 configuration。
- baseURL 为空，就什么都不加入，让 SDK 使用默认地址。

### 6. 创建对象不等于调用模型

执行：

~~~ts
const model = new ChatOpenAI({ ... });
~~~

通常只是创建和配置一个模型客户端，并没有真正发送用户问题。

真正发起网络请求的是：

~~~ts
await model.invoke(...);
~~~

可以类比：

~~~text
new ChatOpenAI() = 准备一部电话并保存号码
model.invoke()    = 真正拨打电话并进行一次通话
~~~

---

## 三、model.invoke() 是什么

最简单的调用：

~~~ts
const response = await model.invoke('你好');
~~~

完整一点可以传消息数组：

~~~ts
const response = await model.invoke([
  {
    role: 'system',
    content: '你是商城中文客服，回答要简洁准确。',
  },
  {
    role: 'user',
    content: '你能做什么？',
  },
]);
~~~

### 1. 为什么需要 await

模型调用是网络请求，无法立刻得到结果：

~~~ts
const response = await model.invoke(...);
~~~

await 表示：

~~~text
等待这个 Promise 完成，再继续执行下一行代码。
~~~

因此包含 await 的函数需要声明为 async：

~~~ts
async function askModel() {
  const response = await model.invoke('你好');
  return response;
}
~~~

### 2. invoke 的输入

常见输入有两种。

直接传字符串：

~~~ts
await model.invoke('你好');
~~~

适合最简单的学习和测试。

传消息数组：

~~~ts
await model.invoke([
  { role: 'system', content: '你是中文客服。' },
  { role: 'user', content: '我的订单发货了吗？' },
]);
~~~

常见角色：

| role | 含义 |
| --- | --- |
| system | 规定模型身份、规则和行为 |
| user | 用户发送的内容 |
| assistant | 模型之前的回答 |
| tool | 工具执行结果，通常由 Agent 管理 |

多轮会话本质上就是把之前的消息一起传给模型。

### 3. invoke 的输出

model.invoke() 返回的不是普通字符串，而是一个 AIMessage 对象。

概念上类似：

~~~ts
{
  content: '你好，我可以帮助你查询商品和订单。',
  response_metadata: {
    // 模型供应商返回的其他信息
  },
  usage_metadata: {
    // 如果供应商支持，可能包含 Token 使用量
  }
}
~~~

所以通常读取：

~~~ts
const response = await model.invoke('你好');
console.log(response.content);
~~~

content 不一定永远是字符串。支持多模态或复杂内容块时，它可能是数组，因此当前项目有 extractText() 专门安全提取文字。

### 4. 普通模型调用不会自动执行工具

如果只写：

~~~ts
await model.invoke('查询我的订单');
~~~

模型并不知道你的数据库，也不能自动调用 OrderService。

即使使用：

~~~ts
const modelWithTools = model.bindTools([someTool]);
~~~

模型也只是能够产生 Tool Call。你仍然需要处理：

1. 查看模型想调用什么工具。
2. 验证工具参数。
3. 执行工具。
4. 把结果作为 ToolMessage 交回模型。
5. 再次调用模型得到最终回答。

createAgent() 就是帮你管理这套循环。

---

## 四、model.invoke() 与 agent.invoke() 的区别

### 普通模型调用

~~~ts
const response = await model.invoke([
  { role: 'user', content: '你好' },
]);
~~~

特点：

- 通常只进行一次模型调用。
- 返回一个 AIMessage。
- 不会自动循环执行自定义工具。
- 适合摘要、翻译、分类和简单回答。

### Agent 调用

当前项目中：

~~~ts
const result = await this.getAgent().invoke({
  messages: [{ role: 'user', content: message }],
});
~~~

特点：

- Agent 内部可能调用模型多次。
- Agent 可以执行一个或多个 Tool。
- Tool 结果会重新交给模型。
- 最后返回包含完整消息列表的状态。

当前代码因此需要取最后一条消息：

~~~ts
const lastMessage = result.messages.at(-1);
~~~

对比：

~~~text
model.invoke()
  输入消息 → 模型 → AIMessage

agent.invoke()
  输入消息 → 模型 → Tool → 模型 → ... → 最终状态
~~~

### 什么时候用哪个

使用 model.invoke()：

- 判断问题属于订单、商品还是售后。
- 将长文本总结成一句话。
- 从用户话语中提取订单号。
- 不需要工具的普通问答。

使用 agent.invoke()：

- 模型需要自己判断应该查询哪个系统。
- 一个问题可能需要连续调用多个 Tool。
- 用户表达比较自由，不能用固定代码提前判断流程。

---

## 五、逐行看懂 calculatorTool

当前工具的结构可以简化为：

~~~ts
const calculatorTool = tool(
  ({ operation, left, right }) => {
    // 真正执行计算的函数
  },
  {
    name: 'calculator',
    description: '对两个数字执行加、减、乘、除运算。',
    schema: z.object({
      operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
      left: z.number(),
      right: z.number(),
    }),
  },
);
~~~

tool() 接收两个主要参数：

~~~text
tool(执行函数, 工具说明配置)
~~~

### 1. 第一个参数：执行函数

~~~ts
({ operation, left, right }) => {
  // ...
}
~~~

输入原本是一个对象：

~~~ts
{
  operation: 'multiply',
  left: 125,
  right: 8,
}
~~~

代码使用对象解构，直接取出三个字段：

~~~ts
({ operation, left, right })
~~~

相当于：

~~~ts
input => {
  const operation = input.operation;
  const left = input.left;
  const right = input.right;
}
~~~

### 2. 计算逻辑

~~~ts
let result: number;
~~~

声明一个数字变量，后面根据 operation 赋值。

~~~ts
switch (operation) {
  case 'add':
    result = left + right;
    break;
  case 'subtract':
    result = left - right;
    break;
  case 'multiply':
    result = left * right;
    break;
  case 'divide':
    if (right === 0) {
      return '计算失败：除数不能为 0。';
    }
    result = left / right;
    break;
}
~~~

这里不让模型自己计算，而是让 TypeScript 执行确定的数学运算。这样比依赖模型心算更稳定。

### 3. 有限数字检查

~~~ts
if (!Number.isFinite(result)) {
  return '计算失败：结果不是有限数字。';
}
~~~

用于拒绝 Infinity、-Infinity 和 NaN 等异常结果。

### 4. 返回字符串

~~~ts
return String(result);
~~~

工具返回字符串 1000 后，LangChain 会把它转换成 ToolMessage，再交给模型。模型看到工具结果后，负责组织最终回答。

工具也可以返回对象，例如：

~~~ts
return {
  operation,
  left,
  right,
  result,
};
~~~

结构化对象适合商品、订单等包含多个字段的数据。

---

## 六、Zod 在工具里的作用

当前 Schema：

~~~ts
schema: z.object({
  operation: z
    .enum(['add', 'subtract', 'multiply', 'divide'])
    .describe('要执行的运算'),
  left: z.number().describe('左操作数'),
  right: z.number().describe('右操作数'),
}),
~~~

它同时完成两件事。

### 1. 告诉模型参数格式

模型能看到类似下面的信息：

~~~text
calculator
- operation: add | subtract | multiply | divide
- left: number
- right: number
~~~

模型才知道应该生成：

~~~json
{
  "operation": "multiply",
  "left": 125,
  "right": 8
}
~~~

### 2. 在程序运行时验证参数

如果模型生成：

~~~json
{
  "operation": "power",
  "left": 2,
  "right": 3
}
~~~

power 不在枚举中，Zod 验证会失败，执行函数不应该正常运行。

### TypeScript 与 Zod 的区别

TypeScript 类型：

~~~ts
type CalculatorInput = {
  operation: 'add' | 'subtract' | 'multiply' | 'divide';
  left: number;
  right: number;
};
~~~

只在开发和编译时帮助程序员，编译成 JavaScript 后类型会消失。

Zod：

~~~ts
z.object({ ... })
~~~

会在程序真正运行时检查模型发来的数据。

记住：

~~~text
TypeScript 防止程序员写错。
Zod 防止运行时外部数据格式错误。
业务权限检查防止合法格式被恶意使用。
~~~

---

## 七、自己增加一个字符串工具

练习目标：增加一个名为 transform_text 的工具，支持：

- 转换为大写。
- 转换为小写。
- 删除首尾空格。
- 反转字符串。

### 第一步：设计输入

希望模型调用时生成：

~~~json
{
  "operation": "uppercase",
  "text": "hello world"
}
~~~

因此需要：

~~~text
operation: uppercase | lowercase | trim | reverse
text: string
~~~

### 第二步：自己完成空白代码

先不要看后面的参考实现：

~~~ts
const transformTextTool = tool(
  ({ operation, text }) => {
    // TODO：根据 operation 处理 text
  },
  {
    name: 'transform_text',
    description: 'TODO：写清楚这个工具什么时候使用',
    schema: z.object({
      operation: z.enum([
        // TODO
      ]),
      text: z.string(),
    }),
  },
);
~~~

需要考虑：

- 输入字符串是否允许为空？
- 最大长度是多少？
- reverse 如何实现？
- 返回字符串还是对象？

### 第三步：参考实现

确认自己尝试过后再看：

~~~ts
const transformTextTool = tool(
  ({ operation, text }) => {
    switch (operation) {
      case 'uppercase':
        return text.toUpperCase();
      case 'lowercase':
        return text.toLowerCase();
      case 'trim':
        return text.trim();
      case 'reverse':
        return Array.from(text).reverse().join('');
    }
  },
  {
    name: 'transform_text',
    description:
      '对字符串执行大写、小写、删除首尾空格或反转操作。用户明确要求转换文本时使用。',
    schema: z.object({
      operation: z
        .enum(['uppercase', 'lowercase', 'trim', 'reverse'])
        .describe('要执行的字符串转换操作'),
      text: z
        .string()
        .min(1, 'text 不能为空')
        .max(1000, 'text 不能超过 1000 个字符')
        .describe('需要处理的原始文本'),
    }),
  },
);
~~~

为什么反转使用：

~~~ts
Array.from(text).reverse().join('')
~~~

而不是：

~~~ts
text.split('').reverse().join('')
~~~

Array.from() 对部分 Unicode 字符的处理更合理。这个实现仍不是完整的自然语言字素处理方案，但比简单 split('') 更适合作为练习。

### 第四步：把工具交给 Agent

只定义工具还不够，还要加入返回数组：

~~~ts
export function createAgentTools() {
  return [calculatorTool, currentTimeTool, transformTextTool];
}
~~~

如果忘记加入，代码虽然存在，但 Agent 看不到它，也不会调用它。

### 第五步：通过页面测试

测试：

~~~text
请把 hello world 转换成大写。
~~~

预期工具参数：

~~~json
{
  "operation": "uppercase",
  "text": "hello world"
}
~~~

预期工具结果：

~~~text
HELLO WORLD
~~~

再测试：

~~~text
请反转字符串 abc123。
~~~

预期：

~~~text
321cba
~~~

### 第六步：确认模型真的调用了工具

最终回答正确，不一定能证明模型调用了 Tool，因为模型可能自己完成简单字符串处理。

学习阶段可以：

- 在 Tool 执行函数中临时加入非敏感日志。
- 使用 Agent 流式事件观察 Tool Call。
- 查看 LangSmith Trace。

简单日志：

~~~ts
console.log('transform_text 被调用', { operation });
~~~

不要记录完整 text，因为未来可能包含用户隐私。

---

## 八、name 和 description 为什么重要

### name

~~~ts
name: 'transform_text'
~~~

是工具的程序标识。建议：

- 使用英文。
- 使用 snake_case。
- 名称简短但含义明确。
- 不要使用空格和特殊符号。

### description

~~~ts
description: '对字符串执行大写、小写、删除首尾空格或反转操作。'
~~~

模型主要根据 description 判断什么时候使用工具。

太模糊：

~~~ts
description: '处理字符串'
~~~

模型不知道具体能做什么。

太夸大：

~~~ts
description: '可以处理所有文字问题'
~~~

可能导致普通聊天也错误调用工具。

好的 description 应该包含：

- 工具能完成什么。
- 什么情况下应该使用。
- 必要时说明不能完成什么。

---

## 九、常见误区

### 误区 1：Tool 是模型内部能力

不是。Tool 是运行在 NestJS 服务器中的 TypeScript 函数。

### 误区 2：定义 Tool 后一定会被调用

不一定。模型根据问题、description 和上下文决定是否调用。

### 误区 3：Zod 已经保证业务安全

不对。Zod 只验证格式，不验证订单归属、登录权限和金额是否可信。

### 误区 4：model.invoke() 会自动执行 Tool

不会。普通模型最多产生 Tool Call。createAgent() 才负责自动执行循环。

### 误区 5：Agent 只会调用模型一次

不一定。一次 agent.invoke() 可能包含多次模型请求和工具调用，因此延迟和费用通常高于单次 model.invoke()。

### 误区 6：工具参数一定正确

模型可能生成错误参数，所以需要 Zod、业务校验、异常处理和权限检查。

---

## 十、调试顺序

工具没有按预期执行时，按照下面顺序检查：

1. Tool 是否已经加入 createAgentTools() 返回数组。
2. Tool 的 name 是否简单、唯一。
3. description 是否明确说明使用时机。
4. Zod Schema 是否和执行函数输入一致。
5. 当前模型供应商是否支持 Tool Calling。
6. 模型生成的参数是否通过 Zod。
7. Tool 内部是否抛出数据库或网络异常。
8. Tool 返回结果是否过长或不可序列化。
9. System Prompt 是否与 description 冲突。
10. Agent 是否达到超时或循环上限。

接口一直 pending 时，检查：

1. 普通 model.invoke() 是否也 pending。
2. 模型 Base URL 从服务器是否能访问。
3. Tool 是否在等待数据库或外部接口。
4. 是否设置模型和工具超时。
5. 是否因为工具结果触发多次 Agent 循环。

---

## 十一、本课动手任务

### 必做任务

- [ ] 用自己的话解释 new ChatOpenAI()。
- [ ] 用自己的话解释 model.invoke()。
- [ ] 说出 model.invoke() 的输入和输出。
- [ ] 说出 model.invoke() 与 agent.invoke() 的区别。
- [ ] 逐行解释 calculatorTool。
- [ ] 不复制参考答案，自己写 transformTextTool。
- [ ] 将它加入 createAgentTools()。
- [ ] 用页面测试 uppercase 和 reverse。
- [ ] 确认测试时真的发生 Tool Call。
- [ ] 执行后端构建和测试。

### 思考题

1. 为什么计算器应该用 Tool，而不是让模型直接心算？
2. 为什么普通聊天不应该调用计算器？
3. 如果 operation 不使用 enum，会有什么风险？
4. 如果定义工具但没有加入 createAgentTools()，会发生什么？
5. 为什么订单 Tool 不能让模型传入 userId？
6. 什么情况更适合直接 model.invoke()，而不是 Agent？

### 推荐回答方向

不要背固定答案，至少要理解：

- 确定性计算交给程序更可靠。
- 工具调用会增加延迟和模型调用成本。
- Schema 越明确，错误参数越少。
- 身份和权限必须来自可信后端上下文。
- 简单固定任务不一定需要 Agent。

---

## 十二、官方资料

- LangChain Models：<https://docs.langchain.com/oss/javascript/langchain/models>
- LangChain Agents：<https://docs.langchain.com/oss/javascript/langchain/agents>
- LangChain Tools：<https://docs.langchain.com/oss/javascript/langchain/tools>
- Structured Output：<https://docs.langchain.com/oss/javascript/langchain/structured-output>

阅读顺序建议：Models 的 Invoke → Tools 的 Create tools → Agents 的 Tools。暂时不需要读完整文档。

## 本课学习记录

~~~text
完成日期：

我对 ChatOpenAI 的理解：

我对 model.invoke() 的理解：

我对 createAgent() 的理解：

我对 Tool 的理解：

我对 Zod 的理解：

我自己完成的字符串工具：

遇到的错误和原因：

下一课想学习的问题：
~~~
