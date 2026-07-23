'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
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

/** One Analysis or Generation phase card in the Citation Feed. */
export type FeedPhaseTask = {
  id: 'analyze' | 'generate'
  /** Bold main task, e.g. "Analyzing · 5s" or "Analyzed · 12s". */
  label: string
  /** Overall subtask summary — never names a specific sentence. */
  detail?: string
  busy?: boolean
  /** When set and the phase is done, Show Reasoning is available. */
  reasoning?: string | null
}

export type TimelineQueueSentence = {
  index: number
  text: string
}

function SentenceQueue({
  sentences,
  live,
  possibleMatches,
  onPick,
  picking,
  onFocus,
  focusIndex,
}: {
  sentences: TimelineQueueSentence[]
  live: Record<number, LiveSentenceState>
  stages: Record<number, CitationPipelineStage | 'searching'>
  possibleMatches?: Record<number, PossibleMatchChip[]>
  onPick?: (sentenceIndex: number, matchIndex: number) => void
  picking?: number | null
  onFocus?: (sentenceIndex: number) => void
  focusIndex?: number | null
}) {
  if (!sentences.length) return null

  return (
    <div className="agent-tl__queue">
      <p className="agent-tl__queue-title">Sentences Identified for Citing</p>
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
              className={`agent-tl__chip agent-tl__chip--${status} ${focusIndex === sentence.index ? 'is-focused' : ''}`.trim()}
            >
              <button
                type="button"
                className="agent-tl__chip-focus"
                onClick={() => onFocus?.(sentence.index)}
              >
                <div className="agent-tl__chip-meta">
                  <span className="agent-tl__chip-index">Sentence {sentence.index + 1}</span>
                  <span className={`agent-tl__chip-status agent-tl__chip-status--${status}`}>
                    {statusLabel}
                  </span>
                </div>
                <p className="agent-tl__chip-text">{sentence.text}</p>
              </button>
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

function PhaseTaskCard({ task }: { task: FeedPhaseTask }) {
  const [open, setOpen] = useState(false)
  const canShowReasoning = Boolean(task.reasoning?.trim()) && !task.busy

  useEffect(() => {
    if (!canShowReasoning) setOpen(false)
  }, [canShowReasoning, task.id])

  return (
    <div className={`agent-tl__phase ${task.busy ? 'is-busy' : ''}`.trim()}>
      <div className="agent-tl__reasoning-head">
        <p className="agent-tl__reasoning-label">
          {task.busy ? <span className="status-dot" aria-hidden /> : null}
          <span className="agent-tl__reasoning-copy">{task.label}</span>
        </p>
        {canShowReasoning ? (
          <button
            type="button"
            className="agent-tl__reasoning-toggle"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Hide Reasoning' : 'Show Reasoning'}
          </button>
        ) : null}
      </div>
      {task.detail ? <p className="agent-tl__live-line">{task.detail}</p> : null}
      {open && task.reasoning ? (
        <div className="agent-tl__reasoning-body">
          {task.reasoning.split(/\n+/).map((para, i) => (
            <p key={`${task.id}-r-${i}`}>{para}</p>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function AgentTimeline({
  tasks = [],
  sentences = [],
  live = {},
  stages = {},
  possibleMatches,
  onPickMatch,
  pickingMatch = null,
  onSentenceFocus,
  focusSentenceIndex = null,
  footer,
  footerCentered = false,
  liveClockMs,
  showSentences = false,
}: {
  /** Analysis / Generation phase cards (primary Citation Feed content). */
  tasks?: FeedPhaseTask[]
  sentences?: TimelineQueueSentence[]
  live?: Record<number, LiveSentenceState>
  stages?: Record<number, CitationPipelineStage | 'searching'>
  possibleMatches?: Record<number, PossibleMatchChip[]>
  onPickMatch?: (sentenceIndex: number, matchIndex: number) => void
  pickingMatch?: number | null
  onSentenceFocus?: (sentenceIndex: number) => void
  focusSentenceIndex?: number | null
  footer?: ReactNode
  footerCentered?: boolean
  /** Forces re-render while Analysis/Generation timers tick. */
  liveClockMs?: number
  /** Show sentence chips (review / near-miss picks), not during live phases. */
  showSentences?: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickBottomRef = useRef(true)
  const queueVisible = showSentences && sentences.length > 0
  const latestDetail = tasks[tasks.length - 1]?.detail
  const latestLabel = tasks[tasks.length - 1]?.label

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !stickBottomRef.current) return
    el.scrollTop = el.scrollHeight
  }, [tasks.length, latestDetail, latestLabel, liveClockMs, queueVisible])

  return (
    <aside className="agent-tl" aria-label="Citation Feed">
      <header className="agent-tl__head">
        <h2 className="agent-tl__title">Citation Feed</h2>
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
        {tasks.length === 0 && !queueVisible ? (
          <p className="agent-tl__empty">Waiting to start…</p>
        ) : null}

        {tasks.length > 0 ? (
          <div className="agent-tl__phases">
            {tasks.map((task) => (
              <PhaseTaskCard key={task.id} task={task} />
            ))}
          </div>
        ) : null}

        {queueVisible ? (
          <SentenceQueue
            sentences={sentences}
            live={live}
            stages={stages}
            possibleMatches={possibleMatches}
            onPick={onPickMatch}
            picking={pickingMatch}
            onFocus={onSentenceFocus}
            focusIndex={focusSentenceIndex}
          />
        ) : null}
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
