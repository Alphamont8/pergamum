"use client"

import { useState } from 'react'
import { GripVertical, Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import { clearDefaultTitleOnFocus } from '../../../lib/clear-default-title'
import type { WordBudget } from '../../../types'
import './WordBudgetEditor.css'

interface WordBudgetEditorProps {
  wordBudget: WordBudget
  targetTotal: number
  locked: boolean
  onUpdateSection: (sectionId: string, patch: { label?: string; weightPercent?: number }) => void
  onReorder: (orderedIds: string[]) => void
  onRemove: (sectionId: string) => void
  onAdd: () => void
  onRebalance: () => void
}

export function WordBudgetEditor({
  wordBudget,
  targetTotal,
  locked,
  onUpdateSection,
  onReorder,
  onRemove,
  onAdd,
  onRebalance,
}: WordBudgetEditorProps) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [weightDrafts, setWeightDrafts] = useState<Record<string, string | null>>({})

  const weightTotal = wordBudget.sections.reduce((sum, s) => sum + s.weightPercent, 0)
  const weightDelta = weightTotal - 100

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return
    const ids = wordBudget.sections.map((s) => s.id)
    const from = ids.indexOf(dragId)
    const to = ids.indexOf(targetId)
    if (from < 0 || to < 0) return
    const next = [...ids]
    next.splice(from, 1)
    next.splice(to, 0, dragId)
    onReorder(next)
    setDragId(null)
    setOverId(null)
  }

  const commitWeight = (sectionId: string, raw: string) => {
    setWeightDrafts((drafts) => {
      const next = { ...drafts }
      delete next[sectionId]
      return next
    })
    if (raw === '') {
      onUpdateSection(sectionId, { weightPercent: 0 })
      return
    }
    const parsed = Number(raw)
    if (!Number.isNaN(parsed)) {
      onUpdateSection(sectionId, { weightPercent: Math.max(0, Math.min(100, Math.round(parsed))) })
    }
  }

  return (
    <div className="word-budget-editor">
      <div className="word-budget-editor__header">
        <h4 className="word-budget-editor__heading bp-section-label">Word Count Distribution</h4>
        {!locked && (
          <div className="word-budget-editor__actions">
            <button type="button" className="word-budget-editor__action-btn" onClick={onRebalance}>
              <SlidersHorizontal size={14} strokeWidth={1.75} aria-hidden />
              Rebalance
            </button>
            <button type="button" className="word-budget-editor__action-btn" onClick={onAdd}>
              <Plus size={14} strokeWidth={1.75} aria-hidden />
              Add
            </button>
          </div>
        )}
      </div>

      <div
        className="word-budget-editor__columns"
        aria-hidden={wordBudget.sections.length === 0}
      >
        <span className="word-budget-editor__col-label word-budget-editor__col-label--drag" />
        <span className="word-budget-editor__col-label word-budget-editor__col-label--section bp-field-label">
          Section
        </span>
        <span className="word-budget-editor__col-label word-budget-editor__col-label--distribution bp-field-label">
          Distribution
        </span>
        <span className="word-budget-editor__col-label bp-field-label">Weighting</span>
        <span className="word-budget-editor__col-label word-budget-editor__col-label--action" />
      </div>

      <div className="word-budget-editor__rows">
        {wordBudget.sections.map((sec) => {
          const isDragging = dragId === sec.id
          const isDropTarget = overId === sec.id && dragId !== sec.id
          const weightDisplay =
            weightDrafts[sec.id] !== undefined && weightDrafts[sec.id] !== null
              ? weightDrafts[sec.id]!
              : String(sec.weightPercent)
          const effectiveWeight = (() => {
            const draft = weightDrafts[sec.id]
            if (draft !== undefined && draft !== null && draft !== '') {
              const parsed = Number.parseInt(draft, 10)
              return Number.isNaN(parsed) ? sec.weightPercent : parsed
            }
            return sec.weightPercent
          })()

          return (
            <div
              key={sec.id}
              className={`word-budget-editor__row ${isDragging ? 'word-budget-editor__row--dragging' : ''} ${isDropTarget ? 'word-budget-editor__row--drop-target' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                if (dragId && dragId !== sec.id) setOverId(sec.id)
              }}
              onDragLeave={() => {
                if (overId === sec.id) setOverId(null)
              }}
              onDrop={() => handleDrop(sec.id)}
            >
              {!locked ? (
                <button
                  type="button"
                  className="word-budget-editor__drag-btn"
                  aria-label={`Reorder ${sec.label}`}
                  draggable
                  onDragStart={(e) => {
                    setDragId(sec.id)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragEnd={() => {
                    setDragId(null)
                    setOverId(null)
                  }}
                >
                  <GripVertical size={14} strokeWidth={1.75} />
                </button>
              ) : (
                <span className="word-budget-editor__drag-spacer" />
              )}
              <input
                type="text"
                className="word-budget-editor__label bp-input"
                value={sec.label}
                disabled={locked}
                aria-label={`Section label ${sec.label}`}
                onChange={(e) => onUpdateSection(sec.id, { label: e.target.value })}
                onFocus={() =>
                  clearDefaultTitleOnFocus(sec.label, () => onUpdateSection(sec.id, { label: '' }))
                }
              />
              <div className="word-budget-editor__bar-track">
                {effectiveWeight > 0 && (
                  <div
                    className="word-budget-editor__bar"
                    style={{ width: `${effectiveWeight}%` }}
                    aria-hidden
                  />
                )}
              </div>
              <div className="word-budget-editor__weight-cell">
                <input
                  type="number"
                  className="word-budget-editor__weight-input bp-input"
                  min={0}
                  max={100}
                  value={weightDisplay}
                  disabled={locked}
                  aria-label={`Weighting percent ${sec.label}`}
                  onChange={(e) => {
                    if (locked) return
                    setWeightDrafts((drafts) => ({ ...drafts, [sec.id]: e.target.value }))
                  }}
                  onBlur={(e) => {
                    if (locked) return
                    commitWeight(sec.id, e.target.value)
                  }}
                />
                <span className="word-budget-editor__weight-suffix" aria-hidden>
                  %
                </span>
              </div>
              {!locked ? (
                <button
                  type="button"
                  className="word-budget-editor__delete-btn"
                  aria-label={`Remove ${sec.label}`}
                  disabled={wordBudget.sections.length <= 1}
                  onClick={() => onRemove(sec.id)}
                >
                  <Trash2 size={14} strokeWidth={1.75} />
                </button>
              ) : (
                <span className="word-budget-editor__delete-spacer" />
              )}
            </div>
          )
        })}
      </div>

      <div className="word-budget-editor__footer">
        <span className="word-budget-editor__footer-total">
          Weighting: <strong>{weightTotal}%</strong> / 100%
        </span>
        <div className="word-budget-editor__footer-weight-col">
          {weightDelta !== 0 && (
            <span
              className={`word-budget-editor__delta ${
                weightDelta > 0
                  ? 'word-budget-editor__delta--over'
                  : 'word-budget-editor__delta--under'
              }`}
            >
              {weightDelta > 0 ? `${weightDelta}% over` : `${Math.abs(weightDelta)}% under`}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
