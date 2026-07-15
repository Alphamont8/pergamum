import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/session'
import { HelpClient } from '@/components/help/HelpClient'

export default async function HelpPage() {
  const { user } = await getSessionUser()
  if (!user) redirect('/login?redirect=/help')
  return <HelpClient />
}
