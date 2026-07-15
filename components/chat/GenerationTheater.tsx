'use client'

import { useMemo } from 'react'
import { Button } from '@/components/ui/Button'
import type { CitationPipelineStage } from '@/lib/cite/stages'
import type { LiveSentenceState } from '@/lib/essay/liveSegments'
import { LiveEssayCanvas } from './LiveEssayCanvas'
import { PipelineActivityRail, type PossibleMatchChip } from './PipelineActivityRail'
import './generation-theater.css'

export type TheaterMode = 'running' | 'complete' | 'error'

function resolveDraftTitle(title: string | null | undefined, essay: string): string {
  const t = title?.trim()
  if (t && t !== 'Untitled draft' && t !== 'Untitled') return t
  const first = essay.trim().split(/\n+/)[0]?.replace(/\s+/g, ' ').trim() ?? ''
  if (first.length >= 8) {
    return first.length > 72 ? `${first.slice(0, 72).trim()}…` : first
  }
  return t || 'Untitled draft'
}

export function GenerationTheater({
  essay,
  sentences,
  live,
  activeIndexes,
  stages,
  progress,
  statusMessage,
  title,
  mode,
  error,
  possibleMatches = {},
  onViewDraft,
  onRetry,
  allowSentenceRetry = false,
  retryingIndex = null,
  onRetrySentence,
  onLockedRetry,
  embedded = false,
}: {
  essay: string
  sentences: Array<{ index: number; text: string }>
  live: Record<number, LiveSentenceState>
  activeIndexes: number[]
  stages: Record<number, CitationPipelineStage | 'searching'>
  progress: { current: number; total: number }
  statusMessage: string
  title?: string | null
  mode: TheaterMode
  error: string | null
  possibleMatches?: Record<number, PossibleMatchChip[]>
  onViewDraft: () => void
  onRetry: () => void
  allowSentenceRetry?: boolean
  retryingIndex?: number | null
  onRetrySentence?: (sentenceIndex: number) => void
  onLockedRetry?: () => void
  /** When true, sit below the analysis panel instead of filling the viewport. */
  embedded?: boolean
}) {
  const pct =
    progress.total > 0 ? Math.min(100, Math.round((progress.current / progress.total) * 100)) : 0

  const focusIndex =
    activeIndexes[0] ??
    (progress.current > 0
      ? sentences.find((s) => live[s.index]?.status === 'done' || live[s.index]?.status === 'failed')
          ?.index ?? null
      : sentences[0]?.index ?? null)

  const headline =
    mode === 'complete'
      ? 'Your citations are ready.'
      : mode === 'error'
        ? "Citation generation didn't finish."
        : statusMessage || 'Searching for sources to back up your claims…'

  const draftTitle = useMemo(() => resolveDraftTitle(title, essay), [title, essay])

  return (
    <div
      className={`gt ${mode === 'running' ? 'gt--running' : ''} ${mode === 'complete' ? 'gt--complete' : ''} ${embedded ? 'gt--embedded' : ''}`.trim()}
    >
      <div className="gt-ambient" aria-hidden />

      <header className="gt-chrome">
        <div className="gt-chrome__copy">
          <p className="gt-chrome__eyebrow">Live Draft</p>
          <h2 className="gt-chrome__title">{draftTitle}</h2>
          <p className="gt-chrome__status">{headline}</p>
        </div>
        <div className="gt-chrome__stats">
          <div
            className="gt-ring"
            style={{ ['--gt-pct' as string]: `${pct}` }}
            role="progressbar"
            aria-valuenow={progress.current}
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-label="Citation progress"
          >
            <span className="gt-ring__value">
              {progress.current}/{progress.total || '…'}
            </span>
          </div>
        </div>
      </header>

      {mode === 'error' && error ? (
        <div className="gt-error">
          <p>{error}</p>
          <Button variant="accent" onClick={onRetry}>
            Try Again
          </Button>
        </div>
      ) : (
        <div className="gt-stage">
          <LiveEssayCanvas
            essay={essay}
            sentences={sentences}
            live={live}
            focusIndex={mode === 'running' || retryingIndex != null ? focusIndex : null}
          />
          <PipelineActivityRail
            sentences={sentences}
            live={live}
            stages={stages}
            completed={progress.current}
            total={progress.total}
            possibleMatches={possibleMatches}
            showRetry={mode === 'complete'}
            allowSentenceRetry={allowSentenceRetry}
            retryingIndex={retryingIndex}
            onRetrySentence={onRetrySentence}
            onLockedRetry={onLockedRetry}
          />
        </div>
      )}

      {mode === 'complete' ? (
        <footer className="gt-footer">
          <Button variant="accent" size="lg" onClick={onViewDraft}>
            View Draft
          </Button>
          {!allowSentenceRetry ? (
            <button type="button" className="gt-footer__hint" onClick={onLockedRetry}>
              Not happy with one match? Retry single sentences on Pro.
            </button>
          ) : (
            <p className="gt-footer__note">
              Unsure about a source? Retry that sentence above. It costs 1 Cite.
            </p>
          )}
        </footer>
      ) : null}
    </div>
  )
}
