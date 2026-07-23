import { z } from 'zod'
import { completeStructured } from '@/lib/ai/provider'
import { locateSentenceInEssay } from '@/lib/essay/alignSentences'
import {
  CONFIRM_MATCH_SYSTEM,
  EXTRACT_CLAIM_QUERY_SYSTEM,
  VERIFY_SOURCE_SYSTEM,
} from '@/lib/ai/prompts'
import type { GenerationSettings } from '@/types'
import { countWords } from '@/lib/billing/entitlements'
import { reasoningImpliesCitations } from '@/lib/format/agentReasoning'
import { mergeExistingCitation } from '@/lib/cite/existingCitation'
import {
  getCachedClaimQuery,
  putCachedClaimQuery,
  getClaimQueryFromMemory,
  seedClaimQuery,
} from '@/lib/cite/claimQueryCache'

export const claimTypeSchema = z.enum(['academic', 'news', 'mixed'])
export type ClaimType = z.infer<typeof claimTypeSchema>

/** Coerce model quirks: object maps, single strings, or null → string[]. */
function coerceStringList(value: unknown): string[] {
  if (value == null) return []
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item
        if (item == null) return ''
        if (typeof item === 'number' || typeof item === 'boolean') return String(item)
        if (typeof item === 'object') return Object.values(item as Record<string, unknown>).map(String).join(' ')
        return ''
      })
      .map((s) => s.trim())
      .filter(Boolean)
  }
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .map((v) => (typeof v === 'string' ? v : v == null ? '' : String(v)))
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

const stringListSchema = z.preprocess(coerceStringList, z.array(z.string()))

const claimTypeField = z.preprocess((value) => {
  if (value === 'academic' || value === 'news' || value === 'mixed') return value
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase()
    if (lower === 'academic' || lower === 'news' || lower === 'mixed') return lower
  }
  return 'mixed'
}, claimTypeSchema)

export const claimQuerySchema = z.object({
  claim: z.string().min(1),
  keywords: stringListSchema.pipe(z.array(z.string()).min(1).max(12)),
  entities: stringListSchema.pipe(z.array(z.string()).max(8)).default([]),
  dataPoints: stringListSchema.pipe(z.array(z.string()).max(8)).default([]),
  academicQuery: z.string().min(1),
  webQuery: z.string().min(1),
  embeddingFocus: z.string().min(1),
  /** Natural-language research question for hybrid recall. */
  questionQuery: z.string().optional(),
  /** Paragraph-style claim for OpenAlex semantic / embedding search. */
  semanticQuery: z.string().optional(),
})

export type ClaimQuery = z.infer<typeof claimQuerySchema>

/** Claim fields optional so older cached analyses still parse. */
const existingCitationSchema = z
  .object({
    raw: z.string().optional(),
    form: z.enum(['parenthetical', 'narrative', 'doi', 'numeric']).optional(),
    authors: stringListSchema.pipe(z.array(z.string()).max(4)).optional(),
    year: z.preprocess((v) => (v == null ? undefined : String(v)), z.string().optional()),
    doi: z.string().optional(),
    number: z.preprocess((v) => {
      if (typeof v === 'number') return v
      if (typeof v === 'string' && v.trim()) return Number(v)
      return v
    }, z.number().int().positive().optional()),
  })
  .nullable()
  .optional()

const optionalNonEmptyString = z.preprocess((value) => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}, z.string().min(1).optional())

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

/** Normalize alternate model field names and string-only sentence entries. */
function normalizeRawSentenceItem(item: unknown, position: number): Record<string, unknown> | null {
  if (typeof item === 'string' && item.trim()) {
    return { index: position, text: item.trim() }
  }
  if (!item || typeof item !== 'object') return null
  const raw = item as Record<string, unknown>
  const text = pickString(raw, [
    'text',
    'sentence',
    'sentenceText',
    'sentence_text',
    'essaySentence',
    'essay_sentence',
    'original',
    'content',
    'quote',
    'passage',
  ])
  const claim = pickString(raw, ['claim', 'claimText', 'claim_text'])
  if (!text) return null
  return {
    ...raw,
    index: raw.index ?? position,
    text,
    sentence: pickString(raw, ['sentence']) ?? text,
    ...(claim ? { claim } : {}),
  }
}

function preprocessSentenceList(value: unknown): unknown[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item, i) => normalizeRawSentenceItem(item, i))
    .filter((item): item is Record<string, unknown> => item != null)
}

const sentenceAnalyzeSchema = z.object({
  index: z.preprocess((v) => {
    if (typeof v === 'string' && v.trim()) return Number(v)
    return v
  }, z.number().int().nonnegative()),
  /** Exact essay span; may be missing from flaky model output — recovered below. */
  text: optionalNonEmptyString,
  sentence: optionalNonEmptyString,
  reason: z.string().optional(),
  /** Routes search: academic DBs only, news/web first, or full cascade. */
  claimType: claimTypeField.default('mixed'),
  claim: z.string().optional(),
  keywords: stringListSchema.optional(),
  entities: stringListSchema.optional(),
  dataPoints: stringListSchema.optional(),
  academicQuery: z.string().optional(),
  webQuery: z.string().optional(),
  embeddingFocus: z.string().optional(),
  questionQuery: z.string().optional(),
  semanticQuery: z.string().optional(),
  /** In-text citation already present in the pasted draft (Author, Year / DOI / etc.). */
  existingCitation: existingCitationSchema,
})

export const analyzeSchema = z.object({
  medical: z.preprocess((v) => v === true || v === 'true', z.boolean()).default(false),
  legal: z.preprocess((v) => v === true || v === 'true', z.boolean()).default(false),
  /** Model rationale for claim selection and query generalization (shown in UI). */
  reasoning: z.preprocess((v) => (typeof v === 'string' ? v : ''), z.string()).default(''),
  sentences: z.preprocess(preprocessSentenceList, z.array(sentenceAnalyzeSchema)),
})

/** Phase A identify only — small JSON so dense drafts do not truncate. */
const leanSentenceSchema = z.object({
  index: z.preprocess((v) => {
    if (typeof v === 'string' && v.trim()) return Number(v)
    return v
  }, z.number().int().nonnegative()),
  text: optionalNonEmptyString,
  sentence: optionalNonEmptyString,
  reason: z.string().optional(),
  claimType: claimTypeField.default('mixed'),
  claim: z.string().optional(),
  existingCitation: existingCitationSchema,
})

