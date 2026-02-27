import { Type } from '@mariozechner/pi-ai'
import type { Tool } from '@mariozechner/pi-ai'

export function getReadPageTool(): Tool {
  return {
    name: 'read_page',
    description:
      'Extract the readable content of the current web page. Use this when the user asks about the page they are viewing, wants a summary, or references page content.',
    parameters: Type.Object({}),
  }
}

export async function executeReadPage(signal: AbortSignal): Promise<string> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) {
    throw new Error('No active tab found')
  }

  const url = tab.url ?? ''
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
    throw new Error('Cannot read browser internal pages.')
  }

  return new Promise<string>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }

    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'))
    signal.addEventListener('abort', onAbort, { once: true })

    chrome.tabs.sendMessage(tab.id!, { type: 'READ_PAGE' }, (response) => {
      signal.removeEventListener('abort', onAbort)

      if (chrome.runtime.lastError) {
        reject(new Error(`Cannot read page: ${chrome.runtime.lastError.message}`))
        return
      }

      if (response?.error) {
        reject(new Error(response.error))
        return
      }

      resolve(response?.content ?? 'No content extracted.')
    })
  })
}
