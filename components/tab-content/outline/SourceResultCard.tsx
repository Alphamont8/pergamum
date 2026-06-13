"use client"

import { Plus, TextQuote } from 'lucide-react'
import type { SourceSearchResult } from '../../../types'
import './SourceResultCard.css'

interface SourceResultCardProps {
  result: SourceSearchResult
  disabled?: boolean
  onAdd: (result: SourceSearchResult, quote?: string | null) => void
}

export function SourceResultCard({ result, disabled, onAdd }: SourceResultCardProps) {
  const quote = result.quotes?.[0]

  return (
    <article className="source-result-card">
      <div className="source-result-card__header">
        <h4 className="source-result-card__title">
          {result.url ? (
            <a href={result.url} target="_blank" rel="noreferrer">
              {result.title}
            </a>
          ) : (
            result.title
          )}
        </h4>
      </div>

      {(result.authors || result.year || result.publisher) && (
        <p className="source-result-card__meta">
          {[result.authors, result.year, result.publisher].filter(Boolean).join(' · ')}
        </p>
      )}

      <p className="source-result-card__summary">{result.summary}</p>

      {quote && <blockquote className="source-result-card__quote">{quote}</blockquote>}

      <div className="source-result-card__actions">
        <button
          type="button"
          className="bp-btn-secondary source-result-card__action-btn"
          disabled={disabled}
          onClick={() => onAdd(result, null)}
        >
          <Plus size={14} strokeWidth={1.75} aria-hidden />
          Add to Subpoint
        </button>
        <button
          type="button"
          className="bp-btn-secondary source-result-card__action-btn"
          disabled={disabled || !quote}
          onClick={() => onAdd(result, quote)}
        >
          <TextQuote size={14} strokeWidth={1.75} aria-hidden />
          Add with Quote
        </button>
      </div>
    </article>
  )
}