/** Shared Phase A sentence item — text optional at parse time; materialize recovers from essay. */
const phaseASentenceItemSchema = z.object({
  index: z.preprocess((val) => {
    if (typeof val === 'string' && val.trim()) return Number(val)
    return val
  }, z.number().int().nonnegative()),
  text: optionalNonEmptyString,
  sentence: optionalNonEmptyString,
  claimType: claimTypeField.default('mixed'),
  claim: z.string().optional(),
})

/** Sentences-only schema for Phase A chunks — fewer fields → less prose / truncate risk. */
const phaseASentenceOnlySchema = z.object({
  sentences: z.preprocess(preprocessSentenceList, z.array(phaseASentenceItemSchema)),
})

const leanAnalyzeSchema = z.object({
  medical: z.preprocess((v) => v === true || v === 'true', z.boolean()).default(false),
  legal: z.preprocess((v) => v === true || v === 'true', z.boolean()).default(false),
  reasoning: z.preprocess((v) => (typeof v === 'string' ? v : ''), z.string()).default(''),
  sentences: z.preprocess(preprocessSentenceList, z.array(leanSentenceSchema)),
})

/**
 * Phase A must stay tiny. Do NOT prepend ANALYZE_ESSAY_SYSTEM — that long prompt
 * asks for medical/legal/reasoning/search fields and causes prose instead of JSON.
 */
const PHASE_A_IDENTIFY_SYSTEM = `You identify essay sentences that need citations. Output structured JSON only. Never write prose, plans, or explanations.

Shape: { "sentences": [ { "index": 0, "text": "<exact essay sentence>" } ] }

Rules:
- First character must be "{". No markdown fences.
- Copy each sentence EXACTLY from the essay (same wording and punctuation).
- Include every evidence-backed fact: numbers, percentages, dollar amounts, years with measured outcomes, survey/market stats, or named data sources (Statista, WHO, Pew, OECD, etc.).
- Skip opinions, plans, recommendations, thesis framing, and transitions.
- Optional per sentence: claimType ("academic"|"news"|"mixed"), claim (short restatement).
- Do NOT add medical, legal, reasoning, keywords, queries, entities, or dataPoints.
- If nothing needs a citation, return { "sentences": [] }.`

const PHASE_A_COMPACT_SYSTEM = `You identify essay sentences that need citations. Output structured JSON only. Never write prose.

Shape: { "sentences": [ { "index": 0, "text": "<exact essay sentence>" } ] }

Rules:
- First character must be "{". No markdown fences. No commentary before or after JSON.
- Copy each sentence exactly from the essay.
- Include every checkable fact (numbers, %, $, years with measured outcomes, named data sources).
- Skip opinions, plans, and thesis framing.
- Optional: claimType, claim. No other fields.
- Empty list is valid: { "sentences": [] }.`

const compactSentenceListSchema = z.object({
  sentences: z.preprocess(preprocessSentenceList, z.array(phaseASentenceItemSchema)),
})

export type AnalyzedSentence = z.infer<typeof sentenceAnalyzeSchema> & { text: string }

export interface EssayAnalysis {
  sentences: AnalyzedSentence[]
  /** True when the essay is medicine/health/biomedical related (routes Pro medical database). */
  medical: boolean
  /** True when the essay is primarily law / case-based (routes Pro US legal database). */
  legal: boolean
  /** Analyst rationale for selected claims and skipped opinions. */
  reasoning: string
}

function normalizeClaimType(
  value: unknown,
  sourceTier: GenerationSettings['sourceTier'],
): ClaimType {
  if (sourceTier === 'academic') return 'academic'
  if (value === 'academic' || value === 'news' || value === 'mixed') return value
  return 'mixed'
}

/**
 * Essay-specific brands/project names often land in entities. Keep single-token
 * proper nouns (e.g. Bacco) out of OpenAlex queries. Multi-word places like
 * "Hong Kong" stay searchable.
 */
export function isLikelyEssaySpecificEntity(term: string): boolean {
  const t = term.trim()
  if (!t || /\d/.test(t)) return false
  const words = t.split(/\s+/).filter(Boolean)
  if (words.length !== 1) return false
  return /^[A-Z][\p{L}'-]{1,23}$/u.test(t)
}

function stripEssaySpecificFromQuery(query: string, entities: string[]): string {
  let next = query
  for (const entity of entities) {
    if (!isLikelyEssaySpecificEntity(entity)) continue
    const escaped = entity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    next = next.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), ' ')
  }
  return next.replace(/\s+/g, ' ').trim()
}

