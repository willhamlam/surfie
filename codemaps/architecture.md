# Architecture Codemap
_Updated: 2026-02-27_

## Project
**Surf Copilot** — Chrome Extension (Manifest V3)
AI-powered side panel chat companion using Claude models.

## Tech Stack
- Runtime: Chrome Extension (no backend)
- UI: Vue 3 + TypeScript + Vite + Tailwind CSS v4 + shadcn-vue
- AI: @mariozechner/pi-ai → Anthropic API (direct from browser)
- Search Tool: Tavily API

## Extension Entry Points
| Entry | File | Role |
|-------|------|------|
| Service Worker | `src/background/index.ts` | Background lifecycle |
| Side Panel | `src/sidepanel/index.html` | UI shell |
| Vue App | `src/sidepanel/main.ts` | App bootstrap |

## Key Permissions
`sidePanel`, `activeTab`, `tabs`, `storage`, `unlimitedStorage`, `<all_urls>`

## Data Flow
```
User Input → ChatInput.vue
  → useChat composable
    → lib/ai.ts (pi-ai wrapper)
      → Anthropic API (streaming)
        → tool calls → lib/tools/tavily-search.ts
      → stream chunks → reactive message state
  → MessageBubble.vue (rendered output)
```

## Build
- Bundler: Vite + vite-plugin-web-extension
- Node polyfills: `src/lib/node-stub.ts` (custom Vite plugin)
- Output: `dist/`
