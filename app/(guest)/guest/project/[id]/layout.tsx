import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { GUEST_COOKIE } from '@/lib/guest/constants'
import { GuestProjectWorkspace } from '@/components/project/GuestProjectWorkspace'

export default async function GuestProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const cookieStore = await cookies()
  const guestVal = cookieStore.get(GUEST_COOKIE)?.value ?? null
  if (guestVal !== '1') {
    redirect('/login')
  }

  return (
    <>
      <GuestProjectWorkspace projectId={id} />
      {children}
    </>
  )
}
