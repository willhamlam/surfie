# 对话持久化系统研究

## 1. 概述

surfie 是一个 Chrome Extension (Manifest V3)，没有后端服务。所有对话数据完全存储在浏览器本地的 `chrome.storage.local` 中。

核心设计思路：**每个网页 URL 对应一个独立对话**。用户在不同标签页之间切换时，系统自动保存当前对话、加载目标页面的历史对话。

### 涉及的关键文件

| 文件 | 职责 |
|------|------|
| `src/lib/storage.ts` | 存储层：CRUD 操作、URL 归一化、索引维护 |
| `src/types/chat.ts` | 数据类型：`ChatMessage`、`ToolCallInfo`、`Conversation` |
| `src/types/settings.ts` | 设置类型：`Settings`、`ModelOption` |
| `src/composables/useChat.ts` | 内存状态：消息数组管理、流式循环 |
| `src/composables/useCurrentTab.ts` | 标签页追踪：监听 Chrome tabs 事件 |
| `src/composables/useSettings.ts` | 设置管理：加载/保存/重置 |
| `src/sidepanel/App.vue` | 编排层：watcher 驱动的自动保存与加载 |
| `manifest.json` | 权限声明 |

### 权限依赖

```json
// manifest.json
"permissions": [
  "sidePanel",
  "activeTab",
  "tabs",
  "storage",
  "unlimitedStorage"
]
```

- `storage` — 授权访问 `chrome.storage.local`
- `unlimitedStorage` — 移除默认 ~5MB 配额限制，允许无限增长
- `tabs` — 授权读取 `tab.url`、`tab.title`，监听 `onActivated`、`onUpdated` 事件
- `activeTab` — 授权对当前活动标签页的临时主机权限

---

## 2. 数据模型

### 2.1 ChatMessage

```typescript
// src/types/chat.ts:1-8
interface ChatMessage {
  readonly id: string          // 格式: `${Date.now()}-${random7chars}`
  readonly role: 'user' | 'assistant'
  readonly content: string     // 文本内容（用户消息或助手回复）
  readonly thinkingContent?: string  // 助手的思考过程（仅 reasoning 模型）
  readonly toolCalls?: ReadonlyArray<ToolCallInfo>  // 工具调用列表
  readonly timestamp: number   // Unix 毫秒时间戳
}
```

`id` 由 `useChat.ts` 中的 `generateId()` 生成：

```typescript
// src/composables/useChat.ts:9-11
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}
```

### 2.2 ToolCallInfo

```typescript
// src/types/chat.ts:10-16
interface ToolCallInfo {
  readonly id: string                        // 工具调用 ID（来自 API）
  readonly name: string                      // 工具名称：'read_page' | 'tavily_search'
  readonly params: Record<string, unknown>   // 工具参数
  readonly result?: string                   // 执行结果文本
  readonly status: 'pending' | 'running' | 'done' | 'error'
}
```

状态流转：`pending` → `running` → `done` / `error`。每次状态变化都会触发 `updateLastAssistant`，进而触发 `messages` watcher 和存储写入。

### 2.3 Conversation

```typescript
// src/types/chat.ts:18-23
interface Conversation {
  readonly url: string                           // 归一化后的 URL
  readonly messages: ReadonlyArray<ChatMessage>   // 完整消息历史
  readonly createdAt: number                     // 首条消息的时间戳
  readonly updatedAt: number                     // 最后更新时间
}
```

这是持久化到 `chrome.storage.local` 的顶层对象。每次保存时整个对象被序列化写入。

---

## 3. 存储层 (`src/lib/storage.ts`)

### 3.1 URL 归一化

```typescript
// src/lib/storage.ts:16-23
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return url
  }
}
```

规则：保留 `origin`（协议+主机+端口）和 `pathname`，**丢弃 query string 和 hash**。

示例：
- `https://github.com/user/repo?tab=code#readme` → `https://github.com/user/repo`
- `https://example.com/page?q=1&p=2` → `https://example.com/page`
- 无效 URL → 原样返回（fallback）

这意味着同一路径下不同查询参数的页面共享同一个对话。

### 3.2 存储键生成

