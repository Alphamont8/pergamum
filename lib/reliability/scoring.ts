import type { ReliabilitySubscore, SourceRecord, SourceReliability } from '@/types'
import { RELIABILITY_WEIGHTS, scoreToBand } from './constants'

function domainTier(url?: string): 'gov' | 'edu' | 'publisher' | 'news' | 'blog' | 'unknown' {
  if (!url) return 'unknown'
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host.endsWith('.gov') || host.includes('.gov.')) return 'gov'
    if (host.endsWith('.edu') || host.includes('.ac.')) return 'edu'
    if (
      host.includes('springer') ||
      host.includes('elsevier') ||
      host.includes('nature.com') ||
      host.includes('wiley') ||
      host.includes('jstor')
    ) {
      return 'publisher'
    }
    if (
      host.includes('nytimes') ||
      host.includes('bbc.') ||
      host.includes('reuters') ||
      host.includes('theguardian')
    ) {
      return 'news'
    }
    if (host.includes('blog') || host.includes('medium.com') || host.includes('substack')) {
      return 'blog'
    }
  } catch {
    return 'unknown'
  }
  return 'unknown'
}

function scorePeerReview(source: SourceRecord): ReliabilitySubscore {
  if (source.sourceKind === 'preprint') {
    return { score: 45, rationale: 'Preprint — not yet peer reviewed.' }
  }
  if (source.sourceKind === 'webpage' || source.addedVia === 'link') {
    const tier = domainTier(source.url)
    if (tier === 'gov' || tier === 'edu') {
      return { score: 75, rationale: 'Institutional or government web source.' }
    }
    return { score: 40, rationale: 'Web source without formal peer review.' }
  }

  const venueType = source.venue?.type?.toLowerCase() ?? ''
  const cited = source.citedByCount ?? 0
  let score = 55
  if (venueType.includes('journal')) score = 80
  else if (venueType.includes('repository')) score = 50
  if (cited > 100) score = Math.min(95, score + 10)
  else if (cited > 20) score = Math.min(90, score + 5)
  if (source.fwci && source.fwci > 1.5) score = Math.min(95, score + 5)

  return {
    score,
    rationale:
      cited > 0
        ? `Published work with ${cited} citations${source.venue?.name ? ` in ${source.venue.name}` : ''}.`
        : 'Scholarly source with limited citation data.',
  }
}

function scoreAuthorCredibility(source: SourceRecord): ReliabilitySubscore {
  const authorships = source.authorships ?? []
  if (authorships.length === 0) {
    return {
      score: source.authors ? 55 : 35,
      rationale: source.authors
        ? 'Author listed but credential data is limited.'
        : 'No author information available.',
    }
  }

  const maxH = Math.max(...authorships.map((a) => a.hIndex ?? 0))
  const hasInstitution = authorships.some((a) => (a.institutions?.length ?? 0) > 0)
  let score = 50
  if (maxH >= 30) score = 90
  else if (maxH >= 15) score = 78
  else if (maxH >= 5) score = 65
  if (hasInstitution) score = Math.min(95, score + 5)

  return {
    score,
    rationale:
      maxH > 0
        ? `Lead author h-index up to ${maxH}${hasInstitution ? ' with institutional affiliation' : ''}.`
        : 'Authors identified but h-index data unavailable.',
  }
}

function scoreRecency(source: SourceRecord): ReliabilitySubscore {
  const yearStr = source.publicationDate?.slice(0, 4) ?? source.year
  const year = yearStr ? parseInt(yearStr, 10) : NaN
  const currentYear = new Date().getFullYear()

  if (!Number.isFinite(year)) {
    return { score: 45, rationale: 'Publication date unknown.' }
  }

  const age = currentYear - year
  const cited = source.citedByCount ?? 0
  let score = 70

  if (age <= 2) score = 92
  else if (age <= 5) score = 82
  else if (age <= 10) score = 70
  else if (age <= 20) score = 58
  else score = 45

  if (age > 10 && cited > 50) score = Math.min(85, score + 10)

  return {
    score,
    rationale:
      age <= 5
        ? `Published ${year} — recent source.`
        : `Published ${year} (${age} years ago)${cited > 0 ? `, cited ${cited} times` : ''}.`,
  }
}

function scoreObjectivityHeuristic(source: SourceRecord): ReliabilitySubscore {
  const tier = domainTier(source.url)
  const flags: string[] = []

  if (source.sourceKind === 'preprint') flags.push('preprint')
  if (tier === 'blog') flags.push('blog')

  let score = 60
  if (tier === 'gov') score = 85
  else if (tier === 'edu') score = 80
  else if (tier === 'publisher') score = 75
  else if (tier === 'news') score = 55
  else if (tier === 'blog') score = 35

  if (source.openAccess?.isOA) score = Math.min(90, score + 3)

  return {
    score,
    rationale:
      flags.length > 0
        ? `Heuristic assessment (${flags.join(', ')}).`
        : `Domain and publication type suggest ${tier === 'unknown' ? 'general' : tier} credibility.`,
  }
}

export function computeDeterministicReliability(source: SourceRecord): SourceReliability {
  const peerReview = scorePeerReview(source)
  const authorCredibility = scoreAuthorCredibility(source)
  const recency = scoreRecency(source)
  const objectivity = scoreObjectivityHeuristic(source)

  const overall = Math.round(
    peerReview.score * RELIABILITY_WEIGHTS.peerReview +
      authorCredibility.score * RELIABILITY_WEIGHTS.authorCredibility +
      recency.score * RELIABILITY_WEIGHTS.recency +
      objectivity.score * RELIABILITY_WEIGHTS.objectivity,
  )

  const flags: string[] = []
  if (source.sourceKind === 'preprint') flags.push('Preprint — not peer reviewed')
  if (!source.authors && !source.authorships?.length) flags.push('Missing author')
  if (domainTier(source.url) === 'blog') flags.push('Blog or opinion platform')

  return {
    overall,
    band: scoreToBand(overall),
    subscores: { peerReview, authorCredibility, recency, objectivity },
    evaluatedAt: Date.now(),
    flags: flags.length ? flags : undefined,
  }
}

export function mergeLlmObjectivityScore(
  base: SourceReliability,
  llmScore: number,
  rationale: string,
): SourceReliability {
  const objectivity = {
    score: Math.max(0, Math.min(100, llmScore)),
    rationale,
  }
  const overall = Math.round(
    base.subscores.peerReview.score * RELIABILITY_WEIGHTS.peerReview +
      base.subscores.authorCredibility.score * RELIABILITY_WEIGHTS.authorCredibility +
      base.subscores.recency.score * RELIABILITY_WEIGHTS.recency +
      objectivity.score * RELIABILITY_WEIGHTS.objectivity,
  )
  return {
    ...base,
    overall,
    band: scoreToBand(overall),
    subscores: { ...base.subscores, objectivity },
    evaluatedAt: Date.now(),
  }
}
