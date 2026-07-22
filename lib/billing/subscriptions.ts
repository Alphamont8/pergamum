import { createServiceClient } from '@/lib/supabase/server'
import { creditCitesOnce } from '@/lib/cites/ledger'
import {
  FREE_PLAN_TIER,
  planFromVariantId,
  PRO_MONTHLY_CITES,
  SEMESTER_PRO_AMOUNT_CENTS,
  SEMESTER_PRO_DAYS,
} from '@/lib/billing/plans'
import {
  clearActiveProFeaturesTrial,
  consumeProTrialOpportunity,
} from '@/lib/billing/proTrial'
import type { BillingInterval, PlanTier, SubscriptionStatus } from '@/types'

const PRO_ACCESS_STATUSES = new Set<SubscriptionStatus>(['active', 'trialing', 'past_due'])

/** Lemon Squeezy subscription attributes we need for sync. */
export interface LemonSubscriptionAttrs {
  id: string
  customerId: string
  variantId: string
  status: string
  cancelled: boolean
  renewsAt: string | null
  endsAt: string | null
  createdAt: string
  trialEndsAt: string | null
  /** From checkout custom data when present. */
  custom?: {
    supabase_user_id?: string
    plan?: string
    billing_interval?: string
  }
}

export interface SyncedSubscription {
  userId: string
  billingSubscriptionId: string
  billingCustomerId: string
  planTier: Exclude<PlanTier, 'basic'>
  billingInterval: BillingInterval
  status: SubscriptionStatus
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
}

/**
 * Map Lemon Squeezy status → our SubscriptionStatus.
 * LS `cancelled` with a future ends_at stays "active" + cancel_at_period_end (Stripe-like).
 */
export function mapLemonStatus(
  attrs: Pick<LemonSubscriptionAttrs, 'status' | 'cancelled' | 'endsAt'>,
): { status: SubscriptionStatus; cancelAtPeriodEnd: boolean } {
  const endsAtMs = attrs.endsAt ? new Date(attrs.endsAt).getTime() : 0
  const inGrace = attrs.status === 'cancelled' && endsAtMs > Date.now()

  if (inGrace) {
    return { status: 'active', cancelAtPeriodEnd: true }
  }

  switch (attrs.status) {
    case 'on_trial':
      return { status: 'trialing', cancelAtPeriodEnd: false }
    case 'active':
      return { status: 'active', cancelAtPeriodEnd: Boolean(attrs.cancelled) }
    case 'past_due':
      return { status: 'past_due', cancelAtPeriodEnd: false }
    case 'paused':
      return { status: 'paused', cancelAtPeriodEnd: false }
    case 'unpaid':
      return { status: 'unpaid', cancelAtPeriodEnd: false }
    case 'cancelled':
    case 'expired':
      return { status: 'canceled', cancelAtPeriodEnd: true }
    default:
      return { status: 'canceled', cancelAtPeriodEnd: true }
  }
}

/**
 * Period bounds from Lemon fields.
 * - End: ends_at (cancel grace) or renews_at (next invoice)
 * - Start: optional override (e.g. invoice created_at on payment), else created_at / inferred
 */
export function lemonPeriodBounds(
  attrs: LemonSubscriptionAttrs,
  interval: BillingInterval,
  periodStartOverride?: string,
): { start: string; end: string } {
  const end =
    attrs.endsAt ||
    attrs.renewsAt ||
    attrs.trialEndsAt ||
    addInterval(attrs.createdAt, interval)

  if (periodStartOverride) {
    return { start: periodStartOverride, end }
  }

  if (attrs.renewsAt && !attrs.endsAt) {
    return { start: subtractInterval(attrs.renewsAt, interval), end }
  }

  return { start: attrs.createdAt, end }
}

