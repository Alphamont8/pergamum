import { cookies } from 'next/headers'
import { GUEST_COOKIE } from '@/lib/guest/constants'
import { createClient } from '@/lib/supabase/server'
import { getSessionUser, getUserTier } from '@/lib/auth/session'
import type { SubscriptionTier } from '@/types'
import type { User } from '@supabase/supabase-js'

export interface ApiAuthContext {
  user: User | null
  tier: SubscriptionTier
  isGuest: boolean
  supabase: Awaited<ReturnType<typeof createClient>>
}

/** Resolves logged-in user tier, or Basic when unauthenticated guest cookie is set. */
export async function getApiAuth(): Promise<ApiAuthContext | null> {
  const { supabase, user } = await getSessionUser()

  if (user) {
    return {
      user,
      tier: await getUserTier(user.id),
      isGuest: false,
      supabase,
    }
  }

  const cookieStore = await cookies()
  if (cookieStore.get(GUEST_COOKIE)?.value === '1') {
    return {
      user: null,
      tier: 'Basic',
      isGuest: true,
      supabase,
    }
  }

  return null
}

export async function isGuestSession(): Promise<boolean> {
  const cookieStore = await cookies()
  return cookieStore.get(GUEST_COOKIE)?.value === '1'
}
