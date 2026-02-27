# Data Codemap
_Updated: 2026-02-27_

## Types: `src/types/`

### ChatMessage
```ts
{ id, role: 'user'|'assistant', content, thinkingContent?, toolCalls?, timestamp }
```

### ToolCallInfo
```ts
{ id, name, params: Record<string,unknown>, result?, status: 'pending'|'running'|'done'|'error' }
```

### Conversation
```ts
{ url, messages: ChatMessage[], createdAt, updatedAt }
```

### Settings
```ts
{ anthropicApiKey, anthropicBaseUrl, tavilyApiKey, modelId, systemPrompt, thinkingBudget: number|null }
```

### ModelOption
```ts
{ id, label, reasoning: boolean }
```

## Available Models
| ID | Reasoning |
|----|-----------|
| claude-sonnet-4-6 | No |
| claude-sonnet-4-5-20250514 | Yes |
| claude-haiku-4-5-20251001 | No |
| claude-opus-4-6 | Yes |

## Chrome Storage Schema
| Key | Type | Notes |
|-----|------|-------|
| `"settings"` | Settings | Single global settings object |
| `"conv::{url}"` | Conversation | Per-page; URL = origin+pathname |
| `"conv-index"` | string[] | Ordered list of stored conversation URLs |
