'use client'

import { useMemo, useState } from 'react'
import { Play } from 'lucide-react'
import type {
  DraftDocument,
  DraftToolKind,
  DraftToolScope,
  DraftToolState,
  EssayBlueprint,
  SubscriptionTier,
} from '@/types'
import { buildWritingStyleOptions } from '@/constants/preferenceOptions'
import {
  type DraftToolCategory,
  getDraftToolsByCategory,
  type RunDraftToolOptions,
} from '@/lib/draft-tools'
import { countOpenSuggestions, createEmptyToolState } from '@/lib/draft-utils'
import { extractAllCitationSpans } from '@/lib/citations'
import { SelectionToolsCard } from './SelectionToolsCard'
import { ToolCard } from './ToolCard'
import './ToolsPanel.css'
import './SelectionToolsCard.css'
import './SelectionToolOutput.css'

type ToolsPanelTab = DraftToolCategory

interface ToolsPanelProps {
  draft: DraftDocument
  blueprint: EssayBlueprint
  subscriptionTier: SubscriptionTier
  activeSectionId: string | null
  hasTextSelection: boolean
  selectedText: string | null
  activeSelectionTool: DraftToolKind | null
  toolScopes: Partial<Record<DraftToolKind, DraftToolScope>>
  highlightedSuggestionId: string | null
  onRunTool: (tool: DraftToolKind, options?: RunDraftToolOptions) => void
  onRunAllTools: (category: DraftToolCategory) => void
  onActiveSelectionToolChange: (tool: DraftToolKind | null) => void
  onScopeChange: (tool: DraftToolKind, scope: DraftToolScope) => void
  onAcceptSuggestion: (id: string) => void
  onDismissSuggestion: (id: string) => void
  onReplaceSuggestion: (id: string, text: string) => void
  onScrollToSuggestion: (id: string) => void
  onInsertSourceSuggestion: (id: string) => void
  onAcceptAllTool: (tool: DraftToolKind) => void
  onDismissAllTool: (tool: DraftToolKind) => void
  onClearMultipurposeResults: () => void
}

export function ToolsPanel({
  draft,
  blueprint: _blueprint,
  subscriptionTier,
  activeSectionId: _activeSectionId,
  hasTextSelection,
  selectedText,
  activeSelectionTool,
  toolScopes,
  highlightedSuggestionId,
  onRunTool,
  onRunAllTools,
  onActiveSelectionToolChange,
  onScopeChange,
  onAcceptSuggestion,
  onDismissSuggestion,
  onReplaceSuggestion,
  onScrollToSuggestion,
  onInsertSourceSuggestion,
  onAcceptAllTool,
  onDismissAllTool,
  onClearMultipurposeResults,
}: ToolsPanelProps) {
  const [activeTab, setActiveTab] = useState<ToolsPanelTab>('editing')
  const [shiftToneStyle, setShiftToneStyle] = useState('')

  const openCount = countOpenSuggestions(draft, { hasTextSelection })
  const citationCount = extractAllCitationSpans(draft.sections).length

  const writingStyleOptions = useMemo(
    () => buildWritingStyleOptions(subscriptionTier).filter((o) => o.value !== 'Auto'),
    [subscriptionTier],
  )

  const enabledWritingStyleOptions = useMemo(
    () => writingStyleOptions.filter((o) => !o.disabled),
    [writingStyleOptions],
  )

  const tabTools = getDraftToolsByCategory(activeTab)

  const getToolState = (tool: DraftToolKind): DraftToolState => {
    return draft.tools?.[tool] ?? createEmptyToolState()
  }

  const anyRunning = tabTools.some((t) => getToolState(t.kind).status === 'running')

  return (
    <section className="tools-panel" aria-label="Writing tools">
      <div className="tools-panel__tabs" role="tablist" aria-label="Tool categories">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'editing'}
          className={`tools-panel__tab ${activeTab === 'editing' ? 'tools-panel__tab--active' : ''}`}
          onClick={() => setActiveTab('editing')}
        >
          Editing
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'auditing'}
          className={`tools-panel__tab ${activeTab === 'auditing' ? 'tools-panel__tab--active' : ''}`}
          onClick={() => setActiveTab('auditing')}
        >
          Auditing
        </button>
      </div>

      <div className="tools-panel__actions">
        <button
          type="button"
          className="bp-btn-primary tools-panel__run-all-btn"
          disabled={anyRunning}
          onClick={() => onRunAllTools(activeTab)}
        >
          {!anyRunning && <Play size={14} strokeWidth={2} aria-hidden />}
          {anyRunning ? 'Running…' : 'Run All Tools'}
        </button>
      </div>

      <div className="tools-panel__summary">
        <span className="tools-panel__chip">
          In-Text Citations: <strong>{citationCount}</strong>
        </span>
        {openCount > 0 && (
          <span className="tools-panel__chip tools-panel__chip--issues">
            Open Issues: <strong>{openCount}</strong>
          </span>
        )}
      </div>

      <div className="tools-panel__scroll" role="tabpanel">
        {activeTab === 'editing' && (
          <SelectionToolsCard
            activeTool={activeSelectionTool}
            hasTextSelection={hasTextSelection}
            selectedText={selectedText}
            writingStyleOptions={writingStyleOptions}
            selectedWritingStyle={shiftToneStyle}
            onWritingStyleChange={setShiftToneStyle}
            getToolState={getToolState}
            onActiveToolChange={onActiveSelectionToolChange}
            onRunTool={onRunTool}
            onAccept={onAcceptSuggestion}
            onDismiss={onDismissSuggestion}
            onReplace={onReplaceSuggestion}
            onClearMultipurposeResults={onClearMultipurposeResults}
          />
        )}
        {tabTools.map((def) => (
          <ToolCard
            key={def.kind}
            tool={def.kind}
            title={def.title}
            description={def.description}
            icon={def.icon}
            runMode={def.runMode}
            state={getToolState(def.kind)}
            scope={toolScopes[def.kind] ?? (def.runMode === 'essay' ? 'essay' : 'section')}
            highlightedId={highlightedSuggestionId}
            hasTextSelection={hasTextSelection}
            writingStyleOptions={def.requiresStylePicker ? enabledWritingStyleOptions : undefined}
            selectedWritingStyle={shiftToneStyle}
            onWritingStyleChange={setShiftToneStyle}
            showsWordAlternatives={def.showsWordAlternatives}
            hideScopeToggle={def.hideScopeToggle}
            onScopeChange={onScopeChange}
            onRun={(tool) => {
              if (def.requiresStylePicker) {
                const style = shiftToneStyle || enabledWritingStyleOptions[0]?.value
                if (!style) return
                onRunTool(tool, { targetWritingStyle: style })
                return
              }
              onRunTool(tool)
            }}
            onAccept={onAcceptSuggestion}
            onDismiss={onDismissSuggestion}
            onReplace={onReplaceSuggestion}
            onScrollTo={onScrollToSuggestion}
            onInsertSource={def.kind === 'evidence' ? onInsertSourceSuggestion : undefined}
            onAcceptAll={onAcceptAllTool}
            onDismissAll={onDismissAllTool}
          />
        ))}
      </div>
    </section>
  )
}