/** Drop filler verbs/glue so search queries stay entity + number + topic heavy. */
function tidySearchQuery(query: string): string {
  return query
    .replace(
      /\b(that|which|who|whom|whose|with|from|into|during|while|when|where|were|was|are|is|been|being|have|has|had|the|and|for|of|to|in|on|at|by|as|an|a)\b/gi,
      ' ',
    )
    .replace(
      /\b(estimated|reported|found|showed|indicated|according|suggested|revealed|announced|noted|stated|claimed|said|put|reached|crossed|accounted)\b/gi,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()
}

function polishClaimQuery(cq: ClaimQuery): ClaimQuery {
  const entities = cq.entities ?? []
  const polish = (q: string) =>
    tidySearchQuery(stripEssaySpecificFromQuery(q, entities)) || tidySearchQuery(q) || q.trim()
  return {
    ...cq,
    claim: stripEssaySpecificFromQuery(cq.claim, entities) || cq.claim,
    academicQuery: polish(cq.academicQuery),
    webQuery: polish(cq.webQuery),
    embeddingFocus: polish(cq.embeddingFocus) || cq.claim,
    questionQuery: cq.questionQuery ? polish(cq.questionQuery) || undefined : undefined,
    semanticQuery: cq.semanticQuery ? polish(cq.semanticQuery) || undefined : undefined,
  }
}

/** Build ClaimQuery from analyze sentence fields when present. */
export function claimQueryFromAnalyzed(sentence: AnalyzedSentence): ClaimQuery | null {
  const claim = sentence.claim?.trim()
  const entities = (sentence.entities ?? []).map((e) => e.trim()).filter(Boolean).slice(0, 8)
  const academicQuery = tidySearchQuery(
    stripEssaySpecificFromQuery(sentence.academicQuery?.trim() ?? '', entities),
  )
  const webQuery = tidySearchQuery(
    stripEssaySpecificFromQuery(sentence.webQuery?.trim() ?? '', entities),
  )
  const questionQuery = tidySearchQuery(
    stripEssaySpecificFromQuery(sentence.questionQuery?.trim() ?? '', entities),
  )
  const semanticQuery = tidySearchQuery(
    stripEssaySpecificFromQuery(sentence.semanticQuery?.trim() ?? '', entities),
  )
  const keywords = (sentence.keywords ?? [])
    .map((k) => k.trim())
    .filter(Boolean)
    .filter((k) => !entities.some((e) => isLikelyEssaySpecificEntity(e) && e.toLowerCase() === k.toLowerCase()))
  if (!claim || !academicQuery || !webQuery || keywords.length === 0) return null
  return polishClaimQuery({
    claim: stripEssaySpecificFromQuery(claim, entities) || claim,
    keywords: keywords.slice(0, 12),
    entities: entities.slice(0, 8),
    dataPoints: (sentence.dataPoints ?? []).slice(0, 8),
    academicQuery,
    webQuery,
    embeddingFocus:
      tidySearchQuery(
        stripEssaySpecificFromQuery(sentence.embeddingFocus?.trim() || claim, entities),
      ) || claim,
    questionQuery: questionQuery || undefined,
    semanticQuery: semanticQuery || undefined,
  })
}

function inferSubjectFlags(essay: string): { medical: boolean; legal: boolean } {
  const t = essay.toLowerCase()
  const medicalHits = (
    t.match(
      /\b(hypertension|cardiovascular|blood pressure|clinical|patient|pharma|epidemiolog|disease|treatment|diagnosis|hospital|biomedical|ace inhibitor|public health)\b/g,
    ) ?? []
  ).length
  const legalHits = (
    t.match(
      /\b(strict scrutiny|equal protection|due process|constitutional|statute|court|doctrine|plaintiff|defendant|amendment|judicial review|compelling interest|narrowly tailored|classification)\b/g,
    ) ?? []
  ).length
  // Mixed Statista/market essays often mention health stats once — require denser medical signal.
  const broadNonMedical =
    (
      t.match(
        /\b(statista|smartphone|e-commerce|gdp|semiconductor|renewable|logistics|workforce|retail|advertising)\b/g,
      ) ?? []
    ).length >= 3
  const medicalFloor = broadNonMedical ? 6 : 4
  return {
    medical: medicalHits >= medicalFloor && medicalHits > legalHits,
    legal: legalHits >= 4 && legalHits > medicalHits,
  }
}

function isBroadNonMedicalEssay(essay: string): boolean {
  const t = essay.toLowerCase()
  return (
    (
      t.match(
        /\b(statista|smartphone|e-commerce|gdp|semiconductor|renewable|logistics|workforce|retail|advertising)\b/g,
      ) ?? []
    ).length >= 3
  )
}

function resolveSubjectFlags(
  essay: string,
  modelMedical: boolean,
  modelLegal: boolean,
): { medical: boolean; legal: boolean } {
  const inferred = inferSubjectFlags(essay)
  // On broad multi-topic drafts, ignore a lone model medical=true unless heuristics agree.
  return {
    medical: inferred.medical || (modelMedical && !isBroadNonMedicalEssay(essay)),
    legal: inferred.legal || modelLegal,
  }
}

function preferNewsClaimType(
  claimType: ClaimType,
  text: string,
  sourceTier: GenerationSettings['sourceTier'],
): ClaimType {
  if (sourceTier === 'academic') return 'academic'
  if (claimType === 'academic' || claimType === 'news') return claimType
  const t = text.toLowerCase()
  const recentYear = /\b(202[3-9]|2030)\b/.test(t)
  const newsy =
    /\b(announced|act allocated|policy|government|onshoring|billions|headline|company said|press release)\b/i.test(
      t,
    )
  if (recentYear && newsy) return 'news'
  if (newsy && !/\b(meta-analysis|randomized|peer-reviewed|theory|mechanism)\b/i.test(t)) {
    return 'news'
  }
  return claimType === 'mixed' ? 'academic' : claimType
}

function recoverSentenceText(
  essay: string,
  raw: { text?: string; sentence?: string; claim?: string },
): string | null {
  const candidates = [raw.text, raw.sentence, raw.claim].filter(
    (v): v is string => typeof v === 'string' && v.trim().length > 0,
  )
  for (const candidate of candidates) {
    const located = locateSentenceInEssay(essay, candidate)
    if (located) return located
    if (essay.includes(candidate.trim())) return candidate.trim()
  }
  return null
}

function materializeAnalyzedSentences(
  essay: string,
  rawSentences: Array<z.infer<typeof leanSentenceSchema> | z.infer<typeof sentenceAnalyzeSchema>>,
  settings: GenerationSettings,
): AnalyzedSentence[] {
  const sentences: AnalyzedSentence[] = []
  let dropped = 0
  for (const s of rawSentences) {
    const text = recoverSentenceText(essay, s)
    if (!text) {
      dropped += 1
      continue
    }
    const claimType = preferNewsClaimType(
      normalizeClaimType(s.claimType, settings.sourceTier),
      text,
      settings.sourceTier,
    )
    const existingCitation = mergeExistingCitation(s.existingCitation ?? null, text)
    const full = s as z.infer<typeof sentenceAnalyzeSchema>
    const normalized: AnalyzedSentence = {
      index: s.index,
      text,
      sentence: text,
      reason: s.reason,
      claimType,
      claim: s.claim,
      keywords: full.keywords,
      entities: full.entities,
      dataPoints: full.dataPoints,
      academicQuery: full.academicQuery,
      webQuery: full.webQuery,
      embeddingFocus: full.embeddingFocus,
      questionQuery: full.questionQuery,
      semanticQuery: full.semanticQuery,
      existingCitation: existingCitation ?? s.existingCitation ?? null,
    }
    const cq = claimQueryFromAnalyzed(normalized)
    if (cq) seedClaimQuery(text, cq)
    sentences.push(normalized)
  }
  if (rawSentences.length > 0) {
    console.info(
      `[analyze] materialized ${sentences.length}/${rawSentences.length} sentences` +
        (dropped ? ` (${dropped} unmatched)` : ''),
    )
  }
  return sentences
}

function mergeClaimOntoSentence(sentence: AnalyzedSentence, cq: ClaimQuery): AnalyzedSentence {
  return {
    ...sentence,
    claim: sentence.claim?.trim() || cq.claim,
    keywords: cq.keywords,
    entities: cq.entities,
    dataPoints: cq.dataPoints,
    academicQuery: cq.academicQuery,
    webQuery: cq.webQuery,
    embeddingFocus: cq.embeddingFocus,
    questionQuery: cq.questionQuery,
    semanticQuery: cq.semanticQuery,
  }
}

function heuristicClaimQuery(sentence: AnalyzedSentence): ClaimQuery {
  const text = sentence.text.trim()
  const fallbackKeywords = text
    .replace(/[^\p{L}\p{N}\s%-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 8)
  const query = fallbackKeywords.join(' ') || text.slice(0, 120)
  return {
    claim: sentence.claim?.trim() || text,
    keywords: fallbackKeywords.length ? fallbackKeywords : [text.slice(0, 40)],
    entities: [],
    dataPoints: [],
    academicQuery: query,
    webQuery: query,
    embeddingFocus: text,
  }
}

/** Last-resort: pull strong fact sentences without another LLM call. */
function heuristicExtractFactSentences(
  essay: string,
  settings: GenerationSettings,
): AnalyzedSentence[] {
  const opinionSkip =
    /^(i believe|i think|i feel|i hope|i plan|i love|in my view|in my opinion|we should|we recommend|nevertheless|peer-reviewed syntheses generally|industry trackers note that year-over-year|regional breakdowns show|analysts caution that survey-based|methodological notes in the source|comparative tables across)\b/i
  // Require a strong cue — bare digits in boilerplate are not enough.
  const strongFactCue =
    /\d+(?:[.,]\d+)?%|\$\d[\d,.]*|\b(?:19|20)\d{2}\b.{0,40}\b(?:percent|%|billion|million|trillion|units|deaths|sales|share|rate|capacity|prevalence)\b|\b(?:statista|pew|who|unicef|oecd|iea|unctad|world bank|gallup|naep|pisa|cdc|nhs)\b|\b\d+(?:\.\d+)?\s*(?:billion|million|trillion|gw|kwh|pm2\.5)\b/i

  const candidates: string[] = []
  const paragraphs = essay.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  for (const para of paragraphs.length ? paragraphs : [essay]) {
    const parts = para
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 48 && s.length <= 420)
    for (const part of parts) {
      if (opinionSkip.test(part) || !strongFactCue.test(part)) continue
      candidates.push(part)
    }
  }

  const seen = new Set<string>()
  const raw: Array<{ index: number; text: string; claimType: ClaimType }> = []
  for (const text of candidates) {
    const key = text.toLowerCase().replace(/\s+/g, ' ').slice(0, 160)
    if (seen.has(key)) continue
    seen.add(key)
    raw.push({ index: raw.length, text, claimType: 'mixed' })
  }

  // No sentence cap — omitting real facts is worse than Phase B using heuristics under budget.
  if (raw.length > 50) {
    console.info(`[analyze] heuristic fact extract: ${raw.length} unique candidates (no cap)`)
  }
  return materializeAnalyzedSentences(essay, raw, settings).map((s, i) => ({
    ...s,
    index: i,
    claim: s.claim ?? s.text.slice(0, 160),
  }))
}

async function retryCompactSentenceAnalyze(
  essay: string,
  settings: GenerationSettings,
  timeoutMs: number,
): Promise<AnalyzedSentence[]> {
  const userContent = `Settings:
- Prefer academic sources: ${settings.sourceTier === 'academic' ? 'yes, academic only' : 'academic preferred but news/web ok'}
- Recency preference: ${settings.recency}

Essay:
"""
${essay}
"""`

  try {
    const compact = await completeStructured(
      compactSentenceListSchema,
      [{ role: 'user', content: userContent }],
      {
        system: PHASE_A_COMPACT_SYSTEM,
        temperature: 0.05,
        maxTokens: 6144,
        timeoutMs,
        structuredMode: 'object',
      },
    )
    return materializeAnalyzedSentences(essay, compact.sentences, settings)
  } catch (err) {
    console.warn(
      '[analyze] compact sentence list failed:',
      err instanceof Error ? err.message : err,
    )
    return []
  }
}

/**
 * Two-phase Analyze:
 * Phase A — compact-first sentence identify (parallel chunks for Pro ≥900 words)
 * Phase B — parallel per-sentence claim enrichment (still inside Analyze)
 */
const ANALYZE_CHUNK_WORDS = 650
const ANALYZE_CHUNK_WORD_THRESHOLD = 900
/** Keep Phase A concurrency low — 3 parallel generateObject calls often queue/timeout together. */
const ANALYZE_CHUNK_CONCURRENCY = 2
/** Align with `maxDuration = 300` on `/api/cite/analyze` (small headroom). */
const ANALYZE_ROUTE_BUDGET_MS = 285_000
/** Wall time reserved for Phase B after Phase A finishes. */
const PHASE_B_RESERVE_MS = 55_000
/** Safety ceiling for one Phase A / compact LLM call. */
const PHASE_A_MAX_SINGLE_CALL_MS = 120_000
/** Floor per chunk — sized so ~650-word identify usually completes under gateway load. */
const PHASE_A_MIN_CHUNK_TIMEOUT_MS = 50_000
/** Short salvage when object-first fails without timing out. */
const PHASE_A_NON_JSON_SALVAGE_MS = 12_000
/** Phase B is per-sentence + has heuristic fallback; moderate concurrency is fine. */
const PHASE_B_ENRICH_CONCURRENCY = 6
const PHASE_B_PER_SENTENCE_TIMEOUT_MS = 8_000
/** Soft wall-clock target for Phase B enrich regardless of route budget. */
const PHASE_B_SOFT_BUDGET_MS = 45_000

type IdentifyResult = z.infer<typeof leanAnalyzeSchema>

function phaseAWaveCount(chunkCount: number, concurrency: number): number {
  return Math.max(1, Math.ceil(chunkCount / concurrency))
}

/**
 * Per-chunk Phase A timeout derived from route budget ÷ wave count.
 * Chunking only helps if each chunk gets enough wall time to finish — not a fixed 35–45s cap.
 */
function phaseAChunkTimeoutMs(
  chunkCount: number,
  concurrency: number,
  deadlineAt: number,
): number {
  const waves = phaseAWaveCount(chunkCount, concurrency)
  const remaining = Math.max(0, deadlineAt - Date.now())
  const phaseABudget = Math.max(PHASE_A_MIN_CHUNK_TIMEOUT_MS, remaining - PHASE_B_RESERVE_MS)
  const perWaveMs = Math.floor(phaseABudget / waves)
  return Math.min(
    PHASE_A_MAX_SINGLE_CALL_MS,
    Math.max(PHASE_A_MIN_CHUNK_TIMEOUT_MS, perWaveMs - 2_000),
  )
}

function phaseASinglePassTimeoutMs(deadlineAt: number): number {
  const remaining = Math.max(0, deadlineAt - Date.now())
  return Math.min(
    PHASE_A_MAX_SINGLE_CALL_MS,
    Math.max(PHASE_A_MIN_CHUNK_TIMEOUT_MS, remaining - PHASE_B_RESERVE_MS),
  )
}

function isTimeoutStructuredError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /took too long|aborted due to timeout|timeout/i.test(msg)
}

