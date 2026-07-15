import { redirect } from 'next/navigation'
import { getProfile, getSessionUser } from '@/lib/auth/session'
import { LeaderboardClient } from '@/components/leaderboard/LeaderboardClient'

export default async function LeaderboardPage() {
  const { user } = await getSessionUser()
  if (!user) redirect('/login')
  const profile = await getProfile(user.id)
  if (!profile) redirect('/login')

  return (
    <LeaderboardClient
      currentUserId={user.id}
      referralCode={profile.referralCode}
      appUrl={process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}
    />
  )
}
