'use client'

import type { DraftSuggestion } from '@/types'
import './SelectionToolOutput.css'

interface SelectionToolOutputProps {
  suggestion: DraftSuggestion
  variant?: 'default' | 'define'
  showsWordAlternatives?: boolean
  running?: boolean
  onReplace?: (id: string, text: string) => void
}

export function SelectionToolOutput({
  suggestion,
  variant = 'default',
  showsWordAlternatives,
  running,
  onReplace,
}: SelectionToolOutputProps) {
  if (running) {
    return <p className="selection-tool-output selection-tool-output--loading">Running…</p>
  }

  if (suggestion.status !== 'open') return null

  return (
    <div
      className={`selection-tool-output selection-tool-output--${variant}`}
      data-suggestion-id={suggestion.id}
    >
      {suggestion.message && (
        <p className="selection-tool-output__message">{suggestion.message}</p>
      )}
      {suggestion.suggestion && (
        <p className="selection-tool-output__suggestion">{suggestion.suggestion}</p>
      )}
      {showsWordAlternatives && (suggestion.alternatives?.length || suggestion.antonyms?.length) ? (
        <div className="selection-tool-output__word-lists">
          {suggestion.alternatives && suggestion.alternatives.length > 0 && (
            <div className="selection-tool-output__word-group">
              <span className="selection-tool-output__word-label">Synonyms</span>
              <div className="selection-tool-output__word-chips">
                {suggestion.alternatives.map((word) => (
                  <button
                    key={`syn-${word}`}
                    type="button"
                    className="selection-tool-output__word-chip"
                    onClick={() => onReplace?.(suggestion.id, word)}
                  >
                    {word}
                  </button>
                ))}
              </div>
            </div>
          )}
          {suggestion.antonyms && suggestion.antonyms.length > 0 && (
            <div className="selection-tool-output__word-group">
              <span className="selection-tool-output__word-label">Antonyms</span>
              <div className="selection-tool-output__word-chips">
                {suggestion.antonyms.map((word) => (
                  <button
                    key={`ant-${word}`}
                    type="button"
                    className="selection-tool-output__word-chip selection-tool-output__word-chip--antonym"
                    onClick={() => onReplace?.(suggestion.id, word)}
                  >
                    {word}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
