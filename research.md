# 工具调用系统研究文档

## 1. 概述

Surf Copilot 的工具调用系统允许 AI agent 在对话过程中调用外部工具（如网页搜索），获取结果后继续生成回复。整个系统是**可插拔的接入式架构**，目前仅接入了一个工具（Tavily 搜索），但设计上支持任意扩展。

系统分为 5 个层次：

```
┌─────────────────────────────────────────────────┐
│  UI 渲染层        MessageBubble.vue             │
├─────────────────────────────────────────────────┤
│  流式循环层        useChat.ts (runStreamLoop)    │
├─────────────────────────────────────────────────┤
│  AI 抽象层         ai.ts (buildContext/streamChat)│
├─────────────────────────────────────────────────┤
│  工具定义层        tools/tavily-search.ts        │
├─────────────────────────────────────────────────┤
│  底层库            @mariozechner/pi-ai v0.55.1   │
│                    (Anthropic API 协议转换)       │
└─────────────────────────────────────────────────┘
```

---

## 2. 核心类型定义

### 2.1 应用层类型 (`src/types/chat.ts`)

```ts
// 工具调用信息 — 存储在 ChatMessage 上，跟踪完整生命周期
interface ToolCallInfo {
  readonly id: string                                    // 工具调用唯一 ID（由 Anthropic API 生成）
  readonly name: string                                  // 工具名称，如 'tavily_search'
  readonly params: Record<string, unknown>               // 工具参数，如 { query: "..." }
  readonly result?: string                               // 执行结果（纯文本）
  readonly status: 'pending' | 'running' | 'done' | 'error'  // 生命周期状态
}

// 聊天消息 — 工具调用作为可选数组嵌入在 assistant 消息上
interface ChatMessage {
  readonly id: string
  readonly role: 'user' | 'assistant'
  readonly content: string                               // 文本内容
  readonly thinkingContent?: string                      // 思考过程（extended thinking）
  readonly toolCalls?: ReadonlyArray<ToolCallInfo>       // 工具调用列表
  readonly timestamp: number
}
```

关键设计决策：**工具调用存储在 assistant 消息本身上**，而不是作为独立消息。这简化了 UI 渲染和持久化，但需要在序列化为 API 格式时做转换。

### 2.2 pi-ai 库类型

pi-ai 库定义了与 Anthropic API 对齐的类型体系：

```ts
// 工具定义 — 传递给 API 告诉模型有哪些工具可用
interface Tool<TParameters extends TSchema = TSchema> {
  name: string
  description: string
  parameters: TParameters          // TypeBox schema（自动转换为 JSON Schema）
}

// 工具调用 — 出现在 AssistantMessage.content 数组中
interface ToolCall {
  type: "toolCall"
  id: string                       // Anthropic 生成的唯一 ID
  name: string
  arguments: Record<string, any>   // 解析后的 JSON 参数
  thoughtSignature?: string        // extended thinking 签名（可选）
}

// 工具结果 — 作为独立消息发送回 API
interface ToolResultMessage<TDetails = any> {
  role: "toolResult"
  toolCallId: string               // 对应 ToolCall.id
  toolName: string
  content: (TextContent | ImageContent)[]  // 结果内容（支持文本和图片）
  details?: TDetails
  isError: boolean                 // 标记是否为错误结果
  timestamp: number
}

// 助手消息 — 可包含文本、思考、工具调用三种内容块
interface AssistantMessage {
  role: "assistant"
  content: (TextContent | ThinkingContent | ToolCall)[]
  stopReason: "stop" | "length" | "toolUse" | "error" | "aborted"
  // ... usage, model 等元数据
}

// 上下文对象 — 打包所有信息发送给 API
interface Context {
  systemPrompt?: string
  messages: Message[]
  tools?: Tool[]                   // 可选，不传则模型不会尝试调用工具
}
```

---

## 3. 工具定义与注册

### 3.1 工具定义 (`src/lib/tools/tavily-search.ts`)

