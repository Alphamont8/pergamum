import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  findCitationForSentence,
  applyInTextCitations,
  createCitationSearchCache,
  type CitationPipelineStage,
} from '@/lib/cite/pipeline'
import { formatCitationJobsInDocumentOrder } from '@/lib/cite/documentOrderFormatting'
import { stageMessage } from '@/lib/cite/stageCopy'
import { formatBibliographyEntry, formatInTextCitation } from '@/lib/citations'
import { claimQueryFromAnalyzed, type AnalyzedSentence as CiteAnalyzedSentence } from '@/lib/cite/analyze'
import { isLlmConfigured } from '@/lib/ai/provider'
import { creditCites, getUserCitesBalance } from '@/lib/cites/ledger'
import {
  applyCitationEntitlements,
  getUserCitationEntitlements,
} from '@/lib/billing/entitlements'
import { generateEssayTitle, needsGeneratedTitle } from '@/lib/essay/title'
import type { GenerationSettings, SourceRecord } from '@/types'

export const maxDuration = 300
export const runtime = 'nodejs'

type AnalyzedSentence = CiteAnalyzedSentence

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export async function POST(request: Request) {
  if (!isLlmConfigured()) {
    return new Response(JSON.stringify({ error: "Citation generation isn't configured yet." }), { status: 503 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response(JSON.stringify({ error: 'You need to sign in to do that.' }), { status: 401 })
  }

  const body = (await request.json()) as { generationId?: string }
  if (!body.generationId) {
    return new Response(JSON.stringify({ error: 'Something went wrong. Please try again.' }), { status: 400 })
  }

  const service = await createServiceClient()
  const { data: generation } = await service
    .from('generations')
    .select('*')
    .eq('id', body.generationId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!generation) {
    return new Response(JSON.stringify({ error: "We couldn't find that draft." }), { status: 404 })
  }

  if (!['quoted', 'generating'].includes(generation.status)) {
    return new Response(JSON.stringify({ error: "This draft isn't ready for citation generation yet." }), {
      status: 400,
    })
  }

  const sentences = (generation.sentences ?? []) as AnalyzedSentence[]
  const citesRequired = Number(generation.cites_required ?? sentences.length)
  const [balance, entitlements] = await Promise.all([
    getUserCitesBalance(user.id),
    getUserCitationEntitlements(user.id),
  ])
  const settings = applyCitationEntitlements(
    generation.settings as GenerationSettings,
    entitlements,
  )

  if (balance < citesRequired) {
    return new Response(
      JSON.stringify({
        error: "You don't have enough Cites for this.",
        citesRequired,
        balance,
      }),
      { status: 402 },
    )
  }

  const encoder = new TextEncoder()
  const userId = user.id

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sse(event, data)))
      }

      let spent = false
      let citesSpent = 0

      try {
        await service
          .from('generations')
          .update({
            status: 'generating',
            settings,
            progress: { step: 'generating', current: 0, total: sentences.length },
          })
          .eq('id', generation.id)

        // Deduct cites via ledger only (server-managed)
        await creditCites({
          userId,
          delta: -citesRequired,
          kind: 'spend',
          referenceId: generation.id,
          note:
            citesRequired === 1
              ? 'Generation of 1 citation'
              : `Generation of ${citesRequired} citations`,
        })
        spent = true
        citesSpent = citesRequired

        await service
          .from('generations')
          .update({ cites_spent: citesRequired })
          .eq('id', generation.id)

        // Fallback for drafts analyzed before titles were generated at analyze time.
        const titlePromise = needsGeneratedTitle(generation.title)
          ? generateEssayTitle(generation.essay_input).then(async (title) => {
              const { error } = await service
                .from('generations')
                .update({ title })
                .eq('id', generation.id)
              if (!error) send('title', { title })
              return title
            })
          : Promise.resolve(generation.title as string)

        send('status', {
          step: 'generating',
          message: 'Searching for sources to back up your claims…',
          current: 0,
          total: sentences.length,
        })

        if (sentences.length) {
          await service.from('generation_citations').upsert(
            sentences.map((s) => ({
              generation_id: generation.id,
              sentence_index: s.index,
              sentence_text: s.text,
              status: 'pending',
            })),
            { onConflict: 'generation_id,sentence_index' },
          )
        }

        const sharedSourcesRef: { current: SourceRecord[] } = { current: [] }
        let completed = 0

        // Mark all searching up front, then cite in parallel.
        if (sentences.length) {
          await service
            .from('generation_citations')
            .update({ status: 'searching' })
            .eq('generation_id', generation.id)
        }

        send('progress', {
          step: 'searching',
          message: `Working through ${sentences.length} sentence${sentences.length === 1 ? '' : 's'} at once…`,
          current: 0,
          total: sentences.length,
        })

        type CiteJob = {
          sentence: AnalyzedSentence
          result: Awaited<ReturnType<typeof findCitationForSentence>>
        }

        // Basic runs fewer parallel workers to reduce burst Exa/LLM spend.
        const maxConcurrency = entitlements.planTier === 'basic' ? 2 : 4
        const CONCURRENCY = Math.min(maxConcurrency, Math.max(1, sentences.length))
        const jobs: CiteJob[] = new Array(sentences.length)
        let cursor = 0
        const searchCache = createCitationSearchCache()

        async function worker() {
          while (cursor < sentences.length) {
            const i = cursor++
            const sentence = sentences[i]
            send('progress', {
              step: 'claim',
              message: `Tracking down a source for sentence ${sentence.index + 1} of ${sentences.length}…`,
              current: completed,
              total: sentences.length,
              sentenceIndex: sentence.index,
            })

            const priorSnapshot = sharedSourcesRef.current
            const result = await findCitationForSentence({
              sentence: sentence.text,
              settings,
              entitlements,
              priorSourceIds: priorSnapshot.map((s) => s.id),
              allSourcesSoFar: priorSnapshot,
              claimType: sentence.claimType,
              claimQuery: claimQueryFromAnalyzed(sentence),
              analyzedSentence: sentence,
              searchCache,
              onStage: (stage: CitationPipelineStage) => {
                send('progress', {
                  step: stage,
                  message: stageMessage(stage, sentence.index + 1, sentences.length),
                  current: completed,
                  total: sentences.length,
                  sentenceIndex: sentence.index,
                })
              },
            })

            if (result.status === 'done' && result.record) {
              sharedSourcesRef.current = [...sharedSourcesRef.current, result.record]
              // Provisional in-text for live theater; final pass below normalizes order.
              try {
                result.bibliography = await formatBibliographyEntry(
                  result.record,
                  settings.styleId,
                  sharedSourcesRef.current,
                )
                if (settings.inText && !result.preserveExistingInText) {
                  const prior = sharedSourcesRef.current
                    .slice(0, -1)
                    .map((s) => s.id)
                  result.inText = await formatInTextCitation(
                    result.record,
                    settings.styleId,
                    sharedSourcesRef.current,
                    { priorSourceIds: prior },
                  )
                }
              } catch {
                /* final formatting pass still runs */
              }
            }

            jobs[i] = { sentence, result }

            const row = {
              status: result.status === 'done' ? 'done' : 'failed',
              provider: result.provider ?? null,
              similarity: result.similarity ?? null,
              authors: result.record?.authors ?? null,
              title: result.record?.title ?? null,
              source_name: result.record?.venue?.name ?? result.record?.publisher ?? null,
              publication_date: result.record?.publicationDate ?? result.record?.year ?? null,
              doi: result.record?.doi ?? null,
              url: result.record?.url ?? null,
              volume: result.record?.biblio?.volume ?? null,
              issue: result.record?.biblio?.issue ?? null,
              pages: result.record?.biblio?.pages ?? null,
              metadata: {
                ...(result.record ?? {}),
                claim: result.claim ?? null,
                verificationConfidence: result.verificationConfidence ?? null,
                possibleMatches: result.possibleMatches ?? null,
              },
              correction: result.correction ?? null,
              in_text: result.inText ?? null,
              bibliography: result.bibliography ?? null,
              error_message: result.errorMessage ?? null,
            }

            await service
              .from('generation_citations')
              .update(row)
              .eq('generation_id', generation.id)
              .eq('sentence_index', sentence.index)

            completed += 1
            send('citation', {
              sentenceIndex: sentence.index,
              sentence: sentence.text,
              ...result,
              current: completed,
              total: sentences.length,
            })

            await service
              .from('generations')
              .update({
                progress: {
                  step: 'generating',
                  current: completed,
                  total: sentences.length,
                  message: `Processed ${completed} of ${sentences.length}.`,
                },
              })
              .eq('id', generation.id)
          }
        }

        await Promise.all([
          titlePromise.catch(() => null),
          Promise.all(Array.from({ length: CONCURRENCY }, () => worker())),
        ])

        const citationResults = jobs.filter(Boolean)
        const { bibliography: uniqueBib } = await formatCitationJobsInDocumentOrder(
          citationResults,
          settings.styleId,
          settings,
        )

        for (const c of citationResults) {
          if (c.result.status !== 'done' || !c.result.record) continue
          await service
            .from('generation_citations')
            .update({
              in_text: c.result.inText ?? null,
              bibliography: c.result.bibliography ?? null,
              authors: c.result.record.authors ?? null,
              title: c.result.record.title ?? null,
              source_name: c.result.record.venue?.name ?? c.result.record.publisher ?? null,
              publication_date: c.result.record.publicationDate ?? c.result.record.year ?? null,
            })
            .eq('generation_id', generation.id)
            .eq('sentence_index', c.sentence.index)
        }

        const failedCount = citationResults.filter((c) => c.result.status === 'failed').length
        if (failedCount > 0) {
          try {
            await creditCites({
              userId,
              delta: failedCount,
              kind: 'grant',
              referenceId: `${generation.id}:failed-refund`,
              note: `Refund for ${failedCount} failed citation${failedCount === 1 ? '' : 's'}`,
            })
            citesSpent = Math.max(0, citesSpent - failedCount)
            await service
              .from('generations')
              .update({ cites_spent: citesSpent })
              .eq('id', generation.id)
            send('refund', { failedCount, citesRefunded: failedCount })
          } catch {
            /* best-effort partial refund */
          }
        }

        const essayCitations = citationResults
          .filter((c) => c.result.status === 'done')
          .map((c) => ({
            sentence: c.sentence.text,
            inText: c.result.inText,
            correction: c.result.correction,
            accepted: false,
          }))

        const essayWithCitations = applyInTextCitations(
          generation.essay_input,
          essayCitations,
          settings.styleId,
        )

        const resultPayload = {
          essay: essayWithCitations,
          originalEssay: generation.essay_input,
          bibliography: uniqueBib,
          citations: citationResults.map((c) => ({
            index: c.sentence.index,
            sentence: c.sentence.text,
            status: c.result.status,
            inText: c.result.inText,
            correction: c.result.correction,
            bibliography: c.result.bibliography,
            provider: c.result.provider,
            similarity: c.result.similarity,
            title: c.result.record?.title,
            authors: c.result.record?.authors,
            url: c.result.record?.url,
            doi: c.result.record?.doi,
            errorMessage: c.result.errorMessage,
            record: c.result.status === 'done' ? c.result.record : undefined,
          })),
          citesRefunded: failedCount > 0 ? failedCount : 0,
        }

        await service
          .from('generations')
          .update({
            status: 'completed',
            result: resultPayload,
            progress: {
              step: 'completed',
              current: sentences.length,
              total: sentences.length,
              message: 'Citation generation complete.',
            },
          })
          .eq('id', generation.id)

        if (userId) {
          await service.rpc('increment_bibliographies', { p_user_id: userId })
        }

        const finalTitle = await titlePromise.catch(() => generation.title as string)

        send('complete', {
          generationId: generation.id,
          title: needsGeneratedTitle(finalTitle) ? undefined : finalTitle,
          result: resultPayload,
        })
        controller.close()
      } catch (err) {
        const message = err instanceof Error ? err.message : "We couldn't finish citation generation."
        // Refund if we already spent
        if (spent && citesSpent > 0) {
          try {
            await creditCites({
              userId,
              delta: citesSpent,
              kind: 'grant',
              referenceId: generation.id,
              note: 'Refund after failed generation',
            })
          } catch {
            /* best-effort refund */
          }
        }
        await service
          .from('generations')
          .update({ status: 'failed', error_message: message })
          .eq('id', generation.id)
        send('error', { message })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
