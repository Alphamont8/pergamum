"use client"

import { useMemo, useState } from 'react'
import { ChevronsDownUp, ChevronsUpDown, GitBranch, Layers, Pencil, Plus, RefreshCw, Sparkles } from 'lucide-react'
import type { EssayWorkflowState, OutlineNode, OutlineTreeNode, SourceRecord } from '../../../types'
import { buildOutlineTree } from '../../../state/essayInitial'
import { OutlineNodeRow, type DropPosition } from './OutlineNodeRow'
import './OutlinePanel.css'

interface OutlinePanelProps {
  nodes: OutlineNode[]
  sources: SourceRecord[]
  workflow: EssayWorkflowState
  selectedNodeId: string | null
  selectedSourceId: string | null
  onSelectPoint: (pointId: string) => void
  onSelectSource: (sourceId: string) => void
  onToggleCollapse: (id: string) => void
  onExpandAll: () => void
  onCollapseAll: () => void
  onAddNode: (parentId: string | null, type: OutlineNode['type'], title?: string) => string
  onRemoveNode: (id: string) => void
  onMoveNode: (id: string, newParentId: string | null, newOrder: number) => void
  draftEverGenerated?: boolean
  generatingDraft?: boolean
  onGenerateDraft: () => void
}

export function OutlinePanel({
  nodes,
  sources,
  workflow,
  selectedNodeId,
  selectedSourceId,
  onSelectPoint,
  onSelectSource,
  onToggleCollapse,
  onExpandAll,
  onCollapseAll,
  onAddNode,
  onRemoveNode,
  onMoveNode,
  draftEverGenerated,
  generatingDraft,
  onGenerateDraft,
}: OutlinePanelProps) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [dropPosition, setDropPosition] = useState<DropPosition>(null)
  const [editMode, setEditMode] = useState(false)

  const locked = !workflow.blueprintApproved
  const tree = useMemo(() => buildOutlineTree(nodes), [nodes])

  const stats = useMemo(() => {
    const sections = nodes.filter((n) => n.type === 'section').length
    const points = nodes.filter((n) => n.type === 'point').length
    const subpoints = nodes.filter((n) => n.type === 'subpoint').length
    const linkedSourceIds = new Set<string>()
    nodes
      .filter((n) => n.type === 'subpoint')
      .forEach((n) => n.sourceRefs.forEach((ref) => linkedSourceIds.add(ref.sourceId)))
    return { sections, points, subpoints, sources: linkedSourceIds.size }
  }, [nodes])

  const addPoint = (parentId: string, title: string) => {
    const id = onAddNode(parentId, 'point', title)
    onSelectPoint(id)
  }

  const canDropOn = (targetId: string, position: DropPosition) => {
    if (!dragId || !position || !editMode) return false
    const dragged = nodes.find((n) => n.id === dragId)
    const target = nodes.find((n) => n.id === targetId)
    if (!dragged || !target || dragged.id === target.id) return false
    if (dragged.type === 'section' || target.type === 'section') return false
    if (position === 'inside') {
      return target.type === 'point' && dragged.type === 'subpoint'
    }
    return dragged.type === target.type
  }

  const isAboveFirstPoint = (sectionEl: HTMLElement, clientY: number) => {
    const firstBlock = sectionEl.querySelector('.outline-point-block')
    if (!firstBlock) return true
    return clientY < firstBlock.getBoundingClientRect().top + 8
  }

  const handleSectionDropZoneDragOver = (
    e: React.DragEvent,
    firstPointId: string | undefined,
  ) => {
    if (!editMode || !dragId || !firstPointId) return
    const dragged = nodes.find((n) => n.id === dragId)
    if (dragged?.type !== 'point') return
    const sectionEl = e.currentTarget as HTMLElement
    if (!isAboveFirstPoint(sectionEl, e.clientY)) return
    if (!canDropOn(firstPointId, 'before')) return
    e.preventDefault()
    setDropTargetId(firstPointId)
    setDropPosition('before')
  }

  const handleSectionDropZoneDrop = (
    e: React.DragEvent,
    firstPointId: string | undefined,
  ) => {
    if (!editMode || !dragId || !firstPointId) return
    const sectionEl = e.currentTarget as HTMLElement
    if (!isAboveFirstPoint(sectionEl, e.clientY)) return
    e.preventDefault()
    resolveDrop(firstPointId, 'before')
    setDragId(null)
    setDropTargetId(null)
    setDropPosition(null)
  }

  const resolveDrop = (targetId: string, position: DropPosition) => {
    if (!canDropOn(targetId, position)) return
    const dragged = nodes.find((n) => n.id === dragId)!
    const target = nodes.find((n) => n.id === targetId)!

    if (position === 'inside') {
      const childOrder = nodes.filter((n) => n.parentId === target.id).length
      onMoveNode(dragged.id, target.id, childOrder)
      return
    }

    const parentId = target.parentId
    const siblings = nodes
      .filter((n) => n.parentId === parentId && n.id !== dragged.id)
      .sort((a, b) => a.order - b.order)
    const targetIndex = siblings.findIndex((n) => n.id === target.id)
    const newOrder = position === 'before' ? targetIndex : targetIndex + 1
    onMoveNode(dragged.id, parentId, Math.max(0, newOrder))
  }

  const selectedPointId = useMemo(() => {
    if (!selectedNodeId) return null
    const selected = nodes.find((n) => n.id === selectedNodeId)
    if (!selected) return null
    if (selected.type === 'point') return selected.id
    if (selected.type === 'subpoint' && selected.parentId) return selected.parentId
    return null
  }, [nodes, selectedNodeId])

  const renderPoints = (items: OutlineTreeNode[], depth: number) =>
    items.map((node) => (
      <OutlineNodeRow
        key={node.id}
        node={node}
        depth={depth}
        locked={locked}
        editMode={editMode}
        selectedPointId={selectedPointId}
        selectedSourceId={selectedSourceId}
        sources={sources}
        dragId={dragId}
        onSelectSource={onSelectSource}
        dragNodeType={dragId ? (nodes.find((n) => n.id === dragId)?.type ?? null) : null}
        dropTargetId={dropTargetId}
        dropPosition={dropPosition}
        onSelectPoint={onSelectPoint}
        onToggleCollapse={onToggleCollapse}
        onRemove={onRemoveNode}
        onDragStart={setDragId}
        onDragEnd={() => {
          setDragId(null)
          setDropTargetId(null)
          setDropPosition(null)
        }}
        onDragOver={(id, position) => {
          if (!canDropOn(id, position)) return
          setDropTargetId(id)
          setDropPosition(position)
        }}
        onDrop={(id, position) => {
          resolveDrop(id, position)
          setDragId(null)
          setDropTargetId(null)
          setDropPosition(null)
        }}
        renderChildren={(children, childDepth) => renderPoints(children, childDepth)}
      />
    ))

  if (locked) {
    return (
      <section className="outline-panel outline-panel--locked" aria-label="Outline">
        <div className="outline-panel__placeholder">
          <div className="outline-panel__placeholder-icon" aria-hidden>
            <GitBranch size={28} strokeWidth={1.5} />
          </div>
          <h3 className="outline-panel__placeholder-title">Outline</h3>
          <p className="outline-panel__placeholder-text">
            Generate your outline from the Blueprint tab first. Once approved, your modular,
            research-backed structure will appear here.
          </p>
        </div>
      </section>
    )
  }

  if (tree.length === 0) {
    return (
      <section className="outline-panel outline-panel--empty" aria-label="Outline">
        <div className="outline-panel__placeholder">
          <div className="outline-panel__placeholder-icon" aria-hidden>
            <Layers size={28} strokeWidth={1.5} />
          </div>
          <h3 className="outline-panel__placeholder-title">No outline yet</h3>
          <p className="outline-panel__placeholder-text">
            Your outline will be generated from the Framework sections. Regenerate from Blueprint
            when your framework is ready.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="outline-panel" aria-label="Outline">
      <header className="outline-panel__header">
        <div className="outline-panel__stats" aria-label="Outline coverage">
          <span className="outline-panel__stat">
            Sections: <strong>{stats.sections}</strong>
          </span>
          <span className="outline-panel__stat">
            Points: <strong>{stats.points}</strong>
          </span>
          <span className="outline-panel__stat">
            Subpoints: <strong>{stats.subpoints}</strong>
          </span>
          <span className="outline-panel__stat">
            Sources: <strong>{stats.sources}</strong>
          </span>
        </div>
        <div className="outline-panel__header-actions">
          <button
            type="button"
            className="outline-panel__header-btn"
            disabled={locked}
            title="Expand all points"
            onClick={onExpandAll}
          >
            <ChevronsUpDown size={14} strokeWidth={1.75} aria-hidden />
            Expand All
          </button>
          <button
            type="button"
            className="outline-panel__header-btn"
            disabled={locked}
            title="Collapse all points"
            onClick={onCollapseAll}
          >
            <ChevronsDownUp size={14} strokeWidth={1.75} aria-hidden />
            Collapse All
          </button>
          <button
            type="button"
            className={`outline-panel__header-btn ${editMode ? 'outline-panel__header-btn--active' : ''}`}
            aria-pressed={editMode}
            onClick={() => setEditMode((v) => !v)}
          >
            <Pencil size={14} strokeWidth={1.75} aria-hidden />
            Edit
          </button>
        </div>
      </header>

      <div className="outline-panel__scroll">
        <div className="outline-panel__sections">
          {tree.map((section) => (
            <article
              key={section.id}
              className="outline-section-box bp-card"
              onDragOver={(e) =>
                handleSectionDropZoneDragOver(
                  e,
                  section.children.find((c) => c.type === 'point')?.id,
                )
              }
              onDrop={(e) =>
                handleSectionDropZoneDrop(
                  e,
                  section.children.find((c) => c.type === 'point')?.id,
                )
              }
            >
              <div className="outline-section-box__header">
                <h3 className="outline-section-box__heading">{section.title.toUpperCase()}</h3>
                {!locked && (
                  <button
                    type="button"
                    className="outline-section-box__add-point"
                    title="Add point"
                    aria-label="Add point"
                    onClick={() => addPoint(section.id, '')}
                  >
                    <Plus size={14} strokeWidth={1.75} aria-hidden />
                  </button>
                )}
              </div>
              <div className="outline-section-box__body">
                {section.children.length > 0 ? (
                  renderPoints(section.children, 0)
                ) : (
                  <p className="outline-section-box__empty bp-field-body">No points yet.</p>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>

      <footer className="outline-panel__footer">
        <button
          type="button"
          className="bp-btn-primary"
          disabled={generatingDraft}
          onClick={onGenerateDraft}
        >
          {generatingDraft ? (
            <RefreshCw size={16} strokeWidth={1.75} aria-hidden className="outline-panel__spin" />
          ) : (
            <Sparkles size={16} strokeWidth={1.75} aria-hidden />
          )}
          {generatingDraft ? 'Generating Draft…' : draftEverGenerated ? 'Regenerate Draft' : 'Generate Draft'}
        </button>
      </footer>
    </section>
  )
}