```typescript
// src/lib/storage.ts:25-27
function conversationKey(url: string): string {
  return `conv::${normalizeUrl(url)}`
}
```

存储键格式：`conv::<normalized-url>`

示例：`conv::https://github.com/user/repo`

### 3.3 存储结构总览

`chrome.storage.local` 中的键值布局：

| 键 | 值类型 | 说明 |
|----|--------|------|
| `settings` | `Settings` | 用户设置（API key、模型选择等） |
| `conv-index` | `string[]` | 所有已存对话的归一化 URL 列表 |
| `conv::<url>` | `Conversation` | 单个对话的完整数据 |

### 3.4 CRUD 操作

#### 读取对话

```typescript
// src/lib/storage.ts:29-33
async function loadConversation(url: string): Promise<Conversation | null> {
  const key = conversationKey(url)
  const result = await chrome.storage.local.get(key)
  return result[key] ?? null
}
```

传入原始 URL，内部自动归一化。不存在时返回 `null`。

#### 保存对话

```typescript
// src/lib/storage.ts:35-45
async function saveConversation(conversation: Conversation): Promise<void> {
  const key = conversationKey(conversation.url)
  await chrome.storage.local.set({ [key]: conversation })

  // 维护索引
  const indexResult = await chrome.storage.local.get('conv-index')
  const index: string[] = indexResult['conv-index'] ?? []
  const normalized = normalizeUrl(conversation.url)
  if (!index.includes(normalized)) {
    await chrome.storage.local.set({ 'conv-index': [...index, normalized] })
  }
}
```

两步操作：
1. 写入对话数据（整个 `Conversation` 对象）
2. 检查并更新 `conv-index`（仅在新对话时追加）

注意：这两步不是原子操作。如果第一步成功、第二步失败，会出现对话数据存在但索引中缺失的不一致状态。

#### 删除对话

```typescript
// src/lib/storage.ts:47-57
async function deleteConversation(url: string): Promise<void> {
  const key = conversationKey(url)
  await chrome.storage.local.remove(key)

  // 清理索引
  const indexResult = await chrome.storage.local.get('conv-index')
  const index: string[] = indexResult['conv-index'] ?? []
  const normalized = normalizeUrl(url)
  await chrome.storage.local.set({
    'conv-index': index.filter(u => u !== normalized),
  })
}
```

**重要：此函数是死代码。** 它被导出但在整个代码库中没有任何调用点。UI 中的"清除聊天"按钮只清空内存状态，不删除持久化数据。

---

## 4. 标签页追踪 (`src/composables/useCurrentTab.ts`)

### 4.1 响应式状态

```typescript
const currentUrl = ref('')     // 归一化后的当前标签页 URL
const pageTitle = ref('')      // 当前标签页标题
```

两个值都通过 `readonly()` 暴露，外部只读。

### 4.2 核心更新函数

```typescript
// src/composables/useCurrentTab.ts:8-18
async function updateFromActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.url) {
      currentUrl.value = normalizeUrl(tab.url)
      pageTitle.value = tab.title ?? ''
    }
  } catch {
    // Side panel may not have access yet
  }
}
```

查询当前窗口的活动标签页，更新 URL 和标题。静默吞掉异常（side panel 初始化时可能还没有权限）。

### 4.3 事件监听

组件挂载时注册两个 Chrome 事件监听器：

```typescript
// src/composables/useCurrentTab.ts:34-38
onMounted(() => {
  updateFromActiveTab()                                    // 立即获取当前状态
  chrome.tabs.onActivated.addListener(onTabActivated)      // 标签页切换
  chrome.tabs.onUpdated.addListener(onTabUpdated)          // 标签页内容更新
})
```

#### `onActivated` — 标签页切换

用户点击另一个标签页时触发。无条件调用 `updateFromActiveTab()`。

#### `onUpdated` — 标签页内容变化

```typescript
// src/composables/useCurrentTab.ts:24-32
function onTabUpdated(
  _tabId: number,
  changeInfo: chrome.tabs.TabChangeInfo,
  _tab: chrome.tabs.Tab,
) {
  if (changeInfo.url || changeInfo.status === 'complete') {
    updateFromActiveTab()
  }
}
```

