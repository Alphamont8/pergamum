import type { PreferenceSelectOption } from '@/constants/preferenceOptions'
import { getSourceRefQuotes } from '@/lib/source-ref-quotes'
import type {
  DraftSection,
  DraftSuggestion,
  DraftToolKind,
  DraftToolState,
  EssayBlueprint,
  EssayState,
  OutlineNode,
  SourceRecord,
} from '@/types'
import { buildOutlineTree } from '@/state/essayInitial'

export function htmlToPlainText(html: string): string {
  if (!html.trim()) return ''
  if (typeof document !== 'undefined') {
    const el = document.createElement('div')
    el.innerHTML = html
    return (el.textContent ?? el.innerText ?? '').replace(/\s+/g, ' ').trim()
  }
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function findTextRangeInContent(
  content: string,
  targetText: string,
): { from: number; to: number } | null {
  const needle = targetText.trim()
  if (!needle) return null
  const idx = content.indexOf(needle)
  if (idx < 0) return null
  return { from: idx, to: idx + needle.length }
}

export function getOutlineSectionNodeId(budgetSectionId: string): string {
  return `node-${budgetSectionId}`
}

export function getSectionOutlineContext(
  sectionId: string,
  nodes: OutlineNode[],
  sources: SourceRecord[],
): string {
  const outlineSectionId = getOutlineSectionNodeId(sectionId)
  const tree = buildOutlineTree(nodes)
  const sectionNode = tree.find((n) => n.id === outlineSectionId || n.id === sectionId)
  if (!sectionNode) return '(No outline nodes for this section)'

  const lines: string[] = []
  for (const point of sectionNode.children) {
    lines.push(`Point: ${point.title}`)
    for (const sub of point.children) {
      lines.push(`  Subpoint: ${sub.title}`)
      for (const ref of sub.sourceRefs) {
        const source = sources.find((s) => s.id === ref.sourceId)
        const quotes = getSourceRefQuotes(ref)
        if (source) {
          lines.push(
            `    Source: ${source.title}${source.authors ? ` (${source.authors}` : ''}${source.year ? `, ${source.year}` : ''}${source.authors ? ')' : ''}`,
          )
        }
        for (const q of quotes) {
          lines.push(`    Quote: "${q}"`)
        }
      }
    }
  }
  return lines.length ? lines.join('\n') : '(Outline section has no points yet)'
}

export function getOpenSuggestions(
  draft: EssayState['draft'],
  sectionId?: string | null,
): DraftSuggestion[] {
  const tools = draft.tools ?? {}
  const all: DraftSuggestion[] = []
  for (const state of Object.values(tools)) {
    if (!state?.results) continue
    for (const s of state.results) {
      if (s.status !== 'open') continue
      if (sectionId && s.sectionId !== sectionId) continue
      all.push(s)
    }
  }
  return all
}

export function countSelectionWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).filter(Boolean).length
}

export const MULTIPURPOSE_TOOL_KINDS = [
  'shiftTone',
  'elevatePhrasing',
  'findSynonyms',
  'definePhrase',
] as const

const REWRITE_TOOL_KINDS: DraftToolKind[] = ['shiftTone', 'elevatePhrasing']

export function hasRewriteSessionActive(
  getToolState: (tool: DraftToolKind) => DraftToolState,
): boolean {
  return REWRITE_TOOL_KINDS.some((kind) => {
    const state = getToolState(kind)
    return state.status === 'running' || state.results.some((s) => s.status === 'open')
  })
}

export interface SelectionToolAvailabilityInput {
  hasTextSelection: boolean
  selectedText: string | null
  writingStyleOptions: PreferenceSelectOption[]
  getToolState: (tool: DraftToolKind) => DraftToolState
}

export function isSelectionToolAvailable(
  kind: DraftToolKind,
  input: SelectionToolAvailabilityInput,
): boolean {
  const { hasTextSelection, selectedText, writingStyleOptions, getToolState } = input
  if (hasRewriteSessionActive(getToolState)) return false
  if (getToolState(kind).status === 'running') return false

  if (kind === 'findSynonyms') {
    if (!hasTextSelection || !selectedText) return false
    const wc = countSelectionWords(selectedText)
    return wc >= 1 && wc <= 3
  }

  if (kind === 'shiftTone') {
    if (!hasTextSelection) return false
    return writingStyleOptions.some((o) => !o.disabled)
  }

  return hasTextSelection
}

export function countOpenSuggestions(
  draft: EssayState['draft'],
  options?: { hasTextSelection?: boolean },
): number {
  const hasSelection = options?.hasTextSelection ?? true
  return getOpenSuggestions(draft).filter((s) => {
    if (
      !hasSelection &&
      (s.tool === 'findSynonyms' || s.tool === 'definePhrase')
    ) {
      return false
    }
    return true
  }).length
}

export function createEmptyToolState(): import('@/types').DraftToolState {
  return { status: 'idle', lastRunAt: null, results: [] }
}

export function estimateReadability(text: string): {
  flesch: number
  avgSentenceLength: number
} {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim()).length || 1
  const syllables = text
    .toLowerCase()
    .split(/\s+/)
    .reduce((n, w) => n + Math.max(1, w.replace(/[^aeiou]/g, '').length), 0)
  const avgSentenceLength = words / sentences
  const flesch =
    words > 0
      ? Math.round(206.835 - 1.015 * avgSentenceLength - 84.6 * (syllables / words))
      : 0
  return { flesch: Math.max(0, Math.min(100, flesch)), avgSentenceLength: Math.round(avgSentenceLength) }
}

export function buildDraftEssayText(sections: DraftSection[]): string {
  return sections
    .map((s) => `## ${s.label}\n${s.content}`)
    .filter((block) => block.trim().length > 2)
    .join('\n\n')
}

export function buildBlueprintContext(blueprint: EssayBlueprint): string {
  const analysis = blueprint.analysis
  const parts = [
    `Title: ${blueprint.title}`,
    `Thesis: ${blueprint.thesis}`,
    `Research question: ${blueprint.researchQuestion}`,
    `Document type: ${blueprint.documentType}`,
    `Writing style: ${blueprint.writingStyle}`,
    `Tone: ${blueprint.tone}`,
    `Reading level: ${blueprint.readingLevel}`,
    `Citation style: ${blueprint.citationStyle}`,
  ]
  if (analysis) {
    parts.push(`Goals: ${analysis.goals.join('; ')}`)
    parts.push(`Boundaries: ${analysis.boundaries.join('; ')}`)
    if (analysis.rubricAlignment.length) {
      parts.push(
        `Rubric: ${analysis.rubricAlignment.map((r) => `${r.criterion} (${r.covered ? 'covered' : 'missing'})`).join('; ')}`,
      )
    }
  }
  return parts.join('\n')
}
