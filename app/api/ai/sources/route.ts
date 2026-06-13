import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getApiAuth } from '@/lib/auth/context'
import { completeStructured, isLlmConfigured } from '@/lib/ai/provider'
import { SOURCE_SEARCH_QUERY_SYSTEM } from '@/lib/ai/prompts'
import { sourceSearchQueryExpansionSchema } from '@/lib/ai/digest/schemas'
import { QuotaExceededError, assertWithinQuota, quotaErrorResponse } from '@/lib/ai/usage'
import { searchAllSources } from '@/lib/enrichment/search'
import { searchSourcesForNode } from '@/services/essay/stubs'
import type { SourceSearchResult } from '@/types'

const bodySchema = z.object({
  query: z.string(),
  nodeTitle: z.string().optional(),
  thesis: z.string().optional(),
})

export async function POST(request: Request) {
  const auth = await getApiAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  try {
    await assertWithinQuota(auth, 'sources_search')
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return NextResponse.json(quotaErrorResponse(err), { status: 429 })
    }
    throw err
  }

  const { query, nodeTitle, thesis } = parsed.data
  const topic = query.trim() || nodeTitle?.trim() || 'this topic'

  if (!isLlmConfigured() && !process.env.EXA_API_KEY) {
    const results = await searchSourcesForNode(topic)
    return NextResponse.json({ results })
  }

  try {
    let webQuery = topic
    let academicQuery = topic

    if (isLlmConfigured()) {
      const expansion = await completeStructured(
        sourceSearchQueryExpansionSchema,
        [
          {
            role: 'user',
            content: [
              `Research topic / outline node: ${topic}`,
              thesis ? `Essay thesis: ${thesis}` : '',
              nodeTitle ? `Outline node: ${nodeTitle}` : '',
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
        { system: SOURCE_SEARCH_QUERY_SYSTEM, temperature: 0.3 },
      )
      webQuery = expansion.webQuery
      academicQuery = expansion.academicQuery
    }

    const results = await searchAllSources(webQuery, academicQuery)
    if (results.length > 0) {
      return NextResponse.json({ results: results.slice(0, 10) })
    }
  } catch {
    /* fallback */
  }

  const fallback: SourceSearchResult[] = await searchSourcesForNode(topic)
  return NextResponse.json({ results: fallback })
}
