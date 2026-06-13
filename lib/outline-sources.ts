import type { OutlineNode, SourceRecord, SourceSearchResult } from '@/types'

async function searchSourcesApi(
  query: string,
  nodeTitle?: string,
  thesis?: string,
): Promise<SourceSearchResult[]> {
  const res = await fetch('/api/ai/sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, nodeTitle, thesis }),
  })
  if (!res.ok) return []
  const data = (await res.json()) as { results?: SourceSearchResult[] }
  return data.results ?? []
}

export async function attachInitialSourcesToOutline(
  nodes: OutlineNode[],
  options?: { thesis?: string },
): Promise<{ nodes: OutlineNode[]; sources: SourceRecord[] }> {
  const sources: SourceRecord[] = []
  const sourceKeyToId = new Map<string, string>()

  const enriched = await Promise.all(
    nodes.map(async (node) => {
      if (node.type !== 'subpoint') return node

      const results = await searchSourcesApi(node.title, node.title, options?.thesis)
      const result = results[0]
      if (!result) return node

      const key = result.url?.trim() || result.title.trim()
      let sourceId = sourceKeyToId.get(key)
      if (!sourceId) {
        sourceId = `src-init-${sourceKeyToId.size}-${Date.now()}`
        sourceKeyToId.set(key, sourceId)
        sources.push({
          id: sourceId,
          title: result.title,
          url: result.url,
          type: result.type ?? 'secondary',
          summary: result.summary,
          authors: result.authors,
          year: result.year,
          publisher: result.publisher,
          addedVia: 'search',
        })
      }

      const quote = result.quotes?.[0] ?? result.summary?.slice(0, 120) ?? ''
      return {
        ...node,
        sourceRefs: [{ sourceId, quote }],
      }
    }),
  )

  return { nodes: enriched, sources }
}
