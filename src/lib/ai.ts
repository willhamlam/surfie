import { getModel, streamSimple } from '@mariozechner/pi-ai'
import type { Context, Tool, Message, UserMessage, AssistantMessage, ToolResultMessage } from '@mariozechner/pi-ai'
import type { Settings } from '@/types/settings'

export type { Context, Tool, Message, UserMessage, AssistantMessage, ToolResultMessage }

export function createModel(settings: Settings) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = getModel('anthropic', settings.modelId as any)
  if (settings.anthropicBaseUrl) {
    model.baseUrl = settings.anthropicBaseUrl
  }
  return model
}

export function buildContext(
  messages: ReadonlyArray<Message>,
  systemPrompt: string,
  tools?: Tool[],
): Context {
  return {
    systemPrompt,
    messages: [...messages],
    ...(tools && tools.length > 0 ? { tools } : {}),
  }
}

export interface StreamOptions {
  readonly apiKey: string
  readonly signal?: AbortSignal
  readonly thinkingBudget?: number | null
}

export function streamChat(
  model: ReturnType<typeof getModel>,
  context: Context,
  options: StreamOptions,
) {
  const streamOpts: Record<string, unknown> = {
    apiKey: options.apiKey,
    signal: options.signal,
  }

  if (options.thinkingBudget != null && options.thinkingBudget > 0) {
    streamOpts.reasoning = 'high'
  }

  return streamSimple(model, context, streamOpts)
}