仅在两种情况下触发更新：
- `changeInfo.url` 存在 — 页面导航（URL 变化）
- `changeInfo.status === 'complete'` — 页面加载完成

过滤掉了 `loading` 等中间状态，避免不必要的更新。

### 4.4 清理

```typescript
// src/composables/useCurrentTab.ts:40-43
onUnmounted(() => {
  chrome.tabs.onActivated.removeListener(onTabActivated)
  chrome.tabs.onUpdated.removeListener(onTabUpdated)
})
```

组件卸载时移除监听器，防止内存泄漏。

---

## 5. 内存状态管理 (`src/composables/useChat.ts`)

### 5.1 状态定义

```typescript
// src/composables/useChat.ts:15-19
export function useChat(getSettings: () => Settings) {
  const messages = ref<ChatMessage[]>([])
  const isStreaming = ref(false)
  const error = ref<string | null>(null)
  let abortController: AbortController | null = null
```

`useChat` 是一个工厂函数（非单例），每次调用创建独立的状态。`App.vue` 中只调用一次，所以实际上全局只有一个实例。

`getSettings` 是一个 getter 函数，延迟获取最新设置，避免闭包捕获过期值。

### 5.2 消息数组的不可变更新

```typescript
// src/composables/useChat.ts:21-25
function appendMessage(msg: ChatMessage): ChatMessage[] {
  const next = [...messages.value, msg]
  messages.value = next
  return next
}
```

```typescript
// src/composables/useChat.ts:27-32
function updateLastAssistant(patch: Partial<ChatMessage>) {
  const idx = messages.value.length - 1
  if (idx < 0 || messages.value[idx].role !== 'assistant') return
  const updated = { ...messages.value[idx], ...patch }
  messages.value = [...messages.value.slice(0, idx), updated]
}
```

两个关键特征：
1. **不可变更新**：每次都创建新数组（spread operator），而非原地修改。这确保 Vue 的响应式系统能检测到变化。
2. **`updateLastAssistant` 的高频调用**：在流式响应期间，每个 `text_delta`、`thinking_delta`、`toolcall_end` 事件都会调用此函数，创建新数组并触发 watcher。

### 5.3 加载与清除

```typescript
// src/composables/useChat.ts:232-237
function loadMessages(msgs: ReadonlyArray<ChatMessage>) {
  messages.value = msgs.map(msg => ({
    ...msg,
    toolCalls: Array.isArray(msg.toolCalls) ? msg.toolCalls : undefined,
  }))
}
```

从存储加载时，对 `toolCalls` 做了防御性处理：如果不是数组则设为 `undefined`。这是因为 `chrome.storage.local` 的序列化/反序列化可能改变数据结构。

```typescript
// src/composables/useChat.ts:227-230
function clearMessages() {
  messages.value = []
  error.value = null
}
```

清空内存状态。**不涉及存储操作**。

---

## 6. 编排层 (`src/sidepanel/App.vue`)

App.vue 是持久化系统的核心编排点，通过两个 Vue watcher 将内存状态与存储层连接起来。

### 6.1 Watcher 1：消息变化 → 自动保存

```typescript
// src/sidepanel/App.vue:29-38
watch(messages, async (msgs) => {
  if (!currentUrl.value || msgs.length === 0) return
  const conversation: Conversation = {
    url: currentUrl.value,
    messages: [...msgs],
    createdAt: msgs[0]?.timestamp ?? Date.now(),
    updatedAt: Date.now(),
  }
  await saveConversation(conversation)
}, { deep: true })
```

触发条件：`messages` 数组的任何深层变化（`{ deep: true }`）。

保护条件：
- `currentUrl.value` 为空时不保存（没有关联的页面）
- `msgs.length === 0` 时不保存（防止清除操作覆盖已存数据）

`Conversation` 对象的构造：
- `url` — 当前标签页的归一化 URL
- `messages` — 当前消息数组的浅拷贝
- `createdAt` — 首条消息的时间戳
- `updatedAt` — 当前时间（每次保存都更新）

### 6.2 Watcher 2：URL 变化 → 加载对话

