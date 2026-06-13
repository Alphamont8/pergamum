import { redirect } from 'next/navigation'
import { GUEST_DEFAULT_PROJECT_ID } from '@/lib/guest/constants'

export default function GuestHomePage() {
  redirect(`/guest/project/${GUEST_DEFAULT_PROJECT_ID}/blueprint`)
}
