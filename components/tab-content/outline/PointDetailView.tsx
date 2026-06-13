"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { GripVertical, Link, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react'
import type { OutlineNode, SourceRecord } from '../../../types'
import { clearDefaultTitleOnFocus } from '../../../lib/clear-default-title'
import { getSourceRefQuotes } from '../../../lib/source-ref-quotes'
import { PublicationDateInput } from '../../ui/PublicationDateInput'
import './PointDetailView.css'
import './SourceSearchBar.css'

type SourceDraftMode = 'upload' | 'insert'
type DropPosition = 'before' | 'after' | null

const OPENABLE_UPLOAD = /\.(pdf|html?|txt|rtf|docx?)$/i

function sourceShowsSummary(src: SourceRecord): boolean {
  const via = src.addedVia ?? (src.fileName ? 'upload' : 'search')
  return via !== 'upload' && Boolean(src.summary?.trim())
}

function sourceTitleHref(src: SourceRecord): string | null {
  const url = src.url?.trim()
  if (!url) return null
  if (src.addedVia === 'upload' || src.fileName) {
    return OPENABLE_UPLOAD.test(src.fileName ?? url) ? url : null
  }
  return url
}

interface PointDetailViewProps {
  point: OutlineNode
  subpoints: OutlineNode[]
  sources: SourceRecord[]
  selectedSourceId: string | null
  locked?: boolean
  processingSubpointId?: string | null
  onUpdateNode: (id: string, patch: Partial<OutlineNode>) => void
  onAddSubpoint: (pointId: string) => void
  onMoveSubpoint: (subpointId: string, newOrder: number) => void
  onRemoveSubpoint: (subpointId: string) => void
  onSelectSource: (sourceId: string | null) => void
  onUpdateQuote: (nodeId: string, sourceId: string, quote: string) => void
  onUpdateQuotes: (nodeId: string, sourceId: string, quotes: string[]) => void
  onDetachSource: (nodeId: string, sourceId: string) => void
  onUpdateSource: (sourceId: string, patch: Partial<SourceRecord>) => void
  onProcessUpload: (subpointId: string, file: File) => void
  onProcessLink: (subpointId: string, url: string) => void
  onSearchForSubpoint: (subpointId: string) => void
}

