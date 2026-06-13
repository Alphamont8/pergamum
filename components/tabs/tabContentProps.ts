import type { DraftToolCategory, RunDraftToolOptions } from '@/lib/draft-tools'
import type {
  BlueprintAnalysis,
  DraftToolKind,
  DraftToolScope,
  EssayState,
  OutlineNodeType,
  SourceAddedVia,
  SourceRecord,
  SourceSearchResult,
  SourceType,
  SubscriptionTier,
} from '../../types'
import type { TabKind } from '../../types'

export interface EssayTabActions {
  updateBlueprint: (patch: Partial<EssayState['blueprint']>) => void
  updateInstructionsText: (text: string) => void
  attachInstructionFile: (file: File) => Promise<void>
  removeInstructionAttachment: (attachmentId: string) => void
  clearInstructions: () => void
  applyInstructions: () => void
  updateQuickSettings: (patch: Partial<EssayState['blueprint']['quickSettings']>) => void
  updateWordLimit: (patch: Partial<EssayState['blueprint']['wordLimit']>) => void
  updateWordBudgetSection: (
    sectionId: string,
    patch: { label?: string; weightPercent?: number },
  ) => void
  updateAnalysis: (patch: Partial<BlueprintAnalysis>) => void
  rebalanceWordBudget: () => void
  resetWordBudgetToTemplate: () => void
  reorderWordBudgetSections: (orderedIds: string[]) => void
  removeWordBudgetSection: (sectionId: string) => void
  addWordBudgetSection: () => void
  generateFramework: () => void
  regenerateFrameworkField: (field: 'title' | 'researchQuestion' | 'thesis') => void | Promise<void>
  generateOutline: () => void
  updateOutline: () => void
  regenerateOutline: () => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  runAnalyzeBlueprint: () => void
  approveBlueprint: () => void
  toggleOutlineCollapse: (nodeId: string) => void
  expandAllOutline: () => void
  collapseAllOutline: () => void
  selectOutlineNode: (nodeId: string | null) => void
  selectSource: (sourceId: string | null) => void
  updateOutlineNode: (nodeId: string, patch: Partial<EssayState['outline']['nodes'][0]>) => void
  reorderOutlineNodes: (orderedIds: string[]) => void
  addOutlineNode: (parentId: string | null, type: OutlineNodeType, title?: string) => string
  removeOutlineNode: (nodeId: string) => void
  convertOutlineNodeType: (nodeId: string) => void
  moveOutlineNode: (nodeId: string, newParentId: string | null, newOrder: number) => void
  attachSourceToNode: (nodeId: string, sourceId: string, quote?: string) => void
  detachSourceFromNode: (nodeId: string, sourceId: string) => void
  updateSource: (sourceId: string, patch: Partial<SourceRecord>) => void
  updateSourceRefQuote: (nodeId: string, sourceId: string, quote: string) => void
  updateSourceRefQuotes: (nodeId: string, sourceId: string, quotes: string[]) => void
  searchSources: (query: string) => Promise<SourceSearchResult[]>
  addFoundSourceToNode: (
    nodeId: string,
    result: SourceSearchResult,
    quote?: string | null,
    addedVia?: SourceAddedVia,
  ) => string
  markOutlineReadyForDraft: () => void
  generateDraftFromOutline: () => void | Promise<void>
  generatingFullDraft: boolean
  setDraftMode: (mode: EssayState['workspaceContext']['draftMode']) => void
  setActiveDraftSection: (sectionId: string) => void
  updateDraftSectionContent: (sectionId: string, html: string, content: string) => void
  updateUnifiedDraft: (
    sections: Array<{ id: string; label: string; html: string; content: string }>,
  ) => void
  generateDraftSection: (sectionId: string) => void
  draftToolScopes: Partial<Record<DraftToolKind, DraftToolScope>>
  highlightedSuggestionId: string | null
  setDraftToolScope: (tool: DraftToolKind, scope: DraftToolScope) => void
  runDraftTool: (tool: DraftToolKind, options?: RunDraftToolOptions) => void
  runAllDraftTools: (category?: DraftToolCategory) => void
  acceptDraftSuggestion: (id: string) => void
  dismissDraftSuggestion: (id: string) => void
  replaceDraftSuggestion: (id: string, text: string) => void
  acceptAllDraftTool: (tool: DraftToolKind) => void
  dismissAllDraftTool: (tool: DraftToolKind) => void
  insertCitationAt: (sectionId: string, sourceId: string) => void
  insertSourceFromSuggestion: (id: string) => void
  toggleDraftInlineHighlights: (show: boolean) => void
  highlightDraftSuggestion: (id: string | null) => void
  setTextSelection: (range: EssayState['workspaceContext']['selectedTextRange']) => void
  setActiveSelectionTool: (tool: DraftToolKind | null) => void
  clearMultipurposeToolResults: () => void
  setCitationStyle: (style: EssayState['blueprint']['citationStyle']) => void
  setReferencingStyle: (id: EssayState['blueprint']['referencingStyleId']) => void
  reconcileCitations: () => void
  addCitation: (sourceId: string, sectionId: string) => void
  enrichSource: (sourceId: string) => Promise<void>
  evaluateSource: (sourceId: string) => Promise<void>
  enrichAllSources: () => Promise<void>
  evaluateAllSources: () => Promise<void>
  removeSource: (sourceId: string) => void
  enrichingIds: Set<string>
  evaluatingIds: Set<string>
  bulkEnriching: boolean
  bulkEvaluating: boolean
  uploadSourceStub: (fileName: string, type?: SourceType) => string
  searchOutlineNodeStub: (nodeId: string) => Promise<SourceSearchResult[]>
  saveProgress: () => void
}

export interface RenderTabContentOptions {
  kind: TabKind
  essay: EssayState
  subscriptionTier: SubscriptionTier
  workflow: {
    blueprintApproved: boolean
    outlineReadyForDraft: boolean
    draftHasContent: boolean
    draftEverGenerated: boolean
    hasCitations: boolean
  }
  analyzing: boolean
  generatingOutline: boolean
  saving: boolean
  actions: EssayTabActions
  onCompleteInstructions?: () => void
}
