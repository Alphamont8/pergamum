import {
  applyWeightsToWordTotal,
  applyWordBudgetTemplate,
  clampQuickSettingsToPlan,
  computeAutoWordLimit,
  PLAN_WORD_LIMITS,
} from '../constants/blueprintSettings'
import type {
  BlueprintAnalysis,
  CitationStyle,
  DraftDocument,
  DraftSection,
  DraftToolKind,
  DraftToolState,
  EssayBlueprint,
  EssayState,
  InstructionAttachment,
  OutlineNode,
  OutlineState,
  OutlineTreeNode,
  RubricAlignmentItem,
  SubscriptionTier,
  WordBudget,
  WordBudgetSection,
  WorkspaceContext,
} from '../types'
import { migrateDraftToolKind } from '../lib/draft-tools'
import { referencingStyleToCitationStyle } from '../utils/referencingStyle'

export const DEFAULT_CITATION_STYLE: CitationStyle = 'APA'

export function defaultWordBudget(
  total = 2000,
  documentType = 'Argumentative/Persuasive Essay',
): WordBudget {
  return applyWordBudgetTemplate(documentType, total)
}

export function createInitialQuickSettings(): EssayBlueprint['quickSettings'] {
  return {
    documentType: 'Auto',
    documentTypeIsAuto: true,
    writingStyle: 'Auto',
    writingStyleIsAuto: true,
    readingLevel: 'Auto',
    readingLevelIsAuto: true,
    referencingStyle: 'none',
    referencingStyleIsAuto: false,
  }
}

export function createInitialWordLimit(planMax = PLAN_WORD_LIMITS.Pro): EssayBlueprint['wordLimit'] {
  const { min, max } = computeAutoWordLimit({
    instructionsText: '',
    documentType: 'Argumentative/Persuasive Essay',
    planMax,
    minAuto: true,
    maxAuto: true,
  })
  return {
    min,
    max,
    minAuto: true,
    maxAuto: true,
  }
}

export function createInitialBlueprint(planMax = PLAN_WORD_LIMITS.Pro): EssayBlueprint {
  const wordLimit = createInitialWordLimit(planMax)
  const documentType = 'Argumentative/Persuasive Essay'
  return {
    instructionsText: '',
    attachments: [],
    quickSettings: createInitialQuickSettings(),
    wordLimit,
    frameworkGenerated: false,
    instructionsRaw: '',
    analysis: null,
    title: '',
    thesis: '',
    researchQuestion: '',
    wordBudget: defaultWordBudget(wordLimit.max, documentType),
    documentType,
    writingStyle: 'Analytical',
    tone: 'Analytical',
    readingLevel: 'Undergraduate',
    citationStyle: DEFAULT_CITATION_STYLE,
    referencingStyleId: 'none',
    approvedAt: null,
  }
}

export function migrateBlueprint(raw: unknown): EssayBlueprint {
  const base = createInitialBlueprint()
  if (!raw || typeof raw !== 'object') return base
  const bp = raw as Record<string, unknown>

  let attachments = (bp.attachments as InstructionAttachment[] | undefined) ?? []
  if (attachments.length === 0 && bp.attachment && typeof bp.attachment === 'object') {
    const legacy = bp.attachment as { id?: string; fileName?: string }
    attachments = [
      {
        id: legacy.id ?? `att-${Date.now()}`,
        fileName: legacy.fileName ?? 'document',
        kind: 'brief',
        extractedText: '',
        status: 'parsed',
      },
    ]
  }

  const rawBudget = (bp.wordBudget as WordBudget | undefined) ?? base.wordBudget
  const budgetTotal = rawBudget.total ?? base.wordBudget.total
  const migratedSections = rawBudget.sections.map((section) => ({
    ...section,
    weightPercent:
      typeof section.weightPercent === 'number'
        ? section.weightPercent
        : budgetTotal > 0
          ? Math.round((section.targetWords / budgetTotal) * 100)
          : 0,
  }))

  const merged: EssayBlueprint = {
    ...base,
    ...(bp as Partial<EssayBlueprint>),
    attachments,
    wordBudget: {
      total: budgetTotal,
      sections: applyWeightsToWordTotal(migratedSections, budgetTotal),
    },
    quickSettings: {
      ...base.quickSettings,
      ...(bp.quickSettings as EssayBlueprint['quickSettings']),
    },
    analysis: bp.analysis
      ? normalizeAnalysis(bp.analysis as Partial<BlueprintAnalysis>)
      : null,
  }

  return syncBlueprintResolvedFields(merged, 'Plus')
}

