"use client"

import type { OutlineNode, SourceRecord } from '../../../types'
import { getOutlineNodeAncestors } from '../../../state/essayInitial'
import './NodeDetailCard.css'

interface NodeDetailCardProps {
  node: OutlineNode
  allNodes: OutlineNode[]
  sources: SourceRecord[]
  selectedSourceId: string | null
  locked?: boolean
  onUpdateNode: (id: string, patch: Partial<OutlineNode>) => void
  onSelectSource: (sourceId: string) => void
  onUpdateQuote: (nodeId: string, sourceId: string, quote: string) => void
  onDetachSource: (nodeId: string, sourceId: string) => void
}

export function NodeDetailCard({
  node,
  allNodes,
  sources,
  selectedSourceId,
  locked,
  onUpdateNode,
  onSelectSource,
  onUpdateQuote,
  onDetachSource,
}: NodeDetailCardProps) {
  const ancestors = getOutlineNodeAncestors(allNodes, node.id)
  const typeLabel =
    node.type === 'section' ? 'Section' : node.type === 'point' ? 'Point' : 'Subpoint'

  return (
    <div className="node-detail-card bp-card">
      {ancestors.length > 0 && (
        <nav className="node-detail-card__breadcrumb" aria-label="Outline path">
          {ancestors.map((ancestor, i) => (
            <span key={ancestor.id} className="node-detail-card__crumb">
              {i > 0 && <span className="node-detail-card__crumb-sep">›</span>}
              {ancestor.title}
            </span>
          ))}
          <span className="node-detail-card__crumb">
            <span className="node-detail-card__crumb-sep">›</span>
            {node.title}
          </span>
        </nav>
      )}

      <span className="node-detail-card__type">{typeLabel}</span>

      <label className="bp-field-label">Content</label>
      <textarea
        className="node-detail-card__title-input bp-textarea"
        rows={3}
        value={node.title}
        disabled={locked}
        onChange={(e) => onUpdateNode(node.id, { title: e.target.value })}
      />

      <h4 className="node-detail-card__sources-heading bp-section-label">Attached Sources</h4>

      {node.sourceRefs.length === 0 ? (
        <p className="node-detail-card__empty-sources bp-field-body">
          No sources attached yet. Research this point or search for topics below.
        </p>
      ) : (
        <ul className="node-detail-card__source-list">
          {node.sourceRefs.map((ref) => {
            const src = sources.find((s) => s.id === ref.sourceId)
            if (!src) return null
            const active = selectedSourceId === ref.sourceId
            return (
              <li
                key={ref.sourceId}
                className={`node-detail-card__source-item ${active ? 'node-detail-card__source-item--active' : ''}`}
                onClick={() => onSelectSource(ref.sourceId)}
              >
                <div className="node-detail-card__source-head">
                  <p className="node-detail-card__source-title">
                    {src.url ? (
                      <a href={src.url} target="_blank" rel="noreferrer">
                        {src.title}
                      </a>
                    ) : (
                      src.title
                    )}
                  </p>
                  {!locked && (
                    <button
                      type="button"
                      className="node-detail-card__detach-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDetachSource(node.id, ref.sourceId)
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
                {(src.authors || src.year || src.publisher) && (
                  <p className="node-detail-card__source-meta">
                    {[src.authors, src.year, src.publisher].filter(Boolean).join(' · ')}
                  </p>
                )}
                {src.summary && (
                  <p className="node-detail-card__source-summary">{src.summary}</p>
                )}
                <label className="node-detail-card__quote-label">Key quote</label>
                <textarea
                  className="node-detail-card__quote-input bp-textarea"
                  rows={2}
                  value={ref.quote ?? ''}
                  disabled={locked}
                  placeholder="Add a key quote or relevant excerpt…"
                  onChange={(e) => onUpdateQuote(node.id, ref.sourceId, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
