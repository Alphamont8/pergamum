'use client'

import { useEffect, useRef, useState } from 'react'
import {
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Redo2,
  Save,
  Undo2,
} from 'lucide-react'
import type { DraftToolCategory, RunDraftToolOptions } from '@/lib/draft-tools'
import type {
  DraftDocument,
  DraftToolKind,
  DraftToolScope,
  EssayBlueprint,
  EssayWorkflowState,
  OutlineNode,
  SourceRecord,
  SubscriptionTier,
} from '../../types'
import { ResizableSplitPane } from '../ui/ResizableSplitPane'
import { BlueprintHeaderBtn } from './blueprint/BlueprintHeaderBtn'
import { DraftDocument as DraftDocumentPanel } from './draft/DraftDocument'
import { ToolsPanel } from './draft/ToolsPanel'
import './draft/draft-tokens.css'
import './blueprint/BlueprintHeaderBtn.css'
import './draft/DraftDocument.css'
import './draft/UnifiedDraftEditor.css'
import './draft/EditorToolbar.css'
import './draft/ToolsPanel.css'
import './draft/SelectionToolsCard.css'
import './draft/SelectionToolOutput.css'
import './draft/ToolCard.css'
import './draft/SuggestionItem.css'
import './DraftTab.css'
import '../ui/ResizableSplitPane.css'

type MinimizedPanel = 'document' | 'tools' | null

interface DraftTabProps {
  draft: DraftDocument
  blueprint: EssayBlueprint
  outline: OutlineNode[]
  sources: SourceRecord[]
  workflow: EssayWorkflowState
  subscriptionTier: SubscriptionTier
  saving?: boolean
  generatingDraft?: boolean
  activeSectionId: string | null
  hasTextSelection: boolean
  selectedText: string | null
  activeSelectionTool: DraftToolKind | null
  toolScopes: Partial<Record<DraftToolKind, DraftToolScope>>
  highlightedSuggestionId: string | null
  onSaveProgress?: () => void
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
  onUpdateUnified: (
    sections: Array<{ id: string; label: string; html: string; content: string }>,
  ) => void
  onInsertCitation: (sectionId: string, sourceId: string) => void
  onRunTool: (tool: DraftToolKind, options?: RunDraftToolOptions) => void
  onRunAllTools: (category: DraftToolCategory) => void
  onActiveSelectionToolChange: (tool: DraftToolKind | null) => void
  onScopeChange: (tool: DraftToolKind, scope: DraftToolScope) => void
  onAcceptSuggestion: (id: string) => void
  onDismissSuggestion: (id: string) => void
  onReplaceSuggestion: (id: string, text: string) => void
  onScrollToSuggestion: (id: string) => void
  onHighlightSuggestion: (id: string | null) => void
  onInsertSourceSuggestion: (id: string) => void
  onAcceptAllTool: (tool: DraftToolKind) => void
  onDismissAllTool: (tool: DraftToolKind) => void
  onClearMultipurposeResults: () => void
  onSelectionChange?: (sectionId: string, start: number, end: number, text: string) => void
  onSuggestionClick?: (suggestionId: string) => void
}

