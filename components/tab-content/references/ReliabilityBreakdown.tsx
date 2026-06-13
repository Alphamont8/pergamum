'use client'

import type { SourceReliability } from '@/types'
import './ReliabilityBreakdown.css'

interface ReliabilityBreakdownProps {
  reliability: SourceReliability
}

const LABELS = {
  peerReview: 'Peer review',
  authorCredibility: 'Author credentials',
  recency: 'Recency',
  objectivity: 'Objectivity & bias',
} as const

export function ReliabilityBreakdown({ reliability }: ReliabilityBreakdownProps) {
  return (
    <div className="reliability-breakdown">
      {(Object.keys(LABELS) as Array<keyof typeof LABELS>).map((key) => {
        const sub = reliability.subscores[key]
        return (
          <div key={key} className="reliability-breakdown__row">
            <div className="reliability-breakdown__header">
              <span className="reliability-breakdown__label">{LABELS[key]}</span>
              <span className="reliability-breakdown__score">{sub.score}</span>
            </div>
            <div className="reliability-breakdown__bar-track">
              <div
                className="reliability-breakdown__bar-fill"
                style={{ width: `${sub.score}%` }}
              />
            </div>
            <p className="reliability-breakdown__rationale">{sub.rationale}</p>
          </div>
        )
      })}
      {reliability.flags && reliability.flags.length > 0 && (
        <ul className="reliability-breakdown__flags">
          {reliability.flags.map((flag) => (
            <li key={flag}>{flag}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
