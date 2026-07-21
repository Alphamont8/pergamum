import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'
import { GUEST_COOKIE } from '@/lib/guest/constants'
const GUEST_TTL_DAYS = 7

export type GuestSession = {
  id: string
  citesBalance: number
}

/** Read-only — safe in Server Components / layouts (does not set cookies). */
export async function getGuestSession(): Promise<GuestSession | null> {
  const cookieStore = await cookies()
  const existing = cookieStore.get(GUEST_COOKIE)?.value
  if (!existing) return null

  const service = await createServiceClient()
  const { data } = await service
    .from('guest_sessions')
    .select('id, cites_balance, expires_at')
    .eq('id', existing)
    .maybeSingle()

  if (!data || new Date(data.expires_at).getTime() <= Date.now()) return null
  return { id: data.id, citesBalance: data.cites_balance }
}

/**
 * Create or refresh guest session. Must only be called from Route Handlers
 * (or Server Actions) because it sets an httpOnly cookie.
 */
export async function getOrCreateGuestSession(): Promise<GuestSession & { isNew: boolean }> {
  const cookieStore = await cookies()
  const existing = cookieStore.get(GUEST_COOKIE)?.value
  const service = await createServiceClient()

  if (existing) {
    const { data } = await service
      .from('guest_sessions')
      .select('id, cites_balance, expires_at')
      .eq('id', existing)
      .maybeSingle()

    if (data && new Date(data.expires_at).getTime() > Date.now()) {
      await service
        .from('guest_sessions')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', data.id)
      return { id: data.id, citesBalance: data.cites_balance, isNew: false }
    }
  }

  const expires = new Date()
  expires.setDate(expires.getDate() + GUEST_TTL_DAYS)

  const { data, error } = await service
    .from('guest_sessions')
    .insert({ expires_at: expires.toISOString(), cites_balance: 0 })
    .select('id, cites_balance')
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? "We couldn't create a guest session.")
  }

  cookieStore.set(GUEST_COOKIE, data.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: GUEST_TTL_DAYS * 24 * 60 * 60,
  })

  return { id: data.id, citesBalance: data.cites_balance, isNew: true }
}
