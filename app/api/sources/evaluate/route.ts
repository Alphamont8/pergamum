import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getApiAuth } from '@/lib/auth/context'
import { completeStructured, isLlmConfigured } from '@/lib/ai/provider'
import { OBJECTIVITY_EVAL_SYSTEM } from '@/lib/ai/prompts'
import { objectivityScoreSchema } from '@/lib/ai/digest/schemas'
import { QuotaExceededError, assertWithinQuota, quotaErrorResponse } from '@/lib/ai/usage'
import { computeDeterministicReliability, mergeLlmObjectivityScore } from '@/lib/reliability/scoring'
import type { SourceRecord } from '@/types'

const bodySchema = z.object({
  source: z.object({
    id: z.string(),
    title: z.string(),
    type: z.enum(['primary', 'secondary']),
    url: z.string().optional(),
    authors: z.string().optional(),
    year: z.string().optional(),
    summary: z.string().optional(),
    abstract: z.string().optional(),
    sourceKind: z.string().optional(),
    addedVia: z.string().optional(),
    citedByCount: z.number().optional(),
    fwci: z.number().optional(),
    venue: z
      .object({
        name: z.string().optional(),
        type: z.string().optional(),
      })
      .optional(),
    authorships: z
      .array(
        z.object({
          name: z.string(),
          hIndex: z.number().optional(),
          institutions: z.array(z.string()).optional(),
        }),
      )
      .optional(),
    openAccess: z
      .object({
        isOA: z.boolean(),
      })
      .optional(),
  }),
  useLlm: z.boolean().optional(),
})

export async function POST(request: Request) {
  const auth = await getApiAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const json = await request.json()
    const parsed = bodySchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    try {
      await assertWithinQuota(auth, 'sources_evaluate')
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        return NextResponse.json(quotaErrorResponse(err), { status: 429 })
      }
      throw err
    }

    const source = parsed.data.source as unknown as SourceRecord
    let reliability = computeDeterministicReliability(source)

    const useLlm = parsed.data.useLlm !== false && isLlmConfigured()
    if (useLlm) {
      try {
        const llmResult = await completeStructured(
          objectivityScoreSchema,
          [
            {
              role: 'user',
              content: `Title: ${source.title}
Authors: ${source.authors ?? 'unknown'}
Type: ${source.sourceKind ?? source.type}
Summary: ${(source.abstract ?? source.summary ?? '').slice(0, 800)}
URL: ${source.url ?? 'none'}`,
            },
          ],
          { system: OBJECTIVITY_EVAL_SYSTEM, maxTokens: 120, temperature: 0.2 },
        )
        reliability = mergeLlmObjectivityScore(
          reliability,
          llmResult.score,
          llmResult.rationale ?? 'LLM objectivity assessment.',
        )
      } catch {
        /* keep deterministic objectivity */
      }
    }

    return NextResponse.json({ reliability })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Evaluation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