function splitEssayIntoWordChunks(essay: string, maxWords: number): string[] {
  const paragraphs = essay.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  if (paragraphs.length === 0) return [essay.trim()].filter(Boolean)

  const chunks: string[] = []
  let current: string[] = []
  let currentWords = 0

  for (const paragraph of paragraphs) {
    const paragraphWords = countWords(paragraph)
    if (currentWords > 0 && currentWords + paragraphWords > maxWords) {
      chunks.push(current.join('\n\n'))
      current = [paragraph]
      currentWords = paragraphWords
    } else {
      current.push(paragraph)
      currentWords += paragraphWords
    }
  }

  if (current.length) chunks.push(current.join('\n\n'))
  return chunks.length ? chunks : [essay.trim()]
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await fn(items[index], index)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, () => worker()),
  )
  return results
}

function buildAnalyzeUserContent(essay: string, settings: GenerationSettings): string {
  return `Settings:
- Prefer academic sources: ${settings.sourceTier === 'academic' ? 'yes, academic only' : 'academic preferred but news/web ok'}
- Recency preference: ${settings.recency}

Return ONLY: { "sentences": [ { "index": 0, "text": "..." } ] }
No prose. Include every checkable fact sentence. If none: { "sentences": [] }.

Essay:
"""
${essay}
"""`
}

