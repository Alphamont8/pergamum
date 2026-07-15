/** Client-safe Pro trial types and constants (no server imports). */

/** Timed Pro features trial after a Cites pack purchase. No Stripe subscription / no auto-charge. */
export const PRO_FEATURES_TRIAL_DAYS = 14

export type ProTrialPhase = 'eligible' | 'active' | 'expired' | 'consumed'

export interface ProTrialSnapshot {
  phase: ProTrialPhase
  startedAt: string | null
  endsAt: string | null
  daysRemaining: number | null
  /** True when a timed trial ended and they have not subscribed yet. */
  showConvertPrompt: boolean
}

export function trialEndsAtFrom(start: Date = new Date()): Date {
  const ends = new Date(start)
  ends.setUTCDate(ends.getUTCDate() + PRO_FEATURES_TRIAL_DAYS)
  return ends
}
