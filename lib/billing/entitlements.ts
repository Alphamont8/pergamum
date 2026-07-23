import type { GenerationSettings, PlanTier, ReferencingStyleId, SourceRecency } from '@/types'
import { normalizePlanTier, BASIC_MAX_WORDS } from '@/lib/billing/plans'
import {
  BASIC_REFERENCING_STYLE_IDS,
  isBasicReferencingStyle,
  isKnownReferencingStyle,
  normalizeReferencingStyleId,
} from '@/utils/referencingStyle'

export interface CitationEntitlements {
  planTier: PlanTier
  allowSuggestions: boolean
  /** Pro-only medical database (medicine/health essays). */
  allowPubMed: boolean
  /** Pro-only US legal database (law/policy essays). */
  allowLegalDatabase: boolean
  /** Perplexity Search — primary web discovery (Basic + Pro). */
  allowPerplexity: boolean
  /** Exa /search — real-time web fallback after Perplexity (Pro only). */
  allowExaSearch: boolean
  /** Full style catalog (Chicago, IEEE, niche styles…). Basic keeps APA / MLA / Harvard. */
  allowProStyles: boolean
  /** Recency filters other than "any". */
  allowRecencyFilters: boolean
  /** Word / PDF / BibTeX / RIS export from the library. */
  allowExport: boolean
  /** Re-run a single sentence in Generation Theater. */
  allowSentenceRetry: boolean
  /** Soft composer word cap for Basic (null = unlimited on Pro). */
  maxWords: number | null
}

export function entitlementsForPlan(planTier: PlanTier): CitationEntitlements {
  const pro = planTier === 'pro'
  return {
    planTier,
    allowSuggestions: pro,
    allowPubMed: pro,
    allowLegalDatabase: pro,
    allowPerplexity: true,
    allowExaSearch: pro,
    allowProStyles: pro,
    allowRecencyFilters: pro,
    allowExport: pro,
    allowSentenceRetry: pro,
    maxWords: pro ? null : BASIC_MAX_WORDS,
  }
}

export async function getUserCitationEntitlements(userId: string): Promise<CitationEntitlements> {
  const { syncExpiredProFeaturesTrial } = await import('@/lib/billing/proTrial')
  const planTier = await syncExpiredProFeaturesTrial(userId)
  return entitlementsForPlan(normalizePlanTier(planTier))
}

export function applyCitationEntitlements(
  settings: GenerationSettings,
  entitlements: CitationEntitlements,
): GenerationSettings {
  return {
    ...settings,
    styleId: clampStyleForPlan(settings.styleId, entitlements),
    recency: clampRecencyForPlan(settings.recency, entitlements),
    suggestCorrections: entitlements.allowSuggestions && settings.suggestCorrections,
  }
}

export function clampStyleForPlan(
  styleId: ReferencingStyleId,
  entitlements: CitationEntitlements,
): ReferencingStyleId {
  const normalized = normalizeReferencingStyleId(styleId)
  if (!isKnownReferencingStyle(normalized)) return 'apa'
  if (entitlements.allowProStyles) return normalized
  if (isBasicReferencingStyle(normalized)) return normalized
  return BASIC_REFERENCING_STYLE_IDS[0]
}

export function clampRecencyForPlan(
  recency: SourceRecency,
  entitlements: CitationEntitlements,
): SourceRecency {
  if (entitlements.allowRecencyFilters) return recency
  return 'any'
}

export function countWords(text: string): number {
  const t = text.trim()
  if (!t) return 0
  return t.split(/\s+/).filter(Boolean).length
}

export function isOverWordLimit(text: string, entitlements: CitationEntitlements): boolean {
  if (entitlements.maxWords == null) return false
  return countWords(text) > entitlements.maxWords
}
