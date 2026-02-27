# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # build in watch mode (development) — run manually in terminal
npm run build      # production build → dist/
npm run type-check # TypeScript type checking (no emit)
```

There is no test suite. Load the extension in Chrome via `chrome://extensions` → "Load unpacked" → select `dist/`.

## Design Philosophy

最简 agent：工具和能力作为组件按需接入，不要过度设计，按需构建。

## Architecture

**surfie** is a Chrome Extension (Manifest V3) with a side panel UI. There is no backend — all API calls go directly from the browser to Anthropic and Tavily.

### Extension structure
- `src/background/index.ts` — service worker (minimal, lifecycle only)
- `src/sidepanel/` — the entire UI (Vue 3 SPA loaded in Chrome's side panel)
- `manifest.json` — MV3 manifest; defines permissions and entry points

### State management
No Pinia/Vuex. All state lives in composables:
- `useChat` — owns the message list, streaming state, and the tool-call loop
- `useSettings` — loads/saves settings from Chrome storage
- `useCurrentTab` — tracks the active tab URL; triggers conversation switching in `App.vue`

Conversations are keyed by `origin + pathname` (query/hash stripped). `App.vue` watches the tab URL and calls `loadMessages` / `clearMessages` on `useChat` to swap conversations.

### AI streaming loop (`useChat.ts`)
`sendMessage` → `runStreamLoop` iterates up to `MAX_TOOL_ROUNDS = 5` times:
1. Converts `ChatMessage[]` to pi-ai `Message[]` (including tool results embedded after each assistant turn)
2. Calls `streamChat` (wraps `@mariozechner/pi-ai`'s `streamSimple`)
3. Accumulates `text_delta` / `thinking_delta` / `toolcall_end` events into reactive refs
4. If `stopReason === 'toolUse'`, executes tools and loops; otherwise returns

### Node.js polyfills
`@mariozechner/pi-ai` imports Node.js built-ins. A custom Vite plugin (`nodeStubPlugin` in `vite.config.ts`) redirects all Node built-in imports to `src/lib/node-stub.ts`, which provides browser-compatible stubs.

### Path alias
`@/` maps to `src/` throughout the codebase.

### UI components
`src/components/ui/` contains shadcn-vue components (reka-ui primitives + Tailwind). Don't modify these directly — regenerate via shadcn-vue CLI if needed.