```typescript
// src/sidepanel/App.vue:41-49
watch(currentUrl, async (url) => {
  if (!url || url === previousUrl) return
  previousUrl = url
  clearMessages()
  const conv = await loadConversation(url)
  if (conv?.messages.length) {
    loadMessages(conv.messages)
  }
})
```

`previousUrl` 是一个普通的 `let` 变量（非响应式），用作去重守卫，防止同一 URL 重复加载。

执行流程：
1. URL 变化且与上次不同
2. 更新 `previousUrl`
3. `clearMessages()` — 清空当前消息（触发 Watcher 1，但因 `msgs.length === 0` 被跳过）
4. `loadConversation(url)` — 从存储读取
5. 如果有历史消息，`loadMessages()` 恢复到内存（触发 Watcher 1，执行一次保存）

### 6.3 初始化流程

```typescript
// src/sidepanel/App.vue:51-53
onMounted(() => {
  loadSettingsData()
})
```

组件挂载时只加载设置。对话的加载由 `useCurrentTab` 的 `onMounted` 触发 `updateFromActiveTab()` → `currentUrl` 变化 → Watcher 2 完成。

### 6.4 清除聊天按钮

```html
<!-- src/sidepanel/App.vue:69-77 -->
<Button
  v-if="currentView === 'chat' && messages.length > 0"
  variant="ghost"
  size="icon"
  class="h-7 w-7"
  title="Clear chat"
  @click="clearMessages"
>
```

点击后调用 `clearMessages()`，将 `messages` 设为 `[]`。Watcher 1 因 `msgs.length === 0` 守卫而跳过保存。**结果：UI 清空，但存储中的对话数据保留。** 下次访问同一 URL 时，旧对话会被重新加载。

---

## 7. 设置持久化 (`src/composables/useSettings.ts`)

### 7.1 单例模式

```typescript
// src/composables/useSettings.ts:6-7
const settings = ref<Settings>({ ...DEFAULT_SETTINGS })
const loaded = ref(false)
```

状态声明在模块顶层（函数外部），所有 `useSettings()` 调用共享同一个 ref。这是 Vue composable 的常见单例模式。

### 7.2 Settings 结构

```typescript
// src/types/settings.ts:1-8
interface Settings {
  readonly anthropicApiKey: string      // Anthropic API 密钥
  readonly anthropicBaseUrl: string     // 自定义 API 基础 URL
  readonly tavilyApiKey: string         // Tavily 搜索 API 密钥
  readonly modelId: string              // 模型 ID
  readonly systemPrompt: string         // 系统提示词
  readonly thinkingBudget: number | null // 思考预算（token 数）
}
```

### 7.3 加载与合并

```typescript
// src/lib/storage.ts:5-10
async function loadSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get('settings')
  return result.settings
    ? { ...DEFAULT_SETTINGS, ...result.settings }
    : DEFAULT_SETTINGS
}
```

使用浅合并（spread）将存储中的值覆盖默认值。这提供了向前兼容性：新增的设置字段会自动获得默认值，无需迁移。

### 7.4 与对话持久化的关系

设置和对话使用同一个 `chrome.storage.local` 实例，但键空间完全隔离：
- 设置：`settings` 键
- 对话：`conv::*` 键
- 索引：`conv-index` 键

`useChat` 通过 `getSettings` getter 函数获取设置，不直接依赖 `useSettings`。

---

## 8. 完整数据流

### 8.1 用户发送消息

```
用户输入文本
  → sendMessage(text)
    → appendMessage({ role: 'user', ... })     // messages 变化
      → [Watcher 1] saveConversation()          // 写入存储
    → runStreamLoop()
      → appendMessage({ role: 'assistant', ... })  // 空助手消息
        → [Watcher 1] saveConversation()
      → 流式事件循环:
        → text_delta → updateLastAssistant()    // 每个 delta 触发
          → [Watcher 1] saveConversation()      // 每个 delta 写入存储
        → thinking_delta → updateLastAssistant()
          → [Watcher 1] saveConversation()
        → toolcall_end → updateLastAssistant()
          → [Watcher 1] saveConversation()
      → 工具执行:
        → status: running → updateLastAssistant()
          → [Watcher 1] saveConversation()
        → status: done/error → updateLastAssistant()
          → [Watcher 1] saveConversation()
      → (如果 stopReason === 'toolUse'，循环继续下一轮)
```

