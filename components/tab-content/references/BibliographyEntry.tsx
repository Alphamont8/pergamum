'use client'

import type { BibliographyEntry as BibEntry } from '@/types'
import './BibliographyEntry.css'

interface BibliographyEntryProps {
  entry: BibEntry
  selected?: boolean
  onSelect: () => void
}

export function BibliographyEntryRow({
  entry,
  selected,
  onSelect,
}: BibliographyEntryProps) {
  return (
    <article
      className={`bib-entry ${selected ? 'bib-entry--selected' : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelect()
      }}
    >
      <p className="bib-entry__text">
        {entry.citationNumber != null && (
          <span className="bib-entry__number">[{entry.citationNumber}] </span>
        )}
        {entry.formatted}
      </p>
    </article>
  )
}
