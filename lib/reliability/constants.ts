export const RELIABILITY_WEIGHTS = {
  peerReview: 0.3,
  authorCredibility: 0.25,
  recency: 0.2,
  objectivity: 0.25,
} as const

export const RELIABILITY_BANDS = {
  strong: { min: 80, label: 'Strong' },
  good: { min: 65, label: 'Good' },
  fair: { min: 50, label: 'Fair' },
  caution: { min: 0, label: 'Caution' },
} as const

export function scoreToBand(score: number): keyof typeof RELIABILITY_BANDS {
  if (score >= RELIABILITY_BANDS.strong.min) return 'strong'
  if (score >= RELIABILITY_BANDS.good.min) return 'good'
  if (score >= RELIABILITY_BANDS.fair.min) return 'fair'
  return 'caution'
}
