"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  GitBranch,
  Save,
  PanelLeftClose,
  PanelRightClose,
  PanelLeftOpen,
  PanelRightOpen,
  Undo2,
  Redo2,
} from 'lucide-react'
import type {
  EssayBlueprint,
  EssayWorkflowState,
  OutlineNode,
  SourceRecord,
  SourceAddedVia,
  SourceSearchResult,
  SourceType,
} from '../../types'
import { buildOutlineTree } from '../../state/essayInitial'
import { ResizableSplitPane } from '../ui/ResizableSplitPane'
import { BlueprintHeaderBtn } from './blueprint/BlueprintHeaderBtn'
import { OutlinePanel } from './outline/OutlinePanel'
import { SourcesPanel } from './outline/SourcesPanel'
import './outline/outline-tokens.css'
import './OutlineTab.css'
import '../ui/ResizableSplitPane.css'
import './blueprint/BlueprintHeaderBtn.css'
import './outline/OutlinePanel.css'
import './outline/OutlineNodeRow.css'
import './outline/SourcesPanel.css'
import './outline/PointDetailView.css'
import './outline/SourceResultCard.css'
import './outline/SourceSearchBar.css'
import './outline/SourceUpload.css'
import '../ui/PublicationDateInput.css'

type MinimizedPanel = 'outline' | 'sources' | null

interface OutlineTabProps {
  nodes: OutlineNode[]
  sources: SourceRecord[]
  blueprint: EssayBlueprint
  workflow: EssayWorkflowState
  selectedNodeId: string | null
  selectedSourceId: string | null
  saving?: boolean
  onSaveProgress?: () => void
  onSelectNode: (id: string | null) => void
  onSelectSource: (sourceId: string | null) => void
  onToggleCollapse: (id: string) => void
  onExpandAll: () => void
  onCollapseAll: () => void
  onUpdateNode: (id: string, patch: Partial<OutlineNode>) => void
  onAddNode: (parentId: string | null, type: OutlineNode['type'], title?: string) => string
  onRemoveNode: (id: string) => void
  onConvertNodeType: (id: string) => void
  onMoveNode: (id: string, newParentId: string | null, newOrder: number) => void
  onAttachSource: (nodeId: string, sourceId: string, quote?: string) => void
  onDetachSource: (nodeId: string, sourceId: string) => void
  onUpdateSource: (sourceId: string, patch: Partial<SourceRecord>) => void
  onUpdateSourceQuote: (nodeId: string, sourceId: string, quote: string) => void
  onUpdateSourceQuotes: (nodeId: string, sourceId: string, quotes: string[]) => void
  onSearchSources: (query: string) => Promise<SourceSearchResult[]>
  onResearchNode: (nodeId: string) => Promise<SourceSearchResult[]>
  onAddFoundSource: (
    nodeId: string,
    result: SourceSearchResult,
    quote?: string | null,
    addedVia?: SourceAddedVia,
  ) => void
  onUploadSource: (fileName: string, type?: SourceType) => string
  draftEverGenerated?: boolean
  generatingDraft?: boolean
  onGenerateDraft: () => void
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
}

