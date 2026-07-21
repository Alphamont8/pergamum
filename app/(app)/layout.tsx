import { getProfile, getSessionUser } from '@/lib/auth/session'
import { AppShell } from '@/components/shell/AppShell'
import { ProfileDefaultsProvider } from '@/components/shell/ProfileDefaults'
import { getProTrialSnapshot } from '@/lib/billing/proTrial'
import { redirect } from 'next/navigation'
import type { BillingInterval, SubscriptionStatus } from '@/types'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await getSessionUser()
  if (!user) redirect('/login')

  const profile = await getProfile(user.id)
  if (!profile) redirect('/login')
  if (!profile.onboardingComplete) redirect('/onboarding')

  const [{ data: subscription }, trial] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('status, billing_interval, current_period_end, cancel_at_period_end')
      .eq('user_id', user.id)
      .maybeSingle(),
    getProTrialSnapshot(user.id),
  ])

  return (
    <ProfileDefaultsProvider
      defaults={{
        userId: profile.id,
        defaultStyle: profile.defaultStyle,
        defaultInText: profile.defaultInText,
        defaultSuggestCorrections: profile.defaultSuggestCorrections,
        defaultRecency: profile.defaultRecency,
        defaultSourceTier: profile.defaultSourceTier,
        planTier: profile.planTier,
      }}
    >
      <AppShell
        profile={{
          id: profile.id,
          username: profile.username,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          citesBalance: profile.citesBalance,
          referralCode: profile.referralCode,
          planTier: profile.planTier,
          hasBillingAccount: Boolean(profile.billingCustomerId),
          trial,
          subscription: subscription
            ? {
                status: subscription.status as SubscriptionStatus,
                billingInterval: subscription.billing_interval as BillingInterval,
                currentPeriodEnd: subscription.current_period_end,
                cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
              }
            : null,
        }}
      >
        {children}
      </AppShell>
    </ProfileDefaultsProvider>
  )
}
