import { redirect } from 'next/navigation'
import { getProfile, getSessionUser } from '@/lib/auth/session'
import { LeaderboardClient } from '@/components/leaderboard/LeaderboardClient'
import { getAppUrl } from '@/lib/site'

export default async function LeaderboardPage() {
  const { user } = await getSessionUser()
  if (!user) redirect('/login')
  const profile = await getProfile(user.id)
  if (!profile) redirect('/login')

  return (
    <LeaderboardClient
      currentUserId={user.id}
      referralCode={profile.referralCode}
      appUrl={getAppUrl()}
    />
  )
}