export function estimateMinimumCitableSentences(essay: string): number {
  const words = countWords(essay)
  const sentenceParts = essay
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 40)
  const strongFactCue =
    /\d+(?:[.,]\d+)?%|\$\d[\d,.]*|\b(?:19|20)\d{2}\b|\b(statista|pew|who|unicef|oecd|iea|unctad|world bank|gallup|naep|pisa|cdc|nhs|according to|survey|billion|million|prevalence|reported that)\b/i
  const seen = new Set<string>()
  let uniqueFactCount = 0
  for (const s of sentenceParts) {
    if (!strongFactCue.test(s)) continue
    const key = s.toLowerCase().replace(/\s+/g, ' ').slice(0, 160)
    if (seen.has(key)) continue
    seen.add(key)
    uniqueFactCount++
  }
  if (uniqueFactCount === 0 && !/\d/.test(essay)) return 0
  const fromFacts = Math.ceil(uniqueFactCount * 0.75)
  const fromWords = Math.floor(words / 200)
  // Prefer unique fact count; no hard ceiling — long dense drafts can have many distinct claims.
  return Math.max(fromFacts, Math.min(fromWords, fromFacts + 4))
}

/** Phase A: lean sentences-only identify (object-first; skip salvage on timeout). */
async function runIdentifyPass(
  essay: string,
  settings: GenerationSettings,
  timeoutBudgetMs?: number,
): Promise<IdentifyResult> {
  const userContent = buildAnalyzeUserContent(essay, settings)
  const timeoutMs = Math.min(
    PHASE_A_MAX_SINGLE_CALL_MS,
    Math.max(12_000, timeoutBudgetMs ?? PHASE_A_MIN_CHUNK_TIMEOUT_MS),
  )
  const empty: IdentifyResult = {
    medical: false,
    legal: false,
    reasoning: '',
    sentences: [],
  }

  const runOnce = async (ms: number) => {
    const result = await completeStructured(
      phaseASentenceOnlySchema,
      [{ role: 'user', content: userContent }],
      {
        system: PHASE_A_IDENTIFY_SYSTEM,
        temperature: 0.05,
        maxTokens: 6144,
        timeoutMs: ms,
        structuredMode: 'object',
      },
    )
    return {
      medical: false,
      legal: false,
      reasoning: '',
      sentences: result.sentences,
    } satisfies IdentifyResult
  }

  try {
    return await runOnce(timeoutMs)
  } catch (err) {
    const timedOut = isTimeoutStructuredError(err)
    if (timedOut) {
      console.warn(
        '[analyze] Phase A timed out; skipping salvage:',
        err instanceof Error ? err.message : err,
      )
      return empty
    }
    console.warn(
      '[analyze] Phase A identify failed, short object salvage:',
      err instanceof Error ? err.message : err,
    )
    try {
      return await runOnce(Math.min(PHASE_A_NON_JSON_SALVAGE_MS, timeoutMs))
    } catch (salvageErr) {
      console.warn(
        '[analyze] Phase A salvage failed:',
        salvageErr instanceof Error ? salvageErr.message : salvageErr,
      )
      return empty
    }
  }
}

