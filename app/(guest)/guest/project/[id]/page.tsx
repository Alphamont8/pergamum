import { redirect } from 'next/navigation'

export default async function GuestProjectIndex({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/guest/project/${id}/blueprint`)
}
