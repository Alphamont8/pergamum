import type { CitationStyle, ReferencingStyleId } from '../types'

export function referencingStyleToCitationStyle(id: ReferencingStyleId): CitationStyle {
  if (id === 'none') return 'APA'
  if (id.startsWith('mla') || id === 'mhra') return 'MLA'
  if (id.startsWith('harvard')) return 'Harvard'
  if (id.startsWith('chicago') || id === 'oscola') return 'Chicago'
  if (id === 'ieee' || id === 'vancouver' || id === 'bluebook' || id === 'ama') return 'Chicago'
  return 'APA'
}

/**
 * Bracket / parenthetical numeric markers in running text: [1] or (1).
 * Nature uses superscript instead; Science uses italic parentheticals.
 */
export function isBracketNumericReferencingStyle(id: ReferencingStyleId): boolean {
  return id === 'ieee' || id === 'vancouver'
}

/** Science magazine: italicized numbers in parentheses. */
export function isScienceParentheticalStyle(id: ReferencingStyleId): boolean {
  return id === 'science'
}

/**
 * Styles whose bibliography must stay in citation order (not alphabetical).
 * Includes AMA/ACS/Nature/Science, not only bracket-numeric styles.
 */
export function isCitationOrderStyle(id: ReferencingStyleId): boolean {
  return (
    id === 'ieee' ||
    id === 'vancouver' ||
    id === 'ama' ||
    id === 'acs' ||
    id === 'nature' ||
    id === 'science'
  )
}

/** @deprecated Prefer isCitationOrderStyle / isBracketNumericReferencingStyle. */
export function isNumericReferencingStyle(id: ReferencingStyleId): boolean {
  return isCitationOrderStyle(id)
}

/**
 * Superscript numbers in running text (AMA, ACS, Nature, and notes-style proxies).
 */
export function isSuperscriptReferencingStyle(id: ReferencingStyleId): boolean {
  return (
    id === 'ama' ||
    id === 'acs' ||
    id === 'nature' ||
    id === 'chicago-notes' ||
    id === 'oscola' ||
    id === 'mhra' ||
    id === 'bluebook'
  )
}

export function isNotesReferencingStyle(id: ReferencingStyleId): boolean {
  return id === 'chicago-notes' || id === 'oscola' || id === 'mhra' || id === 'bluebook'
}

export function isBluebookStyle(id: ReferencingStyleId): boolean {
  return id === 'bluebook'
}

/** True when in-text markers are numeric (any form) and need citation numbers. */
export function usesNumericInTextMarker(id: ReferencingStyleId): boolean {
  return (
    isBracketNumericReferencingStyle(id) ||
    isScienceParentheticalStyle(id) ||
    isSuperscriptReferencingStyle(id)
  )
}

export function referencingStyleHasCitations(id: ReferencingStyleId): boolean {
  return id !== 'none'
}

/** Styles available on Basic without upgrading. */
export const BASIC_REFERENCING_STYLE_IDS = ['apa', 'mla', 'harvard'] as const

export type BasicReferencingStyleId = (typeof BASIC_REFERENCING_STYLE_IDS)[number]

export interface ReferencingStyleOption {
  id: ReferencingStyleId
  label: string
  /** When true, selecting this style requires Pro. */
  proOnly: boolean
  /** Short tease shown near locked styles. */
  tease?: string
}

/**
 * Full catalog shown to every user. Basic can see Pro styles but cannot select them.
 * Order: everyday Basic styles first, then common Pro, then niche Pro.
 */
export const REFERENCING_STYLES: ReferencingStyleOption[] = [
  { id: 'apa', label: 'APA 7', proOnly: false },
  { id: 'mla', label: 'MLA 9', proOnly: false },
  { id: 'harvard', label: 'Harvard', proOnly: false },
  {
    id: 'chicago-author-date',
    label: 'Chicago (Author-Date)',
    proOnly: true,
    tease: 'History, social science, and publishing houses.',
  },
  {
    id: 'chicago-notes',
    label: 'Chicago (Notes)',
    proOnly: true,
    tease: 'Footnotes for humanities papers.',
  },
  {
    id: 'ieee',
    label: 'IEEE',
    proOnly: true,
    tease: 'Engineering and computer science.',
  },
  {
    id: 'vancouver',
    label: 'Vancouver',
    proOnly: true,
    tease: 'Medicine and life sciences.',
  },
  {
    id: 'ama',
    label: 'AMA',
    proOnly: true,
    tease: 'American Medical Association journals.',
  },
  {
    id: 'acs',
    label: 'ACS',
    proOnly: true,
    tease: 'Chemistry papers and lab reports.',
  },
  {
    id: 'asa',
    label: 'ASA',
    proOnly: true,
    tease: 'Sociology and related fields.',
  },
  {
    id: 'nature',
    label: 'Nature',
    proOnly: true,
    tease: 'Nature-family journals.',
  },
  {
    id: 'science',
    label: 'Science',
    proOnly: true,
    tease: 'Science magazine style.',
  },
  {
    id: 'mhra',
    label: 'MHRA',
    proOnly: true,
    tease: 'Modern Humanities Research Association.',
  },
  {
    id: 'oscola',
    label: 'OSCOLA',
    proOnly: true,
    tease: 'Oxford University Standard for Citation of Legal Authorities.',
  },
  {
    id: 'bluebook',
    label: 'Bluebook',
    proOnly: true,
    tease: 'US legal citation. Pairs with Pro legal search.',
  },
]

const KNOWN_IDS = new Set(REFERENCING_STYLES.map((s) => s.id))

/** Map removed styles to their closest live equivalent (saved prefs / old drafts). */
const LEGACY_STYLE_ALIASES: Record<string, ReferencingStyleId> = {
  'turabian-author-date': 'chicago-author-date',
  'turabian-notes': 'chicago-notes',
}

export function normalizeReferencingStyleId(id: string): ReferencingStyleId {
  return LEGACY_STYLE_ALIASES[id] ?? (id as ReferencingStyleId)
}

export function isKnownReferencingStyle(id: string): boolean {
  return KNOWN_IDS.has(normalizeReferencingStyleId(id))
}

export function isBasicReferencingStyle(id: string): boolean {
  return (BASIC_REFERENCING_STYLE_IDS as readonly string[]).includes(id)
}

export function styleRequiresPro(id: ReferencingStyleId, isPro: boolean): boolean {
  if (isPro) return false
  const row = REFERENCING_STYLES.find((s) => s.id === id)
  return Boolean(row?.proOnly)
}

export function labelForStyle(id: ReferencingStyleId): string {
  return REFERENCING_STYLES.find((s) => s.id === id)?.label ?? String(id)
}
