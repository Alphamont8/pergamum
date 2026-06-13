'use client'

import { BookOpen, FileText, Globe } from 'lucide-react'
import type { BibliographyGroup, SourceRecord } from '@/types'
import { ReliabilityBadge } from './ReliabilityBadge'
import './SourceLibraryCard.css'

interface SourceLibraryCardProps {
  source: SourceRecord
  group?: BibliographyGroup
  citedCount?: number
  selected?: boolean
  onClick: () => void
}

function kindIcon(source: SourceRecord) {
  if (source.exa?.favicon) {
    return (
      <span
        className="source-lib-card__favicon"
        style={{ backgroundImage: `url(${source.exa.favicon})` }}
        role="img"
        aria-hidden
      />
    )
  }
  if (source.sourceKind === 'journal-article' || source.sourceKind === 'preprint') {
    return <FileText size={16} strokeWidth={1.5} />
  }
  if (source.sourceKind === 'book' || source.sourceKind === 'book-chapter') {
    return <BookOpen size={16} strokeWidth={1.5} />
  }
  return <Globe size={16} strokeWidth={1.5} />
}

export function SourceLibraryCard({
  source,
  group,
  citedCount = 0,
  selected,
  onClick,
}: SourceLibraryCardProps) {
  const meta = [source.authors, source.year, source.venue?.name ?? source.publisher]
    .filter(Boolean)
    .join(' · ')

  return (
    <article
      className={`source-lib-card ${selected ? 'source-lib-card--selected' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onClick()
      }}
    >
      <div className="source-lib-card__icon">{kindIcon(source)}</div>
      <div className="source-lib-card__body">
        <h4 className="source-lib-card__title">{source.title}</h4>
        {meta && <p className="source-lib-card__meta">{meta}</p>}
        <div className="source-lib-card__badges">
          {source.sourceKind === 'preprint' && <span className="source-lib-card__badge">Preprint</span>}
          {source.sourceKind === 'journal-article' && (
            <span className="source-lib-card__badge source-lib-card__badge--peer">Peer-reviewed</span>
          )}
          {source.openAccess?.isOA && (
            <span className="source-lib-card__badge source-lib-card__badge--oa">Open Access</span>
          )}
          {(source.citedByCount ?? 0) > 0 && (
            <span className="source-lib-card__badge">{source.citedByCount}× cited</span>
          )}
          {source.addedVia && (
            <span className="source-lib-card__badge source-lib-card__badge--via">{source.addedVia}</span>
          )}
          {group === 'cited' && citedCount > 0 && (
            <span className="source-lib-card__badge">{citedCount} in essay</span>
          )}
        </div>
      </div>
      <ReliabilityBadge
        score={source.reliability?.overall}
        band={source.reliability?.band}
      />
    </article>
  )
}
