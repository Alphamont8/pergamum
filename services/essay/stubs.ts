import type {
  BlueprintAnalysis,
  DraftSection,
  DraftSuggestion,
  DraftToolKind,
  EssayBlueprint,
  SourceSearchResult,
} from '../../types'
import { findTextRangeInContent } from '@/lib/draft-utils'
import { applyWordBudgetTemplate } from '../../constants/blueprintSettings'
import {
  buildInstructionsRaw,
  mockAnalyzeInstructions,
  mockProposeFromAnalysis,
  syncBlueprintResolvedFields,
} from '../../state/essayInitial'

export async function analyzeInstructions(
  blueprint: EssayBlueprint,
): Promise<{ analysis: BlueprintAnalysis; proposals: Partial<EssayBlueprint> }> {
  await delay(400)
  const synced = syncBlueprintResolvedFields(blueprint)
  const total = synced.wordLimit.max
  const analysis = mockAnalyzeInstructions(synced)
  const proposals = mockProposeFromAnalysis(synced, analysis)
  return {
    analysis,
    proposals: {
      ...proposals,
      wordBudget: applyWordBudgetTemplate(synced.documentType, total),
      frameworkGenerated: true,
      instructionsRaw: buildInstructionsRaw(synced),
    },
  }
}

export async function searchSourcesForNode(
  nodeTitle: string,
  query?: string,
): Promise<SourceSearchResult[]> {
  await delay(400)
  const topic = query?.trim() || nodeTitle.trim() || 'this topic'
  return [
    {
      title: `Academic analysis of ${topic}`,
      url: 'https://example.edu/article',
      summary: `Peer-reviewed findings supporting "${topic}" with methodological rigor (stub).`,
      type: 'secondary',
      authors: 'Smith, J. & Lee, A.',
      year: '2024',
      publisher: 'Journal of Academic Studies',
      quotes: [`"Recent scholarship on ${topic} demonstrates significant theoretical advances."`],
    },
    {
      title: `Overview: ${topic}`,
      url: 'https://example.com/overview',
      summary: `Accessible background context and key definitions for ${topic} (stub).`,
      type: 'secondary',
      authors: 'Research Institute',
      year: '2023',
      quotes: [`"${topic} remains a critical area of contemporary debate."`],
    },
    {
      title: `Primary source on ${topic}`,
      url: 'https://example.org/primary',
      summary: `Original research data directly relevant to ${topic} (stub).`,
      type: 'primary',
      authors: 'Chen, M.',
      year: '2022',
      quotes: [`"Our findings reveal novel patterns in ${topic}."`],
    },
  ]
}

export async function generateDraftSection(
  sectionLabel: string,
  blueprint: EssayBlueprint,
): Promise<string> {
  await delay(500)
  const thesis = blueprint.thesis || 'your central argument'
  return `This section (${sectionLabel}) develops ${thesis}. ` +
    `It integrates evidence from your outline and maintains a ${blueprint.tone.toLowerCase()} tone ` +
    `at ${blueprint.readingLevel.toLowerCase()} reading level. Replace this scaffold with LLM output.`
}

export async function runDraftToolStub(
  tool: DraftToolKind,
  sections: DraftSection[],
  defaultSectionId: string,
  blueprint: EssayBlueprint,
  selectedText?: string,
  targetWritingStyle?: string,
): Promise<DraftSuggestion[]> {
  await delay(400)
  const section = sections.find((s) => s.id === defaultSectionId) ?? sections[0]
  if (!section?.content.trim() && tool !== 'goalAlignment') return []

  const selectionOnly =
    tool === 'shiftTone' ||
    tool === 'elevatePhrasing' ||
    tool === 'findSynonyms' ||
    tool === 'definePhrase'
  const target =
    selectedText?.trim() ||
    (!selectionOnly
      ? section.content.split(/[.!?]/).find((s) => s.trim().length > 20)?.trim().slice(0, 80) ||
        section.content.slice(0, 60)
      : '')

  if (!target) return []

  const range = findTextRangeInContent(section.content, target)
  const style = targetWritingStyle ?? blueprint.writingStyle

  const base: DraftSuggestion = {
    id: `stub-${tool}-${Date.now()}`,
    tool,
    sectionId: section.id,
    status: 'open',
    severity:
      tool === 'spelling'
        ? 'error'
        : tool === 'shiftTone' || tool === 'elevatePhrasing'
          ? 'improvement'
          : 'warning',
    message: stubMessage(tool, blueprint, style),
    targetText: target,
    suggestion:
      tool === 'spelling'
        ? stubSpellingCorrection(target)
        : tool === 'writingQuality'
          ? stubWritingQualityRewrite(target)
          : tool === 'goalAlignment'
            ? stubGoalAlignmentRewrite(target, blueprint)
            : tool === 'shiftTone' || tool === 'elevatePhrasing'
              ? `[${style}] ${target}`
              : undefined,
    range: range ? { sectionId: section.id, from: range.from, to: range.to } : undefined,
    targetWritingStyle: tool === 'shiftTone' ? style : undefined,
  }

  if (tool === 'evidence') {
    base.sourceSuggestion = {
      title: `Supporting research on ${blueprint.title || 'this topic'}`,
      url: 'https://example.edu/stub',
      authors: 'Stub, A.',
      year: '2024',
      summary: 'Stub source suggestion for unsupported claim.',
      quote: '"Evidence supports this line of argument (stub)."',
    }
  }

  if (tool === 'findSynonyms') {
    base.alternatives = ['alternative', 'substitute', 'equivalent', 'synonym']
    base.antonyms = ['opposite', 'antonym']
  }

  if (tool === 'definePhrase') {
    base.suggestion = `A concise definition of "${target}" in this essay's context (stub).`
  }

  return [base]
}

function stubSpellingCorrection(target: string): string {
  const trimmed = target.trim()
  if (!trimmed) return trimmed
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

function stubWritingQualityRewrite(target: string): string {
  const trimmed = target.trim()
  const shortened = trimmed
    .replace(/\b(very|really|quite|basically|actually)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return shortened.length > 10 ? shortened : `${trimmed} — revised for clarity.`
}

function stubGoalAlignmentRewrite(target: string, blueprint: EssayBlueprint): string {
  const criterion = blueprint.analysis?.goals?.[0] ?? 'assignment goals'
  return `Expand this passage to more directly address ${criterion}: ${target.trim()}`
}

function stubMessage(tool: DraftToolKind, blueprint: EssayBlueprint, style: string): string {
  switch (tool) {
    case 'evidence':
      return 'This claim may need a supporting source.'
    case 'goalAlignment':
      return 'A rubric criterion may not be fully addressed.'
    case 'spelling':
      return 'Possible spelling or grammar issue.'
    case 'writingQuality':
      return 'This sentence may be a run-on or use passive voice.'
    case 'shiftTone':
      return `Rewrite in ${style} style.`
    case 'elevatePhrasing':
      return `Elevate phrasing while keeping ${blueprint.tone.toLowerCase()} tone.`
    case 'findSynonyms':
      return 'Consider these synonyms or antonyms.'
    case 'definePhrase':
      return 'Definition for the selected phrase.'
    default:
      return 'Review this passage.'
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
