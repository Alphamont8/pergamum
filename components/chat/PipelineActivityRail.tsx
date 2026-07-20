'use client'

import type { CitationPipelineStage } from '@/lib/cite/stages'
import { stageLabel } from '@/lib/cite/stageCopy'
import type { LiveSentenceState } from '@/lib/essay/liveSegments'

export interface ActivityLogEntry {
  id: string
  sentenceIndex?: number
  stage: CitationPipelineStage | 'searching' | 'idle' | 'analyze'
  message: string
  detail?: string
  at: number
}

export interface BibChip {
  sentenceIndex: number
  title: string
  status: 'done' | 'failed'
  bibliography?: string
}

export interface PossibleMatchChip {
  title: string
  authors?: string
  year?: string
  url?: string
  doi?: string
  similarity?: number
  abstract?: string
}

function sentenceStatusLabel(
  status: LiveSentenceState['status'],
  stage?: CitationPipelineStage | 'searching',
): string {
  if (status === 'done') return 'Cited'
  if (status === 'failed') return 'Missed'
  if (status === 'active') return stage ? stageLabel(stage) : 'Searching'
  return 'Queued'
}

export function PipelineActivityRail({
  sentences,
  live,
  stages,
  completed,
  total,
  possibleMatches = {},
  showRetry = false,
  allowSentenceRetry = false,
  retryingIndex = null,
  onRetrySentence,
  onLockedRetry,
}: {
  sentences: Array<{ index: number; text: string }>
  live: Record<number, LiveSentenceState>
  stages: Record<number, CitationPipelineStage | 'searching'>
  completed: number
  total: number
  possibleMatches?: Record<number, PossibleMatchChip[]>
  showRetry?: boolean
  allowSentenceRetry?: boolean
  retryingIndex?: number | null
  onRetrySentence?: (sentenceIndex: number) => void
  onLockedRetry?: () => void
}) {
  const remaining = Math.max(0, total - completed)

  return (
    <aside className="gt-rail" aria-label="Citation progress">
      <div className="gt-rail__section">
        <h3 className="gt-rail__title">Progress</h3>
        <p className="gt-rail__lede">
          {remaining > 0
            ? `${completed} of ${total} complete · ${remaining} remaining`
            : `${completed} of ${total} complete`}
        </p>
      </div>

      <div className="gt-rail__section gt-rail__section--grow">
        <ul className="gt-queue">
          {sentences.map((sentence) => {
            const state = live[sentence.index]
            const status = state?.status ?? 'pending'
            const stage = stages[sentence.index]
            const statusLabel = sentenceStatusLabel(status, stage)
            const nearMisses = possibleMatches[sentence.index] ?? []

            return (
              <li
                key={sentence.index}
                className={`gt-queue__item gt-queue__item--${status}`}
              >
                <div className="gt-queue__meta">
                  <span className="gt-queue__index">Sentence {sentence.index + 1}</span>
                  <span className={`gt-queue__status gt-queue__status--${status}`}>
                    {statusLabel}
                  </span>
                </div>
                <p className="gt-queue__text">{truncate(sentence.text, 140)}</p>
                {status === 'failed' && nearMisses.length > 0 ? (
                  <div className="gt-queue__possible">
                    <p className="gt-queue__possible-label">Possible Matches</p>
                    <ul>
                      {nearMisses.map((m, i) => (
                        <li key={`${sentence.index}-pm-${i}`}>
                          {m.url ? (
                            <a href={m.url} target="_blank" rel="noreferrer">
                              {m.title}
                            </a>
                          ) : (
                            <span>{m.title}</span>
                          )}
                          {m.year || m.authors ? (
                            <span className="gt-queue__possible-meta">
                              {[m.authors?.split(',')[0], m.year].filter(Boolean).join(' · ')}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {showRetry && status === 'failed' ? (
                  <button
                    type="button"
                    className="gt-queue__retry"
                    disabled={retryingIndex === sentence.index}
                    onClick={() => {
                      if (!allowSentenceRetry) {
                        onLockedRetry?.()
                        return
                      }
                      onRetrySentence?.(sentence.index)
                    }}
                  >
                    {retryingIndex === sentence.index
                      ? 'Retrying…'
                      : allowSentenceRetry
                        ? 'Retry'
                        : 'Retry · Pro'}
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      </div>
    </aside>
  )
}

function truncate(text: string, max: number) {
  const t = text.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}
