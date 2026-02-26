<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useSettings } from '@/composables/useSettings'
import { useChat } from '@/composables/useChat'
import { useCurrentTab } from '@/composables/useCurrentTab'
import { loadConversation, saveConversation } from '@/lib/storage'
import type { Conversation } from '@/types/chat'
import { Settings, ArrowLeft, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import SettingsView from './SettingsView.vue'
import ChatView from './ChatView.vue'

const currentView = ref<'chat' | 'settings'>('chat')
const { settings, load: loadSettingsData } = useSettings()
const { currentUrl, pageTitle } = useCurrentTab()
const {
  messages,
  isStreaming,
  error,
  sendMessage,
  stopGeneration,
  clearMessages,
  loadMessages,
} = useChat(() => settings.value)

let previousUrl = ''

// Save conversation when messages change
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

// Load conversation when URL changes
watch(currentUrl, async (url) => {
  if (!url || url === previousUrl) return
  previousUrl = url
  clearMessages()
  const conv = await loadConversation(url)
  if (conv?.messages.length) {
    loadMessages(conv.messages)
  }
})

onMounted(() => {
  loadSettingsData()
})
</script>

<template>
  <div class="flex h-screen flex-col bg-background text-foreground">
    <header class="flex items-center justify-between border-b px-3 py-2">
      <div class="min-w-0 flex-1">
        <h1 class="text-sm font-semibold">Surf Copilot</h1>
        <p
          v-if="currentView === 'chat' && pageTitle"
          class="truncate text-[11px] text-muted-foreground"
        >
          {{ pageTitle }}
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <Button
          v-if="currentView === 'chat' && messages.length > 0"
          variant="ghost"
          size="icon"
          class="h-7 w-7"
          title="Clear chat"
          @click="clearMessages"
        >
          <Trash2 :size="14" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7"
          :title="currentView === 'chat' ? 'Settings' : 'Back to chat'"
          @click="currentView = currentView === 'chat' ? 'settings' : 'chat'"
        >
          <Settings v-if="currentView === 'chat'" :size="14" />
          <ArrowLeft v-else :size="14" />
        </Button>
      </div>
    </header>
    <main class="flex-1 overflow-hidden">
      <ChatView
        v-if="currentView === 'chat'"
        :messages="messages"
        :is-streaming="isStreaming"
        :error="error"
        @send="sendMessage"
        @stop="stopGeneration"
        @clear="clearMessages"
      />
      <SettingsView v-else />
    </main>
  </div>
</template>
