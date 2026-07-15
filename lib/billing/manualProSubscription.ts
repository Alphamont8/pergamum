import { createServiceClient } from '@/lib/supabase/server'
import { creditCitesOnce } from '@/lib/cites/ledger'
import { PRO_MONTHLY_CITES } from '@/lib/billing/plans'
import { clearActiveProFeaturesTrial, consumeProTrialOpportunity } from '@/lib/billing/proTrial'
import { grantReference } from '@/lib/billing/subscriptions'

/** Redeemable code for a full monthly Pro subscription (no Stripe). */
export const FULL_MONTHLY_PRO_CODE = 'PGMUP1'

export function isFullMonthlyProCode(code: string): boolean {
  return code.trim().toUpperCase() === FULL_MONTHLY_PRO_CODE
}

function monthBounds(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
  return { start: start.toISOString(), end: end.toISOString() }
}

/** Active monthly Pro with subscription row + current-period Cites allotment. */
export async function grantManualMonthlyProSubscription(userId: string): Promise<void> {
  const service = await createServiceClient()
  const stripeSubscriptionId = `sub_manual_${userId}`
  const stripeCustomerId = `cus_manual_${userId}`
  const { start: periodStart, end: periodEnd } = monthBounds()
  const now = new Date().toISOString()

  const { error: subscriptionError } = await service.from('subscriptions').upsert(
    {
      user_id: userId,
      stripe_subscription_id: stripeSubscriptionId,
      stripe_customer_id: stripeCustomerId,
      plan_tier: 'pro',
      billing_interval: 'month',
      status: 'active',
      monthly_cites: PRO_MONTHLY_CITES,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancel_at_period_end: false,
      next_cites_grant_at: periodEnd,
      updated_at: now,
    },
    { onConflict: 'user_id' },
  )
  if (subscriptionError) throw new Error(subscriptionError.message)

  const { data: profile } = await service
    .from('profiles')
    .select('pro_trial_started_at')
    .eq('id', userId)
    .maybeSingle()

  const { error: profileError } = await service
    .from('profiles')
    .update({
      plan_tier: 'pro',
      default_suggest_corrections: true,
      pro_trial_ends_at: null,
      pro_trial_started_at: (profile?.pro_trial_started_at as string | null) ?? now,
      stripe_customer_id: stripeCustomerId,
      updated_at: now,
    })
    .eq('id', userId)
  if (profileError) throw new Error(profileError.message)

  await consumeProTrialOpportunity(userId)
  await clearActiveProFeaturesTrial(userId)

  await creditCitesOnce({
    userId,
    delta: PRO_MONTHLY_CITES,
    kind: 'subscription',
    referenceId: grantReference(stripeSubscriptionId, periodStart),
    note: 'Pro monthly Cites',
  })
}
