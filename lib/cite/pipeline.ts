import { parse as parseDomain } from 'tldts'
import { cosineSimilarity, embed } from '@/lib/ai/provider'
import { searchAcademicWorks, searchWeb } from '@/lib/enrichment/search'
import { fetchPageMetadata } from '@/lib/enrichment/exa'
import { openAlexWorkToPatch, type OpenAlexWork } from '@/lib/enrichment/openalex'
import {
  looksLikeClinicalTrialClaim,
  searchMedicalDatabase,
  type MedicalArticle,
} from '@/lib/enrichment/medical'
import { searchLegalOpinions, type LegalOpinion } from '@/lib/enrichment/legal'
import { enrichFromDoi, needsDoiEnrichment } from '@/lib/enrichment/doi'
import { searchPerplexity, type PerplexitySearchResult } from '@/lib/enrichment/perplexity'
import { normalizeSourceForCitation } from '@/lib/citations/normalize'
import {
  mergeExistingCitation,
  resolveExistingCitation,
  sentenceHasExistingInTextCitation,
} from '@/lib/cite/existingCitation'
import {
  claimQueryFromAnalyzed,
  confirmSourceMatch,
  extractClaimQuery,
  isLikelyEssaySpecificEntity,
  verifySentenceAgainstSource,
  type AnalyzedSentence,
  type ClaimQuery,
  type ClaimType,
} from '@/lib/cite/analyze'
import {
  cachedOpenAlexSearch,
  cachedPerplexitySearch,
  createCitationSearchCache,
  searchCacheKey,
  type CitationSearchCache,
} from '@/lib/cite/searchCache'
import type { CitationEntitlements } from '@/lib/billing/entitlements'
import type { GenerationSettings, SourceRecord } from '@/types'

export { createCitationSearchCache, type CitationSearchCache }

/** Soft gate: candidates below this are not worth verifying (Pro). */
const SIMILARITY_FLOOR = 0.42
/** Stricter soft gate for Basic to cut low-value verify calls. */
const SIMILARITY_FLOOR_BASIC = 0.46
/** Prefer verifying candidates at/above this first. */
const SIMILARITY_PREFERRED = 0.52
/** Skip second-pass confirm when first verify is this strong. */
const HIGH_CONFIDENCE_SKIP_CONFIRM = 0.58
/** Skip confirm when matches + supportsClaim and similarity is at least this. */
const SKIP_CONFIRM_SIMILARITY = 0.5
/** Basic: skip confirm when similarity is high and supportsClaim. */
const BASIC_SKIP_CONFIRM_SIMILARITY = 0.52
/** OpenAlex must return fewer than this before Pro subject databases run. */
const SUBJECT_OPENALEX_THRESHOLD = 8
/** Cap embed batch size before ranking. */
const MAX_CANDIDATES_TO_EMBED = 40
/** Skip embeddings and keep provider order for pools this size or smaller. */
const SKIP_EMBED_MAX = 3
const MAX_CANDIDATES_TO_VERIFY = 10
const MAX_CANDIDATES_TO_VERIFY_BASIC = 8
/** Pro Exa /search only when Perplexity empty or best sim below this. */
const EXA_FALLBACK_SIMILARITY = 0.52
/** Snippet length above which Exa /contents may use cached crawls. */
const SNIPPET_CACHEABLE_CHARS = 200
const OPENALEX_PER_QUERY = 20
const OPENALEX_SEMANTIC_PER_QUERY = 15
const MEDICAL_PER_QUERY = 8
const LEGAL_PER_QUERY = 8
const EXA_PER_QUERY = 8
const PERPLEXITY_MAX_RESULTS = 10
const MAX_ACADEMIC_QUERIES = 4
const MAX_WEB_QUERIES_PRO = 3
const MAX_WEB_QUERIES_BASIC = 2
/** Passage token overlap above this prefers evidence-rich candidates. */
const PASSAGE_OVERLAP_PREFERRED = 0.35
/** Soft-accept identity+overlap only with claim support. */
const EXISTENCE_SOFT_SIM = 0.58
const EXISTENCE_SOFT_OVERLAP = 0.45
const POSSIBLE_MATCH_COUNT = 3

const LEGAL_DOCTRINE_TERMS = [
  'strict scrutiny',
  'intermediate scrutiny',
  'rational basis',
  'equal protection',
  'due process',
  'compelling interest',
  'narrowly tailored',
  'suspect classification',
  'first amendment',
  'fourth amendment',
  'commerce clause',
] as const

function extractDoctrineTerms(...texts: string[]): string[] {
  const blob = texts.join(' ').toLowerCase()
  return LEGAL_DOCTRINE_TERMS.filter((term) => blob.includes(term))
}

/** Distinctive doctrines that must appear in a supporting legal source. */
function distinctiveDoctrines(doctrines: string[]): string[] {
  const weakAlone = new Set(['compelling interest', 'narrowly tailored'])
  return doctrines.filter((d) => !weakAlone.has(d))
}

function sourceCoversDoctrine(record: SourceRecord, doctrines: string[]): boolean {
  if (!doctrines.length) return true
  const hay = [
    record.title ?? '',
    record.abstract ?? '',
    record.summary ?? '',
    ...(record.exa?.highlights ?? []),
  ]
    .join(' ')
    .toLowerCase()

  const required = distinctiveDoctrines(doctrines)
  // If the claim names distinctive doctrines, ALL of them must appear in the source.
  // This blocks RFRA / free-exercise hits that only share "compelling interest".
  if (required.length) {
    return required.every((term) => hay.includes(term))
  }
  // Fallback when only weak phrases were detected.
  return doctrines.some((term) => hay.includes(term))
}

/**
 * Block cross-doctrine drift (e.g. RFRA / free-exercise papers accepted for
 * equal-protection or generic strict-scrutiny claims).
 */
function legalTopicDriftReason(claim: string, record: SourceRecord): string | null {
  const hay = [
    record.title ?? '',
    record.abstract ?? '',
    record.summary ?? '',
    ...(record.exa?.highlights ?? []),
  ]
    .join(' ')
    .toLowerCase()
  const c = claim.toLowerCase()

  const claimEqualProtection =
    /\bequal protection\b|\bsuspect classification\b|\bracial classification|\bclassifications based on race|\bgender classification|\bintermediate scrutiny\b/.test(
      c,
    )
  const claimScrutinyWithoutReligion =
    /\b(strict|intermediate)\s+scrutiny\b/.test(c) &&
    !/\bfree exercise\b|\breligion\b|\brfra\b|\bfirst amendment\b/.test(c)

  const sourceReligionPrimary =
    /\brfra\b|religious freedom restoration|\bfree exercise\b|religion in the prison|\bprofaned\b/.test(
      hay,
    )
  const sourceEqualProtection =
    /\bequal protection\b|\bsuspect classification\b|\bracial classification|\baffirmative action\b|\bgender classification\b/.test(
      hay,
    )

  if (
    (claimEqualProtection || claimScrutinyWithoutReligion) &&
    sourceReligionPrimary &&
    !sourceEqualProtection
  ) {
    return 'Source focuses on free-exercise or RFRA rather than the equal-protection doctrine in the claim.'
  }
  return null
}