async function enrichAnalyzedSentences(
  sentences: AnalyzedSentence[],
  deadlineAt: number,
): Promise<AnalyzedSentence[]> {
  if (sentences.length === 0) return sentences

  return mapWithConcurrency(sentences, PHASE_B_ENRICH_CONCURRENCY, async (sentence) => {
    const existing = claimQueryFromAnalyzed(sentence)
    if (existing) {
      const polished = polishClaimQuery(existing)
      seedClaimQuery(sentence.text, polished)
      void putCachedClaimQuery(sentence.text, polished)
      return mergeClaimOntoSentence(sentence, polished)
    }

    const remaining = deadlineAt - Date.now()
    // Leave headroom for remaining queue; prefer heuristic over stalling Analyze.
    if (remaining < 14_000) {
      const heuristic = polishClaimQuery(heuristicClaimQuery(sentence))
      seedClaimQuery(sentence.text, heuristic)
      void putCachedClaimQuery(sentence.text, heuristic)
      return mergeClaimOntoSentence(sentence, heuristic)
    }

    const cq = await extractClaimQuery(sentence.text, {
      timeoutMs: Math.min(PHASE_B_PER_SENTENCE_TIMEOUT_MS, Math.max(6_000, remaining - 8_000)),
    })
    return mergeClaimOntoSentence(sentence, cq)
  })
}

async function finalizeFromIdentify(
  essay: string,
  settings: GenerationSettings,
  identify: IdentifyResult,
  deadlineAt: number,
  options: { skipCompactRetry?: boolean } = {},
): Promise<EssayAnalysis> {
  const flags = resolveSubjectFlags(essay, identify.medical === true, identify.legal === true)
  let sentences = materializeAnalyzedSentences(essay, identify.sentences, settings)
  const words = countWords(essay)
  const remainingBudget = () => Math.max(8_000, deadlineAt - Date.now())

  const minExpected = estimateMinimumCitableSentences(essay)
  const hasFactCues = /\d/.test(essay) || minExpected > 0
  const likelyNeedsCitations = minExpected >= 2 || (words >= 400 && hasFactCues && minExpected >= 1)
  const underRecalled =
    sentences.length < Math.max(3, Math.floor(minExpected * 0.45)) && minExpected >= 4

  // Skip compact retry when empty is the correct answer (opinion / no fact cues).
  if (
    !options.skipCompactRetry &&
    ((sentences.length === 0 && likelyNeedsCitations) || underRecalled)
  ) {
    console.warn(
      `[analyze] low recall (${sentences.length}/${minExpected} expected); compact retry`,
    )
    const compact = await retryCompactSentenceAnalyze(
      essay,
      settings,
      Math.min(phaseASinglePassTimeoutMs(deadlineAt), remainingBudget()),
    )
    if (compact.length > sentences.length) {
      sentences = compact
    }
  }

  // LLM paths timed out / under-recalled: deterministic fact spans beat a hard fail.
  if (
    likelyNeedsCitations &&
    (sentences.length === 0 || sentences.length < Math.max(4, Math.floor(minExpected * 0.35)))
  ) {
    const heuristic = heuristicExtractFactSentences(essay, settings)
    if (heuristic.length > sentences.length) {
      console.warn(
        `[analyze] heuristic fact extract recovered ${heuristic.length} sentences (was ${sentences.length})`,
      )
      sentences = heuristic
    }
  }

  // Opinion / no-fact drafts: empty is success even if model reasoning is chatty.
  if (sentences.length === 0 && minExpected === 0 && !/\d/.test(essay)) {
    const reasoning = (identify.reasoning ?? '').trim()
    const publicReasoning =
      reasoning && !/compact retry|incomplete model reply/i.test(reasoning) ? reasoning : ''
    return {
      sentences: [],
      medical: flags.medical,
      legal: flags.legal,
      reasoning: publicReasoning,
    }
  }

  // Never return a false empty cite list when the draft clearly needs citations.
  // Do not use bare word-count alone — long opinion drafts can exceed 200 words.
  if (
    sentences.length === 0 &&
    (minExpected >= 2 ||
      likelyNeedsCitations ||
      reasoningImpliesCitations(identify.reasoning ?? ''))
  ) {
    throw new Error("We couldn't finish analysis. Try again in a moment.")
  }

  if (sentences.length > 0) {
    console.info(`[analyze] Phase B enriching ${sentences.length} sentences`)
    const enrichDeadline = Math.min(deadlineAt, Date.now() + PHASE_B_SOFT_BUDGET_MS)
    sentences = await enrichAnalyzedSentences(sentences, enrichDeadline)
  }

  const reasoning = (identify.reasoning ?? '').trim()
  const publicReasoning =
    reasoning && !/compact retry|incomplete model reply/i.test(reasoning) ? reasoning : ''

  return {
    sentences,
    medical: flags.medical,
    legal: flags.legal,
    reasoning: publicReasoning,
  }
}

/**
 * Chunk Phase A: compact-first (short prompt that reliably returns JSON).
 * Lean identify is kept for whole-essay / non-chunk paths only — on chunks it
 * often timed out or returned prose while burning the whole per-chunk budget.
 */
async function runChunkIdentifyPass(
  chunk: string,
  settings: GenerationSettings,
  timeoutMs: number,
): Promise<IdentifyResult> {
  const compact = await retryCompactSentenceAnalyze(chunk, settings, timeoutMs)
  if (compact.length > 0) {
    return {
      medical: false,
      legal: false,
      reasoning: '',
      sentences: compact.map((s, i) => ({
        index: i,
        text: s.text,
        sentence: s.text,
        claimType: s.claimType,
        claim: s.claim,
        reason: s.reason,
        existingCitation: s.existingCitation,
      })),
    }
  }

  // Compact empty: one short lean identify retry before giving up on this chunk.
  const leanMs = Math.min(timeoutMs, Math.max(20_000, Math.floor(timeoutMs * 0.45)))
  return runIdentifyPass(chunk, settings, leanMs)
}

