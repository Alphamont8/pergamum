'use client'

import { Play, type LucideIcon } from 'lucide-react'
import type { PreferenceSelectOption } from '@/constants/preferenceOptions'
import type { DraftSuggestion, DraftToolKind, DraftToolScope, DraftToolState } from '@/types'
import type { DraftToolRunMode } from '@/lib/draft-tools'
import { SuggestionItem } from './SuggestionItem'
import './ToolCard.css'

interface ToolCardProps {
  tool: DraftToolKind
  title: string
  description: string
  icon: LucideIcon
  runMode: DraftToolRunMode
  state: DraftToolState
  scope: DraftToolScope
  highlightedId: string | null
  hasTextSelection: boolean
  writingStyleOptions?: PreferenceSelectOption[]
  selectedWritingStyle?: string
  onWritingStyleChange?: (style: string) => void
  showsWordAlternatives?: boolean
  hideScopeToggle?: boolean
  onScopeChange: (tool: DraftToolKind, scope: DraftToolScope) => void
  onRun: (tool: DraftToolKind) => void
  onAccept: (id: string) => void
  onDismiss: (id: string) => void
  onReplace: (id: string, text: string) => void
  onScrollTo: (id: string) => void
  onInsertSource?: (id: string) => void
  onAcceptAll: (tool: DraftToolKind) => void
  onDismissAll: (tool: DraftToolKind) => void
}

export function ToolCard({
  tool,
  title,
  description,
  icon: Icon,
  runMode,
  state,
  scope,
  highlightedId,
  hasTextSelection,
  writingStyleOptions,
  selectedWritingStyle,
  onWritingStyleChange,
  showsWordAlternatives,
  hideScopeToggle,
  onScopeChange,
  onRun,
  onAccept,
  onDismiss,
  onReplace,
  onScrollTo,
  onInsertSource,
  onAcceptAll,
  onDismissAll,
}: ToolCardProps) {
  const openResults = state.results.filter((s) => s.status === 'open')
  const running = state.status === 'running'
  const selectionBlocked = runMode === 'selection' && !hasTextSelection
  const styleBlocked = writingStyleOptions != null && writingStyleOptions.length === 0
  const showScopeToggle = runMode === 'selection' && !hideScopeToggle

  return (
    <article className="tool-card bp-card">
      <header className="tool-card__header">
        <div className="tool-card__title-row">
          <span className="tool-card__icon" aria-hidden>
            <Icon size={16} strokeWidth={1.75} />
          </span>
          <div className="tool-card__title-block">
            <h3 className="tool-card__title">{title}</h3>
            <p className="tool-card__description">{description}</p>
          </div>
          {openResults.length > 0 && (
            <span className="tool-card__badge">{openResults.length}</span>
          )}
        </div>
        <button
          type="button"
          className="bp-btn-secondary tool-card__run-btn"
          disabled={running || selectionBlocked || styleBlocked}
          aria-label={running ? 'Running' : 'Run'}
          title={running ? 'Running' : 'Run'}
          onClick={() => onRun(tool)}
        >
          {running ? (
            <span className="tool-card__run-btn-label">…</span>
          ) : (
            <Play size={12} strokeWidth={2} aria-hidden />
          )}
        </button>
      </header>

      {runMode === 'selection' && (
        <p className={`tool-card__scope-hint ${selectionBlocked ? 'tool-card__scope-hint--warn' : ''}`}>
          {selectionBlocked
            ? 'Highlight text in the document to run this tool.'
            : 'Uses your current text selection in the document.'}
        </p>
      )}

      {writingStyleOptions && writingStyleOptions.length > 0 && (
        <div className="tool-card__style-picker">
          <label className="tool-card__style-label" htmlFor={`tool-style-${tool}`}>
            Writing Style
          </label>
          <select
            id={`tool-style-${tool}`}
            className="tool-card__style-select"
            value={selectedWritingStyle || writingStyleOptions[0]?.value || ''}
            onChange={(e) => onWritingStyleChange?.(e.target.value)}
          >
            {writingStyleOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {showScopeToggle && (
        <div className="tool-card__controls">
          <div className="tool-card__scope" role="group" aria-label="Scope">
            <button
              type="button"
              className={scope === 'section' ? 'tool-card__scope--active' : ''}
              onClick={() => onScopeChange(tool, 'section')}
            >
              This Section
            </button>
            <button
              type="button"
              className={scope === 'essay' ? 'tool-card__scope--active' : ''}
              onClick={() => onScopeChange(tool, 'essay')}
            >
              Whole Essay
            </button>
          </div>
        </div>
      )}

      {openResults.length > 0 && (
        <div className="tool-card__bulk">
          <button type="button" className="bp-btn-secondary" onClick={() => onAcceptAll(tool)}>
            Accept All
          </button>
          <button type="button" className="bp-btn-secondary" onClick={() => onDismissAll(tool)}>
            Dismiss All
          </button>
        </div>
      )}

      <div className="tool-card__results">
        {openResults.length === 0 ? (
          <p className="tool-card__empty">
            {state.status === 'done'
              ? 'No issues found.'
              : 'Run this check to see suggestions.'}
          </p>
        ) : (
          openResults.map((s: DraftSuggestion) => (
            <SuggestionItem
              key={s.id}
              suggestion={s}
              highlighted={highlightedId === s.id}
              showsWordAlternatives={showsWordAlternatives}
              onAccept={onAccept}
              onDismiss={onDismiss}
              onReplace={onReplace}
              onScrollTo={onScrollTo}
              onInsertSource={tool === 'evidence' ? onInsertSource : undefined}
            />
          ))
        )}
      </div>
    </article>
  )
}
