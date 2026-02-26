<script setup lang="ts">
import { useSettings } from '@/composables/useSettings'
import { MODEL_OPTIONS } from '@/types/settings'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'

const { settings, update } = useSettings()

function onModelChange(value: string) {
  update({ modelId: value })
}

function toggleThinking() {
  update({
    thinkingBudget: settings.value.thinkingBudget === null ? 10000 : null,
  })
}
</script>

<template>
  <div class="flex h-full flex-col overflow-y-auto p-4">
    <h2 class="mb-4 text-sm font-semibold">Settings</h2>

    <div class="space-y-4">
      <div class="space-y-1.5">
        <label class="text-xs font-medium text-muted-foreground">Anthropic API Key</label>
        <Input
          type="password"
          :model-value="settings.anthropicApiKey"
          placeholder="sk-ant-..."
          @update:model-value="update({ anthropicApiKey: String($event) })"
        />
      </div>

      <div class="space-y-1.5">
        <label class="text-xs font-medium text-muted-foreground">Base URL</label>
        <Input
          :model-value="settings.anthropicBaseUrl"
          placeholder="https://api.anthropic.com"
          @update:model-value="update({ anthropicBaseUrl: String($event) })"
        />
      </div>

      <div class="space-y-1.5">
        <label class="text-xs font-medium text-muted-foreground">Tavily API Key</label>
        <Input
          type="password"
          :model-value="settings.tavilyApiKey"
          placeholder="tvly-..."
          @update:model-value="update({ tavilyApiKey: String($event) })"
        />
      </div>

      <Separator />

      <div class="space-y-1.5">
        <label class="text-xs font-medium text-muted-foreground">Model</label>
        <Select :model-value="settings.modelId" @update:model-value="onModelChange">
          <SelectTrigger>
            <SelectValue placeholder="Select model" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="model in MODEL_OPTIONS"
              :key="model.id"
              :value="model.id"
            >
              {{ model.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="space-y-1.5">
        <div class="flex items-center justify-between">
          <label class="text-xs font-medium text-muted-foreground">Extended Thinking</label>
          <Button
            variant="outline"
            size="sm"
            class="h-6 text-xs"
            @click="toggleThinking"
          >
            {{ settings.thinkingBudget !== null ? 'On' : 'Off' }}
          </Button>
        </div>
        <Input
          v-if="settings.thinkingBudget !== null"
          type="number"
          :model-value="settings.thinkingBudget"
          placeholder="Token budget"
          @update:model-value="update({ thinkingBudget: Number($event) })"
        />
      </div>

      <Separator />

      <div class="space-y-1.5">
        <label class="text-xs font-medium text-muted-foreground">System Prompt</label>
        <Textarea
          :model-value="settings.systemPrompt"
          rows="6"
          placeholder="System prompt..."
          @update:model-value="update({ systemPrompt: String($event) })"
        />
      </div>
    </div>
  </div>
</template>
