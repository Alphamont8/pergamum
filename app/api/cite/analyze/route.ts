import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { analyzeEssayForCitations } from '@/lib/cite/analyze'
import { finalizeNoCitationGeneration } from '@/lib/cite/finalizeNoCitations'
import { ensureGenerationTitle, generateEssayTitle, needsGeneratedTitle } from '@/lib/essay/title'
import { isLlmConfigured } from '@/lib/ai/provider'
import { getUserCitesBalance } from '@/lib/cites/ledger'
import {
  applyCitationEntitlements,
  getUserCitationEntitlements,
  isOverWordLimit,
} from '@/lib/billing/entitlements'
import { BASIC_MAX_WORDS } from '@/lib/billing/plans'
import type { GenerationSettings } from '@/types'

export const maxDuration = 120

const bodySchema = z.object({
  essay: z.string().min(40).max(100_000),
  settings: z.object({
    styleId: z.string(),
    inText: z.boolean(),
    suggestCorrections: z.boolean(),
    recency: z.enum(['any', '10y', '5y']),
    sourceTier: z.enum(['any', 'academic']),
  }),
})

type AnalyzeSettingsSlice = Pick<GenerationSettings, 'recency' | 'sourceTier'>

function analyzeSettingsMatch(
  stored: unknown,
  next: AnalyzeSettingsSlice,
): boolean {
  if (!stored || typeof stored !== 'object') return false
  const s = stored as Record<string, unknown>
  return s.recency === next.recency && s.sourceTier === next.sourceTier
}

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

  const parsed = bodySchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: "That request wasn't valid.", details: parsed.error.flatten() }, { status: 400 })
  }

  const { essay, settings: requestedSettings } = parsed.data
  const [balance, entitlements] = await Promise.all([
    getUserCitesBalance(user.id),
    getUserCitationEntitlements(user.id),
  ])

  if (isOverWordLimit(essay, entitlements)) {
    return NextResponse.json(
      {
        error: `Basic drafts can be up to ${BASIC_MAX_WORDS.toLocaleString()} words. Upgrade to Pro for longer papers.`,
        code: 'word_limit',
        maxWords: BASIC_MAX_WORDS,
      },
      { status: 403 },
    )
  }

  const settings = applyCitationEntitlements(
    requestedSettings as GenerationSettings,
    entitlements,
  )

  const service = await createServiceClient()

  // Reuse a recent analysis when the essay + search settings are unchanged.
  const { data: cached } = await service
    .from('generations')
    .select('id, status, sentences, cites_required, settings, title, progress')
    .eq('user_id', user.id)
    .eq('essay_input', essay)
    .in('status', ['quoted', 'completed'])
    .order('created_at', { ascending: false })
    .limit(5)

  const matching = (cached ?? []).filter((row) =>
    analyzeSettingsMatch(row.settings, {
      recency: settings.recency,
      sourceTier: settings.sourceTier,
    }),
  )

  const reuseQuoted = matching.find((row) => row.status === 'quoted' && row.sentences)
  if (reuseQuoted?.sentences) {
    const sentences = reuseQuoted.sentences as Array<{ index: number; text: string; reason?: string }>
    const citesRequired = Number(reuseQuoted.cites_required ?? sentences.length)
    const progress =
      reuseQuoted.progress && typeof reuseQuoted.progress === 'object'
        ? (reuseQuoted.progress as { reasoning?: string })
        : null
    const title = await ensureGenerationTitle(
      service,
      reuseQuoted.id,
      essay,
      reuseQuoted.title,
    )
    if (citesRequired === 0) {
      await finalizeNoCitationGeneration(
        service,
        {
          id: reuseQuoted.id,
          title,
          essay_input: essay,
        },
        { reasoning: progress?.reasoning },
      )
    }
    return NextResponse.json({
      generationId: reuseQuoted.id,
      sentences,
      citesRequired,
      balance,
      enough: balance >= citesRequired,
      title,
      cached: true,
      reasoning: progress?.reasoning || undefined,
      noCitationsNeeded: citesRequired === 0,
    })
  }

  // Completed drafts can't be regenerated in place — clone analysis into a new quoted row.
  const reuseCompleted = matching.find((row) => row.status === 'completed' && row.sentences)
  if (reuseCompleted?.sentences) {
    const sentences = reuseCompleted.sentences as Array<{ index: number; text: string; reason?: string }>
    const citesRequired = Number(reuseCompleted.cites_required ?? sentences.length)
    const medical =
      reuseCompleted.settings &&
      typeof reuseCompleted.settings === 'object' &&
      (reuseCompleted.settings as { medical?: boolean }).medical === true
    const legal =
      reuseCompleted.settings &&
      typeof reuseCompleted.settings === 'object' &&
      (reuseCompleted.settings as { legal?: boolean }).legal === true

    const cloneTitle = needsGeneratedTitle(reuseCompleted.title)
      ? 'Untitled draft'
      : (reuseCompleted.title as string)

    const { data: cloned, error: cloneError } = await service
      .from('generations')
      .insert({
        user_id: user.id,
        guest_session_id: null,
        title: cloneTitle,
        essay_input: essay,
        settings: { ...settings, medical, legal },
        status: 'quoted',
        sentences,
        cites_required: citesRequired,
        progress: {
          step: 'quoted',
          message:
            citesRequired === 0
              ? 'No citations needed.'
              : `Found ${citesRequired} sentences needing citations.`,
          citesRequired,
          balance,
        },
      })
      .select('id, title')
      .single()

    if (!cloneError && cloned) {
      const title = await ensureGenerationTitle(service, cloned.id, essay, cloned.title)
      if (citesRequired === 0) {
        await finalizeNoCitationGeneration(service, {
          id: cloned.id,
          title,
          essay_input: essay,
        })
      }
      return NextResponse.json({
        generationId: cloned.id,
        sentences,
        citesRequired,
        balance,
        enough: balance >= citesRequired,
        title,
        cached: true,
        noCitationsNeeded: citesRequired === 0,
      })
    }
  }

  const { data: generation, error: insertError } = await service
    .from('generations')
    .insert({
      user_id: user.id,
      guest_session_id: null,
      title: 'Untitled draft',
      essay_input: essay,
      settings,
      status: 'analyzing',
      progress: { step: 'analyzing', message: 'Finding sentences that need citations.' },
    })
    .select('id, title')
    .single()

  if (insertError || !generation) {
    return NextResponse.json({ error: insertError?.message ?? "We couldn't start citation analysis." }, { status: 500 })
  }

  try {
    const [analysis, title] = await Promise.all([
      analyzeEssayForCitations(essay, settings as GenerationSettings),
      needsGeneratedTitle(generation.title)
        ? generateEssayTitle(essay)
        : Promise.resolve(generation.title as string),
    ])
    const { sentences, medical, legal, reasoning } = analysis
    const citesRequired = sentences.length

    if (citesRequired === 0) {
      await service
        .from('generations')
        .update({
          title,
          sentences,
          settings: { ...settings, medical, legal },
          cites_required: 0,
          progress: {
            step: 'analyzing',
            message: 'No citations needed.',
            citesRequired: 0,
            balance,
            reasoning: reasoning || undefined,
          },
        })
        .eq('id', generation.id)

      await finalizeNoCitationGeneration(
        service,
        { id: generation.id, title, essay_input: essay },
        { reasoning: reasoning || undefined },
      )
    } else {
      await service
        .from('generations')
        .update({
          title,
          status: 'quoted',
          sentences,
          // Persist routing flags so generate can use medical / legal databases.
          settings: { ...settings, medical, legal },
          cites_required: citesRequired,
          progress: {
            step: 'quoted',
            message: `Found ${citesRequired} sentences needing citations.`,
            citesRequired,
            balance,
            reasoning: reasoning || undefined,
          },
        })
        .eq('id', generation.id)
    }

    return NextResponse.json({
      generationId: generation.id,
      sentences,
      citesRequired,
      balance,
      enough: balance >= citesRequired,
      title,
      reasoning: reasoning || undefined,
      noCitationsNeeded: citesRequired === 0,
    })
  } catch (err) {
    await service
      .from('generations')
      .update({
        status: 'failed',
        error_message: err instanceof Error ? err.message : "We couldn't analyze your essay.",
      })
      .eq('id', generation.id)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "We couldn't analyze your essay." },
      { status: 500 },
    )
  }
}
