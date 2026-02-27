# surfie - Chrome Extension 实现方案

## Context

构建一个网页阅读伴侣 Chrome 插件，通过 Side Panel 展示对话界面，支持基于当前网页的 AI 对话、网络搜索工具调用、流式输出和 thinking 模型。底层使用 pi-mono (`@mariozechner/pi-ai`) 作为 LLM 接口，Vue 3 + shadcn-vue 构建 UI。

## 进度

- [ ] Phase 1: 脚手架和构建管道
- [ ] Phase 2: 设置页面
- [ ] Phase 3: 核心 AI 对话
- [ ] Phase 4: 工具调用 (Tavily 搜索)
- [ ] Phase 5: 按页面保存对话
- [ ] Phase 6: 收尾

## 项目结构

```
surfie/
├── manifest.json
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.css
├── components.json                  # shadcn-vue 配置
├── src/
│   ├── types/
│   │   ├── chat.ts                  # Message, Conversation 类型
│   │   └── settings.ts              # Settings, ModelOption 类型
│   ├── lib/
│   │   ├── ai.ts                    # pi-ai 封装: model 创建, 流式调用, 上下文构建
│   │   ├── tools/
│   │   │   └── tavily-search.ts     # Tavily 工具定义 + fetch 执行器
│   │   ├── storage.ts               # chrome.storage.local 封装
│   │   └── utils.ts                 # cn() 等工具函数
│   ├── composables/
│   │   ├── useChat.ts               # 核心: 发送/流式/中断/工具循环/持久化
│   │   ├── useSettings.ts           # 设置加载/保存
│   │   └── useCurrentTab.ts         # 跟踪当前标签页 URL
│   ├── components/ui/               # shadcn-vue 组件 (CLI 生成)
│   ├── sidepanel/
│   │   ├── index.html
│   │   ├── main.ts
│   │   ├── App.vue                  # 根布局: Chat / Settings 切换
│   │   ├── ChatView.vue             # 消息列表 + 输入区
│   │   ├── MessageBubble.vue        # 单条消息渲染 (文本/thinking/工具)
│   │   ├── ChatInput.vue            # 输入框 + 发送/停止按钮
│   │   └── SettingsView.vue         # API Key, 模型选择, System Prompt
│   └── background/
│       └── index.ts                 # Service Worker: sidePanel 行为
└── public/
    └── icons/                       # 扩展图标 (16, 48, 128)
```

## 依赖

```json
{
  "dependencies": {
    "@mariozechner/pi-ai": "latest",
    "vue": "^3.5"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5",
    "vite": "^6",
    "vite-plugin-web-extension": "^4",
    "typescript": "^5.7",
    "@tailwindcss/vite": "^4",
    "tailwindcss": "^4",
    "reka-ui": "^2",
    "class-variance-authority": "^0.7",
    "clsx": "^2",
    "tailwind-merge": "^2",
    "lucide-vue-next": "latest"
  }
}
```

Tavily 不引入 SDK，直接用 `fetch()` 调用 API。shadcn-vue 组件通过 CLI 复制到项目中。

## 数据模型

```typescript
// Settings
interface Settings {
  readonly anthropicApiKey: string
  readonly tavilyApiKey: string
  readonly modelId: string
  readonly systemPrompt: string
  readonly thinkingBudget: number | null
}

// Chat
interface ChatMessage {
  readonly id: string
  readonly role: 'user' | 'assistant' | 'tool'
  readonly content: string
  readonly thinkingContent?: string
  readonly toolCalls?: ReadonlyArray<ToolCallInfo>
  readonly timestamp: number
}

interface ToolCallInfo {
  readonly id: string
  readonly name: string
  readonly params: Record<string, unknown>
  readonly result?: string
  readonly status: 'pending' | 'running' | 'done' | 'error'
}

interface Conversation {
  readonly url: string
  readonly messages: ReadonlyArray<ChatMessage>
  readonly createdAt: number
  readonly updatedAt: number
}
```

## 存储方案

`chrome.storage.local`，key 设计：
- `"settings"` → Settings
- `"conv::{normalizedUrl}"` → Conversation
- `"conv-index"` → string[]

URL 标准化：`origin + pathname`，去掉 query 和 hash。需要 `unlimitedStorage` 权限。

## 实现阶段

### Phase 1: 脚手架和构建管道

1. 初始化项目，安装所有依赖
2. 创建 `manifest.json`（permissions: sidePanel, activeTab, tabs, storage, unlimitedStorage）
3. 配置 `vite.config.ts`（vue + tailwindcss + webExtension 插件）
4. 创建 `src/sidepanel/index.html` + `main.ts` + `App.vue`
5. 创建 `src/background/index.ts`
6. 初始化 shadcn-vue，添加组件
7. 验证：build → 加载到 Chrome → 点击图标打开 Side Panel

### Phase 2: 设置页面

1. 实现 `src/types/settings.ts`
2. 实现 `src/lib/storage.ts`
3. 实现 `src/composables/useSettings.ts`
4. 构建 `SettingsView.vue`
5. `App.vue` 添加视图切换
6. 验证：设置持久化

### Phase 3: 核心 AI 对话

1. 实现 `src/types/chat.ts`
2. 实现 `src/lib/ai.ts`（pi-ai 封装 + streaming + thinking）
3. 实现 `src/composables/useChat.ts`（发送/流式/中断）
4. 构建 `ChatView.vue` + `MessageBubble.vue` + `ChatInput.vue`
5. 验证：流式对话 + 中断

### Phase 4: 工具调用 (Tavily 搜索)

1. 实现 `src/lib/tools/tavily-search.ts`
2. 更新 `useChat.ts` 处理工具调用循环
3. 更新 `MessageBubble.vue` 显示工具状态
4. 验证：搜索工具调用 + 结果整合

### Phase 5: 按页面保存对话

1. 实现 `src/composables/useCurrentTab.ts`
2. 更新 `useChat.ts` 支持 URL 切换
3. 更新 `App.vue` 显示页面信息
4. 验证：不同页面独立对话

### Phase 6: 收尾

1. 空状态欢迎信息
2. 错误处理
3. Markdown 渲染（可选）

## 流式 + Thinking + 工具调用 + 中断 协作流程

```
用户发送消息
  ├─ 1. 追加 user 消息（不可变）
  ├─ 2. 创建 AbortController
  ├─ 3. 构建 pi-ai Context
  ├─ 4. 调用 streamChat(model, context, signal)
  ├─ 5. 迭代流式事件:
  │     ├─ thinking_delta → thinkingContent
  │     ├─ text_delta → content
  │     ├─ tool_use → 执行工具 → 追加结果 → 回到步骤 3
  │     ├─ done → 保存对话
  │     └─ error → 显示错误
  └─ 6. 用户停止: abort() → 保留部分回复
```

## 验证清单

| 阶段 | 验证方式 |
|------|---------|
| Phase 1 | build 成功 → Chrome 加载 → Side Panel 打开 |
| Phase 2 | 设置持久化 |
| Phase 3 | 流式回复 + 中断 |
| Phase 4 | 工具调用 + 搜索结果 |
| Phase 5 | 按页面独立对话 |
| Phase 6 | 错误处理 + 优雅降级 |