function normalizeAnalysis(partial: Partial<BlueprintAnalysis>): BlueprintAnalysis {
  return {
    taskWords: partial.taskWords ?? [],
    goals: partial.goals ?? [],
    boundaries: partial.boundaries ?? [],
    impliedQuestions: partial.impliedQuestions ?? [],
    suggestedStructure: partial.suggestedStructure ?? [],
    formattingRequirements: partial.formattingRequirements ?? [],
    rubricAlignment: partial.rubricAlignment ?? [],
  }
}

export function buildInstructionsRaw(blueprint: EssayBlueprint): string {
  const parts = [blueprint.instructionsText.trim()]
  for (const att of blueprint.attachments) {
    if (att.extractedText.trim()) {
      parts.push(`[${att.kind}: ${att.fileName}]\n${att.extractedText.trim()}`)
    } else if (att.fileName) {
      parts.push(`Attachment (${att.kind}): ${att.fileName}`)
    }
  }
  return parts.filter(Boolean).join('\n\n')
}

export function getAttachmentText(blueprint: EssayBlueprint): string {
  return blueprint.attachments
    .filter((a) => a.status === 'parsed')
    .map((a) => a.extractedText.trim())
    .filter(Boolean)
    .join('\n\n')
}

export function getBriefText(blueprint: EssayBlueprint): string {
  const parts = [blueprint.instructionsText.trim()]
  const attachmentText = getAttachmentText(blueprint)
  if (attachmentText) parts.push(attachmentText)
  return parts.filter(Boolean).join('\n\n')
}

export function getRubricText(blueprint: EssayBlueprint): string {
  return getAttachmentText(blueprint)
}

export function syncBlueprintResolvedFields(
  blueprint: EssayBlueprint,
  subscriptionTier: SubscriptionTier = 'Plus',
): EssayBlueprint {
  const qs = clampQuickSettingsToPlan(blueprint.quickSettings, subscriptionTier)
  const planMax = PLAN_WORD_LIMITS[subscriptionTier]

  const documentType =
    qs.documentTypeIsAuto || qs.documentType === 'Auto'
      ? blueprint.documentType || 'Argumentative/Persuasive Essay'
      : qs.documentType === 'Other'
        ? qs.documentTypeCustom?.trim() || 'Custom document'
        : qs.documentType

  const writingStyle =
    qs.writingStyleIsAuto || qs.writingStyle === 'Auto'
      ? 'Analytical'
      : qs.writingStyle === 'Expository'
        ? 'Analytical'
        : qs.writingStyle

  const readingLevel =
    qs.readingLevelIsAuto || qs.readingLevel === 'Auto' ? 'Undergraduate' : qs.readingLevel

  const refId =
    qs.referencingStyle === 'none' ||
    qs.referencingStyleIsAuto ||
    qs.referencingStyle === 'Auto'
      ? 'none'
      : qs.referencingStyle

  const citationStyle =
    refId === 'none' ? DEFAULT_CITATION_STYLE : referencingStyleToCitationStyle(refId)

  const autoLimits = computeAutoWordLimit({
    instructionsText: getBriefText(blueprint),
    documentType,
    planMax,
    minAuto: blueprint.wordLimit.minAuto,
    maxAuto: blueprint.wordLimit.maxAuto,
  })

  const min = blueprint.wordLimit.minAuto ? autoLimits.min : blueprint.wordLimit.min
  const max = blueprint.wordLimit.maxAuto
    ? Math.min(autoLimits.max, planMax)
    : Math.min(blueprint.wordLimit.max, planMax)

  const total = max
  const wordBudget =
    blueprint.wordBudget.sections.length > 0 && blueprint.frameworkGenerated
      ? { ...blueprint.wordBudget, total }
      : applyWordBudgetTemplate(documentType, total)

  return {
    ...blueprint,
    quickSettings: qs,
    documentType,
    instructionsRaw: buildInstructionsRaw(blueprint),
    writingStyle,
    readingLevel,
    referencingStyleId: refId,
    citationStyle,
    wordLimit: {
      ...blueprint.wordLimit,
      min,
      max,
    },
    wordBudget,
  }
}