function AutoGrowTextarea({
  value,
  disabled,
  className,
  minRows = 1,
  placeholder,
  onChange,
  onClick,
  onFocus,
}: {
  value: string
  disabled?: boolean
  className?: string
  minRows?: number
  placeholder?: string
  onChange: (value: string) => void
  onClick?: (e: React.MouseEvent<HTMLTextAreaElement>) => void
  onFocus?: (e: React.FocusEvent<HTMLTextAreaElement>) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const resize = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  useEffect(() => {
    resize()
  }, [value, resize])

  return (
    <textarea
      ref={ref}
      className={className}
      rows={minRows}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onInput={resize}
      onClick={onClick}
      onFocus={onFocus}
    />
  )
}

export function PointDetailView({
  point,
  subpoints,
  sources,
  selectedSourceId,
  locked,
  processingSubpointId,
  onUpdateNode,
  onAddSubpoint,
  onMoveSubpoint,
  onRemoveSubpoint,
  onSelectSource,
  onUpdateQuote,
  onUpdateQuotes,
  onDetachSource,
  onUpdateSource,
  onProcessUpload,
  onProcessLink,
  onSearchForSubpoint,
}: PointDetailViewProps) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [dropPosition, setDropPosition] = useState<DropPosition>(null)
  const [quoteDrag, setQuoteDrag] = useState<{
    subId: string
    sourceId: string
    index: number
  } | null>(null)
  const [quoteDrop, setQuoteDrop] = useState<{
    subId: string
    sourceId: string
    index: number
    position: DropPosition
  } | null>(null)
  const [sourceDraft, setSourceDraft] = useState<{ subpointId: string; mode: SourceDraftMode } | null>(
    null,
  )
  const [linkDraft, setLinkDraft] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)
  const [editingSourceKey, setEditingSourceKey] = useState<string | null>(null)
  const [subpointsEditMode, setSubpointsEditMode] = useState(false)
  const uploadInputRef = useRef<HTMLInputElement>(null)

  const computeDropPosition = (e: React.DragEvent): DropPosition => {
    const rect = e.currentTarget.getBoundingClientRect()
    const midpoint = rect.top + rect.height / 2
    return e.clientY < midpoint ? 'before' : 'after'
  }

  const handleDrop = (targetId: string, position: DropPosition) => {
    if (!dragId || !position || dragId === targetId) return
    const ids = subpoints.map((s) => s.id)
    const from = ids.indexOf(dragId)
    const targetIndex = ids.indexOf(targetId)
    if (from < 0 || targetIndex < 0) return
    let to = position === 'before' ? targetIndex : targetIndex + 1
    if (from < to) to -= 1
    onMoveSubpoint(dragId, to)
    setDragId(null)
    setDropTargetId(null)
    setDropPosition(null)
  }

  const beginSubpointDrag = (e: React.DragEvent, id: string) => {
    e.stopPropagation()
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    setDragId(id)
  }

  const isValidLink = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed || /\s/.test(trimmed)) return false
    if (/^https?:\/\//i.test(trimmed)) {
      try {
        new URL(trimmed)
        return true
      } catch {
        return /\./.test(trimmed)
      }
    }
    return /\./.test(trimmed)
  }

  const openSourceDraft = (subpointId: string, mode: SourceDraftMode) => {
    setSourceDraft({ subpointId, mode })
    setLinkDraft('')
    setLinkError(null)
    if (mode === 'upload') {
      requestAnimationFrame(() => uploadInputRef.current?.click())
    }
  }

  const closeSourceDraft = () => {
    setSourceDraft(null)
    setLinkDraft('')
    setLinkError(null)
  }

  const toggleSourceEdit = (sourceKey: string) => {
    onSelectSource(null)
    setEditingSourceKey((current) => (current === sourceKey ? null : sourceKey))
  }

  const reorderQuotes = (
    subId: string,
    sourceId: string,
    fromIndex: number,
    toIndex: number,
    quotes: string[],
  ) => {
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return
    const next = [...quotes]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    onUpdateQuotes(subId, sourceId, next)
  }

  const handleQuoteDrop = (
    subId: string,
    sourceId: string,
    targetIndex: number,
    position: DropPosition,
    quotes: string[],
  ) => {
    if (!quoteDrag || quoteDrag.subId !== subId || quoteDrag.sourceId !== sourceId || !position) {
      return
    }
    const from = quoteDrag.index
    let to = position === 'before' ? targetIndex : targetIndex + 1
    if (from < to) to -= 1
    reorderQuotes(subId, sourceId, from, to, quotes)
    setQuoteDrag(null)
    setQuoteDrop(null)
  }

  useEffect(() => {
    if (!selectedSourceId) return
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Element
      if (target.closest('.point-detail-view__source-item')) return
      onSelectSource(null)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [selectedSourceId, onSelectSource])

  const renderSourceTitle = (src: SourceRecord) => {
    const href = sourceTitleHref(src)
    if (href) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="point-detail-view__source-title point-detail-view__source-title--link"
          onClick={(e) => e.stopPropagation()}
        >
          {src.title}
        </a>
      )
    }
    return <p className="point-detail-view__source-title">{src.title}</p>
  }

  return (
    <div className="point-detail-view bp-card">
      <h3 className="point-detail-view__heading bp-section-label">Detailed View</h3>
      <label className="point-detail-view__field-label bp-field-label">Main Point</label>
      <AutoGrowTextarea
        className="point-detail-view__main-input bp-textarea"
        value={point.title}
        disabled={locked}
        minRows={2}
        onChange={(title) => onUpdateNode(point.id, { title })}
        onFocus={() => clearDefaultTitleOnFocus(point.title, () => onUpdateNode(point.id, { title: '' }))}
      />

      <div className="point-detail-view__subpoints-block">
        <h4 className="point-detail-view__subpoints-heading bp-field-label">Subpoints</h4>
        {!locked && (
          <div className="point-detail-view__subpoints-actions">
            <button
              type="button"
              className={`point-detail-view__subpoint-icon-btn ${subpointsEditMode ? 'point-detail-view__subpoint-icon-btn--active' : ''}`}
              title="Edit subpoints"
              aria-label="Edit subpoints"
              aria-pressed={subpointsEditMode}
              onClick={() => setSubpointsEditMode((v) => !v)}
            >
              <Pencil size={14} strokeWidth={1.75} aria-hidden />
            </button>
            <button
              type="button"
              className="point-detail-view__subpoint-icon-btn"
              title="Add subpoint"
              aria-label="Add subpoint"
              onClick={() => onAddSubpoint(point.id)}
            >
              <Plus size={14} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        )}
        {subpoints.length === 0 ? (
          <p className="point-detail-view__empty bp-field-body">No subpoints yet for this point.</p>
        ) : (
          <ul className="point-detail-view__subpoints">
          {subpoints.map((sub) => {
            const isDragging = dragId === sub.id
            const activeDrop = dropTargetId === sub.id && dragId !== sub.id ? dropPosition : null
            const draftOpen = sourceDraft?.subpointId === sub.id
            const isProcessing = processingSubpointId === sub.id

            return (
              <li
                key={sub.id}
                className={`point-detail-view__subpoint ${isDragging ? 'point-detail-view__subpoint--dragging' : ''} ${activeDrop === 'before' ? 'point-detail-view__subpoint--drop-before' : ''} ${activeDrop === 'after' ? 'point-detail-view__subpoint--drop-after' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault()
                  if (!dragId || dragId === sub.id) return
                  const position = computeDropPosition(e)
                  setDropTargetId(sub.id)
                  setDropPosition(position)
                }}
                onDragLeave={() => {
                  if (dropTargetId === sub.id) {
                    setDropTargetId(null)
                    setDropPosition(null)
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const position = computeDropPosition(e)
                  handleDrop(sub.id, position)
                }}
              >
                <span
                  className="point-detail-view__subpoint-drop-line point-detail-view__subpoint-drop-line--before"
                  aria-hidden
                />
                <div className="point-detail-view__subpoint-row">
                  {!locked && subpointsEditMode && (
                    <div
                      className="point-detail-view__drag-btn"
                      role="button"
                      tabIndex={0}
                      aria-label={`Reorder ${sub.title}`}
                      draggable
                      onDragStart={(e) => beginSubpointDrag(e, sub.id)}
                      onDragEnd={() => {
                        setDragId(null)
                        setDropTargetId(null)
                        setDropPosition(null)
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <GripVertical size={14} strokeWidth={1.75} />
                    </div>
                  )}

                  <div className="point-detail-view__subpoint-editor">
                    <AutoGrowTextarea
                      className="point-detail-view__subpoint-input bp-textarea"
                      value={sub.title}
                      disabled={locked}
                      minRows={3}
                      onChange={(title) => onUpdateNode(sub.id, { title })}
                      onClick={(e) => e.stopPropagation()}
                      onFocus={() =>
                        clearDefaultTitleOnFocus(sub.title, () => onUpdateNode(sub.id, { title: '' }))
                      }
                    />
                  </div>
                  {!locked && subpointsEditMode && (
                    <button
                      type="button"
                      className="point-detail-view__subpoint-delete-btn"
                      aria-label={`Delete subpoint`}
                      title="Delete subpoint"
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemoveSubpoint(sub.id)
                      }}
                    >
                      <Trash2 size={14} strokeWidth={1.75} />
                    </button>
                  )}
                </div>

                <div className="point-detail-view__sources-block">
                  <span className="point-detail-view__sources-title bp-field-label">
                    Attached Sources
                  </span>
                  {!locked && (
                    <div className="point-detail-view__sources-actions">
                      <button
                        type="button"
                        className="point-detail-view__source-action-btn"
                        onClick={() => openSourceDraft(sub.id, 'upload')}
                      >
                        <Upload size={12} strokeWidth={1.75} aria-hidden />
                        Upload
                      </button>
                      <button
                        type="button"
                        className="point-detail-view__source-action-btn"
                        onClick={() => openSourceDraft(sub.id, 'insert')}
                      >
                        <Link size={12} strokeWidth={1.75} aria-hidden />
                        Insert
                      </button>
                      <button
                        type="button"
                        className="point-detail-view__source-action-btn"
                        onClick={() => onSearchForSubpoint(sub.id)}
                      >
                        <Search size={12} strokeWidth={1.75} aria-hidden />
                        Search
                      </button>
                    </div>
                  )}
                  <div className="point-detail-view__sources-body">
                  {sub.sourceRefs.length === 0 && (
                    <span className="point-detail-view__sources-desc bp-field-body">No sources attached.</span>
                  )}

                {draftOpen && sourceDraft?.mode === 'upload' && (
                  <div className="point-detail-view__source-draft-card">
                    <div className="point-detail-view__source-draft-header">
                      <span className="point-detail-view__source-draft-title">Upload Source</span>
                      <button
                        type="button"
                        className="point-detail-view__source-draft-cancel"
                        onClick={closeSourceDraft}
                      >
                        Cancel
                      </button>
                    </div>
                    <div
                      className={`point-detail-view__upload-zone ${isProcessing ? 'point-detail-view__upload-zone--busy' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => !isProcessing && uploadInputRef.current?.click()}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && !isProcessing) {
                          e.preventDefault()
                          uploadInputRef.current?.click()
                        }
                      }}
                    >
                      <Upload size={18} strokeWidth={1.75} aria-hidden />
                      <span className="point-detail-view__upload-zone-text">
                        {isProcessing ? 'Processing upload…' : 'Drop a file or click to upload'}
                      </span>
                      <span className="point-detail-view__upload-zone-formats">One file only</span>
                    </div>
                  </div>
                )}

                {draftOpen && sourceDraft?.mode === 'insert' && (
                  <div className="point-detail-view__source-draft-card">
                    <div className="point-detail-view__source-draft-header">
                      <span className="point-detail-view__source-draft-title">Insert Link</span>
                      <button
                        type="button"
                        className="point-detail-view__source-draft-cancel"
                        onClick={closeSourceDraft}
                      >
                        Cancel
                      </button>
                    </div>
                    <form
                      className="point-detail-view__link-form"
                      onSubmit={(e) => {
                        e.preventDefault()
                        const url = linkDraft.trim()
                        if (!url || isProcessing) return
                        if (!isValidLink(url)) {
                          setLinkError('Enter a valid link (e.g. example.com or https://example.com/page)')
                          return
                        }
                        setLinkError(null)
                        onProcessLink(sub.id, url)
                        closeSourceDraft()
                      }}
                    >
                      <div className="point-detail-view__link-field">
                        <input
                          type="text"
                          className={`point-detail-view__link-input bp-input ${linkError ? 'point-detail-view__link-input--invalid' : ''}`}
                          placeholder="Paste a source link…"
                          value={linkDraft}
                          disabled={isProcessing}
                          onChange={(e) => {
                            setLinkDraft(e.target.value)
                            if (linkError) setLinkError(null)
                          }}
                        />
                        {linkError && (
                          <p className="point-detail-view__link-error" role="alert">
                            {linkError}
                          </p>
                        )}
                      </div>
                      <button
                        type="submit"
                        className="source-search-icon-btn"
                        disabled={!linkDraft.trim() || isProcessing}
                        aria-label="Add link"
                      >
                        <Search size={14} strokeWidth={1.75} aria-hidden />
                      </button>
                    </form>
                  </div>
                )}

                {sub.sourceRefs.length > 0 && (
                  <ul className="point-detail-view__source-list">
                    {sub.sourceRefs.map((ref) => {
                      const src = sources.find((s) => s.id === ref.sourceId)
                      if (!src) return null
                      const active = selectedSourceId === ref.sourceId
                      const sourceKey = `${sub.id}:${ref.sourceId}`
                      const isEditing = editingSourceKey === sourceKey

                      return (
                        <li
                          key={ref.sourceId}
                          className={`point-detail-view__source-item ${active ? 'point-detail-view__source-item--active' : ''}`}
                          onClick={() => onSelectSource(ref.sourceId)}
                        >
                          {isEditing ? (
                            <div className="point-detail-view__source-edit-header">
                              <h4 className="point-detail-view__source-edit-heading bp-section-label">
                                Edit Source
                              </h4>
                              {!locked && (
                                <div className="point-detail-view__source-item-actions">
                                  <button
                                    type="button"
                                    className="point-detail-view__source-icon-btn point-detail-view__source-icon-btn--active"
                                    aria-label="Edit source details"
                                    title="Edit source details"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      toggleSourceEdit(sourceKey)
                                    }}
                                  >
                                    <Pencil size={14} strokeWidth={1.75} />
                                  </button>
                                  <button
                                    type="button"
                                    className="point-detail-view__source-icon-btn point-detail-view__source-icon-btn--delete"
                                    aria-label="Remove source"
                                    title="Remove source"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setEditingSourceKey(null)
                                      onDetachSource(sub.id, ref.sourceId)
                                    }}
                                  >
                                    <Trash2 size={14} strokeWidth={1.75} />
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="point-detail-view__source-head">
                              {renderSourceTitle(src)}
                              {!locked && (
                                <div className="point-detail-view__source-item-actions">
                                  <button
                                    type="button"
                                    className="point-detail-view__source-icon-btn"
                                    aria-label="Edit source details"
                                    title="Edit source details"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      toggleSourceEdit(sourceKey)
                                    }}
                                  >
                                    <Pencil size={14} strokeWidth={1.75} />
                                  </button>
                                  <button
                                    type="button"
                                    className="point-detail-view__source-icon-btn point-detail-view__source-icon-btn--delete"
                                    aria-label="Remove source"
                                    title="Remove source"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      onDetachSource(sub.id, ref.sourceId)
                                    }}
                                  >
                                    <Trash2 size={14} strokeWidth={1.75} />
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                          {isEditing ? (
                            <div
                              className="point-detail-view__source-edit"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <label className="point-detail-view__source-edit-field">
                                <span className="bp-field-label">Title</span>
                                <input
                                  type="text"
                                  className="bp-input"
                                  value={src.title}
                                  onChange={(e) =>
                                    onUpdateSource(ref.sourceId, { title: e.target.value })
                                  }
                                />
                              </label>
                              <label className="point-detail-view__source-edit-field">
                                <span className="bp-field-label">Authors</span>
                                <input
                                  type="text"
                                  className="bp-input"
                                  value={src.authors ?? ''}
                                  onChange={(e) =>
                                    onUpdateSource(ref.sourceId, { authors: e.target.value })
                                  }
                                />
                              </label>
                              <label className="point-detail-view__source-edit-field">
                                <span className="bp-field-label">Publication Date</span>
                                <PublicationDateInput
                                  value={src.year ?? ''}
                                  onChange={(year) => onUpdateSource(ref.sourceId, { year })}
                                />
                              </label>
                              <label className="point-detail-view__source-edit-field">
                                <span className="bp-field-label">Publisher</span>
                                <input
                                  type="text"
                                  className="bp-input"
                                  value={src.publisher ?? ''}
                                  onChange={(e) =>
                                    onUpdateSource(ref.sourceId, { publisher: e.target.value })
                                  }
                                />
                              </label>
                              <label className="point-detail-view__source-edit-field">
                                <span className="bp-field-label">Summary</span>
                                <AutoGrowTextarea
                                  className="point-detail-view__summary-input bp-textarea"
                                  value={src.summary ?? ''}
                                  minRows={3}
                                  onChange={(summary) =>
                                    onUpdateSource(ref.sourceId, { summary })
                                  }
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </label>
                            </div>
                          ) : (
                            <>
                              {(src.authors || src.year || src.publisher) && (
                                <p className="point-detail-view__source-meta">
                                  {[src.authors, src.year, src.publisher].filter(Boolean).join(' · ')}
                                </p>
                              )}
                              {sourceShowsSummary(src) && (
                                <p className="point-detail-view__source-summary">{src.summary}</p>
                              )}
                            </>
                          )}
                          {isEditing ? (
                            <div
                              className="point-detail-view__quotes-section point-detail-view__quotes-section--edit"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="point-detail-view__quotes-header">
                                <span className="point-detail-view__quotes-label bp-field-label">
                                  Key Quotes and Notes
                                </span>
                                {!locked && (
                                  <button
                                    type="button"
                                    className="point-detail-view__quote-add-btn"
                                    aria-label="Add quote"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      const quotes = getSourceRefQuotes(ref)
                                      onUpdateQuotes(sub.id, ref.sourceId, [...quotes, ''])
                                    }}
                                  >
                                    <Plus size={14} strokeWidth={1.75} />
                                  </button>
                                )}
                              </div>
                              <ul className="point-detail-view__quote-rows">
                                {getSourceRefQuotes(ref).map((quoteText, quoteIndex) => {
                                  const quotes = getSourceRefQuotes(ref)
                                  const isQuoteDragging =
                                    quoteDrag?.subId === sub.id &&
                                    quoteDrag.sourceId === ref.sourceId &&
                                    quoteDrag.index === quoteIndex
                                  const activeQuoteDrop =
                                    quoteDrop?.subId === sub.id &&
                                    quoteDrop.sourceId === ref.sourceId &&
                                    quoteDrop.index === quoteIndex
                                      ? quoteDrop.position
                                      : null

                                  return (
                                    <li
                                      key={`${ref.sourceId}-quote-${quoteIndex}`}
                                      className={`point-detail-view__quote-row ${isQuoteDragging ? 'point-detail-view__quote-row--dragging' : ''} ${activeQuoteDrop === 'before' ? 'point-detail-view__quote-row--drop-before' : ''} ${activeQuoteDrop === 'after' ? 'point-detail-view__quote-row--drop-after' : ''}`}
                                      onDragOver={(e) => {
                                        e.preventDefault()
                                        if (
                                          !quoteDrag ||
                                          quoteDrag.subId !== sub.id ||
                                          quoteDrag.sourceId !== ref.sourceId
                                        ) {
                                          return
                                        }
                                        const position = computeDropPosition(e)
                                        setQuoteDrop({
                                          subId: sub.id,
                                          sourceId: ref.sourceId,
                                          index: quoteIndex,
                                          position,
                                        })
                                      }}
                                      onDragLeave={() => {
                                        if (
                                          quoteDrop?.subId === sub.id &&
                                          quoteDrop.sourceId === ref.sourceId &&
                                          quoteDrop.index === quoteIndex
                                        ) {
                                          setQuoteDrop(null)
                                        }
                                      }}
                                      onDrop={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        handleQuoteDrop(
                                          sub.id,
                                          ref.sourceId,
                                          quoteIndex,
                                          computeDropPosition(e),
                                          quotes,
                                        )
                                      }}
                                    >
                                      {!locked && (
                                        <div
                                          className="point-detail-view__quote-drag-btn"
                                          role="button"
                                          tabIndex={0}
                                          aria-label={`Reorder quote ${quoteIndex + 1}`}
                                          draggable
                                          onDragStart={(e) => {
                                            e.stopPropagation()
                                            e.dataTransfer.effectAllowed = 'move'
                                            setQuoteDrag({
                                              subId: sub.id,
                                              sourceId: ref.sourceId,
                                              index: quoteIndex,
                                            })
                                          }}
                                          onDragEnd={() => {
                                            setQuoteDrag(null)
                                            setQuoteDrop(null)
                                          }}
                                          onMouseDown={(e) => e.stopPropagation()}
                                        >
                                          <GripVertical size={14} strokeWidth={1.75} />
                                        </div>
                                      )}
                                      <AutoGrowTextarea
                                        className="point-detail-view__quote-input point-detail-view__quote-input--edit bp-textarea"
                                        value={quoteText}
                                        disabled={locked}
                                        minRows={2}
                                        placeholder="Add key quotes, excerpts, or research notes…"
                                        onChange={(value) => {
                                          const next = [...quotes]
                                          next[quoteIndex] = value
                                          onUpdateQuotes(sub.id, ref.sourceId, next)
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                      {!locked && (
                                        <button
                                          type="button"
                                          className="point-detail-view__quote-delete-btn"
                                          aria-label={`Remove quote ${quoteIndex + 1}`}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            const next = quotes.filter((_, i) => i !== quoteIndex)
                                            onUpdateQuotes(sub.id, ref.sourceId, next)
                                          }}
                                        >
                                          <Trash2 size={14} strokeWidth={1.75} />
                                        </button>
                                      )}
                                    </li>
                                  )
                                })}
                              </ul>
                            </div>
                          ) : (
                            getSourceRefQuotes(ref)
                              .filter((q) => q.trim())
                              .map((q, i) => (
                                <blockquote key={i} className="point-detail-view__quote-display">
                                  {q}
                                </blockquote>
                              ))
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
                  </div>
                </div>
                <span
                  className="point-detail-view__subpoint-drop-line point-detail-view__subpoint-drop-line--after"
                  aria-hidden
                />
              </li>
            )
          })}
          </ul>
        )}
      </div>

      <input
        ref={uploadInputRef}
        type="file"
        hidden
        accept=".pdf,.doc,.docx,.txt,.rtf"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (!file || !sourceDraft || sourceDraft.mode !== 'upload') return
          onProcessUpload(sourceDraft.subpointId, file)
          closeSourceDraft()
          e.target.value = ''
        }}
      />
    </div>
  )
}
