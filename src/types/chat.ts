export interface ChatMessage {
  readonly id: string
  readonly role: 'user' | 'assistant'
  readonly content: string
  readonly thinkingContent?: string
  readonly toolCalls?: ReadonlyArray<ToolCallInfo>
  readonly timestamp: number
}

export interface ToolCallInfo {
  readonly id: string
  readonly name: string
  readonly params: Record<string, unknown>
  readonly result?: string
  readonly status: 'pending' | 'running' | 'done' | 'error'
}

export interface Conversation {
  readonly url: string
  readonly messages: ReadonlyArray<ChatMessage>
  readonly createdAt: number
  readonly updatedAt: number
}
