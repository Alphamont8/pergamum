import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getApiAuth } from '@/lib/auth/context'
import { enrichFromExa } from '@/lib/enrichment/exa'
import { enrichFromOpenAlex } from '@/lib/enrichment/openalex'
import { QuotaExceededError, assertWithinQuota, quotaErrorResponse } from '@/lib/ai/usage'
import type { SourceRecord } from '@/types'

const bodySchema = z.object({
  source: z.object({
    id: z.string(),
    title: z.string(),
    url: z.string().optional(),
    authors: z.string().optional(),
    year: z.string().optional(),
    publisher: z.string().optional(),
    summary: z.string().optional(),
    doi: z.string().optional(),
    type: z.enum(['primary', 'secondary']).optional(),
  }),
})

export async function POST(request: Request) {
  const auth = await getApiAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await assertWithinQuota(auth, 'sources_enrich')
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return NextResponse.json(quotaErrorResponse(err), { status: 429 })
    }
    throw err
  }

  const parsed = bodySchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const source = parsed.data.source as unknown as SourceRecord
  const openAlexPatch = await enrichFromOpenAlex(source)
  const exaPatch = await enrichFromExa({ ...source, ...openAlexPatch })

  const patch: Partial<SourceRecord> = {
    ...openAlexPatch,
    ...exaPatch,
    enrichment: {
      status:
        openAlexPatch.enrichment?.status === 'enriched' || Object.keys(exaPatch).length > 0
          ? 'enriched'
          : 'failed',
      error: openAlexPatch.enrichment?.error,
    },
  }

  return NextResponse.json({ patch })
}