async function analyzeEssayChunked(
  essay: string,
  settings: GenerationSettings,
  deadlineAt: number,
): Promise<EssayAnalysis> {
  const chunks = splitEssayIntoWordChunks(essay, ANALYZE_CHUNK_WORDS)
  const concurrency = ANALYZE_CHUNK_CONCURRENCY
  const phaseATimeoutMs = phaseAChunkTimeoutMs(chunks.length, concurrency, deadlineAt)
  const waves = phaseAWaveCount(chunks.length, concurrency)
  console.info(
    `[analyze] Phase A chunking into ${chunks.length} parts (${concurrency} parallel, ${waves} waves, ${Math.round(phaseATimeoutMs / 1000)}s/chunk)`,
  )

  const words = countWords(essay)
  const compactTimeout = phaseASinglePassTimeoutMs(deadlineAt)
  // Whole-essay compact only for shorter drafts; long essays use per-chunk compact fallback.
  const compactPromise =
    words > 2800
      ? Promise.resolve([] as AnalyzedSentence[])
      : retryCompactSentenceAnalyze(essay, settings, compactTimeout)

  const chunkResults = await mapWithConcurrency(chunks, concurrency, async (chunk) => {
    try {
      return await runChunkIdentifyPass(chunk, settings, phaseATimeoutMs)
    } catch (err) {
      console.warn(
        '[analyze] chunk identify failed:',
        err instanceof Error ? err.message : err,
      )
      return {
        medical: false,
        legal: false,
        reasoning: '',
        sentences: [],
      } satisfies IdentifyResult
    }
  })

  const seen = new Set<string>()
  const mergedSentences: Array<z.infer<typeof leanSentenceSchema>> = []
  for (const result of chunkResults) {
    for (const sentence of result.sentences) {
      const key = (sentence.text ?? sentence.sentence ?? '').trim().toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      mergedSentences.push(sentence)
    }
  }

  const compactSentences = await compactPromise
  const minExpected = estimateMinimumCitableSentences(essay)
  let bestSentences = mergedSentences
  if (compactSentences.length > mergedSentences.length) {
    console.info(
      `[analyze] parallel compact won (${compactSentences.length} vs ${mergedSentences.length} chunked)`,
    )
    bestSentences = compactSentences.map((s, i) => ({
      index: i,
      text: s.text,
      sentence: s.text,
      claimType: s.claimType,
      claim: s.claim,
      reason: s.reason,
      existingCitation: s.existingCitation,
    }))
  } else if (
    mergedSentences.length < Math.max(4, Math.floor(minExpected * 0.4)) &&
    compactSentences.length > 0
  ) {
    console.info(
      `[analyze] merging chunk+compact (chunk ${mergedSentences.length}, compact ${compactSentences.length})`,
    )
    for (const s of compactSentences) {
      const key = s.text.trim().toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      mergedSentences.push({
        index: mergedSentences.length,
        text: s.text,
        sentence: s.text,
        claimType: s.claimType,
        claim: s.claim,
        reason: s.reason,
        existingCitation: s.existingCitation,
      })
    }
    bestSentences = mergedSentences
  }

  const merged: IdentifyResult = {
    medical: chunkResults.some((r) => r.medical === true),
    legal: chunkResults.some((r) => r.legal === true),
    reasoning: '',
    sentences: bestSentences,
  }

  // Skip sequential compact in finalize when we already raced it.
  return finalizeFromIdentify(essay, settings, merged, deadlineAt, {
    skipCompactRetry: true,
  })
}

export interface AnalyzeEssayOptions {
  /** When true, Pro drafts above the chunk threshold use parallel paragraph identify. */
  allowChunked?: boolean
}

export async function analyzeEssayForCitations(
  essay: string,
  settings: GenerationSettings,
  options: AnalyzeEssayOptions = {},
): Promise<EssayAnalysis> {
  const words = countWords(essay)
  const deadlineAt = Date.now() + ANALYZE_ROUTE_BUDGET_MS
  const remainingBudget = () => Math.max(15_000, deadlineAt - Date.now())

  try {
    if (options.allowChunked && words > ANALYZE_CHUNK_WORD_THRESHOLD) {
      return await analyzeEssayChunked(essay, settings, deadlineAt)
    }

    const identify = await runIdentifyPass(essay, settings, phaseASinglePassTimeoutMs(deadlineAt))
    return await finalizeFromIdentify(essay, settings, identify, deadlineAt)
  } catch (err) {
    console.warn(
      '[analyze] primary path failed, last-resort compact:',
      err instanceof Error ? err.message : err,
    )
    const compact = await retryCompactSentenceAnalyze(
      essay,
      settings,
      Math.min(phaseASinglePassTimeoutMs(deadlineAt), remainingBudget()),
    )
    if (compact.length > 0) {
      const flags = resolveSubjectFlags(essay, false, false)
      const enriched = await enrichAnalyzedSentences(compact, deadlineAt)
      return {
        sentences: enriched,
        medical: flags.medical,
        legal: flags.legal,
        reasoning: '',
      }
    }
    // Opinion / no-fact drafts: empty list is success, not a hard fail.
    const minExpected = estimateMinimumCitableSentences(essay)
    if (minExpected < 2 && !/\d/.test(essay)) {
      return {
        sentences: [],
        medical: false,
        legal: false,
        reasoning: '',
      }
    }
    const heuristic = heuristicExtractFactSentences(essay, settings)
    if (heuristic.length > 0) {
      console.warn(`[analyze] last-resort heuristic extract: ${heuristic.length} sentences`)
      const flags = resolveSubjectFlags(essay, false, false)
      const enrichDeadline = Math.min(deadlineAt, Date.now() + 45_000)
      const enriched = await enrichAnalyzedSentences(heuristic, enrichDeadline)
      return {
        sentences: enriched,
        medical: flags.medical,
        legal: flags.legal,
        reasoning: '',
      }
    }
    throw new Error("We couldn't finish analysis. Try again in a moment.")
  }
}

