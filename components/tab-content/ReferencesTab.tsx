"use client"

import { useCallback, useEffect, useState } from 'react'
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Redo2,
  Save,
  Undo2,
} from 'lucide-react'
import type {
  CitationInstance,
  EssayBlueprint,
  OutlineNode,
  ReferencingStyleId,
  SourceRecord,
  SubscriptionTier,
} from '../../types'
import { ResizableSplitPane } from '../ui/ResizableSplitPane'
import { BlueprintHeaderBtn } from './blueprint/BlueprintHeaderBtn'
import { BibliographyPanel } from './references/BibliographyPanel'
import { SourceInspectorPanel } from './references/SourceInspectorPanel'
import { useBibliography } from '@/hooks/useBibliography'
import './references/references-tokens.css'
import './ReferencesTab.css'
import '../ui/ResizableSplitPane.css'
import './blueprint/BlueprintHeaderBtn.css'

type MinimizedPanel = 'bibliography' | 'inspector' | null

interface ReferencesTabProps {
  blueprint: EssayBlueprint
  sources: SourceRecord[]
  citations: CitationInstance[]
  outlineNodes: OutlineNode[]
  draftSections: Array<{ id: string; label: string; html: string; content: string }>
  subscriptionTier: SubscriptionTier
  selectedSourceId: string | null
  saving?: boolean
  enrichingIds?: Set<string>
  evaluatingIds?: Set<string>
  bulkEnriching?: boolean
  bulkEvaluating?: boolean
  onSaveProgress?: () => void
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
  onSetReferencingStyle: (id: ReferencingStyleId) => void
  onReconcileCitations?: () => void
  onSelectSource: (sourceId: string | null) => void
  onUpdateSource: (sourceId: string, patch: Partial<SourceRecord>) => void
  onEnrichSource: (sourceId: string) => void
  onEvaluateSource: (sourceId: string) => void
  onEnrichAll: () => void
  onEvaluateAll: () => void
  onRemoveSource?: (sourceId: string) => void
}

