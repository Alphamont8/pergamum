import type { CitationPipelineStage } from '@/lib/cite/stages'

export function stageMessage(
  stage: CitationPipelineStage,
  sentenceOrdinal: number,
  total: number,
): string {
  const n = `sentence ${sentenceOrdinal} of ${total}`
  switch (stage) {
    case 'claim':
      return `Pinning down the claim in ${n}…`
    case 'resolve':
      return `Looking up the source already cited in ${n}…`
    case 'reuse':
      return `Checking sources we've already found for ${n}…`
    case 'academic':
      return `Scanning academic databases for ${n}…`
    case 'web':
      return `Searching the web for ${n}…`
    case 'rank':
      return `Ranking the best matches for ${n}…`
    case 'verify':
      return `Checking whether a source actually supports ${n}…`
    case 'found':
      return `Found a solid match for ${n}.`
    case 'miss':
      return `We couldn't find a solid match for ${n}.`
    default:
      return `Working on ${n}…`
  }
}

export function stageLabel(stage: CitationPipelineStage | 'searching'): string {
  switch (stage) {
    case 'claim':
      return 'Reading Claim'
    case 'resolve':
      return 'Resolving Cite'
    case 'reuse':
      return 'Reusing Sources'
    case 'academic':
      return 'Academic Search'
    case 'web':
      return 'Web Search'
    case 'rank':
      return 'Ranking'
    case 'verify':
      return 'Verifying'
    case 'found':
      return 'Cited'
    case 'miss':
      return 'Missed'
    case 'searching':
      return 'Searching'
    default:
      return 'Working'
  }
}
