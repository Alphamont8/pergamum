'use client'

import type { DraftSuggestion } from '@/types'
import './SuggestionItem.css'

interface SuggestionItemProps {
  suggestion: DraftSuggestion
  highlighted?: boolean
  showsWordAlternatives?: boolean
  showGoTo?: boolean
  onAccept: (id: string) => void
  onDismiss: (id: string) => void
  onReplace: (id: string, text: string) => void
  onScrollTo: (id: string) => void
  onInsertSource?: (id: string) => void
}

export function SuggestionItem({
  suggestion,
  highlighted,
  showsWordAlternatives,
  showGoTo = true,
  onAccept,
  onDismiss,
  onReplace,
  onScrollTo,
  onInsertSource,
}: SuggestionItemProps) {
  if (suggestion.status !== 'open') return null

  const severityLabel =
    suggestion.tool === 'shiftTone' || suggestion.tool === 'elevatePhrasing'
      ? 'Improvement'
      : suggestion.severity === 'error'
        ? 'Error'
        : suggestion.severity === 'warning'
          ? 'Warning'
          : suggestion.severity === 'improvement'
            ? 'Improvement'
            : 'Info'

  return (
    <div
      className={`suggestion-item ${highlighted ? 'suggestion-item--highlighted' : ''}`}
      data-suggestion-id={suggestion.id}
    >
      <div className="suggestion-item__header">
        <span
          className={`suggestion-item__severity suggestion-item__severity--${
            suggestion.tool === 'shiftTone' ||
            suggestion.tool === 'elevatePhrasing' ||
            suggestion.severity === 'improvement'
              ? 'improvement'
              : suggestion.severity
          }`}
        >
          {severityLabel}
        </span>
      </div>
      <p className="suggestion-item__message">{suggestion.message}</p>
      {suggestion.targetText && (
        <p className="suggestion-item__target">&ldquo;{suggestion.targetText}&rdquo;</p>
      )}
      {suggestion.suggestion && (
        <p className="suggestion-item__suggestion">{suggestion.suggestion}</p>
      )}
      {suggestion.sourceSuggestion && (
        <p className="suggestion-item__suggestion">
          Suggested source: {suggestion.sourceSuggestion.title}
          {suggestion.sourceSuggestion.authors ? ` (${suggestion.sourceSuggestion.authors})` : ''}
        </p>
      )}
      {showsWordAlternatives && (suggestion.alternatives?.length || suggestion.antonyms?.length) ? (
        <div className="suggestion-item__word-lists">
          {suggestion.alternatives && suggestion.alternatives.length > 0 && (
            <div className="suggestion-item__word-group">
              <span className="suggestion-item__word-label">Synonyms</span>
              <div className="suggestion-item__word-chips">
                {suggestion.alternatives.map((word) => (
                  <button
                    key={`syn-${word}`}
                    type="button"
                    className="suggestion-item__word-chip"
                    onClick={() => onReplace(suggestion.id, word)}
                  >
                    {word}
                  </button>
                ))}
              </div>
            </div>
          )}
          {suggestion.antonyms && suggestion.antonyms.length > 0 && (
            <div className="suggestion-item__word-group">
              <span className="suggestion-item__word-label">Antonyms</span>
              <div className="suggestion-item__word-chips">
                {suggestion.antonyms.map((word) => (
                  <button
                    key={`ant-${word}`}
                    type="button"
                    className="suggestion-item__word-chip suggestion-item__word-chip--antonym"
                    onClick={() => onReplace(suggestion.id, word)}
                  >
                    {word}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
      <div className="suggestion-item__actions">
        {showGoTo && (
          <button
            type="button"
            className="suggestion-item__btn"
            onClick={() => onScrollTo(suggestion.id)}
          >
            Go To
          </button>
        )}
        {suggestion.suggestion && (
          <button
            type="button"
            className="suggestion-item__btn suggestion-item__btn--primary"
            onClick={() => onAccept(suggestion.id)}
          >
            Accept
          </button>
        )}
        {suggestion.sourceSuggestion && onInsertSource && (
          <button
            type="button"
            className="suggestion-item__btn suggestion-item__btn--primary"
            onClick={() => onInsertSource(suggestion.id)}
          >
            Insert Citation
          </button>
        )}
        <button
          type="button"
          className="suggestion-item__btn"
          onClick={() => onDismiss(suggestion.id)}
        >
          Decline
        </button>
      </div>
    </div>
  )
}
