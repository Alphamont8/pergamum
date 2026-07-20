import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  applyInTextCitations,
  type SentenceCitationResult,
} from '@/lib/cite/pipeline'
import { formatCitationJobsInDocumentOrder, type CitationJob } from '@/lib/cite/documentOrderFormatting'
import { claimQueryFromAnalyzed, type AnalyzedSentence } from '@/lib/cite/analyze'
import {
  applyCitationEntitlements,
  getUserCitationEntitlements,
} from '@/lib/billing/entitlements'
import { normalizeSourceForCitation } from '@/lib/citations/normalize'
import type { GenerationSettings, SourceRecord } from '@/types'

export const maxDuration = 60
export const runtime = 'nodejs'

const matchSchema = z.object({
  title: z.string().min(1),
  authors: z.string().optional(),
  year: z.string().optional(),
  url: z.string().optional(),
  doi: z.string().optional(),
  similarity: z.number().optional(),
  abstract: z.string().optional(),
})

const bodySchema = z.object({
  generationId: z.string().uuid(),
  sentenceIndex: z.number().int().min(0),
  match: matchSchema,
})

function matchToRecord(match: z.infer<typeof matchSchema>, sentenceIndex: number): SourceRecord {
  return normalizeSourceForCitation({
    id: `pick-${sentenceIndex}-${match.doi || match.url || match.title}`.slice(0, 120),
    title: match.title,
    type: 'secondary',
    authors: match.authors,
    year: match.year,
    url: match.url || (match.doi ? `https://doi.org/${match.doi}` : undefined),
    doi: match.doi,
    abstract: match.abstract,
  })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'You need to sign in to do that.' }, { status: 401 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 400 })
  }

  const { generationId, sentenceIndex, match } = parsed.data
  const service = await createServiceClient()
  const { data: generation } = await service
    .from('generations')
    .select('*')
    .eq('id', generationId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!generation) {
    return NextResponse.json({ error: "We couldn't find that draft." }, { status: 404 })
  }

  if (!['completed', 'generating'].includes(generation.status)) {
    return NextResponse.json(
      { error: "This draft isn't ready for a source pick yet." },
      { status: 400 },
    )
  }

  const entitlements = await getUserCitationEntitlements(user.id)
  const settings = applyCitationEntitlements(
    generation.settings as GenerationSettings,
    entitlements,
  )
  const sentences = (generation.sentences ?? []) as AnalyzedSentence[]
  const sentence = sentences.find((s) => s.index === sentenceIndex)
  if (!sentence) {
    return NextResponse.json({ error: "We couldn't find that sentence." }, { status: 404 })
  }

  const record = matchToRecord(match, sentenceIndex)
  const priorResult = (generation.result ?? {}) as {
    citations?: Array<{
      index: number
      sentence?: string
      status: string
      record?: SourceRecord
      bibliography?: string
      inText?: string
      correction?: string | null
      provider?: string
      similarity?: number
      title?: string
      authors?: string
      url?: string
      doi?: string
      errorMessage?: string
      possibleMatches?: unknown
    }>
    essay?: string
    originalEssay?: string
    bibliography?: string[]
  }

  const existingCitations = [...(priorResult.citations ?? [])]
  const nextCitation = {
    index: sentenceIndex,
    sentence: sentence.text,
    status: 'done' as const,
    inText: undefined as string | undefined,
    correction: null as string | null,
    bibliography: undefined as string | undefined,
    provider: 'openalex',
    similarity: match.similarity ?? 0.7,
    title: record.title,
    authors: record.authors,
    url: record.url,
    doi: record.doi,
    errorMessage: undefined as string | undefined,
    record,
    possibleMatches: undefined,
  }

  const citeIdx = existingCitations.findIndex((c) => c.index === sentenceIndex)
  if (citeIdx >= 0) existingCitations[citeIdx] = nextCitation
  else existingCitations.push(nextCitation)
  existingCitations.sort((a, b) => a.index - b.index)

  const formatJobs: CitationJob[] = []
  for (const c of existingCitations) {
    const src = (c as { record?: SourceRecord }).record
    if (c.status !== 'done' || !src) continue
    formatJobs.push({
      sentence: {
        index: c.index,
        text: c.sentence ?? sentences.find((s) => s.index === c.index)?.text ?? '',
      },
      result: {
        status: 'done',
        record: src,
      } satisfies SentenceCitationResult,
    })
  }

  const { bibliography } = await formatCitationJobsInDocumentOrder(
    formatJobs,
    settings.styleId,
    settings,
  )

  for (const job of formatJobs) {
    const idx = existingCitations.findIndex((c) => c.index === job.sentence.index)
    if (idx >= 0) {
      existingCitations[idx] = {
        ...existingCitations[idx],
        inText: job.result.inText,
        bibliography: job.result.bibliography,
        record: job.result.record,
      }
    }
  }

  const essayCitations = existingCitations
    .filter((c) => c.status === 'done' && c.inText)
    .map((c) => ({
      sentence: c.sentence ?? sentences.find((s) => s.index === c.index)?.text ?? '',
      inText: c.inText,
      correction: null,
      accepted: false,
    }))

  const originalEssay = priorResult.originalEssay || generation.essay_input
  const essayWithCitations = applyInTextCitations(
    originalEssay,
    essayCitations,
    settings.styleId,
  )

  const resultPayload = {
    essay: essayWithCitations,
    originalEssay,
    bibliography,
    citations: existingCitations,
  }

  const picked = existingCitations.find((c) => c.index === sentenceIndex)

  await service
    .from('generation_citations')
    .upsert(
      {
        generation_id: generationId,
        sentence_index: sentenceIndex,
        sentence_text: sentence.text,
        status: 'done',
        provider: 'openalex',
        similarity: match.similarity ?? 0.7,
        authors: record.authors ?? null,
        title: record.title ?? null,
        doi: record.doi ?? null,
        url: record.url ?? null,
        metadata: { ...record, claim: claimQueryFromAnalyzed(sentence)?.claim ?? null },
        correction: null,
        in_text: picked?.inText ?? null,
        bibliography: picked?.bibliography ?? null,
        error_message: null,
      },
      { onConflict: 'generation_id,sentence_index' },
    )

  await service
    .from('generations')
    .update({
      status: 'completed',
      result: resultPayload,
    })
    .eq('id', generationId)

  return NextResponse.json({
    ok: true,
    citation: picked,
    result: resultPayload,
  })
}
