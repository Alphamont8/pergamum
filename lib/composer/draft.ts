import type { GenerationSettings, ReferencingStyleId, SourceRecency, SourceTier } from '@/types'

export interface ComposerDraftDefaults {
  defaultStyle: ReferencingStyleId
  defaultInText: boolean
  defaultSuggestCorrections: boolean
  defaultRecency: SourceRecency
  defaultSourceTier: SourceTier
}

export interface ComposerDraft {
  essay: string
  settings: GenerationSettings
  /** Optional pasted source links / DOIs. */
  sourceLinks?: string
}

const STORAGE_PREFIX = 'pergamum-composer-draft'
export const COMPOSER_CLEAR_EVENT = 'pergamum:composer-clear'

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}:${userId}`
}

export function buildDefaultSettings(
  defaults: ComposerDraftDefaults,
  suggestionsAvailable: boolean,
): GenerationSettings {
  return {
    styleId: defaults.defaultStyle,
    inText: defaults.defaultInText,
    suggestCorrections: suggestionsAvailable && defaults.defaultSuggestCorrections,
    recency: defaults.defaultRecency,
    sourceTier: defaults.defaultSourceTier,
  }
}

export function settingsMatchDefaults(
  settings: GenerationSettings,
  defaults: ComposerDraftDefaults,
  suggestionsAvailable: boolean,
): boolean {
  const base = buildDefaultSettings(defaults, suggestionsAvailable)
  return (
    settings.styleId === base.styleId &&
    settings.inText === base.inText &&
    settings.suggestCorrections === base.suggestCorrections &&
    settings.recency === base.recency &&
    settings.sourceTier === base.sourceTier
  )
}

export function loadComposerDraft(userId: string): ComposerDraft | null {
  if (typeof window === 'undefined' || !userId) return null
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as ComposerDraft
    if (typeof parsed.essay !== 'string' || !parsed.settings || typeof parsed.settings !== 'object') {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function saveComposerDraft(userId: string, draft: ComposerDraft): void {
  if (typeof window === 'undefined' || !userId) return
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(draft))
  } catch {
    /* storage unavailable */
  }
}

export function clearComposerDraft(userId: string): void {
  if (typeof window === 'undefined' || !userId) return
  try {
    localStorage.removeItem(storageKey(userId))
  } catch {
    /* storage unavailable */
  }
}

export function dispatchComposerClear(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(COMPOSER_CLEAR_EVENT))
}
