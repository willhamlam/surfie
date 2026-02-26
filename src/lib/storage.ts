import type { Settings } from '@/types/settings'
import type { Conversation } from '@/types/chat'
import { DEFAULT_SETTINGS } from '@/types/settings'

export async function loadSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get('settings')
  return result.settings
    ? { ...DEFAULT_SETTINGS, ...result.settings }
    : DEFAULT_SETTINGS
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ settings })
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return url
  }
}

function conversationKey(url: string): string {
  return `conv::${normalizeUrl(url)}`
}

export async function loadConversation(url: string): Promise<Conversation | null> {
  const key = conversationKey(url)
  const result = await chrome.storage.local.get(key)
  return result[key] ?? null
}

export async function saveConversation(conversation: Conversation): Promise<void> {
  const key = conversationKey(conversation.url)
  await chrome.storage.local.set({ [key]: conversation })

  const indexResult = await chrome.storage.local.get('conv-index')
  const index: string[] = indexResult['conv-index'] ?? []
  const normalized = normalizeUrl(conversation.url)
  if (!index.includes(normalized)) {
    await chrome.storage.local.set({ 'conv-index': [...index, normalized] })
  }
}

export async function deleteConversation(url: string): Promise<void> {
  const key = conversationKey(url)
  await chrome.storage.local.remove(key)

  const indexResult = await chrome.storage.local.get('conv-index')
  const index: string[] = indexResult['conv-index'] ?? []
  const normalized = normalizeUrl(url)
  await chrome.storage.local.set({
    'conv-index': index.filter(u => u !== normalized),
  })
}

export { normalizeUrl }