export function OutlineTab({
  nodes,
  sources,
  blueprint: _blueprint,
  workflow,
  selectedNodeId,
  selectedSourceId,
  saving,
  onSaveProgress,
  onSelectNode,
  onSelectSource,
  onToggleCollapse,
  onExpandAll,
  onCollapseAll,
  onUpdateNode,
  onAddNode,
  onRemoveNode,
  onConvertNodeType: _onConvertNodeType,
  onMoveNode,
  onAttachSource,
  onDetachSource,
  onUpdateSource,
  onUpdateSourceQuote,
  onUpdateSourceQuotes,
  onSearchSources,
  onResearchNode: _onResearchNode,
  onAddFoundSource,
  onUploadSource,
  draftEverGenerated,
  generatingDraft,
  onGenerateDraft,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: OutlineTabProps) {
  const [minimizedPanel, setMinimizedPanel] = useState<MinimizedPanel>(
    selectedNodeId == null ? 'sources' : null,
  )
  const userAdjustedPanelsRef = useRef(false)

  useEffect(() => {
    if (userAdjustedPanelsRef.current) return
    setMinimizedPanel(selectedNodeId == null ? 'sources' : null)
  }, [selectedNodeId])

  const toggleMinimize = (panel: 'outline' | 'sources') => {
    userAdjustedPanelsRef.current = true
    setMinimizedPanel((current) => (current === panel ? null : panel))
  }

  const outlineMinimized = minimizedPanel === 'outline'
  const sourcesMinimized = minimizedPanel === 'sources'
  const bothMinimized = outlineMinimized && sourcesMinimized
  const hasSelection = selectedNodeId != null

  const handleSelectPoint = (pointId: string) => {
    onSelectNode(pointId)
    setMinimizedPanel((current) => (current === 'sources' ? null : current))
  }

  const handleSelectSource = (sourceId: string) => {
    onSelectSource(sourceId)
    setMinimizedPanel((current) => (current === 'sources' ? null : current))
  }

  const mainPoints = useMemo(() => {
    const tree = buildOutlineTree(nodes)
    const points: OutlineNode[] = []
    for (const section of tree) {
      for (const child of section.children) {
        if (child.type === 'point') points.push(child)
      }
    }
    return points
  }, [nodes])

  const selectedPointId = useMemo(() => {
    if (!selectedNodeId) return null
    const node = nodes.find((n) => n.id === selectedNodeId)
    if (!node) return null
    if (node.type === 'point') return node.id
    if (node.type === 'subpoint' && node.parentId) return node.parentId
    return null
  }, [nodes, selectedNodeId])

  const cyclePoint = useCallback(
    (delta: -1 | 1) => {
      if (mainPoints.length === 0) return
      const idx = selectedPointId ? mainPoints.findIndex((p) => p.id === selectedPointId) : -1
      const nextIdx =
        idx < 0
          ? delta === 1
            ? 0
            : mainPoints.length - 1
          : (idx + delta + mainPoints.length) % mainPoints.length
      onSelectNode(mainPoints[nextIdx].id)
      setMinimizedPanel((current) => (current === 'sources' ? null : current))
    },
    [mainPoints, selectedPointId, onSelectNode],
  )

  const handleSourcesDone = useCallback(() => {
    onSelectNode(null)
    userAdjustedPanelsRef.current = true
    setMinimizedPanel('sources')
  }, [onSelectNode])

  const locked = !workflow.blueprintApproved

  if (locked) {
    return (
      <div className="outline-tab outline-tab--locked">
        <div className="outline-tab__locked-inner">
          <div className="outline-tab__locked-icon" aria-hidden>
            <GitBranch size={28} strokeWidth={1.5} />
          </div>
          <h2>Outline</h2>
          <p>
            Generate your outline from the Blueprint tab first. Once approved, your modular,
            research-backed structure will appear here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="outline-tab">
      <header className="outline-tab__header">
        <h1 className="outline-tab__title">Outline</h1>
        <div className="outline-tab__toolbar">
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
              outlineMinimized ? (
                <PanelLeftOpen size={16} strokeWidth={1.75} />
              ) : (
                <PanelLeftClose size={16} strokeWidth={1.75} />
              )
            }
            label="Minimize Outline"
            active={outlineMinimized}
            aria-pressed={outlineMinimized}
            onClick={() => toggleMinimize('outline')}
          />
          <BlueprintHeaderBtn
            icon={
              sourcesMinimized ? (
                <PanelRightOpen size={16} strokeWidth={1.75} />
              ) : (
                <PanelRightClose size={16} strokeWidth={1.75} />
              )
            }
            label="Minimize Sources"
            active={sourcesMinimized}
            aria-pressed={sourcesMinimized}
            onClick={() => toggleMinimize('sources')}
          />
        </div>
      </header>

      <div className="outline-tab__header-rule" aria-hidden />

      <div
        className={`outline-tab__body ${outlineMinimized ? 'outline-tab__body--outline-min' : ''} ${sourcesMinimized ? 'outline-tab__body--sources-min' : ''} ${!outlineMinimized && !sourcesMinimized ? 'outline-tab__body--split' : ''}`}
      >
        {bothMinimized ? (
          <div className="outline-tab__empty">
            <p>Both panels are minimized. Use the toolbar above to restore Outline or Sources.</p>
          </div>
        ) : !outlineMinimized && !sourcesMinimized ? (
          <ResizableSplitPane
            className="outline-tab__split"
            initialRatio={0.6}
            left={
              <div className="outline-tab__pane outline-tab__pane--outline">
                <OutlinePanel
                  nodes={nodes}
                  sources={sources}
                  workflow={workflow}
                  selectedNodeId={selectedNodeId}
                  selectedSourceId={selectedSourceId}
                  onSelectPoint={handleSelectPoint}
                  onSelectSource={handleSelectSource}
                  onToggleCollapse={onToggleCollapse}
                  onExpandAll={onExpandAll}
                  onCollapseAll={onCollapseAll}
                  onAddNode={onAddNode}
                  onRemoveNode={onRemoveNode}
                  onMoveNode={onMoveNode}
                  draftEverGenerated={draftEverGenerated}
                  generatingDraft={generatingDraft}
                  onGenerateDraft={onGenerateDraft}
                />
              </div>
            }
            right={
              <div
                className={`outline-tab__pane outline-tab__pane--sources ${hasSelection ? 'outline-tab__pane--sources-ready' : ''}`}
              >
                <SourcesPanel
                  nodes={nodes}
                  sources={sources}
                  workflow={workflow}
                  selectedNodeId={selectedNodeId}
                  selectedSourceId={selectedSourceId}
                  onSelectSource={onSelectSource}
                  onUpdateNode={onUpdateNode}
                  onUpdateQuote={onUpdateSourceQuote}
                  onUpdateQuotes={onUpdateSourceQuotes}
                  onDetachSource={onDetachSource}
                  onPrevPoint={() => cyclePoint(-1)}
                  onNextPoint={() => cyclePoint(1)}
                  onDone={handleSourcesDone}
                  canCyclePoints={mainPoints.length > 0}
                  onUpdateSource={onUpdateSource}
                  onAddNode={onAddNode}
                  onRemoveNode={onRemoveNode}
                  onMoveNode={onMoveNode}
                  onSearchSources={onSearchSources}
                  onAddFoundSource={onAddFoundSource}
                  onUploadSource={(fileName) => onUploadSource(fileName, 'primary')}
                  onAttachSource={onAttachSource}
                />
              </div>
            }
          />
        ) : (
          <>
            {!outlineMinimized && (
              <div className="outline-tab__pane outline-tab__pane--outline">
                <OutlinePanel
                  nodes={nodes}
                  sources={sources}
                  workflow={workflow}
                  selectedNodeId={selectedNodeId}
                  selectedSourceId={selectedSourceId}
                  onSelectPoint={handleSelectPoint}
                  onSelectSource={handleSelectSource}
                  onToggleCollapse={onToggleCollapse}
                  onExpandAll={onExpandAll}
                  onCollapseAll={onCollapseAll}
                  onAddNode={onAddNode}
                  onRemoveNode={onRemoveNode}
                  onMoveNode={onMoveNode}
                  draftEverGenerated={draftEverGenerated}
                  generatingDraft={generatingDraft}
                  onGenerateDraft={onGenerateDraft}
                />
              </div>
            )}

            {!sourcesMinimized && (
              <div
                className={`outline-tab__pane outline-tab__pane--sources ${hasSelection ? 'outline-tab__pane--sources-ready' : ''}`}
              >
                <SourcesPanel
                  nodes={nodes}
                  sources={sources}
                  workflow={workflow}
                  selectedNodeId={selectedNodeId}
                  selectedSourceId={selectedSourceId}
                  onSelectSource={onSelectSource}
                  onUpdateNode={onUpdateNode}
                  onUpdateQuote={onUpdateSourceQuote}
                  onUpdateQuotes={onUpdateSourceQuotes}
                  onDetachSource={onDetachSource}
                  onPrevPoint={() => cyclePoint(-1)}
                  onNextPoint={() => cyclePoint(1)}
                  onDone={handleSourcesDone}
                  canCyclePoints={mainPoints.length > 0}
                  onUpdateSource={onUpdateSource}
                  onAddNode={onAddNode}
                  onRemoveNode={onRemoveNode}
                  onMoveNode={onMoveNode}
                  onSearchSources={onSearchSources}
                  onAddFoundSource={onAddFoundSource}
                  onUploadSource={(fileName) => onUploadSource(fileName, 'primary')}
                  onAttachSource={onAttachSource}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
