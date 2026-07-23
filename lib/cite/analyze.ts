import { z } from 'zod'
import { completeStructured } from '@/lib/ai/provider'
import { locateSentenceInEssay } from '@/lib/essay/alignSentences'
import {
  ANALYZE_ESSAY_SYSTEM,
  CONFIRM_MATCH_SYSTEM,
  EXTRACT_CLAIM_QUERY_SYSTEM,
  VERIFY_SOURCE_SYSTEM,
} from '@/lib/ai/prompts'
import type { GenerationSettings } from '@/types'
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
  return {
    ...raw,
    index: raw.index ?? position,
    ...(text ? { text, sentence: raw.sentence ?? text } : {}),
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

/** Minimal schema used when the full analysis JSON is truncated or malformed. */
const leanAnalyzeSchema = z.object({
  medical: z.preprocess((v) => v === true || v === 'true', z.boolean()).default(false),
  legal: z.preprocess((v) => v === true || v === 'true', z.boolean()).default(false),
  reasoning: z.preprocess((v) => (typeof v === 'string' ? v : ''), z.string()).default(''),
  sentences: z.preprocess(
    preprocessSentenceList,
    z.array(
    z.object({
      index: z.preprocess((val) => {
        if (typeof val === 'string' && val.trim()) return Number(val)
        return val
      }, z.number().int().nonnegative()),
      text: optionalNonEmptyString,
      sentence: optionalNonEmptyString,
      claim: z.string().optional(),
      claimType: claimTypeField.default('mixed'),
      reason: z.string().optional(),
      existingCitation: existingCitationSchema,
    }),
    ),
  ),
})

const compactSentenceListSchema = z.object({
  sentences: z.preprocess(
    preprocessSentenceList,
    z.array(
      z.object({
        index: z.preprocess((val) => {
          if (typeof val === 'string' && val.trim()) return Number(val)
          return val
        }, z.number().int().nonnegative()),
        text: z.string().min(1),
        claimType: claimTypeField.default('mixed'),
        claim: z.string().optional(),
      }),
    ),
  ),
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

/** Build ClaimQuery from analyze sentence fields when present. */
export function claimQueryFromAnalyzed(sentence: AnalyzedSentence): ClaimQuery | null {
  const claim = sentence.claim?.trim()
  const entities = (sentence.entities ?? []).map((e) => e.trim()).filter(Boolean).slice(0, 8)
  const academicQuery = stripEssaySpecificFromQuery(sentence.academicQuery?.trim() ?? '', entities)
  const webQuery = stripEssaySpecificFromQuery(sentence.webQuery?.trim() ?? '', entities)
  const questionQuery = stripEssaySpecificFromQuery(sentence.questionQuery?.trim() ?? '', entities)
  const semanticQuery = stripEssaySpecificFromQuery(sentence.semanticQuery?.trim() ?? '', entities)
  const keywords = (sentence.keywords ?? [])
    .map((k) => k.trim())
    .filter(Boolean)
    .filter((k) => !entities.some((e) => isLikelyEssaySpecificEntity(e) && e.toLowerCase() === k.toLowerCase()))
  if (!claim || !academicQuery || !webQuery || keywords.length === 0) return null
  return {
    claim: stripEssaySpecificFromQuery(claim, entities) || claim,
    keywords: keywords.slice(0, 12),
    entities: entities.slice(0, 8),
    dataPoints: (sentence.dataPoints ?? []).slice(0, 8),
    academicQuery,
    webQuery,
    embeddingFocus:
      stripEssaySpecificFromQuery(sentence.embeddingFocus?.trim() || claim, entities) || claim,
    questionQuery: questionQuery || undefined,
    semanticQuery: semanticQuery || undefined,
  }
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
  return {
    medical: medicalHits >= 2 && medicalHits >= legalHits,
    legal: legalHits >= 2 && legalHits > medicalHits,
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
  raw: z.infer<typeof sentenceAnalyzeSchema>,
): string | null {
  const candidates = [raw.text, raw.sentence, raw.claim].filter(
    (v): v is string => typeof v === 'string' && v.trim().length > 0,
  )
  for (const candidate of candidates) {
    const located = locateSentenceInEssay(essay, candidate)
    if (located) return located
    if (essay.includes(candidate.trim())) return candidate.trim()
  }
  // Prefer a located span; only fall back to raw claim text when nothing maps to the essay.
  return null
}

function materializeAnalyzedSentences(
  essay: string,
  rawSentences: Array<z.infer<typeof sentenceAnalyzeSchema>>,
  settings: GenerationSettings,
): AnalyzedSentence[] {
  const sentences: AnalyzedSentence[] = []
  for (const s of rawSentences) {
    const text = recoverSentenceText(essay, s)
    if (!text) continue
    const claimType = preferNewsClaimType(
      normalizeClaimType(s.claimType, settings.sourceTier),
      text,
      settings.sourceTier,
    )
    const existingCitation = mergeExistingCitation(s.existingCitation ?? null, text)
    const normalized: AnalyzedSentence = {
      ...s,
      text,
      claimType,
      existingCitation: existingCitation ?? s.existingCitation ?? null,
    }
    const cq = claimQueryFromAnalyzed(normalized)
    if (cq) seedClaimQuery(text, cq)
    sentences.push(normalized)
  }
  return sentences
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

  const compact = await completeStructured(
    compactSentenceListSchema,
    [{ role: 'user', content: userContent }],
    {
      system: `You identify essay sentences that need citations. Return JSON only:
{ "sentences": [ { "index": 0, "text": "<exact sentence copied from the essay>" } ] }

Rules:
- Copy each sentence exactly from the essay (same wording and punctuation).
- Include every evidence-backed factual claim; skip opinions, plans, and thesis framing.
- Do not paraphrase. Do not add fields beyond index and text.`,
      temperature: 0.1,
      maxTokens: 4096,
      timeoutMs,
      structuredMode: 'fast',
    },
  )

  return materializeAnalyzedSentences(essay, compact.sentences, settings)
}

<<<<<<< HEAD
/** Pro long drafts: split before a single LLM call times out or truncates JSON output. */
const ANALYZE_CHUNK_WORDS = 1800
const ANALYZE_CHUNK_CONCURRENCY = 2

type AnalyzeLlmResult = z.infer<typeof analyzeSchema>

function splitEssayIntoWordChunks(essay: string, maxWords: number): string[] {
  const paragraphs = essay.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  if (paragraphs.length === 0) return [essay]

  const chunks: string[] = []
  let current: string[] = []
  let currentWords = 0

  for (const paragraph of paragraphs) {
    const paragraphWords = paragraph.split(/\s+/).filter(Boolean).length
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
  return chunks.length ? chunks : [essay]
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await fn(items[index])
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  )
  return results
}

function buildAnalyzeUserContent(essay: string, settings: GenerationSettings): string {
  return `Settings:
=======
/** Longer drafts emit large claim-metadata JSON and routinely blow past short function budgets. */
const LEAN_ANALYZE_CHAR_THRESHOLD = 2800
const FULL_ANALYZE_TIMEOUT_MS = 75_000
const LEAN_ANALYZE_TIMEOUT_MS = 110_000
const COMPACT_ANALYZE_TIMEOUT_MS = 45_000

export async function analyzeEssayForCitations(
  essay: string,
  settings: GenerationSettings,
): Promise<EssayAnalysis> {
  const userContent = `Settings:
>>>>>>> a7902279dce75fd6bd1853c925805933bc43fb98
- Prefer academic sources: ${settings.sourceTier === 'academic' ? 'yes, academic only' : 'academic preferred but news/web ok'}
- Recency preference: ${settings.recency}

Essay:
"""
${essay}
"""`
}

async function runAnalyzeLlm(essay: string, settings: GenerationSettings): Promise<AnalyzeLlmResult> {
  const userContent = buildAnalyzeUserContent(essay, settings)

<<<<<<< HEAD
  try {
    return await completeStructured(
      analyzeSchema,
      [{ role: 'user', content: userContent }],
      {
        system: ANALYZE_ESSAY_SYSTEM,
        temperature: 0.2,
        maxTokens: 8192,
      },
    )
  } catch (fullErr) {
    console.warn(
      '[analyze] full schema failed, trying lean schema:',
      fullErr instanceof Error ? fullErr.message : fullErr,
    )
=======
  const preferLean = essay.length >= LEAN_ANALYZE_CHAR_THRESHOLD
  let result: z.infer<typeof analyzeSchema> | null = null

  if (!preferLean) {
    try {
      // Fast single-shot: claim metadata helps generate, but retries burn the whole budget.
      result = await completeStructured(
        analyzeSchema,
        [{ role: 'user', content: userContent }],
        {
          system: ANALYZE_ESSAY_SYSTEM,
          temperature: 0.2,
          maxTokens: 8192,
          timeoutMs: FULL_ANALYZE_TIMEOUT_MS,
          structuredMode: 'fast',
        },
      )
    } catch (fullErr) {
      console.warn(
        '[analyze] full schema failed, trying lean schema:',
        fullErr instanceof Error ? fullErr.message : fullErr,
      )
    }
  } else {
    console.info('[analyze] long draft — using lean schema first')
  }

  if (!result) {
>>>>>>> a7902279dce75fd6bd1853c925805933bc43fb98
    const lean = await completeStructured(
      leanAnalyzeSchema,
      [{ role: 'user', content: userContent }],
      {
        system: `${ANALYZE_ESSAY_SYSTEM}

If output length is a concern, prefer a compact JSON shape: medical, legal, reasoning, and sentences with index, text, claimType, claim, reason only.`,
        temperature: 0.15,
        maxTokens: 4096,
        timeoutMs: LEAN_ANALYZE_TIMEOUT_MS,
        structuredMode: preferLean ? 'full' : 'fast',
      },
    )
    return {
      medical: lean.medical,
      legal: lean.legal,
      reasoning: lean.reasoning,
      sentences: lean.sentences,
    }
  }
}

async function finalizeEssayAnalysis(
  essay: string,
  settings: GenerationSettings,
  result: AnalyzeLlmResult,
): Promise<EssayAnalysis> {
  const inferred = inferSubjectFlags(essay)
  let sentences = materializeAnalyzedSentences(essay, result.sentences, settings)

  if (sentences.length === 0 && reasoningImpliesCitations(result.reasoning ?? '')) {
    console.warn('[analyze] reasoning implies citations but sentence list was empty; retrying compact list')
    sentences = await retryCompactSentenceAnalyze(essay, settings, COMPACT_ANALYZE_TIMEOUT_MS)
  }

  if (sentences.length === 0 && reasoningImpliesCitations(result.reasoning ?? '')) {
    throw new Error(
      "We found claims in your draft but couldn't match them to sentences. Try again or shorten your draft.",
    )
  }

  void Promise.all(
    sentences.map(async (s) => {
      const cq = claimQueryFromAnalyzed(s)
      if (cq) await putCachedClaimQuery(s.text, cq)
    }),
  )

  return {
    sentences,
    medical: result.medical === true || inferred.medical,
    legal: result.legal === true || inferred.legal,
    reasoning: (result.reasoning ?? '').trim(),
  }
}

async function analyzeEssayChunked(
  essay: string,
  settings: GenerationSettings,
): Promise<EssayAnalysis> {
  const chunks = splitEssayIntoWordChunks(essay, ANALYZE_CHUNK_WORDS)
  console.info(`[analyze] chunking long essay into ${chunks.length} parts`)

  const chunkResults = await mapWithConcurrency(chunks, ANALYZE_CHUNK_CONCURRENCY, (chunk) =>
    runAnalyzeLlm(chunk, settings),
  )

  const seen = new Set<string>()
  const mergedSentences: Array<z.infer<typeof sentenceAnalyzeSchema>> = []
  for (const result of chunkResults) {
    for (const sentence of result.sentences) {
      const key = (sentence.text ?? sentence.sentence ?? '').trim().toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      mergedSentences.push(sentence)
    }
  }

  const merged: AnalyzeLlmResult = {
    medical: chunkResults.some((r) => r.medical === true),
    legal: chunkResults.some((r) => r.legal === true),
    reasoning: chunkResults
      .map((r) => (r.reasoning ?? '').trim())
      .filter(Boolean)
      .join('\n\n'),
    sentences: mergedSentences,
  }

  return finalizeEssayAnalysis(essay, settings, merged)
}

export interface AnalyzeEssayOptions {
  /** When true, long Pro drafts are analyzed in paragraph chunks (parallel). */
  allowChunked?: boolean
}

export async function analyzeEssayForCitations(
  essay: string,
  settings: GenerationSettings,
  options: AnalyzeEssayOptions = {},
): Promise<EssayAnalysis> {
  const words = essay.trim().split(/\s+/).filter(Boolean).length
  if (options.allowChunked && words > ANALYZE_CHUNK_WORDS) {
    return analyzeEssayChunked(essay, settings)
  }

  const result = await runAnalyzeLlm(essay, settings)
  return finalizeEssayAnalysis(essay, settings, result)
}

export async function extractClaimQuery(sentence: string): Promise<ClaimQuery> {
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
      },
    )
    const sanitized: ClaimQuery = {
      ...result,
      claim: stripEssaySpecificFromQuery(result.claim, result.entities) || result.claim,
      keywords: result.keywords.filter((k) => !isLikelyEssaySpecificEntity(k)),
      academicQuery:
        stripEssaySpecificFromQuery(result.academicQuery, result.entities) || result.academicQuery,
      webQuery: stripEssaySpecificFromQuery(result.webQuery, result.entities) || result.webQuery,
      embeddingFocus:
        stripEssaySpecificFromQuery(result.embeddingFocus, result.entities) || result.embeddingFocus,
    }
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
    return putCachedClaimQuery(sentence, {
      claim: sentence.trim(),
      keywords: fallbackKeywords.length ? fallbackKeywords : [sentence.slice(0, 40)],
      entities: [],
      dataPoints: [],
      academicQuery: query,
      webQuery: query,
      embeddingFocus: sentence.trim(),
    })
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
