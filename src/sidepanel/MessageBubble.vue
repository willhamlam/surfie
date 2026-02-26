<script setup lang="ts">
import { ref } from 'vue'
import type { ChatMessage } from '@/types/chat'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronRight, Search, Brain } from 'lucide-vue-next'

const props = defineProps<{
  message: ChatMessage
  isLast: boolean
  isStreaming: boolean
}>()

const showThinking = ref(false)
const showToolDetails = ref(false)

const isUser = props.message.role === 'user'
</script>

<template>
  <div :class="['flex flex-col gap-1 px-4 py-2', isUser ? 'items-end' : 'items-start']">
    <!-- User message -->
    <div
      v-if="isUser"
      class="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground"
    >
      {{ message.content }}
    </div>

    <!-- Assistant message -->
    <div v-else class="max-w-[90%] space-y-1">
      <!-- Thinking toggle -->
      <button
        v-if="message.thinkingContent"
        class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        @click="showThinking = !showThinking"
      >
        <Brain :size="12" />
        <span>Thinking</span>
        <ChevronDown v-if="showThinking" :size="12" />
        <ChevronRight v-else :size="12" />
      </button>
      <div
        v-if="showThinking && message.thinkingContent"
        class="rounded-md border bg-muted/50 p-2 text-xs text-muted-foreground"
      >
        <pre class="whitespace-pre-wrap font-sans">{{ message.thinkingContent }}</pre>
      </div>

      <!-- Tool calls -->
      <div v-if="message.toolCalls?.length" class="space-y-1">
        <div
          v-for="tc in message.toolCalls"
          :key="tc.id"
          class="rounded-md border bg-muted/30 p-2"
        >
          <button
            class="flex w-full items-center gap-1.5 text-xs"
            @click="showToolDetails = !showToolDetails"
          >
            <Search :size="12" class="text-muted-foreground" />
            <span class="font-medium">{{ tc.name === 'tavily_search' ? 'Searching' : tc.name }}</span>
            <span class="text-muted-foreground">{{ (tc.params as Record<string, string>).query }}</span>
            <Badge
              :variant="tc.status === 'done' ? 'secondary' : tc.status === 'error' ? 'destructive' : 'outline'"
              class="ml-auto text-[10px]"
            >
              {{ tc.status }}
            </Badge>
          </button>
          <div
            v-if="showToolDetails && tc.result"
            class="mt-2 max-h-40 overflow-y-auto text-xs text-muted-foreground"
          >
            <pre class="whitespace-pre-wrap font-sans">{{ tc.result }}</pre>
          </div>
        </div>
      </div>

      <!-- Text content -->
      <div
        v-if="message.content"
        class="text-sm leading-relaxed"
      >
        <pre class="whitespace-pre-wrap font-sans">{{ message.content }}</pre>
        <span
          v-if="isLast && isStreaming && !message.content"
          class="inline-block h-4 w-1 animate-pulse bg-foreground"
        />
      </div>

      <!-- Streaming cursor when no content yet -->
      <div
        v-if="isLast && isStreaming && !message.content && !message.thinkingContent"
        class="flex items-center gap-1 text-sm text-muted-foreground"
      >
        <span class="inline-block h-4 w-1 animate-pulse bg-foreground" />
      </div>
    </div>
  </div>
</template>
