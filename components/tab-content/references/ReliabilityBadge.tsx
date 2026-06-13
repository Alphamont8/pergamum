'use client'

import type { ReliabilityBand } from '@/types'
import './ReliabilityBadge.css'

interface ReliabilityBadgeProps {
  score?: number
  band?: ReliabilityBand
  size?: 'sm' | 'md'
}

export function ReliabilityBadge({ score, band = 'fair', size = 'sm' }: ReliabilityBadgeProps) {
  if (score == null) {
    return <span className={`reliability-badge reliability-badge--${size} reliability-badge--empty`}>—</span>
  }

  return (
    <span
      className={`reliability-badge reliability-badge--${size} reliability-badge--${band}`}
      title={`Reliability: ${score}/100`}
      aria-label={`Reliability score ${score} out of 100`}
    >
      <svg className="reliability-badge__ring" viewBox="0 0 36 36" aria-hidden>
        <circle className="reliability-badge__track" cx="18" cy="18" r="15.5" />
        <circle
          className="reliability-badge__fill"
          cx="18"
          cy="18"
          r="15.5"
          strokeDasharray={`${(score / 100) * 97.4} 97.4`}
        />
      </svg>
      <span className="reliability-badge__score">{score}</span>
    </span>
  )
}