每个工具由一个**定义函数**和一个**执行函数**组成：

```ts
import { Type } from '@mariozechner/pi-ai'   // TypeBox 的 re-export
import type { Tool } from '@mariozechner/pi-ai'

// 定义函数 — 返回 Tool 对象，描述工具的名称、用途和参数 schema
export function getTavilyTool(): Tool {
  return {
    name: 'tavily_search',
    description: 'Search the web for current information. Use this when the user asks about recent events, news, or anything that requires up-to-date information.',
    parameters: Type.Object({
      query: Type.String({ description: 'The search query' }),
    }),
  }
}
```

`Type.Object` 和 `Type.String` 来自 TypeBox，会被 pi-ai 自动转换为 JSON Schema 格式传递给 Anthropic API。最终 API 收到的格式：

```json
{
  "name": "tavily_search",
  "description": "Search the web for current information...",
  "input_schema": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "The search query" }
    },
    "required": ["query"]
  }
}
```

### 3.2 条件注册 (`src/composables/useChat.ts:121`)

工具不是全局注册的，而是在每次流式循环开始时按条件组装：

```ts
const tools = settings.tavilyApiKey ? [getTavilyTool()] : []
```

没有 API key → 空数组 → `buildContext` 不传 `tools` 字段 → 模型不知道有工具可用 → 不会尝试调用。

这是接入式设计的核心：**工具的存在与否完全由运行时条件决定**。

---

## 4. AI 抽象层 (`src/lib/ai.ts`)

这是一个薄封装层，隔离了 pi-ai 库的具体 API：

```ts
// 创建模型实例
export function createModel(settings: Settings) {
  const model = getModel('anthropic', settings.modelId)
  if (settings.anthropicBaseUrl) {
    model.baseUrl = settings.anthropicBaseUrl   // 支持自定义 API 端点
  }
  return model
}

// 构建上下文 — 工具数组为空时不传 tools 字段
export function buildContext(
  messages: ReadonlyArray<Message>,
  systemPrompt: string,
  tools?: Tool[],
): Context {
  return {
    systemPrompt,
    messages: [...messages],
    ...(tools && tools.length > 0 ? { tools } : {}),
  }
}

// 流式调用 — 封装 pi-ai 的 streamSimple
export function streamChat(model, context: Context, options: StreamOptions) {
  const streamOpts: Record<string, unknown> = {
    apiKey: options.apiKey,
    signal: options.signal,
  }
  if (options.thinkingBudget != null && options.thinkingBudget > 0) {
    streamOpts.reasoning = 'high'   // 启用 extended thinking
  }
  return streamSimple(model, context, streamOpts)
}
```

返回值是 `AssistantMessageEventStream`，一个 `AsyncIterable<AssistantMessageEvent>`。

---

## 5. 流式事件系统

pi-ai 定义了 12 种流式事件，通过 `for await` 消费：

| 事件类型 | 关键字段 | 说明 |
|---------|---------|------|
| `start` | `partial` | 流开始，初始空消息 |
| `text_start` | `contentIndex` | 新文本块开始 |
| `text_delta` | `delta: string` | 增量文本片段 |
| `text_end` | `content: string` | 文本块完成 |
| `thinking_start` | `contentIndex` | 思考块开始 |
| `thinking_delta` | `delta: string` | 增量思考片段 |
| `thinking_end` | `content: string` | 思考块完成 |
| `toolcall_start` | `contentIndex` | 工具调用开始 |
| `toolcall_delta` | `delta: string` | 增量工具调用 JSON |
| `toolcall_end` | `toolCall: ToolCall` | 工具调用完成，参数已解析 |
| `done` | `reason`, `message` | 流正常结束 |
| `error` | `reason`, `error` | 流异常结束 |

本项目只监听了其中 5 种（`useChat.ts:148-171`）：