export async function syncLemonSubscription(
  attrs: LemonSubscriptionAttrs,
  options?: { periodStartOverride?: string },
): Promise<SyncedSubscription | null> {
  const mapped = planFromVariantId(attrs.variantId)
  const metadataPlan = attrs.custom?.plan
  const metadataInterval = attrs.custom?.billing_interval
  const planTier =
    mapped?.planTier ?? (metadataPlan === 'pro' || metadataPlan === 'plus' ? metadataPlan : null)
  const billingInterval =
    mapped?.billingInterval ??
    (metadataInterval === 'month' || metadataInterval === 'semester'
      ? metadataInterval
      : null)

  if (!planTier || !billingInterval) return null
  if (!attrs.customerId) return null
  // Semester is fulfilled via one-time order, not Lemon subscription events.
  if (billingInterval === 'semester') return null

  const service = await createServiceClient()
  let userId = attrs.custom?.supabase_user_id

  if (!userId) {
    const { data: profile } = await service
      .from('profiles')
      .select('id')
      .eq('billing_customer_id', String(attrs.customerId))
      .maybeSingle()
    userId = profile?.id
  }

  if (!userId) return null

  const { status, cancelAtPeriodEnd } = mapLemonStatus(attrs)
  const { start: currentPeriodStart, end: currentPeriodEnd } = lemonPeriodBounds(
    attrs,
    billingInterval,
    options?.periodStartOverride,
  )
  const now = new Date().toISOString()

  const { error: subscriptionError } = await service.from('subscriptions').upsert(
    {
      user_id: userId,
      billing_subscription_id: String(attrs.id),
      billing_customer_id: String(attrs.customerId),
      plan_tier: planTier,
      billing_interval: billingInterval,
      status,
      monthly_cites: PRO_MONTHLY_CITES,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      cancel_at_period_end: cancelAtPeriodEnd,
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
  const profileUpdates: Record<string, unknown> = {
    plan_tier: nextPlanTier,
    billing_customer_id: String(attrs.customerId),
  }

  if (nextPlanTier === FREE_PLAN_TIER) {
    profileUpdates.default_suggest_corrections = false
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
    await consumeProTrialOpportunity(userId)
    await clearActiveProFeaturesTrial(userId)
  }

  return {
    userId,
    billingSubscriptionId: String(attrs.id),
    billingCustomerId: String(attrs.customerId),
    planTier,
    billingInterval,
    status,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd,
  }
}

/**
 * Activate Semester Pro from a one-time Lemon order.
 * Grants month-1 allotment and schedules months 2–4 via next_cites_grant_at.
 */
export async function activateSemesterPro(input: {
  userId: string
  orderId: string
  customerId?: string | null
  checkoutId?: string | null
}): Promise<SyncedSubscription | null> {
  const service = await createServiceClient()
  const billingSubscriptionId = `sem_ls_${input.orderId}`
  const periodStart = new Date()
  const periodEnd = new Date(periodStart)
  periodEnd.setUTCDate(periodEnd.getUTCDate() + SEMESTER_PRO_DAYS)
  const nextGrantAt = addCalendarMonth(periodStart.toISOString())
  const now = periodStart.toISOString()
  const periodEndIso = periodEnd.toISOString()

  // Cap next grant so we never schedule past period end.
  const nextGrantIso =
    new Date(nextGrantAt).getTime() < periodEnd.getTime() ? nextGrantAt : null

  const checkoutKey = input.checkoutId ?? `ls_order_${input.orderId}`

  const { data: pending } = await service
    .from('purchases')
    .select('id, checkout_id')
    .eq('user_id', input.userId)
    .eq('pack', 'semester')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (pending?.checkout_id) {
    const { error } = await service
      .from('purchases')
      .update({
        billing_order_id: String(input.orderId),
        cites: PRO_MONTHLY_CITES,
        amount_cents: SEMESTER_PRO_AMOUNT_CENTS,
        status: 'completed',
        completed_at: now,
      })
      .eq('id', pending.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await service.from('purchases').upsert(
      {
        user_id: input.userId,
        checkout_id: checkoutKey,
        billing_order_id: String(input.orderId),
        pack: 'semester',
        cites: PRO_MONTHLY_CITES,
        amount_cents: SEMESTER_PRO_AMOUNT_CENTS,
        status: 'completed',
        completed_at: now,
      },
      { onConflict: 'checkout_id' },
    )
    if (error) throw new Error(error.message)
  }

  const customerId = input.customerId ? String(input.customerId) : `sem_cust_${input.userId}`

  const { error: subscriptionError } = await service.from('subscriptions').upsert(
    {
      user_id: input.userId,
      billing_subscription_id: billingSubscriptionId,
      billing_customer_id: customerId,
      plan_tier: 'pro',
      billing_interval: 'semester',
      status: 'active',
      monthly_cites: PRO_MONTHLY_CITES,
      current_period_start: now,
      current_period_end: periodEndIso,
      cancel_at_period_end: true,
      next_cites_grant_at: nextGrantIso,
      updated_at: now,
    },
    { onConflict: 'user_id' },
  )
  if (subscriptionError) throw new Error(subscriptionError.message)

  const profileUpdates: Record<string, unknown> = {
    plan_tier: 'pro',
    default_suggest_corrections: true,
  }
  if (input.customerId) {
    profileUpdates.billing_customer_id = String(input.customerId)
  }

  const { error: profileError } = await service
    .from('profiles')
    .update(profileUpdates)
    .eq('id', input.userId)
  if (profileError) throw new Error(profileError.message)

  await consumeProTrialOpportunity(input.userId)
  await clearActiveProFeaturesTrial(input.userId)

  const synced: SyncedSubscription = {
    userId: input.userId,
    billingSubscriptionId,
    billingCustomerId: customerId,
    planTier: 'pro',
    billingInterval: 'semester',
    status: 'active',
    currentPeriodStart: now,
    currentPeriodEnd: periodEndIso,
    cancelAtPeriodEnd: true,
  }

  await grantPaidPeriodCites(synced)
  return synced
}

export async function grantPaidPeriodCites(subscription: SyncedSubscription): Promise<boolean> {
  if (
    subscription.planTier !== 'pro' ||
    !PRO_ACCESS_STATUSES.has(subscription.status)
  ) {
    return false
  }

  const referenceId = grantReference(
    subscription.billingSubscriptionId,
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
    subscription.billingInterval === 'semester'
      ? (() => {
          const next = addCalendarMonth(subscription.currentPeriodStart)
          return new Date(next).getTime() < new Date(subscription.currentPeriodEnd).getTime()
            ? next
            : null
        })()
      : subscription.currentPeriodEnd

  const service = await createServiceClient()
  const { error } = await service
    .from('subscriptions')
    .update({ next_cites_grant_at: nextGrantAt })
    .eq('billing_subscription_id', subscription.billingSubscriptionId)
  if (error) throw new Error(error.message)

  return granted
}

export function grantReference(subscriptionId: string, periodStart: string): string {
  const unixSeconds = Math.floor(new Date(periodStart).getTime() / 1000)
  return `pro:${subscriptionId}:${unixSeconds}`
}

export function isSyntheticSemesterSubscriptionId(subscriptionId: string): boolean {
  return subscriptionId.startsWith('sem_ls_')
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

function addInterval(iso: string, interval: BillingInterval): string {
  const d = new Date(iso)
  if (interval === 'semester') {
    d.setUTCDate(d.getUTCDate() + SEMESTER_PRO_DAYS)
    return d.toISOString()
  }
  return addCalendarMonth(iso)
}

function subtractInterval(iso: string, interval: BillingInterval): string {
  const d = new Date(iso)
  if (interval === 'semester') {
    d.setUTCDate(d.getUTCDate() - SEMESTER_PRO_DAYS)
    return d.toISOString()
  }
  d.setUTCMonth(d.getUTCMonth() - 1)
  return d.toISOString()
}