export function ReferencesTab({
  blueprint,
  sources,
  citations,
  outlineNodes,
  draftSections,
  subscriptionTier,
  selectedSourceId,
  saving,
  enrichingIds = new Set(),
  evaluatingIds = new Set(),
  bulkEnriching,
  bulkEvaluating,
  onSaveProgress,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onSetReferencingStyle,
  onReconcileCitations,
  onSelectSource,
  onUpdateSource,
  onEnrichSource,
  onEvaluateSource,
  onEnrichAll,
  onEvaluateAll,
  onRemoveSource,
}: ReferencesTabProps) {
  const [minimizedPanel, setMinimizedPanel] = useState<MinimizedPanel>(null)

  const styleId = blueprint.referencingStyleId

  useEffect(() => {
    onReconcileCitations?.()
  }, [onReconcileCitations])

  const { entries, groups, warnings, stats, loading } = useBibliography({
    sources,
    outlineNodes,
    draftSections,
    citations,
    styleId,
  })

  const toggleMinimize = (panel: 'bibliography' | 'inspector') => {
    setMinimizedPanel((current) => (current === panel ? null : panel))
  }

  const bibMinimized = minimizedPanel === 'bibliography'
  const inspMinimized = minimizedPanel === 'inspector'
  const bothMinimized = bibMinimized && inspMinimized

  const handleSelectSource = useCallback(
    (sourceId: string) => {
      onSelectSource(sourceId)
      if (inspMinimized) setMinimizedPanel(null)
    },
    [onSelectSource, inspMinimized],
  )

  return (
    <div className="references-tab">
      <header className="references-tab__header">
        <h1 className="references-tab__title">References</h1>
        <div className="references-tab__toolbar">
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
              bibMinimized ? (
                <PanelLeftOpen size={16} strokeWidth={1.75} />
              ) : (
                <PanelLeftClose size={16} strokeWidth={1.75} />
              )
            }
            label="Minimize Bibliography"
            active={bibMinimized}
            aria-pressed={bibMinimized}
            onClick={() => toggleMinimize('bibliography')}
          />
          <BlueprintHeaderBtn
            icon={
              inspMinimized ? (
                <PanelRightOpen size={16} strokeWidth={1.75} />
              ) : (
                <PanelRightClose size={16} strokeWidth={1.75} />
              )
            }
            label="Minimize Inspector"
            active={inspMinimized}
            aria-pressed={inspMinimized}
            onClick={() => toggleMinimize('inspector')}
          />
        </div>
      </header>

      <div className="references-tab__header-rule" aria-hidden />

      <div
        className={`references-tab__body ${bibMinimized ? 'references-tab__body--bib-min' : ''} ${inspMinimized ? 'references-tab__body--insp-min' : ''} ${!bibMinimized && !inspMinimized ? 'references-tab__body--split' : ''}`}
      >
        {bothMinimized ? (
          <div className="references-tab__empty">
            <p>Both panels are minimized. Use the toolbar above to restore Bibliography or Inspector.</p>
          </div>
        ) : !bibMinimized && !inspMinimized ? (
          <ResizableSplitPane
            className="references-tab__split"
            initialRatio={0.55}
            left={
              <div className="references-tab__pane references-tab__pane--bib">
                <BibliographyPanel
                  blueprint={blueprint}
                  subscriptionTier={subscriptionTier}
                  entries={entries}
                  stats={stats}
                  warnings={warnings}
                  loading={loading}
                  selectedSourceId={selectedSourceId}
                  onSetReferencingStyle={onSetReferencingStyle}
                  onSelectSource={handleSelectSource}
                />
              </div>
            }
            right={
              <div className="references-tab__pane references-tab__pane--insp">
                <SourceInspectorPanel
                  sources={sources}
                  groups={groups}
                  entries={entries}
                  outlineNodes={outlineNodes}
                  styleId={styleId}
                  selectedSourceId={selectedSourceId}
                  enrichingIds={enrichingIds}
                  evaluatingIds={evaluatingIds}
                  bulkEnriching={bulkEnriching}
                  bulkEvaluating={bulkEvaluating}
                  onSelectSource={onSelectSource}
                  onUpdateSource={onUpdateSource}
                  onEnrichSource={onEnrichSource}
                  onEvaluateSource={onEvaluateSource}
                  onEnrichAll={onEnrichAll}
                  onEvaluateAll={onEvaluateAll}
                  onRemoveSource={onRemoveSource}
                />
              </div>
            }
          />
        ) : (
          <>
            {!bibMinimized && (
              <div className="references-tab__pane references-tab__pane--bib">
                <BibliographyPanel
                  blueprint={blueprint}
                  subscriptionTier={subscriptionTier}
                  entries={entries}
                  stats={stats}
                  warnings={warnings}
                  loading={loading}
                  selectedSourceId={selectedSourceId}
                  onSetReferencingStyle={onSetReferencingStyle}
                  onSelectSource={handleSelectSource}
                />
              </div>
            )}
            {!inspMinimized && (
              <div className="references-tab__pane references-tab__pane--insp">
                <SourceInspectorPanel
                  sources={sources}
                  groups={groups}
                  entries={entries}
                  outlineNodes={outlineNodes}
                  styleId={styleId}
                  selectedSourceId={selectedSourceId}
                  enrichingIds={enrichingIds}
                  evaluatingIds={evaluatingIds}
                  bulkEnriching={bulkEnriching}
                  bulkEvaluating={bulkEvaluating}
                  onSelectSource={onSelectSource}
                  onUpdateSource={onUpdateSource}
                  onEnrichSource={onEnrichSource}
                  onEvaluateSource={onEvaluateSource}
                  onEnrichAll={onEnrichAll}
                  onEvaluateAll={onEvaluateAll}
                  onRemoveSource={onRemoveSource}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
