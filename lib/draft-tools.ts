import type { LucideIcon } from 'lucide-react'
import {
  BookCheck,
  BookOpen,
  FileSearch,
  Gem,
  Languages,
  ListChecks,
  PenLine,
  Wand2,
} from 'lucide-react'
import type { DraftToolKind, DraftToolScope } from '@/types'

export type DraftToolCategory = 'editing' | 'auditing'

export type DraftToolRunMode = 'essay' | 'selection'

export const SELECTION_TOOL_KINDS = [
  'shiftTone',
  'elevatePhrasing',
  'findSynonyms',
  'definePhrase',
] as const satisfies readonly DraftToolKind[]

export type SelectionToolKind = (typeof SELECTION_TOOL_KINDS)[number]

export interface DraftToolDef {
  kind: DraftToolKind
  title: string
  description: string
  category: DraftToolCategory
  runMode: DraftToolRunMode
  icon: LucideIcon
  /** Show inline highlights in the document editor for open suggestions */
  inlineHighlights?: boolean
  /** Requires a writing-style picker before running */
  requiresStylePicker?: boolean
  /** Renders synonym / antonym chips in the results list */
  showsWordAlternatives?: boolean
  /** Hide section / whole-essay scope toggle (selection tools) */
  hideScopeToggle?: boolean
  /** Grouped in the multipurpose selection-tools card above Run All Tools */
  multipurposeCard?: boolean
}

export const DRAFT_TOOL_DEFS: DraftToolDef[] = [
  {
    kind: 'evidence',
    title: 'Evidence Sourcing',
    description: 'Verifies that all claims are supported.',
    category: 'auditing',
    runMode: 'essay',
    icon: FileSearch,
    inlineHighlights: true,
  },
  {
    kind: 'goalAlignment',
    title: 'Goal Alignment',
    description: 'Checks draft against goals and rubric criteria.',
    category: 'auditing',
    runMode: 'essay',
    icon: ListChecks,
    inlineHighlights: true,
  },
  {
    kind: 'spelling',
    title: 'Spelling & Grammar',
    description: 'Check spelling, grammar, and formatting.',
    category: 'editing',
    runMode: 'essay',
    icon: BookCheck,
    inlineHighlights: true,
  },
  {
    kind: 'writingQuality',
    title: 'Writing Quality',
    description: 'Checks for structural and clarity issues.',
    category: 'editing',
    runMode: 'essay',
    icon: PenLine,
    inlineHighlights: true,
  },
  {
    kind: 'shiftTone',
    title: 'Shift Tone',
    description: 'Rewrite highlighted text in a different writing style.',
    category: 'editing',
    runMode: 'selection',
    icon: Wand2,
    requiresStylePicker: true,
    hideScopeToggle: true,
    multipurposeCard: true,
  },
  {
    kind: 'elevatePhrasing',
    title: 'Elevate Phrasing',
    description: 'Polish highlighted text while keeping your tone and style.',
    category: 'editing',
    runMode: 'selection',
    icon: Gem,
    hideScopeToggle: true,
    multipurposeCard: true,
  },
  {
    kind: 'findSynonyms',
    title: 'Find Synonyms',
    description: 'Suggest synonyms and antonyms for highlighted words.',
    category: 'editing',
    runMode: 'selection',
    icon: Languages,
    showsWordAlternatives: true,
    hideScopeToggle: true,
    multipurposeCard: true,
  },
  {
    kind: 'definePhrase',
    title: 'Define Phrase',
    description: 'Define the highlighted word or phrase in context.',
    category: 'editing',
    runMode: 'selection',
    icon: BookOpen,
    hideScopeToggle: true,
    multipurposeCard: true,
  },
]

const LEGACY_TOOL_KIND_MAP: Record<string, DraftToolKind> = {
  rubric: 'goalAlignment',
  audit: 'writingQuality',
  style: 'writingQuality',
  vocab: 'findSynonyms',
}

export function isSelectionTool(kind: DraftToolKind): kind is SelectionToolKind {
  return (SELECTION_TOOL_KINDS as readonly string[]).includes(kind)
}

export function getDraftToolDef(kind: DraftToolKind): DraftToolDef {
  const found = DRAFT_TOOL_DEFS.find((d) => d.kind === kind)
  if (!found) throw new Error(`Unknown draft tool: ${kind}`)
  return found
}

export function getMultipurposeToolDefs(): DraftToolDef[] {
  return DRAFT_TOOL_DEFS.filter((d) => d.multipurposeCard)
}

export function getDraftToolsByCategory(category: DraftToolCategory): DraftToolDef[] {
  return DRAFT_TOOL_DEFS.filter((d) => d.category === category && !d.multipurposeCard)
}

export function getDefaultToolScope(kind: DraftToolKind): DraftToolScope {
  return getDraftToolDef(kind).runMode === 'essay' ? 'essay' : 'section'
}

export function migrateDraftToolKind(kind: string): DraftToolKind {
  return (LEGACY_TOOL_KIND_MAP[kind] ?? kind) as DraftToolKind
}

export interface RunDraftToolOptions {
  targetWritingStyle?: string
  selection?: {
    sectionId: string
    start: number
    end: number
    text: string
  }
}