export async function extractClaimQuery(
  sentence: string,
  options?: { timeoutMs?: number },
): Promise<ClaimQuery> {
  const mem = getClaimQueryFromMemory(sentence)
  if (mem) return mem

  const cached = await getCachedClaimQuery(sentence)
  if (cached) return cached

  try {
    const result = await completeStructured(
      claimQuerySchema,
      [
        {
          role: 'user',
          content: `Extract searchable claim metadata from this essay sentence so we can find supporting academic/web sources.

Sentence:
"""
${sentence}
"""`,
        },
      ],
      {
        system: EXTRACT_CLAIM_QUERY_SYSTEM,
        temperature: 0.15,
        maxTokens: 900,
        timeoutMs: options?.timeoutMs,
        structuredMode: 'fast',
      },
    )
    const sanitized = polishClaimQuery({
      ...result,
      claim: stripEssaySpecificFromQuery(result.claim, result.entities) || result.claim,
      keywords: result.keywords.filter((k) => !isLikelyEssaySpecificEntity(k)),
      academicQuery:
        stripEssaySpecificFromQuery(result.academicQuery, result.entities) || result.academicQuery,
      webQuery: stripEssaySpecificFromQuery(result.webQuery, result.entities) || result.webQuery,
      embeddingFocus:
        stripEssaySpecificFromQuery(result.embeddingFocus, result.entities) || result.embeddingFocus,
    })
    if (sanitized.keywords.length === 0) {
      sanitized.keywords = result.keywords.slice(0, 8)
    }
    return putCachedClaimQuery(sentence, sanitized)
  } catch {
    const fallbackKeywords = sentence
      .replace(/[^\p{L}\p{N}\s%-]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 8)
    const query = fallbackKeywords.join(' ') || sentence.slice(0, 120)
    return putCachedClaimQuery(
      sentence,
      polishClaimQuery({
        claim: sentence.trim(),
        keywords: fallbackKeywords.length ? fallbackKeywords : [sentence.slice(0, 40)],
        entities: [],
        dataPoints: [],
        academicQuery: query,
        webQuery: query,
        embeddingFocus: sentence.trim(),
      }),
    )
  }
}

export const verifySchema = z.object({
  matches: z.boolean(),
  confidence: z.number().min(0).max(1),
  supportsClaim: z.boolean(),
  evidenceSnippet: z.string().optional(),
  correction: z.string().optional(),
  rationale: z.string().optional(),
})

export type SourceVerification = z.infer<typeof verifySchema>

export async function verifySentenceAgainstSource(input: {
  sentence: string
  claim?: string
  keywords?: string[]
  entities?: string[]
  dataPoints?: string[]
  placeEntities?: string[]
  sourceTitle: string
  sourceAuthors?: string
  sourceVenue?: string
  sourceYear?: string
  sourceAbstract?: string
  sourceHighlights?: string[]
  suggestCorrections: boolean
}): Promise<SourceVerification> {
  const highlights = (input.sourceHighlights ?? []).filter(Boolean).slice(0, 3).join('\n- ')
  const places = input.placeEntities?.length
    ? input.placeEntities
    : (input.entities ?? []).filter((e) =>
        /\b(hong kong|china|japan|usa|united states|uk|europe|asia)\b/i.test(e),
      )
  // Essay-only brands must not be treated as required match entities.
  const entities = (input.entities ?? [])
    .map((e) => e.trim())
    .filter(Boolean)
    .filter((e) => !isLikelyEssaySpecificEntity(e))
    .slice(0, 6)
  const claim = (input.claim ?? input.sentence).trim()
  const abstract = (input.sourceAbstract ?? '').trim()

  // Order for implicit caching across candidate sources for the same sentence:
  // system (static) → claim context (stable per sentence) → source payload (unique, last).
  try {
    const raw = await completeStructured(
      verifySchema,
      [
        {
          role: 'user',
          content: `Suggestions enabled: ${input.suggestCorrections ? 'true' : 'false'}

Claim restatement (PRIMARY — judge support against this):
"""
${claim}
"""

Essay sentence (context only; ignore brand/project packaging when judging support):
"""
${input.sentence}
"""

Keywords: ${(input.keywords ?? []).slice(0, 8).join(', ') || 'n/a'}
Public entities to respect (not essay-only brands): ${entities.length ? entities.join(', ') : 'none'}
Required place context: ${places.length ? places.join(', ') : 'none'}
Data points to check: ${(input.dataPoints ?? []).slice(0, 6).join('; ') || 'none'}

Source title: ${input.sourceTitle}
Authors: ${input.sourceAuthors ?? 'Unknown'}
Venue: ${input.sourceVenue ?? 'Unknown'}
Year: ${input.sourceYear ?? 'Unknown'}
Abstract/excerpt${abstract ? '' : ' (empty — you may still match from a clearly on-point title + venue)'}:
"""
${abstract.slice(0, 1200) || '(none provided)'}
"""
${highlights ? `Highlights:\n- ${highlights}` : ''}`,
        },
      ],
      {
        system: VERIFY_SOURCE_SYSTEM,
        temperature: 0.1,
        maxTokens: 800,
      },
    )
    return raw
  } catch {
    return {
      matches: false,
      confidence: 0,
      supportsClaim: false,
      evidenceSnippet: undefined,
      correction: undefined,
      rationale: 'Verification skipped due to a model response error.',
    }
  }
}

/** Second-pass confirmation after an initial match. */
export async function confirmSourceMatch(input: {
  sentence: string
  claim: string
  sourceTitle: string
  sourceAbstract?: string
  evidenceSnippet?: string | null
  firstRationale?: string
}): Promise<{ confirmed: boolean; confidence: number; rationale?: string }> {
  const schema = z.object({
    confirmed: z.boolean(),
    confidence: z.number().min(0).max(1),
    rationale: z.string().optional(),
  })

  try {
    return await completeStructured(
      schema,
      [
        {
          role: 'user',
          content: `Second verification: does this source reliably support the transferable claim?

Claim (PRIMARY):
"""
${input.claim}
"""

Essay sentence (context only; brand packaging does not need to appear in the source):
"""
${input.sentence}
"""

Source: ${input.sourceTitle}
Evidence used: ${input.evidenceSnippet ?? 'n/a'}
Prior rationale: ${input.firstRationale ?? 'n/a'}
Source excerpt:
"""
${(input.sourceAbstract ?? '').slice(0, 800) || '(none provided)'}
"""`,
        },
      ],
      {
        system: CONFIRM_MATCH_SYSTEM,
        temperature: 0.1,
        maxTokens: 400,
      },
    )
  } catch {
    return { confirmed: true, confidence: 0.5, rationale: 'Confirmation skipped due to model error' }
  }
}
