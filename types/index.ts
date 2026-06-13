export type TabKind = 'blueprint' | 'outline' | 'draft' | 'references' | 'export'

export type ThemeMode = 'light' | 'dark'

export type ThemePreference = 'system' | 'light' | 'dark'

export type SubscriptionTier = 'Basic' | 'Plus' | 'Pro' | 'Max'

/** Shown under the Pergamum logo in the sidebar (subscription tier). */
export type PlanLabel = SubscriptionTier

export type BlueprintSection = 'instructions' | 'framework'

export type DraftSubView = 'editing' | 'auditing' | 'polishing'

export type TabDisplayMode = 'fullscreen' | 'half'

export type ViewLayout = 'single' | 'split'

export type DraftMode = 'write' | 'audit' | 'polish'

export type CitationStyle = 'APA' | 'MLA' | 'Chicago' | 'Harvard'

export type ReferencingStyleId =
  | 'none'
  | 'apa'
  | 'mla'
  | 'harvard'
  | 'chicago-notes'
  | 'chicago-author-date'
  | 'ieee'
  | 'vancouver'
  | 'bluebook'
  | string

export type SourceKind =
  | 'journal-article'
  | 'book'
  | 'book-chapter'
  | 'preprint'
  | 'report'
  | 'webpage'
  | 'thesis'
  | 'other'

export type EnrichmentStatus = 'pending' | 'enriching' | 'enriched' | 'failed'

export interface SourceVenue {
  name?: string
  type?: string
  publisher?: string
  issn?: string
}

export interface SourceBiblio {
  volume?: string
  issue?: string
  pages?: string
}

export interface SourceAuthorship {
  name: string
  orcid?: string
  hIndex?: number
  institutions?: string[]
}

export interface SourceOpenAccess {
  isOA: boolean
  status?: string
  oaUrl?: string
}

export interface SourceExaMeta {
  favicon?: string
  image?: string
  siteName?: string
  publishedDate?: string
  highlights?: string[]
}

export interface SourceEnrichment {
  status: EnrichmentStatus
  enrichedAt?: number
  error?: string
}

export type ReliabilityBand = 'strong' | 'good' | 'fair' | 'caution'

export interface ReliabilitySubscore {
  score: number
  rationale: string
}

export interface SourceReliability {
  overall: number
  band: ReliabilityBand
  subscores: {
    peerReview: ReliabilitySubscore
    authorCredibility: ReliabilitySubscore
    recency: ReliabilitySubscore
    objectivity: ReliabilitySubscore
  }
  evaluatedAt?: number
  flags?: string[]
}

export type InstructionAttachmentKind = 'brief' | 'rubric' | 'material'

export type InstructionAttachmentStatus = 'parsing' | 'parsed' | 'error'

export interface InstructionAttachment {
  id: string
  fileName: string
  kind: InstructionAttachmentKind
  extractedText: string
  status: InstructionAttachmentStatus
  errorMessage?: string
}

export interface QuickSettings {
  documentType: string
  documentTypeIsAuto: boolean
  /** Custom label when documentType is "Other" (Pro+). */
  documentTypeCustom?: string
  writingStyle: string
  writingStyleIsAuto: boolean
  readingLevel: string
  readingLevelIsAuto: boolean
  referencingStyle: ReferencingStyleId | 'Auto' | 'none'
  referencingStyleIsAuto: boolean
}

export interface WordLimitSettings {
  min: number
  max: number
  minAuto: boolean
  maxAuto: boolean
}

export type SourceType = 'primary' | 'secondary'

export type OutlineNodeType = 'section' | 'point' | 'subpoint'

export interface WorkspaceTab {
  id: string
  kind: TabKind
  label: string
  closed: boolean
  displayMode: TabDisplayMode
  order: number
}

export interface WorkspaceView {
  layout: ViewLayout
  focusedTabId: string | null
  pairedTabId: string | null
  splitRatio: number
}

export interface RubricAlignmentItem {
  criterion: string
  addressedBy: string
  covered: boolean
}

export interface BlueprintAnalysis {
  taskWords: string[]
  goals: string[]
  boundaries: string[]
  impliedQuestions: string[]
  suggestedStructure: string[]
  formattingRequirements: string[]
  rubricAlignment: RubricAlignmentItem[]
}

export interface WordBudgetSection {
  id: string
  label: string
  /** Section share of total word count (0–100). */
  weightPercent: number
  targetWords: number
}

export interface WordBudget {
  total: number
  sections: WordBudgetSection[]
}

export interface EssayBlueprint {
  instructionsText: string
  attachments: InstructionAttachment[]
  quickSettings: QuickSettings
  wordLimit: WordLimitSettings
  frameworkGenerated: boolean
  instructionsRaw: string
  analysis: BlueprintAnalysis | null
  title: string
  thesis: string
  researchQuestion: string
  wordBudget: WordBudget
  documentType: string
  writingStyle: string
  tone: string
  readingLevel: string
  citationStyle: CitationStyle
  referencingStyleId: ReferencingStyleId
  approvedAt: number | null
  /** Fingerprint of instructions input when framework was last generated. */
  frameworkInputFingerprint?: string | null
  /** JSON snapshot of word-budget section ids/labels when outline was last synced. */
  outlineBudgetFingerprint?: string | null
}