export function buildOutlineTree(nodes: OutlineNode[]): OutlineTreeNode[] {
  const byParent = new Map<string | null, OutlineNode[]>()
  for (const node of nodes) {
    const key = node.parentId
    const list = byParent.get(key) ?? []
    list.push(node)
    byParent.set(key, list)
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.order - b.order)
  }

  const build = (parentId: string | null): OutlineTreeNode[] => {
    const children = byParent.get(parentId) ?? []
    return children.map((node) => ({
      ...node,
      children: build(node.id),
    }))
  }

  return build(null)
}

export function getOutlineNodeAncestors(
  nodes: OutlineNode[],
  nodeId: string,
): OutlineNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const ancestors: OutlineNode[] = []
  let current = byId.get(nodeId)
  while (current?.parentId) {
    const parent = byId.get(current.parentId)
    if (!parent) break
    ancestors.unshift(parent)
    current = parent
  }
  return ancestors
}

export function getChildTypeForParent(parentType: OutlineNode['type']): OutlineNode['type'] | null {
  if (parentType === 'section') return 'point'
  if (parentType === 'point') return 'subpoint'
  return null
}

export function getSiblingType(nodeType: OutlineNode['type']): OutlineNode['type'] {
  return nodeType
}

function createSectionWithPoints(
  sectionId: string,
  title: string,
  order: number,
  points: { title: string; subpoints?: string[] }[],
  collapsed = false,
): OutlineNode[] {
  const nodes: OutlineNode[] = [
    {
      id: sectionId,
      parentId: null,
      type: 'section',
      title,
      sourceRefs: [],
      collapsed,
      order,
    },
  ]
  points.forEach((point, pointOrder) => {
    const pointId = `${sectionId}-pt-${pointOrder}`
    nodes.push({
      id: pointId,
      parentId: sectionId,
      type: 'point',
      title: point.title,
      sourceRefs: [],
      collapsed: false,
      order: pointOrder,
    })
    ;(point.subpoints ?? []).forEach((subpoint, subOrder) => {
      nodes.push({
        id: `${pointId}-sub-${subOrder}`,
        parentId: pointId,
        type: 'subpoint',
        title: subpoint,
        sourceRefs: [],
        collapsed: false,
        order: subOrder,
      })
    })
  })
  return nodes
}

export function createInitialOutlineNodes(): OutlineNode[] {
  return [
    ...createSectionWithPoints('node-intro', 'Introduction', 0, [
      { title: 'Hook and context', subpoints: ['Establish relevance', 'Define key terms'] },
      { title: 'Thesis statement', subpoints: ['Central claim', 'Scope of argument'] },
    ]),
    ...createSectionWithPoints(
      'node-body1',
      'Body I',
      1,
      [
        { title: 'Main claim', subpoints: ['Topic sentence', 'Link to thesis'] },
        { title: 'Evidence', subpoints: ['Primary source support', 'Analysis of evidence'] },
      ],
      false,
    ),
    ...createSectionWithPoints(
      'node-body2',
      'Body II',
      2,
      [{ title: 'Counterpoint or secondary theme', subpoints: ['Acknowledge opposition', 'Rebuttal'] }],
      true,
    ),
    ...createSectionWithPoints(
      'node-body3',
      'Body III',
      3,
      [{ title: 'Synthesis', subpoints: ['Connect themes', 'Broader implications'] }],
      true,
    ),
    ...createSectionWithPoints(
      'node-conclusion',
      'Conclusion',
      4,
      [
        { title: 'Restate thesis', subpoints: ['Summarize key arguments'] },
        { title: 'Broader significance', subpoints: ['Future directions', 'Final thought'] },
      ],
      true,
    ),
  ]
}

