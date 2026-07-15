import type Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/server'
import { creditCitesOnce } from '@/lib/cites/ledger'
import { FREE_PLAN_TIER, planFromPriceId, PRO_MONTHLY_CITES } from '@/lib/billing/plans'
import {
  clearActiveProFeaturesTrial,
  consumeProTrialOpportunity,
} from '@/lib/billing/proTrial'
import type { BillingInterval, PlanTier, SubscriptionStatus } from '@/types'

const PRO_ACCESS_STATUSES = new Set<SubscriptionStatus>(['active', 'trialing', 'past_due'])

export interface SyncedSubscription {
  userId: string
  stripeSubscriptionId: string
  stripeCustomerId: string
  planTier: Exclude<PlanTier, 'basic'>
  billingInterval: BillingInterval
  status: SubscriptionStatus
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
}

export async function syncStripeSubscription(
  subscription: Stripe.Subscription,
): Promise<SyncedSubscription | null> {
  const item = subscription.items.data[0]
  if (!item) return null

  const mapped = planFromPriceId(item.price.id)
  const metadataPlan = subscription.metadata.plan
  const metadataInterval = subscription.metadata.billing_interval
  const planTier =
    mapped?.planTier ?? (metadataPlan === 'pro' || metadataPlan === 'plus' ? metadataPlan : null)
  const billingInterval =
    mapped?.billingInterval ??
    (metadataInterval === 'month' || metadataInterval === 'year'
      ? metadataInterval
      : item.price.recurring?.interval === 'month' || item.price.recurring?.interval === 'year'
        ? item.price.recurring.interval
        : null)

  if (!planTier || !billingInterval) return null

  const stripeCustomerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id
  if (!stripeCustomerId) return null

  const service = await createServiceClient()
  let userId = subscription.metadata.supabase_user_id

  if (!userId) {
    const { data: profile } = await service
      .from('profiles')
      .select('id')
      .eq('stripe_customer_id', stripeCustomerId)
      .maybeSingle()
    userId = profile?.id
  }

  if (!userId) return null

  const currentPeriodStart = toIso(item.current_period_start)
  const currentPeriodEnd = toIso(item.current_period_end)
  const status = subscription.status as SubscriptionStatus
  const now = new Date().toISOString()

  const { error: subscriptionError } = await service.from('subscriptions').upsert(
    {
      user_id: userId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: stripeCustomerId,
      plan_tier: planTier,
      billing_interval: billingInterval,
      status,
      monthly_cites: PRO_MONTHLY_CITES,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      cancel_at_period_end: subscription.cancel_at_period_end,
      updated_at: now,
    },
    { onConflict: 'user_id' },
  )
  if (subscriptionError) throw new Error(subscriptionError.message)

  const { data: existingProfile } = await service
    .from('profiles')
    .select('plan_tier')
    .eq('id', userId)
    .maybeSingle()

  const hasProAccess = planTier === 'pro' && PRO_ACCESS_STATUSES.has(status)

  // Preserve an active pack-purchase features trial if Stripe access is not active.
  const { data: trialProfile } = await service
    .from('profiles')
    .select('pro_trial_ends_at')
    .eq('id', userId)
    .maybeSingle()
  const trialEndsAt = trialProfile?.pro_trial_ends_at as string | null
  const trialStillActive =
    Boolean(trialEndsAt) && new Date(trialEndsAt!).getTime() > Date.now()

  const nextPlanTier: PlanTier = hasProAccess
    ? 'pro'
    : trialStillActive
      ? 'pro'
      : FREE_PLAN_TIER
  const profileUpdates: Record<string, unknown> = { plan_tier: nextPlanTier }

  if (nextPlanTier === FREE_PLAN_TIER) {
    profileUpdates.default_suggest_corrections = false
    // Unused monthly Pro allotment expires when paid Pro access ends.
    profileUpdates.pro_cites_balance = 0
  } else if (existingProfile?.plan_tier !== 'pro') {
    profileUpdates.default_suggest_corrections = true
  }

  const { error: profileError } = await service
    .from('profiles')
    .update(profileUpdates)
    .eq('id', userId)
  if (profileError) throw new Error(profileError.message)

  if (hasProAccess) {
    // Paid Pro consumes the one-time trial opportunity and clears any timed window.
    await consumeProTrialOpportunity(userId)
    await clearActiveProFeaturesTrial(userId)
  }

  return {
    userId,
    stripeSubscriptionId: subscription.id,
    stripeCustomerId,
    planTier,
    billingInterval,
    status,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  }
}

export async function grantPaidPeriodCites(subscription: SyncedSubscription): Promise<boolean> {
  if (
    subscription.planTier !== 'pro' ||
    !PRO_ACCESS_STATUSES.has(subscription.status)
  ) {
    return false
  }

  const referenceId = grantReference(
    subscription.stripeSubscriptionId,
    subscription.currentPeriodStart,
  )
  const granted = await creditCitesOnce({
    userId: subscription.userId,
    delta: PRO_MONTHLY_CITES,
    kind: 'subscription',
    referenceId,
    note: 'Pro monthly Cites',
  })

  const nextGrantAt =
    subscription.billingInterval === 'year'
      ? addCalendarMonth(subscription.currentPeriodStart)
      : subscription.currentPeriodEnd

  const service = await createServiceClient()
  const { error } = await service
    .from('subscriptions')
    .update({ next_cites_grant_at: nextGrantAt })
    .eq('stripe_subscription_id', subscription.stripeSubscriptionId)
  if (error) throw new Error(error.message)

  return granted
}

export function grantReference(subscriptionId: string, periodStart: string): string {
  const unixSeconds = Math.floor(new Date(periodStart).getTime() / 1000)
  return `pro:${subscriptionId}:${unixSeconds}`
}

function toIso(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString()
}

function addCalendarMonth(iso: string): string {
  const source = new Date(iso)
  const day = source.getUTCDate()
  const target = new Date(source)
  target.setUTCDate(1)
  target.setUTCMonth(target.getUTCMonth() + 1)
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return target.toISOString()
}