export interface OutlineSourceRef {
  sourceId: string
  /** @deprecated Prefer `quotes`; kept for backward compatibility */
  quote?: string
  quotes?: string[]
}

export interface OutlineNode {
  id: string
  parentId: string | null
  type: OutlineNodeType
  title: string
  /** @deprecated Use child point/subpoint nodes instead */
  bullets?: string[]
  sourceRefs: OutlineSourceRef[]
  collapsed: boolean
  order: number
}

export interface OutlineTreeNode extends OutlineNode {
  children: OutlineTreeNode[]
}

export interface SourceSearchResult {
  title: string
  url: string
  summary: string
  type?: SourceType
  authors?: string
  year?: string
  publisher?: string
  quotes?: string[]
}

export interface OutlineState {
  nodes: OutlineNode[]
  readyForDraftAt: number | null
}

export type DraftToolKind =
  | 'evidence'
  | 'goalAlignment'
  | 'spelling'
  | 'writingQuality'
  | 'shiftTone'
  | 'elevatePhrasing'
  | 'findSynonyms'
  | 'definePhrase'

export type DraftSuggestionStatus = 'open' | 'accepted' | 'dismissed'

export type DraftSuggestionSeverity = 'info' | 'warning' | 'error' | 'improvement'

export type DraftToolScope = 'section' | 'essay'

export interface DraftTextRange {
  sectionId: string
  from: number
  to: number
}

export interface DraftSourceSuggestion {
  title: string
  url?: string
  authors?: string
  year?: string
  summary?: string
  quote?: string
}

export interface DraftSuggestion {
  id: string
  tool: DraftToolKind
  sectionId: string
  status: DraftSuggestionStatus
  severity: DraftSuggestionSeverity
  message: string
  targetText?: string
  suggestion?: string
  range?: DraftTextRange
  sourceSuggestion?: DraftSourceSuggestion
  /** Synonyms or close alternatives (Find Synonyms tool) */
  alternatives?: string[]
  /** Antonyms (Find Synonyms tool) */
  antonyms?: string[]
  /** Target writing style used (Shift Tone tool) */
  targetWritingStyle?: string
}

export interface DraftToolState {
  status: 'idle' | 'running' | 'done' | 'error'
  lastRunAt: number | null
  results: DraftSuggestion[]
}

export interface DraftSection {
  id: string
  label: string
  /** Plaintext mirror for word counts, AI prompts, and export */
  content: string
  /** Rich HTML content for the TipTap editor */
  html: string
  wordCount: number
  highlights: string[]
  status: 'empty' | 'generating' | 'draft' | 'approved'
}

export interface DraftDocument {
  sections: DraftSection[]
  activeSectionId: string | null
  /** Set when draft is first generated; never cleared even if user deletes all text */
  generatedAt?: number | null
  tools?: Partial<Record<DraftToolKind, DraftToolState>>
  showInlineHighlights?: boolean
}

export type SourceAddedVia = 'upload' | 'link' | 'search' | 'ai'

export interface SourceRecord {
  id: string
  title: string
  url?: string
  fileName?: string
  type: SourceType
  addedVia?: SourceAddedVia
  summary?: string
  authors?: string
  year?: string
  publisher?: string
  doi?: string
  openAlexId?: string
  abstract?: string
  publicationDate?: string
  venue?: SourceVenue
  biblio?: SourceBiblio
  authorships?: SourceAuthorship[]
  citedByCount?: number
  fwci?: number
  openAccess?: SourceOpenAccess
  topics?: string[]
  sourceKind?: SourceKind
  exa?: SourceExaMeta
  enrichment?: SourceEnrichment
  reliability?: SourceReliability
}

export interface CitationInstance {
  id: string
  sourceId: string
  style: CitationStyle
  inText: string
  sectionId: string
  locator?: string
  citationNumber?: number
}

export type BibliographyGroup = 'cited' | 'outline' | 'unused'

export interface BibliographyEntry {
  sourceId: string
  group: BibliographyGroup
  formatted: string
  citationIds: string[]
  citationCount: number
  citationNumber?: number
}

export interface TextSelectionRange {
  sectionId: string
  start: number
  end: number
  text: string
}

export interface WorkspaceContext {
  activeTabKind: TabKind
  activeNavId: string
  blueprintSection: BlueprintSection
  draftSubView: DraftSubView
  activeSectionId: string | null
  selectedOutlineNodeId: string | null
  selectedSourceId: string | null
  selectedTextRange: TextSelectionRange | null
  draftMode: DraftMode
  /** Active function in the multipurpose selection-tools card */
  activeSelectionTool: DraftToolKind | null
}

export interface EssayWorkflowState {
  blueprintApproved: boolean
  outlineReadyForDraft: boolean
  draftHasContent: boolean
  /** True once draft has been generated at least once, even if user clears all text */
  draftEverGenerated: boolean
  hasCitations: boolean
  instructionsComplete?: boolean
  blueprintGenerated?: boolean
}

export interface EssayState {
  blueprint: EssayBlueprint
  outline: OutlineState
  draft: DraftDocument
  sources: SourceRecord[]
  citations: CitationInstance[]
  workspaceContext: WorkspaceContext
}