```ts
for await (const event of eventStream) {
  switch (event.type) {
    case 'text_delta':      // 累积文本 → 实时更新 UI
    case 'thinking_delta':  // 累积思考 → 实时更新 UI
    case 'toolcall_end':    // 捕获完成的工具调用（id, name, arguments）
    case 'done':            // 检查 stopReason === 'toolUse' 决定是否继续循环
    case 'error':           // 抛出异常
  }
}
```

`done` 事件的 `reason` 映射：
- `"stop"` — 模型正常结束回复
- `"toolUse"` — 模型请求调用工具（触发工具执行循环）
- `"length"` — 达到 token 上限

---

## 6. 工具调用循环 (`runStreamLoop`)

这是整个系统的核心，位于 `src/composables/useChat.ts:119-198`。

### 6.1 循环结构

```
runStreamLoop (最多 MAX_TOOL_ROUNDS = 5 轮)
  │
  ├─ 第 1 轮
  │   ├─ toPiMessages() → 序列化消息
  │   ├─ buildContext() → 构建上下文（含工具定义）
  │   ├─ streamChat() → 流式调用 API
  │   ├─ 消费事件 → 累积 text/thinking/toolCalls
  │   ├─ stopReason === 'toolUse'?
  │   │   ├─ 否 → return（结束）
  │   │   └─ 是 → 执行工具 → 更新消息
  │   └─ 继续下一轮
  │
  ├─ 第 2 轮（包含上一轮的工具结果）
  │   └─ ... 同上
  │
  └─ 最多第 5 轮
```

### 6.2 工具调用状态追踪

每个工具调用经历 4 个状态：

```
pending → running → done
                  → error
```

状态变化时实时更新 UI：

```ts
// 1. toolcall_end 事件 → 创建 pending 状态的 ToolCallInfo
toolCalls.push({ id, name, params, status: 'pending' })
updateLastAssistant({ toolCalls: [...toolCalls] })

// 2. 开始执行 → 更新为 running
updatedCalls[i] = { ...tc, status: 'running' }
updateLastAssistant({ toolCalls: updatedCalls })

// 3. 执行完成 → 更新为 done（附带结果）或 error（附带错误信息）
updatedCalls[i] = { ...tc, status: 'done', result }
// 或
updatedCalls[i] = { ...tc, status: 'error', result: errorMsg }
updateLastAssistant({ toolCalls: [...updatedCalls] })
```

### 6.3 循环退出条件 (`useChat.ts:174`)

```ts
if (!hasToolUse || toolCalls.length === 0 || signal.aborted) {
  return  // 退出循环
}
```

三种情况退出：
1. 模型没有请求工具调用（`stopReason !== 'toolUse'`）
2. 没有实际的工具调用（理论上不会发生）
3. 用户取消了操作（`signal.aborted`）

---

## 7. 消息序列化 (`toPiMessages`)

`toPiMessages`（`useChat.ts:33-84`）负责将应用层的 `ChatMessage[]` 转换为 pi-ai 的 `Message[]`，这是工具调用能正确传递给 API 的关键。

### 7.1 转换规则

**用户消息** → 直接映射：
```ts
{ role: 'user', content: msg.content, timestamp }
```

**助手消息** → 构建 content 数组，包含三种可能的内容块：
```ts
content = [
  { type: 'thinking', thinking: '...' },     // 如果有思考内容
  { type: 'text', text: '...' },              // 如果有文本内容
  { type: 'toolCall', id, name, arguments },  // 每个工具调用一个
  { type: 'toolCall', id, name, arguments },  // 可能有多个
]
```

**工具结果** → 在助手消息之后追加独立的 toolResult 消息：
```ts
{
  role: 'toolResult',
  toolCallId: tc.id,        // 必须匹配对应的 toolCall.id
  toolName: tc.name,
  content: [{ type: 'text', text: tc.result }],
  isError: tc.status === 'error',
  timestamp: msg.timestamp,
}
```

### 7.2 序列化后的消息序列示例

一次包含工具调用的完整对话序列化后：

