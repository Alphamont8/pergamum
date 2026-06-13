'use client'

import { ArrowLeft, ExternalLink, RefreshCw, Shield, Trash2 } from 'lucide-react'
import type { BibliographyEntry, OutlineNode, ReferencingStyleId, SourceRecord } from '@/types'
import { PublicationDateInput } from '../../ui/PublicationDateInput'
import { ReliabilityBadge } from './ReliabilityBadge'
import { ReliabilityBreakdown } from './ReliabilityBreakdown'
import '../../ui/PublicationDateInput.css'
import './SourceDetailCard.css'

interface SourceDetailCardProps {
  source: SourceRecord
  bibliographyEntry?: BibliographyEntry
  outlineNodes: OutlineNode[]
  styleId: ReferencingStyleId
  enriching?: boolean
  evaluating?: boolean
  onBack: () => void
  onUpdateSource: (patch: Partial<SourceRecord>) => void
  onEnrich: () => void
  onEvaluate: () => void
  onRemove?: () => void
}

export function SourceDetailCard({
  source,
  bibliographyEntry,
  outlineNodes,
  styleId,
  enriching,
  evaluating,
  onBack,
  onUpdateSource,
  onEnrich,
  onEvaluate,
  onRemove,
}: SourceDetailCardProps) {
  const outlineUsage = outlineNodes.flatMap((node) =>
    node.sourceRefs
      .filter((r) => r.sourceId === source.id)
      .map((r) => ({ nodeTitle: node.title, quotes: r.quotes ?? (r.quote ? [r.quote] : []) })),
  )

  return (
    <div className="source-detail">
      <button type="button" className="source-detail__back bp-btn-secondary" onClick={onBack}>
        <ArrowLeft size={14} strokeWidth={1.75} />
        Back to Library
      </button>

      <header className="source-detail__header">
        <div className="source-detail__title-row">
          <div className="source-detail__title-col">
            <h2 className="source-detail__title">{source.title}</h2>
            {(source.authors || source.year || source.venue?.name || source.publisher) && (
              <p className="source-detail__meta">
                {[source.authors, source.year, source.venue?.name ?? source.publisher]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </div>
          <ReliabilityBadge
            score={source.reliability?.overall}
            band={source.reliability?.band}
            size="md"
          />
        </div>
        {source.url && (
          <a href={source.url} target="_blank" rel="noreferrer" className="source-detail__link">
            <ExternalLink size={14} />
            Open Source
          </a>
        )}
      </header>

      <div className="source-detail__actions">
        <button type="button" className="bp-btn-secondary" disabled={enriching} onClick={onEnrich}>
          <RefreshCw size={14} />
          {enriching ? 'Updating…' : 'Update'}
        </button>
        <button type="button" className="bp-btn-secondary" disabled={evaluating} onClick={onEvaluate}>
          <Shield size={14} />
          {evaluating ? 'Evaluating…' : 'Evaluate'}
        </button>
        {onRemove && (
          <button type="button" className="bp-btn-secondary source-detail__remove" onClick={onRemove}>
            <Trash2 size={14} />
            Delete
          </button>
        )}
      </div>

      {(source.abstract || source.summary) && (
        <section className="source-detail__section bp-card">
          <span className="bp-section-label">Abstract</span>
          <p className="source-detail__abstract">{source.abstract ?? source.summary}</p>
        </section>
      )}

      {source.topics && source.topics.length > 0 && (
        <section className="source-detail__section">
          <span className="bp-section-label">Topics</span>
          <div className="source-detail__topics">
            {source.topics.map((t) => (
              <span key={t} className="source-detail__topic">
                {t}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="source-detail__section bp-card">
        <span className="bp-section-label">Metadata</span>
        <div className="source-detail__metadata">
          <label className="source-detail__edit-field">
            <span className="bp-field-label">Title</span>
            <input
              type="text"
              className="bp-input"
              value={source.title}
              onChange={(e) => onUpdateSource({ title: e.target.value })}
            />
          </label>
          <label className="source-detail__edit-field">
            <span className="bp-field-label">Authors</span>
            <input
              type="text"
              className="bp-input"
              value={source.authors ?? ''}
              onChange={(e) => onUpdateSource({ authors: e.target.value })}
            />
          </label>
          <label className="source-detail__edit-field">
            <span className="bp-field-label">Publication Date</span>
            <PublicationDateInput
              value={source.year ?? ''}
              onChange={(year) => onUpdateSource({ year })}
            />
          </label>
          <label className="source-detail__edit-field">
            <span className="bp-field-label">Publisher</span>
            <input
              type="text"
              className="bp-input"
              value={source.publisher ?? source.venue?.name ?? ''}
              onChange={(e) =>
                onUpdateSource({
                  publisher: e.target.value,
                  venue: { ...source.venue, name: e.target.value },
                })
              }
            />
          </label>
          {source.doi && (
            <div className="source-detail__edit-field">
              <span className="bp-field-label">DOI</span>
              <span className="source-detail__readonly">{source.doi}</span>
            </div>
          )}
        </div>
      </section>

      {bibliographyEntry && styleId !== 'none' && (
        <section className="source-detail__section bp-card">
          <span className="bp-section-label">Formatted Reference ({styleId})</span>
          <p className="source-detail__bib">{bibliographyEntry.formatted}</p>
        </section>
      )}

      {outlineUsage.length > 0 && (
        <section className="source-detail__section bp-card">
          <span className="bp-section-label">Used in Outline</span>
          <ul className="source-detail__usage">
            {outlineUsage.map((u, i) => (
              <li key={`${u.nodeTitle}-${i}`}>
                <strong>{u.nodeTitle}</strong>
                {u.quotes.map((q) => (
                  <blockquote key={q.slice(0, 40)}>{q}</blockquote>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}

      {source.reliability && (
        <section className="source-detail__section bp-card">
          <span className="bp-section-label">Reliability Breakdown</span>
          <ReliabilityBreakdown reliability={source.reliability} />
        </section>
      )}
    </div>
  )
}
