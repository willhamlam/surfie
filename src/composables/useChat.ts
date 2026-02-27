import { ref, readonly } from 'vue'
import type { ChatMessage, ToolCallInfo } from '@/types/chat'
import type { Settings } from '@/types/settings'
import type { AssistantMessage, Message, UserMessage, ToolResultMessage } from '@/lib/ai'
import { createModel, buildContext, streamChat } from '@/lib/ai'
import { getTavilyTool, executeTavilySearch } from '@/lib/tools/tavily-search'
import { getReadPageTool, executeReadPage } from '@/lib/tools/read-page'

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

const MAX_TOOL_ROUNDS = 5

export function useChat(getSettings: () => Settings) {
  const messages = ref<ChatMessage[]>([])
  const isStreaming = ref(false)
  const error = ref<string | null>(null)
  let abortController: AbortController | null = null

  function appendMessage(msg: ChatMessage): ChatMessage[] {
    const next = [...messages.value, msg]
    messages.value = next
    return next
  }

  function updateLastAssistant(patch: Partial<ChatMessage>) {
    const idx = messages.value.length - 1
    if (idx < 0 || messages.value[idx].role !== 'assistant') return
    const updated = { ...messages.value[idx], ...patch }
    messages.value = [...messages.value.slice(0, idx), updated]
  }

  function toPiMessages(msgs: ReadonlyArray<ChatMessage>): Message[] {
    const result: Message[] = []
    for (const msg of msgs) {
      if (msg.role === 'user') {
        result.push({
          role: 'user',
          content: msg.content,
          timestamp: msg.timestamp,
        } as UserMessage)
      } else if (msg.role === 'assistant') {
        const content: Array<{ type: string; [key: string]: unknown }> = []
        if (msg.thinkingContent) {
          content.push({ type: 'thinking', thinking: msg.thinkingContent })
        }
        if (msg.content) {
          content.push({ type: 'text', text: msg.content })
        }
        if (Array.isArray(msg.toolCalls)) {
          for (const tc of msg.toolCalls) {
            content.push({
              type: 'toolCall',
              id: tc.id,
              name: tc.name,
              arguments: tc.params,
            })
          }
        }
        result.push({
          role: 'assistant',
          content,
          timestamp: msg.timestamp,
        } as unknown as AssistantMessage)

        // Add tool results after assistant message
        if (Array.isArray(msg.toolCalls)) {
          for (const tc of msg.toolCalls) {
            if (tc.result != null) {
              result.push({
                role: 'toolResult',
                toolCallId: tc.id,
                toolName: tc.name,
                content: [{ type: 'text', text: tc.result }],
                isError: tc.status === 'error',
                timestamp: msg.timestamp,
              } as ToolResultMessage)
            }
          }
        }
      }
    }
    return result
  }

  async function sendMessage(text: string) {
    if (isStreaming.value || !text.trim()) return

    const settings = getSettings()
    if (!settings.anthropicApiKey) {
      error.value = 'Please set your Anthropic API key in Settings.'
      return
    }

    error.value = null
    isStreaming.value = true
    abortController = new AbortController()

    appendMessage({
      id: generateId(),
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    })

    try {
      await runStreamLoop(settings, abortController.signal)
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        error.value = msg
      }
    } finally {
      isStreaming.value = false
      abortController = null
    }
  }

  async function runStreamLoop(settings: Settings, signal: AbortSignal) {
    const model = createModel(settings)
    const tools = [
      ...(settings.tavilyApiKey ? [getTavilyTool()] : []),
      getReadPageTool(),
    ]

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const piMessages = toPiMessages(messages.value)
      const context = buildContext(piMessages, settings.systemPrompt, tools)

      appendMessage({
        id: generateId(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      })

      let textAccum = ''
      let thinkingAccum = ''
      const toolCalls: ToolCallInfo[] = []
      let hasToolUse = false

      const eventStream = streamChat(model, context, {
        apiKey: settings.anthropicApiKey,
        signal,
        thinkingBudget: settings.thinkingBudget,
      })

      for await (const event of eventStream) {
        if (signal.aborted) break

        switch (event.type) {
          case 'text_delta':
            textAccum += event.delta
            updateLastAssistant({ content: textAccum })
            break
          case 'thinking_delta':
            thinkingAccum += event.delta
            updateLastAssistant({ thinkingContent: thinkingAccum })
            break
          case 'toolcall_end':
            toolCalls.push({
              id: event.toolCall.id,
              name: event.toolCall.name,
              params: event.toolCall.arguments,
              status: 'pending',
            })
            updateLastAssistant({ toolCalls: [...toolCalls] })
            break
          case 'done':
            hasToolUse = event.message.stopReason === 'toolUse'
            break
          case 'error':
            throw new Error(event.error?.errorMessage ?? 'Stream error')
        }
      }

      if (!hasToolUse || toolCalls.length === 0 || signal.aborted) {
        return
      }

      // Execute tools and update message
      for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i]
        const updatedCalls = [...toolCalls]
        updatedCalls[i] = { ...tc, status: 'running' }
        updateLastAssistant({ toolCalls: updatedCalls })

        try {
          const result = await executeToolCall(tc, settings, signal)
          updatedCalls[i] = { ...tc, status: 'done', result }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Tool execution failed'
          updatedCalls[i] = { ...tc, status: 'error', result: msg }
        }

        updateLastAssistant({ toolCalls: [...updatedCalls] })
        toolCalls.splice(0, toolCalls.length, ...updatedCalls)
      }

      // Continue loop for next round with tool results
    }
  }

  async function executeToolCall(
    tc: ToolCallInfo,
    settings: Settings,
    signal: AbortSignal,
  ): Promise<string> {
    if (tc.name === 'read_page') {
      return executeReadPage(signal)
    }
    if (tc.name === 'tavily_search') {
      return executeTavilySearch(
        tc.params as { query: string },
        settings.tavilyApiKey,
        signal,
      )
    }
    throw new Error(`Unknown tool: ${tc.name}`)
  }

  function stopGeneration() {
    abortController?.abort()
  }

  function clearMessages() {
    messages.value = []
    error.value = null
  }

  function loadMessages(msgs: ReadonlyArray<ChatMessage>) {
    messages.value = msgs.map(msg => ({
      ...msg,
      toolCalls: Array.isArray(msg.toolCalls) ? msg.toolCalls : undefined,
    }))
  }

  return {
    messages: readonly(messages),
    isStreaming: readonly(isStreaming),
    error: readonly(error),
    sendMessage,
    stopGeneration,
    clearMessages,
    loadMessages,
  }
}