```
Message[0]: { role: 'user', content: '今天香港天气怎么样？' }
Message[1]: { role: 'assistant', content: [
               { type: 'thinking', thinking: '用户问天气，我需要搜索...' },
               { type: 'toolCall', id: 'toolu_xxx', name: 'tavily_search',
                 arguments: { query: '香港今天天气' } }
             ]}
Message[2]: { role: 'toolResult', toolCallId: 'toolu_xxx',
              content: [{ type: 'text', text: '[1] 香港天气...' }],
              isError: false }
Message[3]: { role: 'assistant', content: [
               { type: 'text', text: '根据搜索结果，今天香港...' }
             ]}
```

---

## 8. Anthropic API 协议转换

pi-ai 库内部（`providers/anthropic.ts`）负责将上述格式转换为 Anthropic API 的原生格式。

### 8.1 工具定义转换

```
pi-ai Tool                          Anthropic API
─────────────                       ─────────────
name: "tavily_search"          →    name: "tavily_search"
description: "..."             →    description: "..."
parameters: Type.Object({})    →    input_schema: { type: "object", properties: {...}, required: [...] }
```

TypeBox schema 通过 `Type.Strict()` 转换为标准 JSON Schema。

### 8.2 消息转换

```
pi-ai Message                       Anthropic API
─────────────                       ─────────────
{ role: 'user', content }      →    { role: "user", content: [{ type: "text", text }] }

{ role: 'assistant', content: [
  { type: 'thinking', ... },   →    { type: "thinking", thinking, signature }
  { type: 'text', ... },       →    { type: "text", text }
  { type: 'toolCall', ... },   →    { type: "tool_use", id, name, input: arguments }
]}

{ role: 'toolResult', ... }    →    { role: "user", content: [
                                       { type: "tool_result", tool_use_id, content, is_error }
                                     ]}
```

注意：Anthropic API 中 `tool_result` 是放在 `user` 角色的消息里的，连续的多个 tool_result 会被合并到同一个 user 消息中。

### 8.3 流式事件转换

```
Anthropic SSE                        pi-ai Event
───────────                          ───────────
content_block_start (tool_use)  →    toolcall_start
content_block_delta              →    toolcall_delta（累积 JSON 片段）
  (input_json_delta)                  使用 parseStreamingJson() 增量解析
content_block_stop              →    toolcall_end（包含完整解析的 ToolCall）
message_delta (stop_reason:     →    done (reason: "toolUse")
  "tool_use")
```

### 8.4 Stop Reason 映射

```
Anthropic          pi-ai
─────────          ─────
end_turn      →    "stop"
pause_turn    →    "stop"
tool_use      →    "toolUse"
max_tokens    →    "length"
refusal       →    "error"
sensitive     →    "error"
```

---

## 9. 工具执行与调度

### 9.1 调度器 (`useChat.ts:201-214`)

```ts
async function executeToolCall(
  tc: ToolCallInfo,
  settings: Settings,
  signal: AbortSignal,
): Promise<string> {
  if (tc.name === 'tavily_search') {
    return executeTavilySearch(tc.params as { query: string }, settings.tavilyApiKey, signal)
  }
  throw new Error(`Unknown tool: ${tc.name}`)
}
```

简单的 name 匹配分发。未知工具抛出错误，错误会被捕获并存储为 `status: 'error'` 的工具结果。

### 9.2 Tavily Search 实现 (`src/lib/tools/tavily-search.ts:24-51`)

- 直接 POST 到 `https://api.tavily.com/search`（无后端代理）
- 请求最多 5 条结果，`include_answer: false`
- 支持 `AbortSignal` 取消
- 结果格式化为编号文本块：

```
[1] 标题
https://url
内容摘要

[2] 标题
https://url
内容摘要
```

---

## 10. UI 渲染 (`src/sidepanel/MessageBubble.vue`)

工具调用在助手消息气泡内渲染，位于思考内容和文本内容之间：

