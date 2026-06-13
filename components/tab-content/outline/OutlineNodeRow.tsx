"use client"

import { type ReactNode } from 'react'
import { ChevronDown, ChevronRight, GripVertical, Trash2 } from 'lucide-react'
import type { OutlineNode, OutlineTreeNode, SourceRecord } from '../../../types'
import './OutlineNodeRow.css'

export type DropPosition = 'before' | 'after' | 'inside' | null

interface OutlineNodeRowProps {
  node: OutlineTreeNode
  depth: number
  locked: boolean
  editMode: boolean
  selectedPointId: string | null
  selectedSourceId: string | null
  sources: SourceRecord[]
  dragId: string | null
  dragNodeType: OutlineNode['type'] | null
  dropTargetId: string | null
  dropPosition: DropPosition
  onSelectPoint: (pointId: string) => void
  onSelectSource: (sourceId: string) => void
  onToggleCollapse: (id: string) => void
  onRemove: (id: string) => void
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onDragOver: (id: string, position: DropPosition) => void
  onDrop: (id: string, position: DropPosition) => void
  renderChildren: (children: OutlineTreeNode[], depth: number) => ReactNode
}

export function OutlineNodeRow({
  node,
  depth,
  locked,
  editMode,
  selectedPointId,
  selectedSourceId,
  sources,
  dragId,
  dragNodeType,
  dropTargetId,
  dropPosition,
  onSelectPoint,
  onSelectSource,
  onToggleCollapse,
  onRemove,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  renderChildren,
}: OutlineNodeRowProps) {
  const hasChildren = node.children.length > 0
  const isPoint = node.type === 'point'
  const isSubpoint = node.type === 'subpoint'
  const isDragging = dragId === node.id
  const canDragPoint = editMode && !locked && isPoint
  const canDragSubpoint = editMode && !locked && isSubpoint
  const showChildrenArea = isPoint ? !node.collapsed : hasChildren && !node.collapsed
  const pointBlockSelected = isPoint && selectedPointId === node.id
  const activeDrop = dropTargetId === node.id ? dropPosition : null

  const handleSelectPoint = () => {
    if (isPoint) {
      onSelectPoint(node.id)
      return
    }
    if (isSubpoint && node.parentId) {
      onSelectPoint(node.parentId)
    }
  }

  const computePointBlockPosition = (e: React.DragEvent, blockEl: HTMLElement): DropPosition => {
    const blockRect = blockEl.getBoundingClientRect()
    const y = e.clientY
    const band = Math.max(10, Math.min(20, blockRect.height * 0.15))
    if (y <= blockRect.top + band) return 'before'
    if (y >= blockRect.bottom - band) return 'after'
    const mid = blockRect.top + blockRect.height / 2
    return y < mid ? 'before' : 'after'
  }

  const computePosition = (e: React.DragEvent, allowInside: boolean): DropPosition => {
    if (allowInside && dragNodeType === 'subpoint') return 'inside'
    if (allowInside && dragNodeType === 'point' && isPoint) {
      return computePointBlockPosition(e, e.currentTarget as HTMLElement)
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const midpoint = rect.top + rect.height / 2
    return e.clientY < midpoint ? 'before' : 'after'
  }

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.stopPropagation()
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    onDragStart(id)
  }

  const forwardPointDragToParent = (e: React.DragEvent): boolean => {
    if (dragNodeType !== 'point' || !isSubpoint || !node.parentId || dragId === node.parentId) {
      return false
    }
    const parentBlock = (e.currentTarget as HTMLElement).closest('.outline-point-block')
    if (!parentBlock) return false
    e.preventDefault()
    e.stopPropagation()
    const position = computePointBlockPosition(e, parentBlock as HTMLElement)
    onDragOver(node.parentId, position)
    return true
  }

  const handleDropLineDragOver = (e: React.DragEvent, position: 'before' | 'after') => {
    if (!editMode || !dragId || dragId === node.id) return
    if (dragNodeType !== 'point') return
    e.preventDefault()
    e.stopPropagation()
    onDragOver(node.id, position)
  }

  const handleDropLineDrop = (e: React.DragEvent, position: 'before' | 'after') => {
    if (!editMode || !dragId || dragId === node.id) return
    if (dragNodeType !== 'point') return
    e.preventDefault()
    e.stopPropagation()
    onDrop(node.id, position)
  }

  const handleRowDragOver = (e: React.DragEvent, allowInside: boolean) => {
    if (!editMode || !dragId || dragId === node.id) return
    if (forwardPointDragToParent(e)) return
    e.preventDefault()
    e.stopPropagation()
    const position = computePosition(e, allowInside)
    onDragOver(node.id, position)
  }

  const handleRowDrop = (e: React.DragEvent, allowInside: boolean) => {
    if (!editMode || !dragId) return
    if (dragNodeType === 'point' && isSubpoint && node.parentId && dragId !== node.parentId) {
      const parentBlock = (e.currentTarget as HTMLElement).closest('.outline-point-block')
      if (parentBlock) {
        e.preventDefault()
        e.stopPropagation()
        onDrop(node.parentId, computePointBlockPosition(e, parentBlock as HTMLElement))
        return
      }
    }
    e.preventDefault()
    e.stopPropagation()
    const position = computePosition(e, allowInside)
    onDrop(node.id, position)
  }

  const dragHandle = (extraClass = '') =>
    (isPoint ? canDragPoint : canDragSubpoint) ? (
      <div
        className={`outline-node-row__drag-btn ${extraClass}`}
        role="button"
        tabIndex={0}
        aria-label={`Reorder ${node.title}`}
        draggable
        onDragStart={(e) => handleDragStart(e, node.id)}
        onDragEnd={onDragEnd}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical size={14} strokeWidth={1.75} />
      </div>
    ) : null

  const renderSourceChips = () =>
    isSubpoint &&
    node.sourceRefs.length > 0 && (
      <div className="outline-node-row__sources">
        {node.sourceRefs.map((ref) => {
          const src = sources.find((s) => s.id === ref.sourceId)
          if (!src) return null
          return (
            <span
              key={ref.sourceId}
              className={`outline-node-row__source-chip ${selectedSourceId === ref.sourceId ? 'outline-node-row__source-chip--active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                if (node.parentId) onSelectPoint(node.parentId)
                onSelectSource(ref.sourceId)
              }}
            >
              <span className="outline-node-row__source-chip-link">{src.title}</span>
            </span>
          )
        })}
      </div>
    )

  if (isPoint) {
    return (
      <div
        className={`outline-point-block ${editMode ? 'outline-point-block--edit' : ''} ${pointBlockSelected ? 'outline-point-block--selected' : ''} ${isDragging ? 'outline-point-block--dragging' : ''} ${activeDrop === 'before' ? 'outline-point-block--drop-before' : ''} ${activeDrop === 'after' ? 'outline-point-block--drop-after' : ''} ${activeDrop === 'inside' ? 'outline-point-block--drop-inside' : ''}`}
        onDragOver={(e) => handleRowDragOver(e, true)}
        onDrop={(e) => handleRowDrop(e, true)}
      >
        <span
          className="outline-node-row__drop-line outline-node-row__drop-line--before"
          aria-hidden
          onDragOver={(e) => handleDropLineDragOver(e, 'before')}
          onDrop={(e) => handleDropLineDrop(e, 'before')}
        />
        <div
          className="outline-point-block__surface"
          onClick={handleSelectPoint}
          onDoubleClick={handleSelectPoint}
        >
          <div
            className={`outline-node-row outline-node-row--point ${editMode ? 'outline-node-row--edit' : 'outline-node-row--no-edit'} outline-node-row--has-collapse`}
          >
            <div className="outline-node-row__head">
              {dragHandle()}
              <button
                type="button"
                className="outline-node-row__collapse-btn"
                aria-expanded={!node.collapsed}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleCollapse(node.id)
                }}
              >
                {node.collapsed ? (
                  <ChevronRight size={14} strokeWidth={1.75} />
                ) : (
                  <ChevronDown size={14} strokeWidth={1.75} />
                )}
              </button>

              <span className="outline-node-row__text">{node.title}</span>

              {!locked && editMode && (
                <div className="outline-node-row__actions">
                  <button
                    type="button"
                    className="outline-node-row__action-btn outline-node-row__action-btn--delete"
                    title="Delete"
                    aria-label={`Delete ${node.title}`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemove(node.id)
                    }}
                  >
                    <Trash2 size={14} strokeWidth={1.75} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {showChildrenArea && hasChildren && (
            <div className="outline-point-block__subs">
              {renderChildren(node.children, depth + 1)}
            </div>
          )}
        </div>
        <span
          className="outline-node-row__drop-line outline-node-row__drop-line--after"
          aria-hidden
          onDragOver={(e) => handleDropLineDragOver(e, 'after')}
          onDrop={(e) => handleDropLineDrop(e, 'after')}
        />
      </div>
    )
  }

  return (
    <div
      className={`outline-node-row outline-node-row--subpoint ${editMode ? 'outline-node-row--edit' : 'outline-node-row--no-edit'} ${isDragging ? 'outline-node-row--dragging' : ''} ${activeDrop === 'before' ? 'outline-node-row--drop-before' : ''} ${activeDrop === 'after' ? 'outline-node-row--drop-after' : ''}`}
      onDragOver={(e) => handleRowDragOver(e, false)}
      onDrop={(e) => handleRowDrop(e, false)}
    >
      <span className="outline-node-row__drop-line outline-node-row__drop-line--before" aria-hidden />
      <div
        className="outline-node-row__main"
        onClick={(e) => {
          e.stopPropagation()
          handleSelectPoint()
        }}
        onDoubleClick={(e) => {
          e.stopPropagation()
          handleSelectPoint()
        }}
      >
        <div className="outline-node-row__head">
          {dragHandle()}
          <span className="outline-node-row__text">{node.title}</span>
        </div>
        {renderSourceChips()}
      </div>
      <span className="outline-node-row__drop-line outline-node-row__drop-line--after" aria-hidden />
    </div>
  )
}
