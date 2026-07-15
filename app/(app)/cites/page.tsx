import { redirect } from 'next/navigation'
import { getProfile, getSessionUser } from '@/lib/auth/session'
import { getProTrialSnapshot } from '@/lib/billing/proTrial'
import { CitesPageClient } from '@/components/cites/CitesPageClient'
import { getAppUrl } from '@/lib/site'

export default async function CitesPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; cancelled?: string }>
}) {
  const { user } = await getSessionUser()
  if (!user) redirect('/login')
  const profile = await getProfile(user.id)
  if (!profile) redirect('/login')
  const [params, trial] = await Promise.all([searchParams, getProTrialSnapshot(user.id)])

  return (
    <CitesPageClient
      userId={profile.id}
      permanentBalance={profile.permanentCitesBalance}
      proCitesBalance={profile.proCitesBalance}
      referralCode={profile.referralCode}
      appUrl={getAppUrl()}
      planTier={profile.planTier}
      trial={trial}
      checkoutResult={
        params.success === '1' ? 'success' : params.cancelled === '1' ? 'cancelled' : null
      }
    />
  )
}
