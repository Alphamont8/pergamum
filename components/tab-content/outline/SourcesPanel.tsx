"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpen, ChevronLeft, ChevronRight } from 'lucide-react'
import type {
  EssayWorkflowState,
  OutlineNode,
  SourceRecord,
  SourceAddedVia,
  SourceSearchResult,
} from '../../../types'
import { PointDetailView } from './PointDetailView'
import { SourceResultCard } from './SourceResultCard'
import { SourceSearchBar } from './SourceSearchBar'
import './SourcesPanel.css'

interface SourcesPanelProps {
  nodes: OutlineNode[]
  sources: SourceRecord[]
  workflow: EssayWorkflowState
  selectedNodeId: string | null
  selectedSourceId: string | null
  onSelectSource: (sourceId: string | null) => void
  onUpdateNode: (id: string, patch: Partial<OutlineNode>) => void
  onAddNode: (parentId: string | null, type: OutlineNode['type'], title?: string) => string
  onRemoveNode: (id: string) => void
  onMoveNode: (id: string, newParentId: string | null, newOrder: number) => void
  onUpdateQuote: (nodeId: string, sourceId: string, quote: string) => void
  onUpdateQuotes: (nodeId: string, sourceId: string, quotes: string[]) => void
  onDetachSource: (nodeId: string, sourceId: string) => void
  onPrevPoint?: () => void
  onNextPoint?: () => void
  onDone?: () => void
  canCyclePoints?: boolean
  onUpdateSource: (sourceId: string, patch: Partial<SourceRecord>) => void
  onSearchSources: (query: string) => Promise<SourceSearchResult[]>
  onAddFoundSource: (
    nodeId: string,
    result: SourceSearchResult,
    quote?: string | null,
    addedVia?: SourceAddedVia,
  ) => void
  onUploadSource: (fileName: string) => string
  onAttachSource: (nodeId: string, sourceId: string) => void
}

function resolvePointSelection(
  nodes: OutlineNode[],
  selectedNodeId: string | null,
): { point: OutlineNode | null; sectionTitle: string } {
  if (!selectedNodeId) return { point: null, sectionTitle: '' }
  const selected = nodes.find((n) => n.id === selectedNodeId)
  if (!selected) return { point: null, sectionTitle: '' }

  let point: OutlineNode | null = null
  if (selected.type === 'point') {
    point = selected
  } else if (selected.type === 'subpoint' && selected.parentId) {
    point = nodes.find((n) => n.id === selected.parentId && n.type === 'point') ?? null
  }

  if (!point) return { point: null, sectionTitle: '' }

  const section = point.parentId
    ? nodes.find((n) => n.id === point.parentId && n.type === 'section')
    : null

  return { point, sectionTitle: section?.title ?? 'Section' }
}

function linkSourceFromUrl(url: string): SourceSearchResult {
  const trimmed = url.trim()
  const normalizedUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let title = trimmed
  try {
    title = new URL(normalizedUrl).hostname.replace(/^www\./, '')
  } catch {
    /* keep trimmed */
  }
  return {
    title,
    url: normalizedUrl,
    summary: '',
    type: 'secondary',
  }
}

