import type { CitationPipelineStage } from '@/lib/cite/stages'
import { formatMissReason, reasoningImpliesCitations } from '@/lib/format/agentReasoning'

export type FeedStepCopy = { message: string; detail: string }

function truncate(text: string, max: number): string {
  const t = text.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1).trim()}…`
}

export function analyzeStepCopy(
  step: 'read' | 'claims' | 'links' | 'queries' | 'result',
  options?: { count?: number; reasoning?: string | null },
): FeedStepCopy {
  switch (step) {
    case 'read':
      return {
        message: 'Reading your draft',
        detail: 'Looking for factual claims that need a source.',
      }
    case 'claims':
      return {
        message: 'Skipping opinions and plans',
        detail: 'Leaving out recommendations and wording that does not need backing.',
      }
    case 'links':
      return {
        message: 'Checking your pasted links',
        detail: 'We will try your URLs or DOIs before searching elsewhere.',
      }
    case 'queries':
      return {
        message: 'Preparing search terms',
        detail: 'Turning each claim into plain searches that work across databases and the web.',
      }
    case 'result': {
      const n = options?.count ?? 0
      const reasoning = options?.reasoning?.trim()
      if (n === 0) {
        if (reasoning && reasoningImpliesCitations(reasoning)) {
          return {
            message: "We couldn't finish analysis",
            detail:
              "We found claims in your draft but couldn't match them to sentences. Try again or shorten your draft.",
          }
        }
        return {
          message: 'No citations needed',
          detail: reasoning || 'Nothing in your draft needs a source right now.',
        }
      }
      return {
        message: `Found ${n} sentence${n === 1 ? '' : 's'} to cite`,
        detail:
          reasoning ||
          `These sentences make claims that should be supported by a published source.`,
      }
    }
  }
}

/** Overall generation subtask copy — never names a specific sentence. */
export function generationStageDetail(
  stage: CitationPipelineStage | 'searching' | 'analyze',
): string {
  const detailByStage: Record<CitationPipelineStage, string> = {
    claim: 'Working out what each sentence is claiming.',
    resolve: 'Checking whether you already named a source in the draft.',
    reuse: 'Seeing whether an earlier match works here too.',
    academic: 'Searching academic papers and journals.',
    web: 'Searching news and trusted web sources.',
    rank: 'Comparing the strongest matches.',
    verify: 'Checking that the source really backs up the claim.',
    found: 'Found a source that supports the claim.',
    miss: "We couldn't find a source that clearly supports this claim.",
  }

  if (stage === 'searching' || stage === 'analyze') {
    return 'Looking for sources that support each claim.'
  }
  return detailByStage[stage] ?? 'Looking for a source that fits this claim.'
}

export function searchStepCopy(
  stage: CitationPipelineStage | 'searching' | 'analyze',
  sentenceOrdinal: number,
  total: number,
  options?: { sourceTitle?: string; missReason?: string | null },
): FeedStepCopy {
  const n = sentenceOrdinal
  const detail = generationStageDetail(stage)

  if (stage === 'searching') {
    return {
      message: `Searching ${total} sentence${total === 1 ? '' : 's'}`,
      detail,
    }
  }

  if (stage === 'found') {
    const title = options?.sourceTitle?.trim()
    return {
      message: total > 1 ? `Cited Sentence ${n}` : 'Source found',
      detail: title
        ? `Matched to “${truncate(title, 72)}”.`
        : 'Found a source that supports the claim.',
    }
  }

  if (stage === 'miss') {
    const reason = formatMissReason(options?.missReason)
    return {
      message: total > 1 ? `Couldn't cite Sentence ${n}` : "Couldn't find a source",
      detail: reason || "We couldn't find a source that clearly supports this claim.",
    }
  }

  const finding = total > 1 ? `Finding a source for Sentence ${n}` : 'Finding a source'
  return {
    message: finding,
    detail,
  }
}

export function feedDoneCopy(): FeedStepCopy {
  return {
    message: 'Citations are ready',
    detail: 'Your in-text citations and bibliography are ready to review.',
  }
}

/** Compact generation summary for Show Reasoning. */
export function formatGenerationReasoning(options: {
  cited: number
  missed: number
  total: number
}): string {
  const { cited, missed, total } = options
  if (total <= 0) {
    return 'Your in-text citations and bibliography are ready to review.'
  }
  const parts: string[] = []
  if (cited > 0) {
    parts.push(`Cited ${cited} of ${total} sentence${total === 1 ? '' : 's'}.`)
  }
  if (missed > 0) {
    parts.push(
      `Couldn't find a solid source for ${missed} sentence${missed === 1 ? '' : 's'}.`,
    )
  }
  if (!parts.length) {
    parts.push(`Searched sources for ${total} sentence${total === 1 ? '' : 's'}.`)
  }
  parts.push('Your in-text citations and bibliography are ready to review.')
  return parts.join(' ')
}
