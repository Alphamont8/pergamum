import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  findCitationForSentence,
  applyInTextCitations,
  createCitationSearchCache,
  type SentenceCitationResult,
} from '@/lib/cite/pipeline'
import { formatCitationJobsInDocumentOrder, type CitationJob } from '@/lib/cite/documentOrderFormatting'
import { claimQueryFromAnalyzed, type AnalyzedSentence } from '@/lib/cite/analyze'
import { isLlmConfigured } from '@/lib/ai/provider'
import { creditCites, getUserCitesBalance } from '@/lib/cites/ledger'
import {
  applyCitationEntitlements,
  getUserCitationEntitlements,
} from '@/lib/billing/entitlements'
import type { GenerationSettings, SourceRecord } from '@/types'

export const maxDuration = 120
export const runtime = 'nodejs'

const bodySchema = z.object({
  generationId: z.string().uuid(),
  sentenceIndex: z.number().int().min(0),
})

export async function POST(request: Request) {
  if (!isLlmConfigured()) {
    return NextResponse.json({ error: "Citation generation isn't configured yet." }, { status: 503 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'You need to sign in to do that.' }, { status: 401 })
  }

  const entitlements = await getUserCitationEntitlements(user.id)
  if (!entitlements.allowSentenceRetry) {
    return NextResponse.json(
      {
        error: 'Sentence retry is a Pro feature.',
        code: 'pro_required',
      },
      { status: 403 },
    )
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 400 })
  }

  const { generationId, sentenceIndex } = parsed.data
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
      { error: "This draft isn't ready for a sentence retry yet." },
      { status: 400 },
    )
  }

  const sentences = (generation.sentences ?? []) as AnalyzedSentence[]
  const sentence = sentences.find((s) => s.index === sentenceIndex)
  if (!sentence) {
    return NextResponse.json({ error: "We couldn't find that sentence." }, { status: 404 })
  }

  const balance = await getUserCitesBalance(user.id)
  if (balance < 1) {
    return NextResponse.json(
      {
        error: "You don't have enough Cites for a retry.",
        citesRequired: 1,
        balance,
      },
      { status: 402 },
    )
  }

  const settings = applyCitationEntitlements(
    generation.settings as GenerationSettings,
    entitlements,
  )

  await creditCites({
    userId: user.id,
    delta: -1,
    kind: 'spend',
    referenceId: `${generationId}:retry:${sentenceIndex}:${Date.now()}`,
    note: `Retried citation for sentence ${sentenceIndex + 1}.`,
  })

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
    }>
    essay?: string
    originalEssay?: string
    bibliography?: string[]
  }

  const priorSources: SourceRecord[] = []
  for (const c of priorResult.citations ?? []) {
    if (c.index === sentenceIndex) continue
    if (c.status === 'done' && c.record) priorSources.push(c.record)
  }

  let result: SentenceCitationResult
  try {
    result = await findCitationForSentence({
      sentence: sentence.text,
      settings,
      entitlements,
      priorSourceIds: priorSources.map((s) => s.id),
      allSourcesSoFar: priorSources,
      claimType: sentence.claimType,
      claimQuery: claimQueryFromAnalyzed(sentence),
      analyzedSentence: sentence,
      searchCache: createCitationSearchCache(),
    })
  } catch (err) {
    await creditCites({
      userId: user.id,
      delta: 1,
      kind: 'grant',
      referenceId: `${generationId}:retry-refund:${sentenceIndex}:${Date.now()}`,
      note: 'Refund for failed sentence retry',
    })
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "That retry didn't finish.",
      },
      { status: 500 },
    )
  }

  if (result.status === 'failed') {
    await creditCites({
      userId: user.id,
      delta: 1,
      kind: 'grant',
      referenceId: `${generationId}:retry-miss-refund:${sentenceIndex}:${Date.now()}`,
      note: 'Refund for missed sentence retry',
    })
  }

  const allSources = [...priorSources]
  if (result.status === 'done' && result.record) {
    allSources.push(result.record)
  }

  await service
    .from('generation_citations')
    .upsert(
      {
        generation_id: generationId,
        sentence_index: sentenceIndex,
        sentence_text: sentence.text,
        status: result.status === 'done' ? 'done' : 'failed',
        provider: result.provider ?? null,
        similarity: result.similarity ?? null,
        authors: result.record?.authors ?? null,
        title: result.record?.title ?? null,
        source_name: result.record?.venue?.name ?? result.record?.publisher ?? null,
        publication_date: result.record?.publicationDate ?? result.record?.year ?? null,
        doi: result.record?.doi ?? null,
        url: result.record?.url ?? null,
        metadata: {
          ...(result.record ?? {}),
          claim: result.claim ?? null,
          verificationConfidence: result.verificationConfidence ?? null,
        },
        correction: result.correction ?? null,
        in_text: result.inText ?? null,
        bibliography: result.bibliography ?? null,
        error_message: result.errorMessage ?? null,
      },
      { onConflict: 'generation_id,sentence_index' },
    )

  const existingCitations = [...(priorResult.citations ?? [])]
  const nextCitation = {
    index: sentenceIndex,
    sentence: sentence.text,
    status: result.status,
    inText: result.inText,
    correction: result.correction,
    bibliography: result.bibliography,
    provider: result.provider,
    similarity: result.similarity,
    title: result.record?.title,
    authors: result.record?.authors,
    url: result.record?.url,
    doi: result.record?.doi,
    errorMessage: result.errorMessage,
    record: result.record,
  }
  const citeIdx = existingCitations.findIndex((c) => c.index === sentenceIndex)
  if (citeIdx >= 0) existingCitations[citeIdx] = nextCitation
  else existingCitations.push(nextCitation)
  existingCitations.sort((a, b) => a.index - b.index)

  const formatJobs: CitationJob[] = []
  for (const c of existingCitations) {
    const record = (c as { record?: SourceRecord }).record
    if (c.status !== 'done' || !record) continue
    formatJobs.push({
      sentence: {
        index: c.index,
        text: c.sentence ?? sentences.find((s) => s.index === c.index)?.text ?? '',
      },
      result: {
        status: 'done',
        record,
      },
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

  await service
    .from('generations')
    .update({
      status: 'completed',
      result: resultPayload,
      cites_spent: Number(generation.cites_spent ?? 0) + (result.status === 'done' ? 1 : 0),
    })
    .eq('id', generationId)

  const newBalance = await getUserCitesBalance(user.id)

  return NextResponse.json({
    ok: true,
    citation: nextCitation,
    result: resultPayload,
    balance: newBalance,
    citesCharged: result.status === 'done' ? 1 : 0,
  })
}