export function SourcesPanel({
  nodes,
  sources,
  workflow,
  selectedNodeId,
  selectedSourceId,
  onSelectSource,
  onUpdateNode,
  onAddNode,
  onRemoveNode,
  onMoveNode,
  onUpdateQuote,
  onUpdateQuotes,
  onDetachSource,
  onPrevPoint,
  onNextPoint,
  onDone,
  canCyclePoints = false,
  onUpdateSource,
  onSearchSources,
  onAddFoundSource,
  onUploadSource,
  onAttachSource,
}: SourcesPanelProps) {
  const [results, setResults] = useState<SourceSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [resultsLabel, setResultsLabel] = useState<string | null>(null)
  const [activeSubpointId, setActiveSubpointId] = useState<string | null>(null)
  const [searchFocusRequest, setSearchFocusRequest] = useState(0)
  const [searchBoxVisible, setSearchBoxVisible] = useState(false)
  const [processingSubpointId, setProcessingSubpointId] = useState<string | null>(null)

  const locked = !workflow.blueprintApproved
  const { point, sectionTitle } = useMemo(
    () => resolvePointSelection(nodes, selectedNodeId),
    [nodes, selectedNodeId],
  )

  const subpoints = useMemo(() => {
    if (!point) return []
    return nodes
      .filter((n) => n.parentId === point.id && n.type === 'subpoint')
      .sort((a, b) => a.order - b.order)
  }, [nodes, point])

  useEffect(() => {
    if (!point) {
      setActiveSubpointId(null)
      setSearchBoxVisible(false)
      setResults([])
      setResultsLabel(null)
      setSearching(false)
      return
    }
    if (activeSubpointId && subpoints.some((s) => s.id === activeSubpointId)) return
    setActiveSubpointId(subpoints[0]?.id ?? null)
  }, [point, subpoints, activeSubpointId])

  useEffect(() => {
    setSearchBoxVisible(false)
    setResults([])
    setResultsLabel(null)
    setSearching(false)
  }, [point?.id])

  const attachTargetId = activeSubpointId ?? subpoints[0]?.id ?? null

  const runSearch = useCallback(
    async (query: string, label: string) => {
      setSearching(true)
      setResultsLabel(label)
      try {
        const found = await onSearchSources(query)
        setResults(found)
      } finally {
        setSearching(false)
      }
    },
    [onSearchSources],
  )

  const handleAddSubpoint = (pointId: string) => {
    const id = onAddNode(pointId, 'subpoint', '')
    setActiveSubpointId(id)
  }

  const handleMoveSubpoint = (subpointId: string, newOrder: number) => {
    if (!point) return
    onMoveNode(subpointId, point.id, newOrder)
  }

  const attachUploadedFile = (subpointId: string, file: File) => {
    const sourceId = onUploadSource(file.name)
    onAttachSource(subpointId, sourceId)
    if (/\.(pdf|html?|txt|rtf|docx?)$/i.test(file.name)) {
      onUpdateSource(sourceId, { url: URL.createObjectURL(file) })
    }
  }

  const clearSearchResults = () => {
    setResults([])
    setResultsLabel(null)
    setSearching(false)
    setSearchBoxVisible(false)
  }

  const handleSearchForSubpoint = (subpointId: string) => {
    setActiveSubpointId(subpointId)
    setSearchBoxVisible(true)
    setSearchFocusRequest((n) => n + 1)
  }

  const processExtractedText = async (subpointId: string, fileName: string, text: string) => {
    const title = fileName.replace(/\.[^.]+$/, '')
    const excerpt = text.trim().slice(0, 400)
    const authorMatch = text.match(/(?:by|author[s]?:)\s*([^\n]{3,80})/i)
    const summary = excerpt.slice(0, 160)
    onAddFoundSource(
      subpointId,
      {
        title: title || 'Uploaded source',
        url: '',
        summary,
        authors: authorMatch?.[1]?.trim(),
        quotes: excerpt ? [excerpt] : undefined,
        type: 'primary',
      },
      excerpt || undefined,
      'ai',
    )
  }

  const handleProcessUpload = async (subpointId: string, file: File) => {
    setProcessingSubpointId(subpointId)
    setActiveSubpointId(subpointId)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/ai/extract', { method: 'POST', body: formData })
      if (res.ok) {
        const data = (await res.json()) as { text?: string }
        await processExtractedText(subpointId, file.name, data.text ?? '')
      } else {
        attachUploadedFile(subpointId, file)
      }
    } catch {
      attachUploadedFile(subpointId, file)
    } finally {
      setProcessingSubpointId(null)
    }
  }

  const handleProcessLink = async (subpointId: string, url: string) => {
    setProcessingSubpointId(subpointId)
    setActiveSubpointId(subpointId)
    try {
      const linkResult = linkSourceFromUrl(url)
      onAddFoundSource(subpointId, linkResult, undefined, 'link')
    } finally {
      setProcessingSubpointId(null)
    }
  }

  if (locked) {
    return (
      <section className="sources-panel sources-panel--empty" aria-label="Sources">
        <div className="sources-panel__placeholder">
          <div className="sources-panel__placeholder-icon" aria-hidden>
            <BookOpen size={28} strokeWidth={1.5} />
          </div>
          <h3 className="sources-panel__placeholder-title">Sources</h3>
          <p className="sources-panel__placeholder-text">
            Select outline points to view source details, research evidence, and upload your own
            materials once your outline is generated.
          </p>
        </div>
      </section>
    )
  }

  if (!point) {
    return (
      <section className="sources-panel sources-panel--empty" aria-label="Sources">
        <div className="sources-panel__placeholder">
          <div className="sources-panel__placeholder-icon" aria-hidden>
            <BookOpen size={28} strokeWidth={1.5} />
          </div>
          <h3 className="sources-panel__placeholder-title">Sources</h3>
          <p className="sources-panel__placeholder-text">
            Select a point on the left to view its detailed breakdown, research sources, and attach
            evidence to subpoints.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="sources-panel" aria-label="Sources">
      <header className="sources-panel__header">
        <span className="sources-panel__section-tag">{sectionTitle}</span>
        <span className="sources-panel__header-spacer" aria-hidden />
        <button
          type="button"
          className="sources-panel__nav-btn"
          disabled={!canCyclePoints}
          aria-label="Previous point"
          onClick={onPrevPoint}
        >
          <ChevronLeft size={14} strokeWidth={1.75} aria-hidden />
        </button>
        <button
          type="button"
          className="sources-panel__nav-btn"
          disabled={!canCyclePoints}
          aria-label="Next point"
          onClick={onNextPoint}
        >
          <ChevronRight size={14} strokeWidth={1.75} aria-hidden />
        </button>
        <button type="button" className="sources-panel__close-btn bp-btn-primary" onClick={onDone}>
          Done
        </button>
      </header>

      <div className="sources-panel__scroll">
        <PointDetailView
          point={point}
          subpoints={subpoints}
          sources={sources}
          selectedSourceId={selectedSourceId}
          locked={locked}
          processingSubpointId={processingSubpointId}
          onUpdateNode={onUpdateNode}
          onAddSubpoint={handleAddSubpoint}
          onMoveSubpoint={handleMoveSubpoint}
          onRemoveSubpoint={onRemoveNode}
          onSelectSource={onSelectSource}
          onUpdateQuote={onUpdateQuote}
          onUpdateQuotes={onUpdateQuotes}
          onDetachSource={onDetachSource}
          onUpdateSource={onUpdateSource}
          onProcessUpload={handleProcessUpload}
          onProcessLink={handleProcessLink}
          onSearchForSubpoint={handleSearchForSubpoint}
        />

        {searchBoxVisible && (
          <div className="sources-panel__research-box bp-card">
            <SourceSearchBar
              disabled={locked}
              searching={searching}
              focusRequest={searchFocusRequest}
              showResults={searching || results.length > 0 || Boolean(resultsLabel)}
              onSearch={(query) => runSearch(query, `Results for "${query}"`)}
              onDone={clearSearchResults}
            />

            {(searching || results.length > 0 || resultsLabel) && (
              <div className="sources-panel__results">
                <h4 className="sources-panel__results-heading bp-section-label">
                  {resultsLabel ?? 'Research Results'}
                </h4>
                {searching && <p className="sources-panel__loading">Searching…</p>}
                {!searching && results.length === 0 && (
                  <p className="sources-panel__results-empty bp-field-body">No sources found.</p>
                )}
                {!searching &&
                  results.map((result, i) => (
                    <SourceResultCard
                      key={`${result.url}-${i}`}
                      result={result}
                      disabled={!attachTargetId}
                      onAdd={(r, quote) =>
                        attachTargetId && onAddFoundSource(attachTargetId, r, quote, 'search')
                      }
                    />
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
