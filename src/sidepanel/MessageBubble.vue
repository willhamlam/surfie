<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ChatMessage } from '@/types/chat'
import { renderMarkdown } from '@/lib/markdown'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronRight, Search, Brain, FileText } from 'lucide-vue-next'

const props = defineProps<{
  message: ChatMessage
  isLast: boolean
  isStreaming: boolean
}>()

const showThinking = ref(false)
const openToolDetails = ref<Set<string>>(new Set())

function toggleToolDetails(id: string) {
  const next = new Set(openToolDetails.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  openToolDetails.value = next
}

const isUser = computed(() => props.message.role === 'user')

const renderedContent = computed(() => {
  if (!props.message.content) return ''
  return renderMarkdown(props.message.content)
})

function toolQuery(params: Record<string, unknown>): string {
  return typeof params?.query === 'string' ? params.query : ''
}
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
        class="flex items-center gap-1 rounded text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
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

      <!-- Text content (markdown rendered) -->
      <div
        v-if="message.content"
        class="message-content text-sm leading-relaxed"
        v-html="renderedContent"
      />

      <!-- Streaming cursor when no content yet -->
      <div
        v-if="isLast && isStreaming && !message.content && !message.thinkingContent"
        class="flex items-center gap-1 text-sm text-muted-foreground"
      >
        <span class="inline-block h-4 w-1 animate-pulse bg-primary" />
      </div>

      <!-- Tool calls -->
      <div v-if="message.toolCalls?.length" class="space-y-1">
        <div
          v-for="tc in message.toolCalls"
          :key="tc.id"
          class="rounded-md border bg-muted/30 p-2"
        >
          <button
            class="flex w-full items-center gap-1.5 rounded text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            :aria-label="`${tc.name === 'read_page' ? 'Reading page' : tc.name === 'tavily_search' ? 'Search' : tc.name}: ${toolQuery(tc.params)}`"
            :aria-expanded="openToolDetails.has(tc.id)"
            @click="toggleToolDetails(tc.id)"
          >
            <FileText v-if="tc.name === 'read_page'" :size="12" class="text-muted-foreground" />
            <Search v-else :size="12" class="text-muted-foreground" />
            <span class="font-medium">{{ tc.name === 'read_page' ? 'Reading page' : tc.name === 'tavily_search' ? 'Searching' : tc.name }}</span>
            <span class="text-muted-foreground">{{ toolQuery(tc.params) }}</span>
            <Badge
              :variant="tc.status === 'done' ? 'secondary' : tc.status === 'error' ? 'destructive' : 'outline'"
              class="ml-auto text-[10px]"
            >
              {{ tc.status }}
            </Badge>
          </button>
          <div
            v-if="openToolDetails.has(tc.id) && tc.result"
            class="mt-2 max-h-40 overflow-y-auto text-xs text-muted-foreground"
          >
            <pre class="whitespace-pre-wrap font-sans">{{ tc.result }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