一次包含工具调用的完整对话可能触发数十次 `saveConversation`。

### 8.2 标签页切换

```
用户切换标签页
  → chrome.tabs.onActivated 事件
    → updateFromActiveTab()
      → chrome.tabs.query({ active: true, currentWindow: true })
      → currentUrl.value = normalizeUrl(tab.url)
        → [Watcher 2] 检测 URL 变化
          → clearMessages()           // messages = []
            → [Watcher 1] 跳过（length === 0）
          → loadConversation(url)     // 从存储读取
          → loadMessages(conv.messages)  // 恢复到内存
            → [Watcher 1] saveConversation()  // 重新写入（updatedAt 更新）
```

### 8.3 页面内导航

```
用户在同一标签页内导航
  → chrome.tabs.onUpdated 事件
    → changeInfo.url 存在
      → updateFromActiveTab()
        → currentUrl.value 更新
          → [Watcher 2] 同标签页切换流程
```

### 8.4 清除聊天

```
用户点击清除按钮
  → clearMessages()
    → messages.value = []
      → [Watcher 1] 跳过（length === 0）
  // 存储中的数据未被删除
  // 下次访问同一 URL 时会重新加载旧对话
```

---

## 9. 已知问题与边界情况

### 9.1 写放大（Write Amplification）

流式响应期间，每个 `text_delta` 事件（通常每几个字符一次）都会：
1. 创建新的 messages 数组（不可变更新）
2. 触发 deep watcher
3. 构造完整的 `Conversation` 对象
4. 调用 `chrome.storage.local.set()` 写入完整对话

一次普通对话可能产生上百次存储写入。没有防抖（debounce）或批处理机制。

### 9.2 清除不删除

UI 的"清除聊天"按钮只清空内存，不调用 `deleteConversation()`。用户可能认为对话已被删除，但数据仍在存储中。

### 9.3 `deleteConversation` 是死代码

`storage.ts` 导出了 `deleteConversation` 函数，但整个代码库中没有任何调用点。对话一旦创建，永远不会被删除。

### 9.4 无过期策略

- 没有 TTL 或过期机制
- 没有最大对话数限制
- 没有存储用量监控（`getBytesInUse` 未被调用）
- `conv-index` 数组只增不减
- `unlimitedStorage` 权限移除了 Chrome 的默认配额限制

长期使用后存储会无限增长。

### 9.5 非原子索引更新

`saveConversation` 中的两步操作（写数据 + 更新索引）不是原子的。如果第一步成功、第二步失败（如扩展被终止），会导致数据存在但索引缺失。不过由于 `conv-index` 目前也是死代码（没有被读取用于任何功能），这个问题暂时没有实际影响。

### 9.6 URL 归一化的边界情况

- 同一页面不同查询参数共享对话：`/search?q=foo` 和 `/search?q=bar` 是同一个对话
- Hash 路由的 SPA 应用所有路由共享一个对话：`/app#/page1` 和 `/app#/page2` 是同一个对话
- 无效 URL 原样作为键，可能导致意外的键冲突或无法匹配

### 9.7 加载时的冗余写入

Watcher 2 加载对话后，`loadMessages()` 修改 `messages`，触发 Watcher 1 执行一次 `saveConversation`。这次写入只更新了 `updatedAt`，对话内容没有变化，是一次冗余写入。

### 9.8 API 密钥明文存储

`Settings` 中的 `anthropicApiKey` 和 `tavilyApiKey` 以明文形式存储在 `chrome.storage.local` 中，没有加密层。任何能访问该存储区域的扩展或调试工具都可以读取。

### 9.9 并发安全

`conv-index` 的读取-修改-写入模式（read → check includes → write）不是原子的。如果两个异步操作同时执行 `saveConversation`（理论上可能在快速标签页切换时发生），可能导致索引重复或丢失。不过在实际使用中，JavaScript 的单线程模型和 Chrome storage API 的序列化特性使这个问题极少发生。
