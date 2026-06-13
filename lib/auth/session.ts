import { createClient } from '@/lib/supabase/server'
import { DEFAULT_SUBSCRIPTION_TIER } from '@/lib/config/tier'
import type { SubscriptionTier } from '@/types'

export async function getSessionUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

export async function getUserTier(_userId: string): Promise<SubscriptionTier> {
  return DEFAULT_SUBSCRIPTION_TIER
}
