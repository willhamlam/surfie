<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import type { ChatMessage } from '@/types/chat'
import { ScrollArea } from '@/components/ui/scroll-area'
import MessageBubble from './MessageBubble.vue'
import ChatInput from './ChatInput.vue'

const props = defineProps<{
  messages: ReadonlyArray<ChatMessage>
  isStreaming: boolean
  error: string | null
}>()

const emit = defineEmits<{
  send: [text: string]
  stop: []
  clear: []
}>()

const scrollContainer = ref<HTMLElement | null>(null)

function scrollToBottom() {
  nextTick(() => {
    if (scrollContainer.value) {
      scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
    }
  })
}

watch(
  () => props.messages.length,
  () => scrollToBottom(),
)

watch(
  () => {
    const last = props.messages[props.messages.length - 1]
    return last?.content?.length ?? 0
  },
  () => scrollToBottom(),
)
</script>

<template>
  <div class="flex h-full flex-col">
    <div
      ref="scrollContainer"
      class="flex-1 overflow-y-auto"
    >
      <!-- Empty state -->
      <div
        v-if="messages.length === 0"
        class="flex h-full flex-col items-center justify-center gap-2 p-8 text-center"
      >
        <p class="text-lg">🏄</p>
        <p class="text-sm font-medium">surfie</p>
        <p class="text-xs text-muted-foreground">
          Ask anything about the current page, or just chat.
        </p>
      </div>

      <!-- Messages -->
      <div v-else class="py-2">
        <MessageBubble
          v-for="(msg, i) in messages"
          :key="msg.id"
          :message="msg"
          :is-last="i === messages.length - 1"
          :is-streaming="isStreaming"
        />
      </div>
    </div>

    <!-- Error banner -->
    <div
      v-if="error"
      class="border-t bg-destructive/10 px-4 py-2 text-xs text-destructive"
    >
      {{ error }}
    </div>

    <ChatInput
      :is-streaming="isStreaming"
      @send="$emit('send', $event)"
      @stop="$emit('stop')"
    />
  </div>
</template>
