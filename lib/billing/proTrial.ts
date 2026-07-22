import { createServiceClient } from '@/lib/supabase/server'
import { FREE_PLAN_TIER, normalizePlanTier } from '@/lib/billing/plans'
import {
  PRO_FEATURES_TRIAL_DAYS,
  trialEndsAtFrom,
  type ProTrialPhase,
  type ProTrialSnapshot,
} from '@/lib/billing/proTrial.shared'
import type { PlanTier } from '@/types'

export {
  PRO_FEATURES_TRIAL_DAYS,
  trialEndsAtFrom,
  type ProTrialPhase,
  type ProTrialSnapshot,
} from '@/lib/billing/proTrial.shared'

const PAID_PRO_STATUSES = new Set(['active', 'trialing', 'past_due'])

function daysRemaining(endsAt: string | null): number | null {
  if (!endsAt) return null
  return Math.ceil((new Date(endsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

async function hasPaidProAccess(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  userId: string,
): Promise<boolean> {
  const { data } = await service
    .from('subscriptions')
    .select('status')
    .eq('user_id', userId)
    .maybeSingle()
  return Boolean(data && PAID_PRO_STATUSES.has(data.status))
}

/**
 * Eligibility for the pack-purchase Pro features trial.
 * One opportunity per account: never started, not on paid Pro, not already on Pro via code.
 */
export async function isEligibleForProFeaturesTrial(userId: string): Promise<boolean> {
  const service = await createServiceClient()
  const { data: profile } = await service
    .from('profiles')
    .select('plan_tier, pro_trial_started_at')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) return false
  if (profile.pro_trial_started_at) return false
  if (normalizePlanTier(profile.plan_tier) === 'pro') return false
  if (await hasPaidProAccess(service, userId)) return false
  return true
}

/**
 * Start the 7-day Pro features trial after a completed pack purchase (any pack size).
 * Does not grant the 200 monthly Cites allotment.
 * Idempotent: returns false if already used or ineligible.
 */
export async function maybeStartProFeaturesTrial(userId: string): Promise<boolean> {
  const eligible = await isEligibleForProFeaturesTrial(userId)
  if (!eligible) return false

  const service = await createServiceClient()
  const started = new Date()
  const ends = trialEndsAtFrom(started)
  const now = started.toISOString()

  const { data, error } = await service
    .from('profiles')
    .update({
      plan_tier: 'pro',
      default_suggest_corrections: true,
      pro_trial_started_at: now,
      pro_trial_ends_at: ends.toISOString(),
      // Features-only trial: never seed the monthly allotment.
      pro_cites_balance: 0,
      updated_at: now,
    })
    .eq('id', userId)
    .is('pro_trial_started_at', null)
    .eq('plan_tier', FREE_PLAN_TIER)
    .select('id')
    .maybeSingle()

  if (error) throw new Error(error.message)
  return Boolean(data)
}

/** Mark the one-time trial opportunity as used without granting a timed window (paid / code Pro). */
export async function consumeProTrialOpportunity(userId: string): Promise<void> {
  const service = await createServiceClient()
  const now = new Date().toISOString()
  const { error } = await service
    .from('profiles')
    .update({
      pro_trial_started_at: now,
      // No timed window — opportunity consumed via paid/manual Pro.
      pro_trial_ends_at: null,
      updated_at: now,
    })
    .eq('id', userId)
    .is('pro_trial_started_at', null)
  if (error) throw new Error(error.message)
}

/**
 * Clear an active timed trial window when the user upgrades to paid Pro.
 * Keeps pro_trial_started_at so the opportunity stays consumed.
 */
export async function clearActiveProFeaturesTrial(userId: string): Promise<void> {
  const service = await createServiceClient()
  const now = new Date().toISOString()
  const { error } = await service
    .from('profiles')
    .update({
      pro_trial_ends_at: null,
      updated_at: now,
    })
    .eq('id', userId)
    .not('pro_trial_ends_at', 'is', null)
  if (error) throw new Error(error.message)
}

/**
 * If a timed trial has ended and there is no paid Pro, drop features.
 * Safe to call on every session / entitlements read.
 * Keeps pro_trial_ends_at so convert prompts can reference the end date.
 */
export async function syncExpiredProFeaturesTrial(userId: string): Promise<PlanTier> {
  const service = await createServiceClient()
  const { data: profile } = await service
    .from('profiles')
    .select('plan_tier, pro_trial_ends_at')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) return FREE_PLAN_TIER

  const planTier = normalizePlanTier(profile.plan_tier)
  const endsAt = profile.pro_trial_ends_at as string | null
  if (!endsAt || planTier !== 'pro') return planTier
  if (new Date(endsAt).getTime() > Date.now()) return planTier
  if (await hasPaidProAccess(service, userId)) {
    await clearActiveProFeaturesTrial(userId)
    return 'pro'
  }

  const now = new Date().toISOString()
  const { error } = await service
    .from('profiles')
    .update({
      plan_tier: FREE_PLAN_TIER,
      default_suggest_corrections: false,
      pro_cites_balance: 0,
      updated_at: now,
    })
    .eq('id', userId)
  if (error) throw new Error(error.message)

  return FREE_PLAN_TIER
}

export async function getProTrialSnapshot(userId: string): Promise<ProTrialSnapshot> {
  await syncExpiredProFeaturesTrial(userId)
  const service = await createServiceClient()
  const [{ data: profile }, paid] = await Promise.all([
    service
      .from('profiles')
      .select('plan_tier, pro_trial_started_at, pro_trial_ends_at')
      .eq('id', userId)
      .maybeSingle(),
    hasPaidProAccess(service, userId),
  ])

  const startedAt = (profile?.pro_trial_started_at as string | null) ?? null
  const endsAt = (profile?.pro_trial_ends_at as string | null) ?? null
  const planTier = normalizePlanTier(profile?.plan_tier)
  const endsMs = endsAt ? new Date(endsAt).getTime() : null

  if (endsMs != null && endsMs > Date.now() && planTier === 'pro' && !paid) {
    return {
      phase: 'active',
      startedAt,
      endsAt,
      daysRemaining: daysRemaining(endsAt),
      showConvertPrompt: false,
    }
  }

  if (!startedAt && planTier !== 'pro' && !paid) {
    return {
      phase: 'eligible',
      startedAt: null,
      endsAt: null,
      daysRemaining: null,
      showConvertPrompt: false,
    }
  }

  // Timed trial ended; urge paid Pro for ~30 days (no auto-charge).
  if (
    endsMs != null &&
    endsMs <= Date.now() &&
    !paid &&
    planTier !== 'pro' &&
    Date.now() - endsMs < 30 * 24 * 60 * 60 * 1000
  ) {
    return {
      phase: 'expired',
      startedAt,
      endsAt,
      daysRemaining: 0,
      showConvertPrompt: true,
    }
  }

  return {
    phase: startedAt || paid || planTier === 'pro' ? 'consumed' : 'eligible',
    startedAt,
    endsAt,
    daysRemaining: null,
    showConvertPrompt: false,
  }
}
