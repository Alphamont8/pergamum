import type { SourceRecord } from '@/types'

export interface ExaContentsResult {
  title?: string
  url?: string
  author?: string
  publishedDate?: string
  text?: string
  highlights?: string[]
  favicon?: string
  image?: string
}

async function exaFetch<T>(path: string, body: Record<string, unknown>): Promise<T | null> {
  const apiKey = process.env.EXA_API_KEY
  if (!apiKey) return null

  const res = await fetch(`https://api.exa.ai${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) return null
  return res.json() as Promise<T>
}

export async function enrichFromExa(source: SourceRecord): Promise<Partial<SourceRecord>> {
  if (!source.url) return {}

  const data = await exaFetch<{ results?: ExaContentsResult[] }>('/contents', {
    urls: [source.url],
    text: { maxCharacters: 2000 },
    highlights: { numSentences: 2, highlightsPerUrl: 2 },
    livecrawl: 'fallback',
  })

  const result = data?.results?.[0]
  if (!result) return {}

  let siteName: string | undefined
  try {
    siteName = new URL(source.url).hostname.replace(/^www\./, '')
  } catch {
    siteName = undefined
  }

  const patch: Partial<SourceRecord> = {
    exa: {
      favicon: result.favicon,
      image: result.image,
      siteName,
      publishedDate: result.publishedDate,
      highlights: result.highlights,
    },
  }

  if (!source.summary && result.text) {
    patch.summary = result.text.slice(0, 500)
  }
  if (!source.authors && result.author) {
    patch.authors = result.author
  }
  if (!source.year && result.publishedDate) {
    patch.year = result.publishedDate.slice(0, 4)
    patch.publicationDate = result.publishedDate
  }

  return patch
}
