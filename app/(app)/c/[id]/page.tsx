import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/session'
import { GenerationViewLoader } from '@/components/chat/GenerationViewLoader'

export default async function GenerationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { user } = await getSessionUser()
  if (!user) redirect('/login')

  return <GenerationViewLoader id={id} />
}
