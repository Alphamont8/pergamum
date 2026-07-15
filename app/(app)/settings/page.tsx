import { redirect } from 'next/navigation'
import { formatSignInDisplay } from '@/lib/auth/sign-in-display'
import { getProfile, getSessionUser } from '@/lib/auth/session'
import { getProTrialSnapshot } from '@/lib/billing/proTrial'
import { SettingsClient } from '@/components/settings/SettingsClient'
import type { BillingInterval, SubscriptionStatus } from '@/types'

export default async function SettingsPage() {
  const { supabase, user } = await getSessionUser()
  if (!user) redirect('/login')
  const profile = await getProfile(user.id)
  if (!profile) redirect('/login')

  let schoolLabel = ''
  if (profile.schoolId) {
    const { data: school } = await supabase
      .from('schools')
      .select('name, country')
      .eq('id', profile.schoolId)
      .maybeSingle()
    if (school) {
      schoolLabel = school.country ? `${school.name} · ${school.country}` : school.name
    }
  }

  const identities = user.identities ?? []
  const hasEmailIdentity = identities.some((i) => i.provider === 'email')
  const hasOnlyOAuth =
    identities.length > 0 && identities.every((i) => i.provider !== 'email')
  const canChangePassword = hasEmailIdentity || (!hasOnlyOAuth && Boolean(user.email))
  const signIn = formatSignInDisplay(user.email, identities)

  const [{ data: subscription }, trial] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('status, billing_interval, current_period_end, cancel_at_period_end')
      .eq('user_id', user.id)
      .maybeSingle(),
    getProTrialSnapshot(user.id),
  ])

  return (
    <SettingsClient
      initial={{
        username: profile.username ?? '',
        schoolId: profile.schoolId,
        schoolLabel,
        signInLabel: signIn.label,
        signInEmail: signIn.email,
        signInOAuthLabel: signIn.oauthLabel,
        defaultStyle: String(profile.defaultStyle),
        defaultInText: profile.defaultInText,
        defaultSuggestCorrections: profile.defaultSuggestCorrections,
        defaultRecency: profile.defaultRecency,
        defaultSourceTier: profile.defaultSourceTier,
        planTier: profile.planTier,
        citesBalance: profile.citesBalance,
        themePreference: profile.themePreference,
        canChangePassword,
        hasBillingAccount: Boolean(profile.stripeCustomerId),
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
    />
  )
}
