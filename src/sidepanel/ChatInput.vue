<script setup lang="ts">
import { ref } from 'vue'
import { Send, Square } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

const props = defineProps<{
  isStreaming: boolean
}>()

const emit = defineEmits<{
  send: [text: string]
  stop: []
}>()

const input = ref('')

function handleSend() {
  if (props.isStreaming || !input.value.trim()) return
  emit('send', input.value)
  input.value = ''
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}
</script>

<template>
  <div class="border-t p-3">
    <div class="flex gap-2">
      <Textarea
        v-model="input"
        placeholder="Ask about this page..."
        rows="2"
        class="min-h-[40px] flex-1 resize-none text-sm"
        @keydown="handleKeydown"
      />
      <Button
        v-if="isStreaming"
        variant="destructive"
        size="icon"
        class="h-10 w-10 shrink-0"
        @click="$emit('stop')"
      >
        <Square :size="14" />
      </Button>
      <Button
        v-else
        size="icon"
        class="h-10 w-10 shrink-0"
        :disabled="!input.trim()"
        @click="handleSend"
      >
        <Send :size="14" />
      </Button>
    </div>
  </div>
</template>
