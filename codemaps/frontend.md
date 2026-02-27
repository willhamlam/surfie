# Frontend Codemap
_Updated: 2026-02-27_

## Views
| Component | File | Responsibility |
|-----------|------|----------------|
| App | `src/sidepanel/App.vue` | Root layout, view routing (chat/settings) |
| ChatView | `src/sidepanel/ChatView.vue` | Message list + scroll management |
| MessageBubble | `src/sidepanel/MessageBubble.vue` | Renders user/assistant messages, thinking, tool calls |
| ChatInput | `src/sidepanel/ChatInput.vue` | Text input, send/stop controls |
| SettingsView | `src/sidepanel/SettingsView.vue` | API keys, model selection, system prompt |

## Composables
| Composable | File | State Owned |
|------------|------|-------------|
| useChat | `src/composables/useChat.ts` | messages, streaming state, abort control, tool-call loop |
| useSettings | `src/composables/useSettings.ts` | settings load/save |
| useCurrentTab | `src/composables/useCurrentTab.ts` | active tab URL tracking |

## UI Components (shadcn-vue)
`src/components/ui/` — Badge, Button, Card, Input, ScrollArea, Select, Separator, Textarea

## Patterns
- Vue 3 Composition API throughout
- All state via composables (no Pinia/Vuex)
- Immutable interfaces (`readonly` everywhere)
- Streaming via async iterators + reactive refs
- Per-page conversation switching on tab URL change
