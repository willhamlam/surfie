import { Type } from '@mariozechner/pi-ai'
import type { Tool } from '@mariozechner/pi-ai'

export function getTavilyTool(): Tool {
  return {
    name: 'tavily_search',
    description: 'Search the web for current information. Use this when the user asks about recent events, news, or anything that requires up-to-date information.',
    parameters: Type.Object({
      query: Type.String({ description: 'The search query' }),
    }),
  }
}

interface TavilyResult {
  readonly title: string
  readonly url: string
  readonly content: string
}

interface TavilyResponse {
  readonly results: ReadonlyArray<TavilyResult>
}

export async function executeTavilySearch(
  params: { query: string },
  apiKey: string,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query: params.query,
      max_results: 5,
      include_answer: false,
    }),
    signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error')
    throw new Error(`Tavily API error (${response.status}): ${text}`)
  }

  const data = (await response.json()) as TavilyResponse

  return data.results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.content}`)
    .join('\n\n')
}
