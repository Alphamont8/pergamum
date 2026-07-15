import { redirect } from 'next/navigation'
import { getProfile, getSessionUser } from '@/lib/auth/session'
import { getProTrialSnapshot } from '@/lib/billing/proTrial'
import { UpgradePageClient } from '@/components/upgrade/UpgradePageClient'
import type { BillingInterval, SubscriptionStatus } from '@/types'

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; cancelled?: string }>
}) {
  const { supabase, user } = await getSessionUser()
  if (!user) redirect('/login?redirect=/upgrade')

  const profile = await getProfile(user.id)
  if (!profile) redirect('/login')

  const [{ data: subscription }, params, trial] = await Promise.all([
    supabase
      .from('subscriptions')
      .select(
        'status, billing_interval, current_period_end, cancel_at_period_end, next_cites_grant_at',
      )
      .eq('user_id', user.id)
      .maybeSingle(),
    searchParams,
    getProTrialSnapshot(user.id),
  ])

  return (
    <UpgradePageClient
      initial={{
        planTier: profile.planTier,
        citesBalance: profile.citesBalance,
        permanentCitesBalance: profile.permanentCitesBalance,
        proCitesBalance: profile.proCitesBalance,
        hasBillingAccount: Boolean(profile.stripeCustomerId),
        trial,
        subscription: subscription
          ? {
              status: subscription.status as SubscriptionStatus,
              billingInterval: subscription.billing_interval as BillingInterval,
              currentPeriodEnd: subscription.current_period_end,
              cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
              nextCitesGrantAt: subscription.next_cites_grant_at,
            }
          : null,
        checkoutResult:
          params.success === '1'
            ? 'success'
            : params.cancelled === '1'
              ? 'cancelled'
              : null,
      }}
    />
  )
}
