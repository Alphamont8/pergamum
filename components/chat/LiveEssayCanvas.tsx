'use client'

import { useEffect, useRef } from 'react'
import {
  buildLiveEssaySegments,
  withInTextCitation,
  type LiveSentenceState,
} from '@/lib/essay/liveSegments'

export function LiveEssayCanvas({
  essay,
  sentences,
  live,
  focusIndex,
}: {
  essay: string
  sentences: Array<{ index: number; text: string }>
  live: Record<number, LiveSentenceState>
  focusIndex: number | null
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const segments = buildLiveEssaySegments(essay, sentences, live)

  useEffect(() => {
    if (focusIndex == null || !rootRef.current) return
    const el = rootRef.current.querySelector(`[data-sentence-index="${focusIndex}"]`)
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [focusIndex, live])

  return (
    <div className="gt-essay" ref={rootRef}>
      <div className="gt-essay__scroll">
        <article className="gt-essay__body" aria-live="polite">
          {segments.map((seg, i) => {
            if (seg.kind === 'plain') {
              return (
                <span key={`p-${i}`} className="gt-plain">
                  {seg.text}
                </span>
              )
            }

            const parts =
              seg.status === 'done' && seg.inText
                ? withInTextCitation(seg.text, seg.inText)
                : null
            const showCite = Boolean(parts?.mark)

            return (
              <mark
                key={`s-${seg.sentenceIndex}`}
                data-sentence-index={seg.sentenceIndex}
                className={`gt-mark gt-mark--${seg.status}`}
              >
                {showCite && parts ? (
                  <>
                    {parts.body}{' '}
                    <span key={seg.citeKey} className="gt-cite">
                      {parts.mark}
                    </span>
                    {parts.tail}
                  </>
                ) : (
                  seg.text
                )}
                {seg.status === 'failed' ? (
                  <span className="gt-miss" aria-label="Missed">
                    · missed
                  </span>
                ) : null}
              </mark>
            )
          })}
        </article>
      </div>
    </div>
  )
}
