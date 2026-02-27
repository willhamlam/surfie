# Backend Codemap
_Updated: 2026-02-27_

> Note: No traditional backend. "Backend" here = service worker + AI/storage integrations.

## Service Worker
`src/background/index.ts` — Minimal; Chrome extension lifecycle only.

## AI Integration
`src/lib/ai.ts`
- Wraps `@mariozechner/pi-ai`
- Exposes streaming message function
- Handles extended thinking budget
- Returns async iterator of stream events

## Tool Calling
`src/lib/tools/tavily-search.ts`
- Tavily web search API integration
- Called by useChat during tool-call loop (max 5 rounds)
- Input: query string → Output: search results string

## Storage
`src/lib/storage.ts`
- Wraps Chrome `storage.local` API
- Typed get/set helpers for Settings and Conversations
- Key schema:
  - `"settings"` → Settings
  - `"conv::{normalizedUrl}"` → Conversation
  - `"conv-index"` → string[] (URL list)

## Utilities
`src/lib/utils.ts` — General helpers (URL normalization, class merging, etc.)
`src/lib/node-stub.ts` — Node.js API polyfills for browser environment
