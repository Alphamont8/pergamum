'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import type { CitationPipelineStage } from '@/lib/cite/stages'
import type { LiveSentenceState } from '@/lib/essay/liveSegments'
import type { PossibleMatchChip } from './PipelineActivityRail'

export type TimelineStep = {
  id: string
  message: string
  detail?: string
  stage?: CitationPipelineStage | 'searching' | 'idle' | 'analyze'
  sentenceIndex?: number
  at: number
  busy?: boolean
}

export type TimelineReasoning = {
  label: string
  busy?: boolean
}

export type TimelineQueueSentence = {
  index: number
  text: string
}

function truncate(text: string, max: number): string {
  const t = text.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

function SentenceQueue({
  sentences,
  live,
  possibleMatches,
  onPick,
  picking,
}: {
  sentences: TimelineQueueSentence[]
  live: Record<number, LiveSentenceState>
  stages: Record<number, CitationPipelineStage | 'searching'>
  possibleMatches?: Record<number, PossibleMatchChip[]>
  onPick?: (sentenceIndex: number, matchIndex: number) => void
  picking?: number | null
}) {
  if (!sentences.length) return null

  return (
    <div className="agent-tl__queue">
      <p className="agent-tl__queue-title">Sentences</p>
      <ul className="agent-tl__queue-list">
        {sentences.map((sentence) => {
          const state = live[sentence.index]
          const status = state?.status ?? 'pending'
          const nearMisses = possibleMatches?.[sentence.index] ?? []
          const statusLabel =
            status === 'done'
              ? 'Cited'
              : status === 'failed'
                ? 'Missed'
                : status === 'active'
                  ? 'Searching'
                  : 'Queued'
          return (
            <li
              key={sentence.index}
              className={`agent-tl__chip agent-tl__chip--${status}`}
            >
              <div className="agent-tl__chip-meta">
                <span className="agent-tl__chip-index">Sentence {sentence.index + 1}</span>
                <span className={`agent-tl__chip-status agent-tl__chip-status--${status}`}>
                  {statusLabel}
                </span>
              </div>
              <p className="agent-tl__chip-text">{truncate(sentence.text, 140)}</p>
              {status === 'failed' && state?.missReason ? (
                <p className="agent-tl__chip-miss">{state.missReason}</p>
              ) : null}
              {status === 'failed' && nearMisses.length > 0 ? (
                <ul className="agent-tl__chip-matches">
                  {nearMisses.map((m, i) => (
                    <li key={`${sentence.index}-m-${i}`}>
                      <div className="agent-tl__chip-match-copy">
                        <span className="agent-tl__chip-match-title">{m.title}</span>
                        {(m.authors || m.year) && (
                          <span className="agent-tl__chip-match-meta">
                            {[m.authors?.split(',')[0], m.year].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </div>
                      {onPick ? (
                        <button
                          type="button"
                          className="pg-btn pg-btn--success pg-btn--sm"
                          disabled={picking === sentence.index}
                          onClick={() => onPick(sentence.index, i)}
                        >
                          {picking === sentence.index ? 'Applying…' : 'Use'}
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function TimerLabel({ label, busy }: TimelineReasoning) {
  return (
    <div className="agent-tl__reasoning">
      <span className="agent-tl__reasoning-label">
        {busy ? <span className="status-dot" aria-hidden /> : null}
        {label}
      </span>
    </div>
  )
}

export function AgentTimeline({
  steps,
  reasoning,
  sentences = [],
  live = {},
  stages = {},
  possibleMatches,
  onPickMatch,
  pickingMatch = null,
  footer,
  footerCentered = false,
  liveClockMs,
}: {
  steps: TimelineStep[]
  reasoning?: TimelineReasoning | null
  sentences?: TimelineQueueSentence[]
  live?: Record<number, LiveSentenceState>
  stages?: Record<number, CitationPipelineStage | 'searching'>
  possibleMatches?: Record<number, PossibleMatchChip[]>
  onPickMatch?: (sentenceIndex: number, matchIndex: number) => void
  pickingMatch?: number | null
  footer?: ReactNode
  footerCentered?: boolean
  /** Forces re-render of the active step while analyzing/generating. */
  liveClockMs?: number
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickBottomRef = useRef(true)

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !stickBottomRef.current) return
    el.scrollTop = el.scrollHeight
  }, [steps.length, steps[steps.length - 1]?.id, liveClockMs])

  return (
    <aside className="agent-tl" aria-label="Agent Feed">
      <header className="agent-tl__head">
        <h2 className="agent-tl__title">Agent Feed</h2>
      </header>

      <div
        className="agent-tl__scroll"
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current
          if (!el) return
          stickBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
        }}
      >
        {reasoning ? <TimerLabel {...reasoning} /> : null}

        {sentences.length > 0 ? (
          <SentenceQueue
            sentences={sentences}
            live={live}
            stages={stages}
            possibleMatches={possibleMatches}
            onPick={onPickMatch}
            picking={pickingMatch}
          />
        ) : null}

        {steps.length === 0 && !reasoning && sentences.length === 0 ? (
          <p className="agent-tl__empty">Waiting to start…</p>
        ) : (
          <ol className="agent-tl__steps">
            {steps.map((step, i) => {
              const isLast = i === steps.length - 1
              const busy = Boolean(
                step.busy || (isLast && step.busy !== false && liveClockMs != null),
              )
              return (
                <li
                  key={step.id}
                  className={`agent-tl__step ${busy ? 'is-busy' : ''} ${step.stage === 'found' ? 'is-found' : ''} ${step.stage === 'miss' ? 'is-miss' : ''}`.trim()}
                >
                  <p className="agent-tl__step-msg">
                    {busy ? <span className="status-dot" aria-hidden /> : null}
                    {step.message}
                  </p>
                  {step.detail ? <p className="agent-tl__step-detail">{step.detail}</p> : null}
                </li>
              )
            })}
          </ol>
        )}
      </div>

      {footer ? (
        <div
          className={`agent-tl__footer ${footerCentered ? 'agent-tl__footer--centered' : ''}`.trim()}
        >
          {footer}
        </div>
      ) : null}
    </aside>
  )
}