```
┌─────────────────────────────────┐
│ 🧠 Thinking  ▶                  │  ← 可折叠的思考内容
│                                 │
│ ┌─────────────────────────────┐ │
│ │ 🔍 Searching  香港天气  done│ │  ← 工具调用卡片
│ │   [展开查看结果]            │ │     状态徽章：pending/running/done/error
│ └─────────────────────────────┘ │
│                                 │
│ 根据搜索结果，今天香港...       │  ← 文本内容
└─────────────────────────────────┘
```

状态徽章颜色：
- `done` → `secondary`（灰色）
- `error` → `destructive`（红色）
- `pending` / `running` → `outline`（边框）

---

## 11. 扩展性分析

### 添加新工具的步骤

1. **创建工具文件** `src/lib/tools/my-tool.ts`：
   - 导出 `getMyTool(): Tool` — 定义 name、description、parameters
   - 导出 `executeMyTool(params, ...): Promise<string>` — 实现执行逻辑

2. **注册工具** 在 `useChat.ts` 的 `runStreamLoop` 中：
   ```ts
   const tools = [
     ...(settings.tavilyApiKey ? [getTavilyTool()] : []),
     ...(settings.myToolKey ? [getMyTool()] : []),   // 新增
   ]
   ```

3. **添加调度** 在 `executeToolCall` 中：
   ```ts
   if (tc.name === 'my_tool') {
     return executeMyTool(tc.params as MyParams, settings.myToolKey, signal)
   }
   ```

4. **（可选）更新 UI** — 如果需要特殊的渲染方式，修改 `MessageBubble.vue`

### 当前设计的局限

- 工具**顺序执行**，不支持并行（`for` 循环逐个执行）
- 工具结果只支持**纯文本**（`Promise<string>`），不支持图片等富内容
- 调度器是硬编码的 `if/else`，工具多了需要改为注册表模式
- 没有工具调用的重试机制

---

## 12. 完整数据流图

```
用户输入 "今天香港天气怎么样？"
         │
         ▼
    sendMessage()
         │
         ├─ 创建 user ChatMessage，追加到 messages
         │
         ▼
    runStreamLoop() ─── 第 1 轮 ───────────────────────────────
         │
         ├─ toPiMessages(messages)
         │   └─ ChatMessage[] → pi-ai Message[]
         │
         ├─ buildContext(piMessages, systemPrompt, [tavilyTool])
         │   └─ { systemPrompt, messages, tools }
         │
         ├─ streamChat(model, context, { apiKey, signal })
         │   └─ pi-ai streamSimple() → Anthropic API 请求
         │       └─ POST /v1/messages (含 tools 定义)
         │
         ├─ 消费 SSE 流
         │   ├─ thinking_delta → 累积思考文本 → updateLastAssistant
         │   ├─ toolcall_end → 捕获 { id, name, arguments }
         │   │   └─ 创建 ToolCallInfo { status: 'pending' }
         │   └─ done → stopReason = 'toolUse'
         │
         ├─ hasToolUse = true → 进入工具执行
         │   ├─ status: 'running' → updateLastAssistant
         │   ├─ executeToolCall() → executeTavilySearch()
         │   │   └─ POST https://api.tavily.com/search
         │   │       └─ 返回格式化的搜索结果文本
         │   └─ status: 'done', result: '...' → updateLastAssistant
         │
         ▼
    runStreamLoop() ─── 第 2 轮 ───────────────────────────────
         │
         ├─ toPiMessages(messages)  ← 现在包含工具调用和结果
         │   └─ [..., assistantMsg(含toolCall), toolResultMsg]
         │
         ├─ buildContext → streamChat → Anthropic API
         │   └─ 模型看到工具结果，生成最终回复
         │
         ├─ 消费 SSE 流
         │   ├─ text_delta → 累积文本 → updateLastAssistant
         │   └─ done → stopReason = 'stop'
         │
         └─ hasToolUse = false → return（结束循环）

         ▼
    UI 显示完整回复（含工具调用卡片和最终文本）
```