/** Strip precise numbers from a search query to improve recall; keep concepts. */
function stripPreciseNumbers(query: string): string {
  return query
    .replace(/\b\d+\.\d+\b/g, ' ')
    .replace(/\b\d{4}\b/g, ' ')
    .replace(/\b\d+%|\b\d+\s*points?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Drop claim verbs / filler so keyword search hits concept papers, not narrative prose. */
function toConceptQuery(query: string | undefined): string {
  if (!query?.trim()) return ''
  return query
    .replace(
      /\b(predicts?|predicted|obtained|obtains|reliably|roughly|requires?|required|produces?|produce|remains?|forms?|shows?|showed|suggests?|suggested|indicates?|indicated|associated|controlling|after|during|within|about|into|that|this|these|those|from|onto|over|under|between|among|through|across|against|without|whether|while|when|where|which|what|how|why|can|will|should|may|might|must|also|one|large|sample|first-year)\b/gi,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()
}

export type CitationProvider =
  | 'openalex'
  | 'pubmed'
  | 'europepmc'
  | 'clinicaltrials'
  | 'courtlistener'
  | 'exa'
  | 'perplexity'
  | 'crossref'

const ACADEMIC_PROVIDERS = new Set<CitationProvider>([
  'openalex',
  'pubmed',
  'europepmc',
  'clinicaltrials',
  'courtlistener',
  'crossref',
])

const PLACE_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: 'Hong Kong', re: /\bhong\s*kong\b|\bhk\b/i },
  { label: 'Japan', re: /\bjapan\b|\bjapanese\b/i },
  { label: 'United States', re: /\bunited states\b|\busa\b|\bu\.s\.a?\b|\bamerica\b/i },
  { label: 'United Kingdom', re: /\bunited kingdom\b|\bbritain\b|\buk\b/i },
  { label: 'China', re: /\bchina\b|\bchinese\b|\bmainland china\b/i },
  { label: 'Singapore', re: /\bsingapore\b/i },
  { label: 'Taiwan', re: /\btaiwan\b/i },
  { label: 'South Korea', re: /\bsouth korea\b|\bkorea\b/i },
  { label: 'Australia', re: /\baustralia\b/i },
  { label: 'Europe', re: /\beurope\b|\beuropean\b/i },
  { label: 'Asia', re: /\basia\b|\basian\b/i },
]

export interface CandidateSource {
  provider: CitationProvider
  record: SourceRecord
  textForEmbed: string
}

export interface RankedCandidate {
  candidate: CandidateSource
  similarity: number
}

export interface SentenceCitationResult {
  status: 'done' | 'failed'
  provider?: CitationProvider
  similarity?: number
  record?: SourceRecord
  correction?: string | null
  inText?: string
  bibliography?: string
  errorMessage?: string
  claim?: string
  verificationConfidence?: number
  /** When true, the draft already has an in-text cite; keep it and only add bibliography. */
  preserveExistingInText?: boolean
  /** Ranked near-misses when auto-verify fails (human-in-the-loop). */
  possibleMatches?: PossibleMatch[]
}

export interface PossibleMatch {
  title: string
  authors?: string
  year?: string
  url?: string
  doi?: string
  similarity?: number
  abstract?: string
  provider?: CitationProvider
}

import type { CitationPipelineStage, CitationStageReporter } from '@/lib/cite/stages'

export type { CitationPipelineStage, CitationStageReporter } from '@/lib/cite/stages'
export { applyInTextCitations } from '@/lib/cite/applyInTextCitations'

function detectPlaces(...texts: string[]): string[] {
  const blob = texts.filter(Boolean).join('\n')
  const found: string[] = []
  for (const p of PLACE_PATTERNS) {
    if (p.re.test(blob)) found.push(p.label)
  }
  return [...new Set(found)]
}

function ensurePlaceInQuery(query: string, places: string[]): string {
  if (!places.length) return query
  const lower = query.toLowerCase()
  const missing = places.filter((p) => !lower.includes(p.toLowerCase()))
  if (!missing.length) return query
  return `${query} ${missing.join(' ')}`.trim()
}

function sourceMentionsPlaces(record: SourceRecord, places: string[]): boolean {
  if (!places.length) return true
  const blob = [
    record.title,
    record.abstract,
    record.summary,
    record.venue?.name,
    record.publisher,
    ...(record.topics ?? []),
    ...(record.exa?.highlights ?? []),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase()
  return places.some((p) => blob.includes(p.toLowerCase()))
}

function workToRecord(work: OpenAlexWork, index: number, queryTag: string): SourceRecord {
  const patch = openAlexWorkToPatch(work)
  return {
    id: `oa-${queryTag}-${index}-${work.id}`,
    title: patch.title ?? work.display_name ?? 'Untitled',
    type: 'secondary',
    ...patch,
  }
}

function exaToRecord(
  result: {
    title?: string
    url?: string
    author?: string
    publishedDate?: string
    text?: string
    highlights?: string[]
  },
  index: number,
  queryTag: string,
): SourceRecord {
  const url = result.url ?? ''
  const parsed = url ? parseDomain(url) : null
  const siteName = parsed?.domainWithoutSuffix
    ? `${parsed.domainWithoutSuffix}${parsed.publicSuffix ? `.${parsed.publicSuffix}` : ''}`
    : parsed?.hostname ?? undefined

  return {
    id: `exa-${queryTag}-${index}-${url || index}`,
    title: result.title ?? url ?? 'Untitled',
    url,
    type: 'secondary',
    authors: result.author,
    year: result.publishedDate?.slice(0, 4),
    publicationDate: result.publishedDate,
    summary: result.text?.slice(0, 800) ?? result.highlights?.join(' '),
    abstract: result.text?.slice(0, 2000),
    sourceKind: 'webpage',
    publisher: siteName,
    venue: siteName ? { name: siteName, type: 'website' } : undefined,
    exa: {
      siteName,
      publishedDate: result.publishedDate,
      highlights: result.highlights,
    },
    enrichment: { status: 'enriched', enrichedAt: Date.now() },
  }
}

function pubmedToRecord(article: MedicalArticle, index: number, queryTag: string): SourceRecord {
  const providerPrefix =
    article.source === 'clinicaltrials'
      ? 'ct'
      : article.source === 'europepmc'
        ? 'epmc'
        : 'pm'
  return {
    id: `${providerPrefix}-${queryTag}-${index}-${article.pmid}`,
    title: article.title ?? 'Untitled',
    type: 'secondary',
    doi: article.doi,
    url: article.doi ? `https://doi.org/${article.doi}` : article.url,
    authors: article.authors?.length ? article.authors.join(', ') : undefined,
    year: article.year,
    publicationDate: article.publicationDate,
    abstract: article.abstract,
    sourceKind: article.source === 'clinicaltrials' ? 'report' : 'journal-article',
    venue: article.journal
      ? {
          name: article.journal,
          type: article.source === 'clinicaltrials' ? 'website' : 'journal',
        }
      : undefined,
    biblio:
      article.volume || article.issue || article.pages
        ? { volume: article.volume, issue: article.issue, pages: article.pages }
        : undefined,
    enrichment: { status: 'enriched', enrichedAt: Date.now() },
  }
}

function legalToRecord(opinion: LegalOpinion, index: number, queryTag: string): SourceRecord {
  return {
    id: `cl-${queryTag}-${index}-${opinion.id}`,
    title: opinion.caseName,
    type: 'primary',
    url: opinion.url,
    authors: opinion.court,
    year: opinion.year,
    publicationDate: opinion.dateFiled,
    abstract: opinion.snippet,
    summary: opinion.citation
      ? `${opinion.citation}${opinion.docketNumber ? ` · ${opinion.docketNumber}` : ''}`
      : opinion.snippet,
    sourceKind: 'legal-case',
    venue: opinion.court ? { name: opinion.court, type: 'court' } : undefined,
    publisher: opinion.court,
    enrichment: { status: 'enriched', enrichedAt: Date.now() },
  }
}

function medicalProvider(article: MedicalArticle): CitationProvider {
  if (article.source === 'europepmc') return 'europepmc'
  if (article.source === 'clinicaltrials') return 'clinicaltrials'
  return 'pubmed'
}

function perplexityToRecord(
  result: PerplexitySearchResult,
  index: number,
  queryTag: string,
): SourceRecord {
  const url = result.url
  const parsed = url ? parseDomain(url) : null
  const siteName = parsed?.domainWithoutSuffix
    ? `${parsed.domainWithoutSuffix}${parsed.publicSuffix ? `.${parsed.publicSuffix}` : ''}`
    : parsed?.hostname ?? undefined
  const date = result.date ?? result.last_updated ?? undefined

  return {
    id: `pplx-${queryTag}-${index}-${url || index}`,
    title: result.title || url || 'Untitled',
    url,
    type: 'secondary',
    year: date?.slice(0, 4),
    publicationDate: date ?? undefined,
    summary: result.snippet?.slice(0, 800),
    abstract: result.snippet?.slice(0, 2000),
    sourceKind: 'webpage',
    publisher: siteName,
    venue: siteName ? { name: siteName, type: 'website' } : undefined,
    exa: { siteName, publishedDate: date ?? undefined },
    enrichment: { status: 'pending' },
  }
}

function withinRecency(year: string | undefined, recency: GenerationSettings['recency']): boolean {
  if (recency === 'any' || !year) return true
  const y = parseInt(year.slice(0, 4), 10)
  if (!Number.isFinite(y)) return true
  const now = new Date().getFullYear()
  const maxAge = recency === '5y' ? 5 : 10
  return now - y <= maxAge
}

function buildOpenAlexEmbedText(record: SourceRecord): string {
  return [
    `Title: ${record.title}`,
    record.authors ? `Authors: ${record.authors}` : '',
    record.venue?.name ? `Venue: ${record.venue.name}` : '',
    record.year ? `Year: ${record.year}` : '',
    record.topics?.length ? `Topics: ${record.topics.slice(0, 6).join('; ')}` : '',
    record.abstract ? `Abstract: ${record.abstract.slice(0, 1800)}` : '',
    !record.abstract && record.summary ? `Summary: ${record.summary.slice(0, 800)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function buildExaEmbedText(record: SourceRecord, highlights?: string[]): string {
  return [
    `Title: ${record.title}`,
    record.authors ? `Authors: ${record.authors}` : '',
    record.publisher ? `Site: ${record.publisher}` : '',
    record.year ? `Year: ${record.year}` : '',
    highlights?.length ? `Highlights:\n- ${highlights.slice(0, 4).join('\n- ')}` : '',
    record.abstract ? `Content: ${record.abstract.slice(0, 1600)}` : '',
    !record.abstract && record.summary ? `Summary: ${record.summary.slice(0, 800)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function buildQueryEmbedText(sentence: string, claim: ClaimQuery, places: string[]): string {
  return [
    `Sentence: ${sentence}`,
    `Claim: ${claim.claim}`,
    `Focus: ${claim.embeddingFocus}`,
    places.length ? `Place: ${places.join(', ')}` : '',
    claim.keywords.length ? `Keywords: ${claim.keywords.join(', ')}` : '',
    claim.entities.length ? `Entities: ${claim.entities.join(', ')}` : '',
    claim.dataPoints.length ? `Data: ${claim.dataPoints.join('; ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function normalizeTitleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function candidateKey(c: CandidateSource): string {
  const doi = c.record.doi?.toLowerCase().trim()
  if (doi) return `doi:${doi}`
  const title = normalizeTitleKey(c.record.title ?? '')
  if (title.length >= 12) return `title:${title}`
  const url = c.record.url?.toLowerCase().replace(/[#?].*$/, '').replace(/\/+$/, '').trim()
  if (url) return `url:${url}`
  return `title:${title || c.record.id}`
}

function dedupeCandidates(candidates: CandidateSource[]): CandidateSource[] {
  const seen = new Map<string, CandidateSource>()
  for (const c of candidates) {
    const key = candidateKey(c)
    if (!seen.has(key)) seen.set(key, c)
  }
  return [...seen.values()]
}

function sanitizeOpenAlexQuery(query: string, mode: 'keyword' | 'semantic'): string {
  let q = query.replace(/\s+/g, ' ').trim()
  if (!q) return ''
  if (mode === 'keyword') {
    q = q.replace(/\?/g, ' ').replace(/\s+/g, ' ').trim()
    if (/^(what|how|why|when|where|which|does|do|is|are)\b/i.test(q) && q.length > 80) {
      q = q
        .replace(/^(what|how|why|when|where|which|does|do|is|are)\b[\s\S]{0,40}?\b(?:that|that\s+)?/i, '')
        .trim()
    }
    return q.slice(0, 180)
  }
  // Semantic mode: prefer short topical phrases; long NL questions often 400.
  q = q.replace(/\?/g, ' ').replace(/\s+/g, ' ').trim()
  if (/^(what|how|why|when|where|which|does|do|is|are)\b/i.test(q)) {
    const stop = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'of',
      'in',
      'on',
      'to',
      'for',
      'with',
      'that',
      'this',
      'is',
      'are',
      'was',
      'were',
      'be',
      'as',
      'by',
      'from',
      'at',
      'it',
      'its',
      'when',
      'which',
      'what',
      'how',
      'why',
      'does',
      'do',
    ])
    q = q
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stop.has(w.toLowerCase()))
      .slice(0, 18)
      .join(' ')
  }
  return q.slice(0, 400)
}

function uniqueQueries(max: number, ...parts: Array<string | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of parts) {
    const cleaned = sanitizeOpenAlexQuery(part ?? '', 'keyword')
    if (!cleaned || cleaned.length < 3) continue
    const key = cleaned.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(cleaned)
    if (out.length >= max) break
  }
  return out
}

async function rankCandidates(
  queryEmbedText: string,
  candidates: CandidateSource[],
  cachedQueryVec?: number[],
  places: string[] = [],
  claimYears: number[] = [],
  claimText = '',
  keywords: string[] = [],
  preferLegal = false,
): Promise<{ ranked: RankedCandidate[]; queryVec: number[]; providerOrdered: boolean }> {
  if (candidates.length === 0) {
    return { ranked: [], queryVec: cachedQueryVec ?? [], providerOrdered: false }
  }

  // Cap embed batch — keep provider order (already roughly relevance-sorted).
  const capped = candidates.slice(0, MAX_CANDIDATES_TO_EMBED)

  // Tiny pools: trust provider ranking; skip embed cost.
  // Synthetic scores sit above preferred so verify/reuse still run in order;
  // callers must not treat them as real similarity for Exa / hard-reject gates.
  if (capped.length <= SKIP_EMBED_MAX) {
    const ranked = capped.map((candidate, i) => ({
      candidate,
      similarity: applyQualityAndMismatchScore(
        0.7 - i * 0.02,
        candidate.record,
        places,
        claimYears,
        claimText,
        keywords,
        { preferLegal, provider: candidate.provider },
      ),
    }))
    return { ranked, queryVec: cachedQueryVec ?? [], providerOrdered: true }
  }

  let queryVec: number[]
  let rawSims: number[]

  if (cachedQueryVec?.length) {
    const candidateEmbeddings = await embed(capped.map((c) => c.textForEmbed))
    queryVec = cachedQueryVec
    rawSims = capped.map((_, i) => cosineSimilarity(cachedQueryVec, candidateEmbeddings[i]))
  } else {
    const embeddings = await embed([queryEmbedText, ...capped.map((c) => c.textForEmbed)])
    queryVec = embeddings[0]
    rawSims = capped.map((_, i) => cosineSimilarity(queryVec, embeddings[i + 1]))
  }

  const ranked = capped
    .map((candidate, i) => ({
      candidate,
      similarity: applyQualityAndMismatchScore(
        rawSims[i],
        candidate.record,
        places,
        claimYears,
        claimText,
        keywords,
        { preferLegal, provider: candidate.provider },
      ),
    }))
    .sort((a, b) => b.similarity - a.similarity)
  return { ranked, queryVec, providerOrdered: false }
}

/** Blend cosine relevance with citation count, recency, type, and passage overlap. */
function applyQualityAndMismatchScore(
  cosine: number,
  record: SourceRecord,
  places: string[],
  claimYears: number[],
  claimText: string,
  keywords: string[],
  options?: { preferLegal?: boolean; provider?: CitationProvider },
): number {
  const cites = record.citedByCount ?? 0
  const citeNorm = Math.min(1, Math.log1p(cites) / Math.log1p(500))
  const year = sourceYearNumber(record)
  const now = new Date().getFullYear()
  let recencyNorm = 0.4
  if (year != null) {
    const age = Math.max(0, now - year)
    if (age <= 5) recencyNorm = 1
    else if (age <= 10) recencyNorm = 0.7
    else if (age <= 20) recencyNorm = 0.4
    else recencyNorm = 0.15
  }
  let typeBoost = 0
  const kind = record.sourceKind
  if (kind === 'journal-article') typeBoost = 0.03
  if (record.title && /\breview\b|\bmeta-?analysis\b/i.test(record.title)) typeBoost = 0.05

  const overlap = passageOverlapScore(claimText, keywords, record)
  const overlapBoost = overlap >= PASSAGE_OVERLAP_PREFERRED ? 0.04 + overlap * 0.06 : overlap * 0.04

  let score = 0.6 * cosine + 0.25 * citeNorm + 0.15 * recencyNorm + typeBoost + overlapBoost
  score -= softMismatchPenalty(record, places, claimYears)
  if (places.length && sourceMentionsPlaces(record, places)) score += 0.03
  if (options?.preferLegal && options.provider === 'courtlistener') score += 0.08
  if (options?.preferLegal && options.provider === 'openalex') {
    // Softly demote OpenAlex when we have a legal essay — doctrine papers often mislead.
    score -= 0.03
  }
  return Math.max(0, Math.min(1, score))
}

/** Token overlap between claim/keywords and title+abstract passage. */
function passageOverlapScore(
  claimText: string,
  keywords: string[],
  record: SourceRecord,
): number {
  const passage = [
    record.title,
    record.abstract,
    record.summary,
    ...(record.exa?.highlights ?? []),
    ...(record.topics ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  if (!passage.trim()) return 0

  const tokens = new Set(
    [...claimText.toLowerCase().split(/\W+/), ...keywords.map((k) => k.toLowerCase())]
      .map((t) => t.trim())
      .filter((t) => t.length >= 4),
  )
  if (!tokens.size) return 0
  let hits = 0
  for (const t of tokens) {
    if (passage.includes(t)) hits += 1
  }
  return hits / tokens.size
}

function softMismatchPenalty(
  record: SourceRecord,
  places: string[],
  claimYears: number[],
): number {
  let penalty = 0
  if (places.length && !sourceMentionsPlaces(record, places)) {
    penalty += 0.08
  }
  const sy = sourceYearNumber(record)
  if (sy != null && claimYears.length === 1) {
    const gap = Math.abs(sy - claimYears[0])
    if (gap >= 8) penalty += 0.1
    else if (gap >= 5) penalty += 0.05
  }
  return penalty
}

function hasResolvableIdentity(record: SourceRecord): boolean {
  return Boolean(record.doi || record.openAlexId)
}

function toPossibleMatches(ranked: RankedCandidate[], limit = POSSIBLE_MATCH_COUNT): PossibleMatch[] {
  return ranked.slice(0, limit).map((r) => ({
    title: r.candidate.record.title,
    authors: r.candidate.record.authors,
    year: r.candidate.record.year ?? r.candidate.record.publicationDate?.slice(0, 4),
    url: r.candidate.record.url,
    doi: r.candidate.record.doi,
    similarity: r.similarity,
    abstract: (r.candidate.record.abstract ?? r.candidate.record.summary)?.slice(0, 280),
    provider: r.candidate.provider,
  }))
}

async function searchOpenAlexCandidates(
  queries: string[],
  settings: GenerationSettings,
  searchCache?: CitationSearchCache,
  semanticQuery?: string,
): Promise<CandidateSource[]> {
  if (!queries.length && !semanticQuery?.trim()) return []

  const oaOpts = {
    recency: settings.recency,
    sourceTier: settings.sourceTier,
    preferPeerReviewed: settings.sourceTier === 'academic',
  } as const

  const fetchKeyword = (query: string) =>
    cachedOpenAlexSearch(
      searchCache,
      searchCacheKey(query, 'oa-kw', OPENALEX_PER_QUERY, settings.recency, settings.sourceTier),
      () => searchAcademicWorks(query, OPENALEX_PER_QUERY, { ...oaOpts, mode: 'keyword' }),
    )

  const fetchSemantic = (query: string) =>
    cachedOpenAlexSearch(
      searchCache,
      searchCacheKey(query, 'oa-sem', OPENALEX_SEMANTIC_PER_QUERY, settings.recency, settings.sourceTier),
      () =>
        searchAcademicWorks(query, OPENALEX_SEMANTIC_PER_QUERY, {
          ...oaOpts,
          mode: 'semantic',
        }),
    )

  const mapWorks = (works: OpenAlexWork[], qi: number, tag: string): CandidateSource[] =>
    works
      .map((work, i) => {
        const record = workToRecord(work, i, `${tag}${qi}`)
        if (!withinRecency(record.year, settings.recency)) return null
        return {
          provider: 'openalex' as const,
          record,
          textForEmbed: buildOpenAlexEmbedText(record),
        }
      })
      .filter(Boolean) as CandidateSource[]

  // Always fan out all keyword variants + one semantic query in parallel.
  const keywordJobs = queries.map(async (query, idx) => {
    const works = await fetchKeyword(query)
    return mapWorks(works, idx, 'k')
  })

  const semText = sanitizeOpenAlexQuery(semanticQuery || queries[0] || '', 'semantic')
  const semanticJob = semText
    ? fetchSemantic(semText).then((works) => mapWorks(works, 0, 's'))
    : Promise.resolve([] as CandidateSource[])

  const batches = await Promise.all([...keywordJobs, semanticJob])
  return dedupeCandidates(batches.flat())
}

async function searchMedicalCandidates(
  queries: string[],
  settings: GenerationSettings,
  claimTexts: string[],
): Promise<CandidateSource[]> {
  // Single best query — avoid PubMed/Europe PMC fanout × N.
  const query = queries[0]
  if (!query) return []
  const includeTrials = looksLikeClinicalTrialClaim(...claimTexts)
  const articles = await searchMedicalDatabase(query, {
    limit: MEDICAL_PER_QUERY,
    includeTrials,
  })
  return dedupeCandidates(
    articles
      .map((article, i) => {
        const record = pubmedToRecord(article, i, 'q0')
        if (!withinRecency(record.year, settings.recency)) return null
        return {
          provider: medicalProvider(article),
          record,
          textForEmbed: buildOpenAlexEmbedText(record),
        }
      })
      .filter(Boolean) as CandidateSource[],
  )
}

async function searchLegalCandidates(
  queries: string[],
  settings: GenerationSettings,
): Promise<CandidateSource[]> {
  // Prefer short doctrine-heavy queries; long NL strings underperform on CourtListener.
  const doctrineHints = queries.flatMap((q) => {
    const terms = extractDoctrineTerms(q)
    return terms.length ? [terms.slice(0, 3).join(' ')] : []
  })
  const rankedQueries = [...doctrineHints, ...queries].sort((a, b) => a.length - b.length)
  const query =
    rankedQueries.find((q) =>
      /scrutiny|equal protection|due process|amendment|classification|compelling/i.test(q),
    ) || rankedQueries[0]
  if (!query) return []
  const opinions = await searchLegalOpinions(query.slice(0, 160), LEGAL_PER_QUERY)
  return dedupeCandidates(
    opinions
      .map((opinion, i) => {
        const record = legalToRecord(opinion, i, 'q0')
        if (!withinRecency(record.year, settings.recency)) return null
        return {
          provider: 'courtlistener' as const,
          record,
          textForEmbed: buildOpenAlexEmbedText(record),
        }
      })
      .filter(Boolean) as CandidateSource[],
  )
}

async function searchExaCandidates(
  queries: string[],
  settings: GenerationSettings,
): Promise<CandidateSource[]> {
  if (settings.sourceTier === 'academic') return []
  // One Exa /search query — variants rarely justify 2–3× cost.
  const query = queries[0]
  if (!query) return []
  const results = await searchWeb(query, { numResults: EXA_PER_QUERY })
  return dedupeCandidates(
    results
      .map((r, i) => {
        const record = exaToRecord(r, i, 'q0')
        if (!withinRecency(record.year, settings.recency)) return null
        return {
          provider: 'exa' as const,
          record,
          textForEmbed: buildExaEmbedText(record, r.highlights),
        }
      })
      .filter(Boolean) as CandidateSource[],
  )
}

/** Primary web discovery: one Perplexity Search API request ($0.005) per sentence. */
async function searchPerplexityCandidates(
  queries: string[],
  settings: GenerationSettings,
  searchCache?: CitationSearchCache,
): Promise<CandidateSource[]> {
  const query = queries[0]
  if (!query) return []

  const academicOnly = settings.sourceTier === 'academic'
  const batch = await cachedPerplexitySearch(
    searchCache,
    searchCacheKey(query, 'pplx', PERPLEXITY_MAX_RESULTS, academicOnly, settings.recency),
    () =>
      searchPerplexity(query, {
        maxResults: PERPLEXITY_MAX_RESULTS,
        academicOnly,
        recency: settings.recency,
      }),
  )

  const candidates = batch
    .map((r, i) => {
      const record = perplexityToRecord(r, i, 'q0')
      if (!withinRecency(record.year, settings.recency)) return null
      return {
        provider: 'perplexity' as const,
        record,
        textForEmbed: buildExaEmbedText(record),
      }
    })
    .filter(Boolean) as CandidateSource[]

  return dedupeCandidates(candidates)
}

function pickVerificationPool(
  ranked: RankedCandidate[],
  places: string[],
  similarityFloor: number,
  maxVerify: number,
  claimText = '',
  keywords: string[] = [],
): RankedCandidate[] {
  const aboveFloor = ranked.filter((r) => r.similarity >= similarityFloor)
  const base = aboveFloor.length > 0 ? aboveFloor : ranked.slice(0, maxVerify)
  const preferred = base.filter((r) => r.similarity >= SIMILARITY_PREFERRED)

  let pool = preferred.length > 0 ? preferred : base

  if (places.length) {
    const geoOk = pool.filter((r) => sourceMentionsPlaces(r.candidate.record, places))
    // Prefer geo matches but do not drop the whole pool when none match.
    if (geoOk.length > 0) {
      pool = [...geoOk, ...pool.filter((r) => !geoOk.includes(r))]
    }
  }

  if (claimText || keywords.length) {
    pool = [...pool].sort((a, b) => {
      const oa = passageOverlapScore(claimText, keywords, a.candidate.record)
      const ob = passageOverlapScore(claimText, keywords, b.candidate.record)
      if (oa !== ob) return ob - oa
      return b.similarity - a.similarity
    })
  }

  return pool.slice(0, maxVerify)
}

function needsEnrichment(record: SourceRecord): boolean {
  return Boolean(
    record.url && (!record.authors || !record.year || !record.publicationDate || !record.abstract),
  )
}

function hasThinEvidence(record: SourceRecord): boolean {
  const abstract = record.abstract?.trim()
  const summary = record.summary?.trim()
  const highlights = record.exa?.highlights?.filter(Boolean) ?? []
  return !(abstract || summary || highlights.length > 0)
}

function snippetLength(record: SourceRecord): number {
  return Math.max(
    record.abstract?.trim().length ?? 0,
    record.summary?.trim().length ?? 0,
  )
}

function normalizeExaUrlKey(url: string): string {
  return url.toLowerCase().replace(/[#?].*$/, '').replace(/\/+$/, '').trim()
}

/** Years mentioned in claim text (4-digit, 1900–2099). */
function extractClaimYears(...texts: string[]): number[] {
  const years: number[] = []
  for (const t of texts) {
    for (const m of t.matchAll(/\b(19|20)\d{2}\b/g)) {
      const y = parseInt(m[0], 10)
      if (y >= 1900 && y <= 2099) years.push(y)
    }
  }
  return [...new Set(years)]
}

function sourceYearNumber(record: SourceRecord): number | null {
  const raw = record.year ?? record.publicationDate?.slice(0, 4)
  if (!raw) return null
  const y = parseInt(raw.slice(0, 4), 10)
  return Number.isFinite(y) ? y : null
}

/**
 * Cheap pre-verify rejects — only hard-fail when there is no usable evidence.
 * Year/place mismatches are soft penalties in ranking, not hard kills.
 */
function ruleBasedReject(
  record: SourceRecord,
  _places: string[],
  _claimYears: number[],
): string | null {
  if (hasThinEvidence(record) && !record.url && !record.abstract && !record.summary && !record.doi) {
    return 'Source has no usable evidence text.'
  }

  return null
}

async function enrichCandidateRecord(
  record: SourceRecord,
  exaUrlCache?: Map<string, Promise<SourceRecord>>,
): Promise<SourceRecord> {
  if (!record.url) return record
  // Always allow Exa /contents refresh for thin Perplexity snippets even if a date exists.
  const thin =
    !record.authors ||
    !record.year ||
    !record.publicationDate ||
    !record.abstract ||
    (record.abstract?.trim().length ?? 0) < 400
  if (!thin && record.enrichment?.status === 'enriched') return record

  const cacheKey = normalizeExaUrlKey(record.url)
  if (exaUrlCache?.has(cacheKey)) {
    return exaUrlCache.get(cacheKey)!
  }

  const fetchPromise = (async (): Promise<SourceRecord> => {
    try {
      const maxAgeHours = snippetLength(record) >= SNIPPET_CACHEABLE_CHARS ? 24 : 0
      const meta = await fetchPageMetadata(record.url!, { maxAgeHours })
      if (!meta) return normalizeSourceForCitation(record)

      const authors = record.authors || meta.authors
      const authorships = record.authorships?.length
        ? record.authorships
        : meta.authorships
      const year = record.year || meta.year
      const publicationDate = record.publicationDate || meta.publishedDate
      const abstract = meta.text?.slice(0, 2000) || record.abstract
      const summary = meta.summary || record.summary
      const title = record.title || meta.title || record.title
      const publisher = record.publisher || meta.siteName || meta.organization

      return normalizeSourceForCitation({
        ...record,
        title,
        authors,
        authorships,
        year,
        publicationDate,
        abstract,
        summary,
        publisher,
        venue: record.venue ?? (publisher ? { name: publisher, type: 'website' } : undefined),
        exa: {
          ...record.exa,
          favicon: meta.favicon ?? record.exa?.favicon,
          image: meta.image ?? record.exa?.image,
          siteName: meta.siteName ?? record.exa?.siteName,
          publishedDate: publicationDate ?? record.exa?.publishedDate,
          highlights: meta.highlights?.length ? meta.highlights : record.exa?.highlights,
        },
        enrichment: { status: 'enriched', enrichedAt: Date.now() },
      })
    } catch (err) {
      console.warn('[enrich] failed', record.url, err instanceof Error ? err.message : err)
      return normalizeSourceForCitation(record)
    }
  })()

  if (exaUrlCache) exaUrlCache.set(cacheKey, fetchPromise)
  return fetchPromise
}

interface VerifyContext {
  sentence: string
  claim: ClaimQuery
  places: string[]
  claimYears: number[]
  settings: GenerationSettings
  priorSourceIds: string[]
  allSourcesSoFar: SourceRecord[]
  isBasic: boolean
  exaUrlCache: Map<string, Promise<SourceRecord>>
  onStage?: CitationStageReporter
  /** Legal doctrine phrases that a supporting source should mention. */
  doctrineTerms?: string[]
  /** When true, require stronger evidence (existing-cite resolve path). */
  requireStrongMatch?: boolean
}

interface PoolVerdict {
  success?: SentenceCitationResult
  bestRejected: RankedCandidate | null
  lastRejectReason: string
}

/** Lazily enrich + verify a ranked pool; returns the first candidate that survives verification. */
async function verifyPool(pool: RankedCandidate[], ctx: VerifyContext): Promise<PoolVerdict> {
  const { claim, places, claimYears } = ctx
  let bestRejected: RankedCandidate | null = pool[0] ?? null
  let lastRejectReason = 'No verified source supported the claim.'
  let reportedVerify = false
  const verifyEntities = claim.entities.filter((e) => !isLikelyEssaySpecificEntity(e))

  for (let poolIndex = 0; poolIndex < pool.length; poolIndex++) {
    const row = pool[poolIndex]
    let record = row.candidate.record

    // Hydrate thin academic/web evidence before verify for every candidate we attempt.
    const needsHydrate =
      (hasThinEvidence(record) || needsEnrichment(record)) &&
      Boolean(record.url || record.doi)

    if (needsHydrate) {
      if (record.doi || (record.url && /doi\.org/i.test(record.url))) {
        record = await enrichFromDoi(record)
      }
      if ((hasThinEvidence(record) || needsEnrichment(record)) && record.url) {
        record = await enrichCandidateRecord(record, ctx.exaUrlCache)
      }
    }

    const ruleReject = ruleBasedReject(record, places, claimYears)
    if (ruleReject) {
      // If geo failed on thin text and we haven't hydrated yet, enrich once then re-check.
      if (
        places.length &&
        !sourceMentionsPlaces(record, places) &&
        (hasThinEvidence(record) || needsEnrichment(record)) &&
        record.url
      ) {
        if (record.doi || /doi\.org/i.test(record.url)) {
          record = await enrichFromDoi(record)
        }
        record = await enrichCandidateRecord(record, ctx.exaUrlCache)
        const again = ruleBasedReject(record, places, claimYears)
        if (again) {
          bestRejected = { ...row, candidate: { ...row.candidate, record } }
          lastRejectReason = again
          continue
        }
      } else {
        bestRejected = { ...row, candidate: { ...row.candidate, record } }
        lastRejectReason = ruleReject
        continue
      }
    }

    if (places.length && !sourceMentionsPlaces(record, places)) {
      // Soft: enrich once for better place signals, but do not hard-skip the candidate.
      if (needsEnrichment(record) && record.url) {
        record = await enrichCandidateRecord(record, ctx.exaUrlCache)
      }
    }

    if (!reportedVerify) {
      ctx.onStage?.('verify')
      reportedVerify = true
    }

    const overlap = passageOverlapScore(claim.claim, claim.keywords, record)
    const identity = hasResolvableIdentity(record)
    const doctrines = ctx.doctrineTerms ?? []

    if (doctrines.length && !sourceCoversDoctrine(record, doctrines)) {
      bestRejected = { ...row, candidate: { ...row.candidate, record } }
      lastRejectReason = 'Source does not discuss the legal doctrine in the claim.'
      continue
    }

    const topicDrift = doctrines.length
      ? legalTopicDriftReason(claim.claim, record)
      : null
    if (topicDrift) {
      bestRejected = { ...row, candidate: { ...row.candidate, record } }
      lastRejectReason = topicDrift
      continue
    }

    const verification = await verifySentenceAgainstSource({
      sentence: ctx.sentence,
      claim: claim.claim,
      keywords: claim.keywords,
      entities: verifyEntities,
      placeEntities: places,
      dataPoints: claim.dataPoints,
      sourceTitle: record.title,
      sourceAuthors: record.authors,
      sourceVenue: record.venue?.name ?? record.publisher,
      sourceYear: record.year ?? record.publicationDate,
      sourceAbstract: record.abstract ?? record.summary,
      sourceHighlights: record.exa?.highlights,
      suggestCorrections: ctx.settings.suggestCorrections,
    })

    // Require claim support; never accept on matches alone or correction alone.
    // Legal doctrine claims must both match and clear the doctrine gate (already above).
    const softAccept =
      (verification.supportsClaim &&
        verification.matches &&
        verification.confidence >= (ctx.requireStrongMatch || doctrines.length ? 0.55 : 0.45)) ||
      (!doctrines.length &&
        verification.supportsClaim &&
        verification.confidence >= 0.62 &&
        row.similarity >= SIMILARITY_PREFERRED) ||
      (!doctrines.length &&
        verification.supportsClaim &&
        verification.confidence >= 0.55 &&
        row.similarity >= SIMILARITY_PREFERRED &&
        overlap >= PASSAGE_OVERLAP_PREFERRED) ||
      (!doctrines.length &&
        identity &&
        verification.supportsClaim &&
        verification.matches &&
        row.similarity >= EXISTENCE_SOFT_SIM &&
        overlap >= EXISTENCE_SOFT_OVERLAP)

    if (!softAccept) {
      bestRejected = { ...row, candidate: { ...row.candidate, record } }
      lastRejectReason =
        verification.rationale?.slice(0, 180) ||
        'Source did not reliably support the sentence.'
      continue
    }

    let confirmConfidence = verification.confidence
    const isAcademic = ACADEMIC_PROVIDERS.has(row.candidate.provider)
    const skipConfirm =
      !ctx.requireStrongMatch &&
      !doctrines.length &&
      ((identity &&
        verification.supportsClaim &&
        verification.matches &&
        row.similarity >= SKIP_CONFIRM_SIMILARITY) ||
        (verification.matches &&
          verification.supportsClaim &&
          verification.confidence >= HIGH_CONFIDENCE_SKIP_CONFIRM &&
          row.similarity >= SKIP_CONFIRM_SIMILARITY) ||
        (isAcademic &&
          verification.matches &&
          verification.supportsClaim &&
          verification.confidence >= 0.55 &&
          row.similarity >= SIMILARITY_PREFERRED) ||
        (ctx.isBasic &&
          verification.matches &&
          verification.supportsClaim &&
          row.similarity >= BASIC_SKIP_CONFIRM_SIMILARITY))

    if (!skipConfirm) {
      const confirmation = await confirmSourceMatch({
        sentence: ctx.sentence,
        claim: claim.claim,
        sourceTitle: record.title,
        sourceAbstract: record.abstract ?? record.summary,
        evidenceSnippet: verification.evidenceSnippet,
        firstRationale: verification.rationale,
      })

      if (!confirmation.confirmed || confirmation.confidence < 0.4) {
        bestRejected = { ...row, candidate: { ...row.candidate, record } }
        lastRejectReason =
          confirmation.rationale?.slice(0, 180) ||
          'Source failed second-pass verification.'
        continue
      }
      confirmConfidence = confirmation.confidence
    }

    // Enrich winners only when bibliography metadata is still incomplete.
    if (needsEnrichment(record)) {
      record = await enrichCandidateRecord(record, ctx.exaUrlCache)
    }
    if (record.doi && needsDoiEnrichment(record)) {
      record = await enrichFromDoi(record)
    }

    const cleanRecord = normalizeSourceForCitation(record)
    // Bibliography / in-text are formatted once in generate (document order).
    return {
      success: {
        status: 'done',
        provider: row.candidate.provider,
        similarity: row.similarity,
        record: cleanRecord,
        claim: claim.claim,
        verificationConfidence: Math.min(verification.confidence, confirmConfidence),
        correction:
          ctx.settings.suggestCorrections && verification.correction
            ? verification.correction
            : null,
      },
      bestRejected: null,
      lastRejectReason,
    }
  }

  return { bestRejected, lastRejectReason }
}

function applyGeoBoost(ranked: RankedCandidate[], places: string[]): RankedCandidate[] {
  if (!places.length) return ranked
  return ranked
    .map((r) => ({
      ...r,
      similarity: r.similarity + (sourceMentionsPlaces(r.candidate.record, places) ? 0.03 : 0),
    }))
    .sort((a, b) => b.similarity - a.similarity)
}

export async function findCitationForSentence(input: {
  sentence: string
  settings: GenerationSettings
  entitlements: CitationEntitlements
  priorSourceIds: string[]
  allSourcesSoFar: SourceRecord[]
  /** From analyze; defaults to mixed when missing (older generations). */
  claimType?: ClaimType
  /** Precomputed claim query from analyze (skips extractClaimQuery LLM). */
  claimQuery?: ClaimQuery | null
  analyzedSentence?: AnalyzedSentence
  /** Optional progress hook for Generation Theater SSE. */
  onStage?: CitationStageReporter
  /** Generation-scoped OpenAlex / Perplexity cache (shared across sentences). */
  searchCache?: CitationSearchCache
  /** User-pasted links resolved before search — preferred over discovery. */
  providedSources?: SourceRecord[]
}): Promise<SentenceCitationResult> {
  const stage = (s: CitationPipelineStage) => {
    try {
      input.onStage?.(s)
    } catch {
      /* ignore reporter errors */
    }
  }

  try {
    const isBasic = input.entitlements.planTier === 'basic'
    const similarityFloor = isBasic ? SIMILARITY_FLOOR_BASIC : SIMILARITY_FLOOR
    const maxVerify = isBasic ? MAX_CANDIDATES_TO_VERIFY_BASIC : MAX_CANDIDATES_TO_VERIFY
    const maxWebQueries = isBasic ? MAX_WEB_QUERIES_BASIC : MAX_WEB_QUERIES_PRO
    const exaUrlCache = new Map<string, Promise<SourceRecord>>()

    // Academic-only user setting forces the academic path regardless of analyze tags.
    const claimType: ClaimType =
      input.settings.sourceTier === 'academic'
        ? 'academic'
        : input.claimType === 'academic' || input.claimType === 'news' || input.claimType === 'mixed'
          ? input.claimType
          : 'mixed'

    const runAcademic = claimType === 'academic' || claimType === 'mixed'
    const runWeb = claimType === 'news' || claimType === 'mixed'

    stage('claim')
    const existingCite = mergeExistingCitation(
      input.analyzedSentence?.existingCitation ?? null,
      input.sentence,
    )
    const fromAnalyze =
      input.claimQuery ??
      (input.analyzedSentence ? claimQueryFromAnalyzed(input.analyzedSentence) : null)
    const claim = fromAnalyze ?? (await extractClaimQuery(input.sentence))
    const sentenceForSignals = existingCite
      ? input.sentence.replace(existingCite.raw, ' ').replace(/\s+/g, ' ').trim()
      : input.sentence
    const places = detectPlaces(
      sentenceForSignals,
      claim.claim,
      claim.entities.join(' '),
      claim.keywords.join(' '),
      claim.academicQuery,
      claim.webQuery,
    )
    const claimYears = extractClaimYears(
      sentenceForSignals,
      claim.claim,
      ...claim.dataPoints,
      ...claim.keywords,
    )

    const searchableEntities = claim.entities.filter((e) => !isLikelyEssaySpecificEntity(e))
    const keywordBundle = [
      ...claim.keywords.filter((k) => !isLikelyEssaySpecificEntity(k)),
      ...searchableEntities,
      ...claim.dataPoints,
      ...places,
    ]
      .filter(Boolean)
      .slice(0, 12)
      .join(' ')

    const semanticQuery =
      claim.semanticQuery?.trim() ||
      claim.claim?.trim() ||
      claim.embeddingFocus?.trim() ||
      claim.academicQuery?.trim()

    const conceptFromAcademic = toConceptQuery(claim.academicQuery)
    const conceptFromKeywords = toConceptQuery(keywordBundle)

    const academicQueries = uniqueQueries(
      MAX_ACADEMIC_QUERIES,
      // Concept-first: rare stats match better without claim verbs / precise numbers.
      ensurePlaceInQuery(conceptFromAcademic, places),
      ensurePlaceInQuery(stripPreciseNumbers(claim.academicQuery), places),
      ensurePlaceInQuery(claim.academicQuery, places),
      ensurePlaceInQuery(conceptFromKeywords || keywordBundle, places),
      ensurePlaceInQuery(stripPreciseNumbers(keywordBundle), places),
      ensurePlaceInQuery(claim.claim, places),
    )
    const webQueries = uniqueQueries(
      maxWebQueries,
      ensurePlaceInQuery(claim.webQuery, places),
      ensurePlaceInQuery(stripPreciseNumbers(claim.webQuery), places),
      ensurePlaceInQuery(keywordBundle, places),
      ensurePlaceInQuery(claim.claim, places),
    )
    const queryEmbedText = buildQueryEmbedText(input.sentence, claim, places)

    const preferLegal =
      input.settings.legal === true && input.entitlements.allowLegalDatabase

    const ctx: VerifyContext = {
      sentence: input.sentence,
      claim,
      places,
      claimYears,
      settings: input.settings,
      priorSourceIds: input.priorSourceIds,
      allSourcesSoFar: input.allSourcesSoFar,
      isBasic,
      exaUrlCache,
      onStage: stage,
      doctrineTerms: extractDoctrineTerms(
        input.sentence,
        claim.claim,
        claim.academicQuery,
        ...claim.keywords,
      ),
    }

    let bestRejected: RankedCandidate | null = null
    let lastRejectReason = 'No verified source supported the claim.'
    let queryVec: number[] | undefined
    let academicCandidates: CandidateSource[] = []
    let perplexityCandidates: CandidateSource[] = []
    let exaCandidates: CandidateSource[] = []
    let lastRanked: RankedCandidate[] = []
    const triedKeys = new Set<string>()
    const academicOnlySetting = input.settings.sourceTier === 'academic'

    const finish = (result: SentenceCitationResult): SentenceCitationResult => {
      if (result.status === 'failed' && !result.possibleMatches?.length && lastRanked.length) {
        result.possibleMatches = toPossibleMatches(lastRanked)
      }
      stage(result.status === 'done' ? 'found' : 'miss')
      return result
    }

    const rankAndPool = async (candidates: CandidateSource[], cached?: number[]) => {
      stage('rank')
      const rankedResult = await rankCandidates(
        queryEmbedText,
        candidates,
        cached,
        places,
        claimYears,
        claim.claim,
        claim.keywords,
        preferLegal,
      )
      queryVec = rankedResult.queryVec
      const ranked = applyGeoBoost(rankedResult.ranked, places)
      lastRanked = ranked
      const pool = pickVerificationPool(
        ranked,
        places,
        similarityFloor,
        maxVerify,
        claim.claim,
        claim.keywords,
      )
      return { ranked, rankedResult, pool }
    }

    // Prefer resolving an in-text citation already present in the draft.
    // Always verify before accepting — author+year search alone is too loose.
    if (existingCite && (existingCite.doi || (existingCite.authors.length && existingCite.year))) {
      stage('resolve')
      try {
        const resolved = await resolveExistingCitation(existingCite)
        if (resolved) {
          let record = resolved
          if (record.doi && needsDoiEnrichment(record)) {
            record = await enrichFromDoi(record)
          }
          const cleanRecord = normalizeSourceForCitation(record)
          const provider: CitationProvider = cleanRecord.openAlexId
            ? 'openalex'
            : cleanRecord.doi
              ? 'crossref'
              : 'openalex'
          const resolveCandidate: CandidateSource = {
            provider,
            record: cleanRecord,
            textForEmbed: buildOpenAlexEmbedText(cleanRecord),
          }
          const { pool } = await rankAndPool([resolveCandidate], queryVec)
          const resolveCtx: VerifyContext = {
            ...ctx,
            requireStrongMatch: true,
          }
          const verdict = await verifyPool(pool.length ? pool : [{
            candidate: resolveCandidate,
            similarity: existingCite.doi ? 0.85 : 0.6,
          }], resolveCtx)
          if (verdict.success) {
            return finish({
              ...verdict.success,
              provider: verdict.success.provider ?? provider,
              preserveExistingInText: sentenceHasExistingInTextCitation(input.sentence),
              verificationConfidence: Math.max(
                verdict.success.verificationConfidence ?? 0.7,
                existingCite.doi ? 0.85 : 0.7,
              ),
            })
          }
          bestRejected = verdict.bestRejected
          lastRejectReason =
            verdict.lastRejectReason ||
            'The cited author/year did not resolve to a source that supports this claim.'
        }
      } catch {
        /* fall through to normal search */
      }
    }

    // Prefer user-pasted links / DOIs over discovery search.
    if (input.providedSources?.length) {
      stage('resolve')
      const providedCandidates: CandidateSource[] = input.providedSources.map((record, i) => ({
        provider: (record.openAlexId
          ? 'openalex'
          : record.doi
            ? 'crossref'
            : 'exa') as CitationProvider,
        record: { ...record, id: record.id || `provided-${i}` },
        textForEmbed: buildOpenAlexEmbedText(record),
      }))
      const { pool } = await rankAndPool(providedCandidates)
      if (pool.length) {
        const verdict = await verifyPool(pool, ctx)
        if (verdict.success) {
          return finish({
            ...verdict.success,
            provider: verdict.success.provider ?? 'exa',
            verificationConfidence: Math.max(verdict.success.verificationConfidence ?? 0.7, 0.75),
          })
        }
        // Soft accept best provided match — user supplied the link.
        const best = pool[0]
        if (best && best.similarity >= 0.28) {
          let record = best.candidate.record
          if (record.doi && needsDoiEnrichment(record)) {
            record = await enrichFromDoi(record)
          }
          if (needsEnrichment(record)) {
            record = await enrichCandidateRecord(record, ctx.exaUrlCache)
          }
          return finish({
            status: 'done',
            provider: best.candidate.provider,
            similarity: best.similarity,
            record: normalizeSourceForCitation(record),
            claim: claim.claim,
            verificationConfidence: 0.72,
            correction: null,
          })
        }
      }
    }

    // Reuse sources already found in this essay before any external search.
    if (input.allSourcesSoFar.length > 0) {
      stage('reuse')
      const priorCandidates: CandidateSource[] = input.allSourcesSoFar.map((record, i) => ({
        provider: 'openalex' as CitationProvider,
        record: { ...record, id: record.id || `prior-${i}` },
        textForEmbed: buildOpenAlexEmbedText(record),
      }))
      const { pool } = await rankAndPool(priorCandidates)
      // Only accept prior reuse when similarity is reasonably strong.
      const strongPool = pool.filter((r) => r.similarity >= SIMILARITY_PREFERRED)
      if (strongPool.length) {
        const verdict = await verifyPool(strongPool, ctx)
        if (verdict.success) {
          return finish({
            ...verdict.success,
            provider: verdict.success.provider ?? 'openalex',
          })
        }
        bestRejected = verdict.bestRejected
        lastRejectReason = verdict.lastRejectReason
      }
    }

    // Academic path: hybrid OpenAlex keyword + semantic. Pro subject DBs when thin.
    if (runAcademic) {
      stage('academic')

      // Legal essays: try CourtListener alone first so doctrine opinions beat noisy OpenAlex.
      if (preferLegal) {
        const legalFirst = await searchLegalCandidates(academicQueries, input.settings)
        for (const candidate of legalFirst) triedKeys.add(candidateKey(candidate))
        if (legalFirst.length) {
          const { pool } = await rankAndPool(legalFirst, queryVec)
          const verdict = await verifyPool(pool, ctx)
          if (verdict.success) return finish(verdict.success)
          bestRejected = verdict.bestRejected
          lastRejectReason = verdict.lastRejectReason
        }
      }

      const oaCandidates = await searchOpenAlexCandidates(
        academicQueries,
        input.settings,
        input.searchCache,
        semanticQuery,
      )
      const thinOpenAlex = oaCandidates.length < SUBJECT_OPENALEX_THRESHOLD

      const [medicalCandidates, legalCandidates] = await Promise.all([
        input.entitlements.allowPubMed &&
        (input.settings.medical === true || academicOnlySetting) &&
        (thinOpenAlex || input.settings.medical === true)
          ? searchMedicalCandidates(academicQueries, input.settings, [
              input.sentence,
              claim.claim,
              claim.academicQuery,
              ...claim.keywords,
              ...claim.entities,
            ])
          : Promise.resolve([] as CandidateSource[]),
        // Fill legal pool again when first pass was empty or we still need academic backup.
        preferLegal
          ? searchLegalCandidates(academicQueries, input.settings)
          : Promise.resolve([] as CandidateSource[]),
      ])

      academicCandidates = dedupeCandidates([
        ...legalCandidates,
        ...oaCandidates,
        ...medicalCandidates,
      ])
      for (const candidate of academicCandidates) triedKeys.add(candidateKey(candidate))

      if (academicCandidates.length > 0) {
        const { pool, rankedResult } = await rankAndPool(academicCandidates, queryVec)
        const verdict = await verifyPool(pool, ctx)
        if (verdict.success) return finish(verdict.success)
        bestRejected = verdict.bestRejected
        lastRejectReason = verdict.lastRejectReason
        void rankedResult

        // Rescue: PubMed/Europe PMC with a concept-compressed query when OpenAlex near-missed.
        if (
          input.entitlements.allowPubMed &&
          (academicOnlySetting || input.settings.medical === true)
        ) {
          const rescueQuery =
            toConceptQuery(academicQueries[0]) ||
            toConceptQuery(claim.academicQuery) ||
            academicQueries[0]
          if (rescueQuery) {
            const rescue = (
              await searchMedicalCandidates([rescueQuery], input.settings, [
                input.sentence,
                claim.claim,
                rescueQuery,
                ...claim.keywords,
              ])
            ).filter((candidate) => !triedKeys.has(candidateKey(candidate)))
            for (const candidate of rescue) triedKeys.add(candidateKey(candidate))
            if (rescue.length) {
              academicCandidates = dedupeCandidates([...academicCandidates, ...rescue])
              const rescueRanked = await rankAndPool(rescue, queryVec)
              const rescueVerdict = await verifyPool(rescueRanked.pool, ctx)
              if (rescueVerdict.success) return finish(rescueVerdict.success)
              if (!bestRejected && rescueVerdict.bestRejected) {
                bestRejected = rescueVerdict.bestRejected
                lastRejectReason = rescueVerdict.lastRejectReason
              }
            }
          }
        }
      }

      // Only hard-stop academic path when the user forced Academic Only.
      if (academicOnlySetting) {
        if (!academicCandidates.length) {
          return finish({
            status: 'failed',
            claim: claim.claim,
            errorMessage:
              'No candidate sources were found in academic databases for this scholarly claim.',
            possibleMatches: toPossibleMatches(lastRanked),
          })
        }
        return finish({
          status: 'failed',
          provider: bestRejected?.candidate.provider,
          similarity: bestRejected?.similarity,
          record: bestRejected?.candidate.record,
          claim: claim.claim,
          errorMessage: lastRejectReason,
          possibleMatches: toPossibleMatches(lastRanked),
        })
      }
    }

    // News / mixed / academic-fallback web path.
    let bestPplxSimilarity = 0
    const allowWebFallback = runWeb || (claimType === 'academic' && !academicOnlySetting)
    if (allowWebFallback) {
      if (input.entitlements.allowPerplexity) {
        stage('web')
        perplexityCandidates = (
          await searchPerplexityCandidates(webQueries, input.settings, input.searchCache)
        ).filter((candidate) => !triedKeys.has(candidateKey(candidate)))
        for (const candidate of perplexityCandidates) triedKeys.add(candidateKey(candidate))

        if (perplexityCandidates.length > 0) {
          const { pool, rankedResult } = await rankAndPool(perplexityCandidates, queryVec)
          bestPplxSimilarity = rankedResult.providerOrdered ? 0 : (pool[0]?.similarity ?? 0)
          const verdict = await verifyPool(pool, ctx)
          if (verdict.success) return finish(verdict.success)
          if (!bestRejected && verdict.bestRejected) {
            bestRejected = verdict.bestRejected
            lastRejectReason = verdict.lastRejectReason
          }
        }
      }

      // Exa /search fallback — Pro only, and only when Perplexity is empty or weak.
      const shouldExaSearch =
        input.entitlements.allowExaSearch &&
        (perplexityCandidates.length === 0 || bestPplxSimilarity < EXA_FALLBACK_SIMILARITY)

      if (shouldExaSearch) {
        stage('web')
        exaCandidates = (await searchExaCandidates(webQueries, input.settings)).filter(
          (candidate) => !triedKeys.has(candidateKey(candidate)),
        )
        for (const candidate of exaCandidates) triedKeys.add(candidateKey(candidate))

        if (exaCandidates.length > 0) {
          const { pool } = await rankAndPool(exaCandidates, queryVec)
          const verdict = await verifyPool(pool, ctx)
          if (verdict.success) return finish(verdict.success)
          if (!bestRejected && verdict.bestRejected) {
            bestRejected = verdict.bestRejected
            lastRejectReason = verdict.lastRejectReason
          }
        }
      }
    }

    if (!academicCandidates.length && !exaCandidates.length && !perplexityCandidates.length) {
      const webLabel = input.entitlements.allowExaSearch
        ? 'real-time web and agentic web'
        : 'agentic web'
      const subjectBits = [
        input.entitlements.allowPubMed && input.settings.medical === true
          ? 'medical database'
          : null,
        input.entitlements.allowLegalDatabase && input.settings.legal === true
          ? 'legal database'
          : null,
      ].filter(Boolean)
      const availableSearches =
        claimType === 'news'
          ? webLabel
          : ['academic databases', ...subjectBits, webLabel].join(', ')
      return finish({
        status: 'failed',
        claim: claim.claim,
        errorMessage: `No candidate sources were found across the available ${availableSearches} searches.`,
        possibleMatches: toPossibleMatches(lastRanked),
      })
    }

    return finish({
      status: 'failed',
      provider: bestRejected?.candidate.provider,
      similarity: bestRejected?.similarity,
      record: bestRejected?.candidate.record,
      claim: claim.claim,
      errorMessage: lastRejectReason,
      possibleMatches: toPossibleMatches(lastRanked),
    })
  } catch (err) {
    stage('miss')
    return {
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : "Citation search didn't finish.",
    }
  }
}