export function createSectionNodesForBudget(
  sec: WordBudgetSection,
  order: number,
  blueprint: EssayBlueprint,
): OutlineNode[] {
  const sectionId = `node-${sec.id}`
  const isIntro = sec.label.toLowerCase().includes('intro')
  const isConclusion = sec.label.toLowerCase().includes('conclusion')
  const thesis = blueprint.thesis || 'the central argument'

  const points = isIntro
    ? [
        { title: 'Hook and context', subpoints: ['Establish relevance'] },
        { title: 'Thesis statement', subpoints: [thesis] },
      ]
    : isConclusion
      ? [
          { title: 'Restate thesis', subpoints: ['Summarize key arguments'] },
          { title: 'Broader significance', subpoints: ['Future directions'] },
        ]
      : [
          {
            title: `Develop ${thesis}`,
            subpoints: ['Topic sentence', 'Link to thesis'],
          },
          {
            title: 'Support with evidence',
            subpoints: ['Primary source', 'Analysis'],
          },
        ]

  return createSectionWithPoints(sectionId, sec.label, order, points, order > 1)
}

export function mockOutlineFromBlueprint(blueprint: EssayBlueprint): OutlineNode[] {
  return blueprint.wordBudget.sections.flatMap((sec, order) =>
    createSectionNodesForBudget(sec, order, blueprint),
  )
}

export function migrateOutlineNodes(nodes: OutlineNode[]): OutlineNode[] {
  const normalized = nodes.map((node) => {
    const rawType = node.type as string
    const type: OutlineNode['type'] =
      rawType === 'section' ? 'section' : rawType === 'subpoint' ? 'subpoint' : 'point'
    return { ...node, type }
  })

  const hasPoints = normalized.some((n) => n.type === 'point' || n.type === 'subpoint')
  if (hasPoints) return normalized

  const migrated: OutlineNode[] = []
  for (const section of normalized.filter((n) => n.parentId == null)) {
    migrated.push({ ...section, type: 'section' })
    const bullets = section.bullets ?? []
    bullets.forEach((bullet, pointOrder) => {
      const pointId = `${section.id}-pt-mig-${pointOrder}`
      migrated.push({
        id: pointId,
        parentId: section.id,
        type: 'point',
        title: bullet,
        sourceRefs: [],
        collapsed: false,
        order: pointOrder,
      })
    })
  }

  return migrated.length > 0 ? migrated : normalized
}

