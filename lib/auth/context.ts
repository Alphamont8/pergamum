import { cookies } from 'next/headers'
import { GUEST_ONLY_MODE } from '@/lib/config/guest-only'
import { DEFAULT_SUBSCRIPTION_TIER } from '@/lib/config/tier'
import { GUEST_COOKIE } from '@/lib/guest/constants'
import { createClient } from '@/lib/supabase/server'
import { getSessionUser } from '@/lib/auth/session'
import type { SubscriptionTier } from '@/types'
import type { User } from '@supabase/supabase-js'

export interface ApiAuthContext {
  user: User | null
  tier: SubscriptionTier
  isGuest: boolean
  supabase: Awaited<ReturnType<typeof createClient>>
}

/** Resolves logged-in user tier, or Pro when unauthenticated guest cookie is set. */
export async function getApiAuth(): Promise<ApiAuthContext | null> {
  const { supabase, user } = await getSessionUser()

  if (GUEST_ONLY_MODE) {
    return {
      user: null,
      tier: DEFAULT_SUBSCRIPTION_TIER,
      isGuest: true,
      supabase,
    }
  }

  if (user) {
    return {
      user,
      tier: DEFAULT_SUBSCRIPTION_TIER,
      isGuest: false,
      supabase,
    }
  }

  const cookieStore = await cookies()
  if (cookieStore.get(GUEST_COOKIE)?.value === '1') {
    return {
      user: null,
      tier: DEFAULT_SUBSCRIPTION_TIER,
      isGuest: true,
      supabase,
    }
  }

  return null
}

export async function isGuestSession(): Promise<boolean> {
  if (GUEST_ONLY_MODE) return true
  const cookieStore = await cookies()
  return cookieStore.get(GUEST_COOKIE)?.value === '1'
}
