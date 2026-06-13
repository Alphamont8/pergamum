import { createClient } from '@/lib/supabase/server'
import type { SubscriptionTier } from '@/types'

export async function getSessionUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

export async function getUserTier(userId: string): Promise<SubscriptionTier> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('subscription_tier')
    .eq('id', userId)
    .single()

  const tier = data?.subscription_tier as SubscriptionTier | undefined
  if (tier && ['Basic', 'Plus', 'Pro', 'Max'].includes(tier)) return tier
  return 'Basic'
}