export function DraftTab({
  draft,
  blueprint,
  outline: _outline,
  sources,
  workflow,
  subscriptionTier,
  saving,
  generatingDraft,
  activeSectionId,
  hasTextSelection,
  selectedText,
  activeSelectionTool,
  toolScopes,
  highlightedSuggestionId,
  onSaveProgress,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onUpdateUnified,
  onInsertCitation,
  onRunTool,
  onRunAllTools,
  onActiveSelectionToolChange,
  onScopeChange,
  onAcceptSuggestion,
  onDismissSuggestion,
  onReplaceSuggestion,
  onScrollToSuggestion,
  onHighlightSuggestion,
  onInsertSourceSuggestion,
  onAcceptAllTool,
  onDismissAllTool,
  onClearMultipurposeResults,
  onSelectionChange,
  onSuggestionClick,
}: DraftTabProps) {
  const [minimizedPanel, setMinimizedPanel] = useState<MinimizedPanel>(() =>
    workflow.outlineReadyForDraft && !workflow.draftEverGenerated ? 'tools' : null,
  )
  const wasGeneratingRef = useRef(false)

  useEffect(() => {
    if (generatingDraft) {
      wasGeneratingRef.current = true
      return
    }
    if (wasGeneratingRef.current && workflow.draftEverGenerated) {
      wasGeneratingRef.current = false
      setMinimizedPanel(null)
    }
  }, [generatingDraft, workflow.draftEverGenerated])

  const toggleMinimize = (panel: 'document' | 'tools') => {
    setMinimizedPanel((current) => (current === panel ? null : panel))
  }

  const documentMinimized = minimizedPanel === 'document'
  const toolsMinimized = minimizedPanel === 'tools'
  const bothMinimized = documentMinimized && toolsMinimized

  if (!workflow.outlineReadyForDraft) {
    return (
      <div className="draft-tab draft-tab--locked">
        <div className="draft-tab__locked-inner">
          <div className="draft-tab__locked-icon" aria-hidden>
            <FileText size={28} strokeWidth={1.5} />
          </div>
          <h2>Draft</h2>
          <p>
            Generate your essay from your outline after marking it ready in the Outline section.
          </p>
        </div>
      </div>
    )
  }

  const documentPanel = (
    <DraftDocumentPanel
      draft={draft}
      blueprint={blueprint}
      sources={sources}
      generating={generatingDraft}
      onUpdateUnified={onUpdateUnified}
      onInsertCitation={onInsertCitation}
      onSelectionChange={onSelectionChange}
      onSuggestionClick={onSuggestionClick ?? onHighlightSuggestion}
      subscriptionTier={subscriptionTier}
      hasTextSelection={hasTextSelection}
      selectedText={selectedText}
      onRunTool={onRunTool}
      onActiveSelectionToolChange={onActiveSelectionToolChange}
    />
  )

  const toolsPanel = (
    <ToolsPanel
      draft={draft}
      blueprint={blueprint}
      subscriptionTier={subscriptionTier}
      activeSectionId={activeSectionId}
      hasTextSelection={hasTextSelection}
      selectedText={selectedText}
      activeSelectionTool={activeSelectionTool}
      toolScopes={toolScopes}
      highlightedSuggestionId={highlightedSuggestionId}
      onRunTool={onRunTool}
      onRunAllTools={onRunAllTools}
      onActiveSelectionToolChange={onActiveSelectionToolChange}
      onScopeChange={onScopeChange}
      onAcceptSuggestion={onAcceptSuggestion}
      onDismissSuggestion={onDismissSuggestion}
      onReplaceSuggestion={onReplaceSuggestion}
      onScrollToSuggestion={onScrollToSuggestion}
      onInsertSourceSuggestion={onInsertSourceSuggestion}
      onAcceptAllTool={onAcceptAllTool}
      onDismissAllTool={onDismissAllTool}
      onClearMultipurposeResults={onClearMultipurposeResults}
    />
  )

  return (
    <div className="draft-tab">
      <header className="draft-tab__header">
        <h1 className="draft-tab__title">Draft</h1>
        <div className="draft-tab__toolbar">
          <BlueprintHeaderBtn
            icon={<Undo2 size={16} strokeWidth={1.75} />}
            label="Undo"
            disabled={!canUndo || !onUndo}
            onClick={onUndo}
          />
          <BlueprintHeaderBtn
            icon={<Redo2 size={16} strokeWidth={1.75} />}
            label="Redo"
            disabled={!canRedo || !onRedo}
            onClick={onRedo}
          />
          <BlueprintHeaderBtn
            icon={<Save size={16} strokeWidth={1.75} />}
            label={saving ? 'Saving…' : 'Save Progress'}
            disabled={saving || !onSaveProgress}
            onClick={onSaveProgress}
          />
          <BlueprintHeaderBtn
            icon={
              documentMinimized ? (
                <PanelLeftOpen size={16} strokeWidth={1.75} />
              ) : (
                <PanelLeftClose size={16} strokeWidth={1.75} />
              )
            }
            label="Minimize Document"
            active={documentMinimized}
            aria-pressed={documentMinimized}
            onClick={() => toggleMinimize('document')}
          />
          <BlueprintHeaderBtn
            icon={
              toolsMinimized ? (
                <PanelRightOpen size={16} strokeWidth={1.75} />
              ) : (
                <PanelRightClose size={16} strokeWidth={1.75} />
              )
            }
            label="Minimize Tools"
            active={toolsMinimized}
            aria-pressed={toolsMinimized}
            onClick={() => toggleMinimize('tools')}
          />
        </div>
      </header>

      <div className="draft-tab__header-rule" aria-hidden />

      <div
        className={`draft-tab__body ${documentMinimized ? 'draft-tab__body--document-min' : ''} ${toolsMinimized ? 'draft-tab__body--tools-min' : ''} ${!documentMinimized && !toolsMinimized ? 'draft-tab__body--split' : ''}`}
      >
        {bothMinimized ? (
          <div className="draft-tab__empty">
            <p>Both panels are minimized. Use the toolbar above to restore Document or Tools.</p>
          </div>
        ) : !documentMinimized && !toolsMinimized ? (
          <ResizableSplitPane
            className="draft-tab__split"
            initialRatio={0.7}
            left={<div className="draft-tab__pane draft-tab__pane--document">{documentPanel}</div>}
            right={<div className="draft-tab__pane draft-tab__pane--tools">{toolsPanel}</div>}
          />
        ) : (
          <>
            {!documentMinimized && (
              <div className="draft-tab__pane draft-tab__pane--document">{documentPanel}</div>
            )}
            {!toolsMinimized && (
              <div className="draft-tab__pane draft-tab__pane--tools">{toolsPanel}</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