export function createInitialOutline(): OutlineState {
  return {
    nodes: createInitialOutlineNodes(),
    readyForDraftAt: null,
  }
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

export function contentToHtml(content: string): string {
  const trimmed = content.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('<')) return trimmed
  return trimmed
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

export function createDraftSectionsFromBudget(budget: WordBudget): DraftSection[] {
  return budget.sections.map((s) => ({
    id: s.id,
    label: s.label,
    content: '',
    html: '',
    wordCount: 0,
    highlights: [],
    status: 'empty' as const,
  }))
}

export function migrateDraftSection(section: DraftSection): DraftSection {
  const content = section.content ?? ''
  const html =
    typeof section.html === 'string' && section.html.trim()
      ? section.html
      : contentToHtml(content)
  return {
    ...section,
    content,
    html,
    wordCount: section.wordCount ?? recalcSectionWordCount(content),
  }
}

function migrateDraftTools(
  tools: DraftDocument['tools'] | undefined,
): DraftDocument['tools'] {
  if (!tools) return {}
  const migrated: Partial<Record<DraftToolKind, DraftToolState>> = {}
  for (const [key, state] of Object.entries(tools)) {
    if (!state) continue
    const kind = migrateDraftToolKind(key)
    const remappedResults = state.results.map((r) => ({ ...r, tool: kind }))
    const existing = migrated[kind]
    migrated[kind] = existing
      ? {
          ...existing,
          results: [...existing.results, ...remappedResults],
          lastRunAt: Math.max(existing.lastRunAt ?? 0, state.lastRunAt ?? 0) || null,
        }
      : { ...state, results: remappedResults }
  }
  return migrated
}

export function migrateDraft(raw: unknown): DraftDocument {
  const base = createInitialDraft()
  if (!raw || typeof raw !== 'object') return base
  const draft = raw as Record<string, unknown>
  const sections = Array.isArray(draft.sections)
    ? (draft.sections as DraftSection[]).map(migrateDraftSection)
    : base.sections
  const hasContent = sections.some((s) => s.content.trim().length > 0)
  const legacyGenerated =
    typeof draft.generatedAt === 'number'
      ? draft.generatedAt
      : hasContent
        ? Date.now()
        : null
  return {
    sections,
    activeSectionId:
      typeof draft.activeSectionId === 'string' ? draft.activeSectionId : sections[0]?.id ?? null,
    generatedAt: legacyGenerated,
    tools: migrateDraftTools(draft.tools as DraftDocument['tools']),
    showInlineHighlights:
      typeof draft.showInlineHighlights === 'boolean' ? draft.showInlineHighlights : true,
  }
}

export function createInitialDraft(blueprint?: EssayBlueprint): DraftDocument {
  const sections = createDraftSectionsFromBudget(
    blueprint?.wordBudget ?? defaultWordBudget(),
  )
  return {
    sections,
    activeSectionId: sections[0]?.id ?? null,
    generatedAt: null,
    tools: {},
    showInlineHighlights: true,
  }
}

export function createInitialWorkspaceContext(): WorkspaceContext {
  return {
    activeTabKind: 'blueprint',
    activeNavId: 'blueprint',
    blueprintSection: 'instructions',
    draftSubView: 'editing',
    activeSectionId: null,
    selectedOutlineNodeId: null,
    selectedSourceId: null,
    selectedTextRange: null,
    draftMode: 'write',
    activeSelectionTool: null,
  }
}

export function createInitialEssayState(): EssayState {
  const blueprint = createInitialBlueprint()
  const draft = createInitialDraft(blueprint)
  return {
    blueprint,
    outline: createInitialOutline(),
    draft,
    sources: [],
    citations: [],
    workspaceContext: {
      ...createInitialWorkspaceContext(),
      activeSectionId: draft.activeSectionId,
    },
  }
}

export function mockAnalyzeInstructions(blueprint: EssayBlueprint): BlueprintAnalysis {
  const raw = getBriefText(blueprint) || 'Essay assignment'
  const words = raw
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 4)
    .slice(0, 8)

  const rubricText = getRubricText(blueprint)
  const rubricAlignment: RubricAlignmentItem[] = rubricText
    ? [
        {
          criterion: 'Addresses assignment requirements',
          addressedBy: 'Framework goals and structure',
          covered: true,
        },
        {
          criterion: 'Demonstrates critical analysis',
          addressedBy: 'Thesis and body sections',
          covered: words.length > 3,
        },
      ]
    : []

  return {
    taskWords: words.length ? words : ['analyze', 'evaluate', 'argue'],
    goals: [
      'Address the assignment prompt directly',
      'Develop a clear thesis supported by evidence',
    ],
    boundaries: [
      `Respect word limit (${blueprint.wordLimit.minAuto ? 'Auto min' : blueprint.wordLimit.min}–${blueprint.wordLimit.maxAuto ? 'Auto max' : blueprint.wordLimit.max} words)`,
      `Citation style: ${blueprint.referencingStyleId === 'none' ? 'None (Basic)' : blueprint.referencingStyleId}`,
    ],
    impliedQuestions: [
      'What is the central argument?',
      'What evidence best supports each section?',
    ],
    suggestedStructure: blueprint.wordBudget.sections.map((s) => s.label),
    formattingRequirements: [
      'Double-spaced unless otherwise specified',
      `${blueprint.referencingStyleId !== 'none' ? blueprint.referencingStyleId : 'No'} referencing required`,
    ],
    rubricAlignment,
  }
}

export function mockProposeFromAnalysis(
  blueprint: EssayBlueprint,
  analysis: BlueprintAnalysis,
): Partial<EssayBlueprint> {
  const excerpt = getBriefText(blueprint).slice(0, 80).trim() || 'Essay topic'
  return {
    title: `${excerpt}${excerpt.length >= 80 ? '…' : ''}: A Structured Argument`,
    thesis: `This essay argues that ${analysis.taskWords.slice(0, 2).join(' and ')} are central to the assigned task.`,
    researchQuestion: `How do ${analysis.taskWords[0] ?? 'key factors'} shape the outcome of this assignment?`,
    documentType: blueprint.documentType || 'Argumentative/Persuasive Essay',
    tone: blueprint.writingStyle,
    instructionsRaw: buildInstructionsRaw(blueprint),
  }
}

export function recalcSectionWordCount(content: string): number {
  return countWords(content)
}
