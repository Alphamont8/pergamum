import { redirect } from 'next/navigation'

export default async function GuestDraftAuditRedirect({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/guest/project/${id}/draft`)
}
