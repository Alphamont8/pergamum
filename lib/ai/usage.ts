import { cookies } from 'next/headers'
import { GUEST_COOKIE } from '@/lib/guest/constants'
import { createServiceClient } from '@/lib/supabase/server'
import type { ApiAuthContext } from '@/lib/auth/context'
import type { SubscriptionTier } from '@/types'

export type UsageFeature =
  | 'analyze'
  | 'outline'
  | 'framework'
  | 'draft'
  | 'draft_tools'
  | 'sources_search'
  | 'sources_enrich'
  | 'sources_evaluate'
  | 'extract'
  | 'export'

export const MONTHLY_USAGE_CAPS: Record<SubscriptionTier, number | null> = {
  Basic: 30,
  Plus: 300,
  Pro: 1500,
  Max: null,
}

function monthStartIso(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

async function getGuestId(): Promise<string | null> {
  const cookieStore = await cookies()
  if (cookieStore.get(GUEST_COOKIE)?.value !== '1') return null
  const existing = cookieStore.get('pergamum_guest_id')?.value
  if (existing) return existing
  return 'guest-anonymous'
}

export class QuotaExceededError extends Error {
  readonly status = 429
  readonly remaining = 0
  readonly limit: number

  constructor(limit: number) {
    super(`Monthly AI usage limit reached (${limit} requests). Upgrade your plan for more.`)
    this.name = 'QuotaExceededError'
    this.limit = limit
  }
}

export async function getMonthlyUsageCount(auth: ApiAuthContext): Promise<number> {
  const service = await createServiceClient()
  const since = monthStartIso()

  if (auth.user) {
    const { count, error } = await service
      .from('usage_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', auth.user.id)
      .gte('created_at', since)
    if (error) return 0
    return count ?? 0
  }

  const guestId = await getGuestId()
  if (!guestId) return 0

  const { count, error } = await service
    .from('usage_events')
    .select('*', { count: 'exact', head: true })
    .eq('guest_id', guestId)
    .gte('created_at', since)
  if (error) return 0
  return count ?? 0
}

export async function getUsageSummary(auth: ApiAuthContext): Promise<{
  used: number
  limit: number | null
  remaining: number | null
}> {
  const used = await getMonthlyUsageCount(auth)
  const limit = MONTHLY_USAGE_CAPS[auth.tier]
  const remaining = limit === null ? null : Math.max(0, limit - used)
  return { used, limit, remaining }
}

export async function assertWithinQuota(auth: ApiAuthContext, feature: UsageFeature): Promise<void> {
  const limit = MONTHLY_USAGE_CAPS[auth.tier]
  if (limit === null) {
    await recordUsage(auth, feature)
    return
  }

  const used = await getMonthlyUsageCount(auth)
  if (used >= limit) {
    throw new QuotaExceededError(limit)
  }

  await recordUsage(auth, feature)
}

async function recordUsage(auth: ApiAuthContext, feature: UsageFeature): Promise<void> {
  try {
    const service = await createServiceClient()
    const guestId = auth.isGuest ? await getGuestId() : null
    await service.from('usage_events').insert({
      user_id: auth.user?.id ?? null,
      guest_id: guestId,
      feature,
      tier: auth.tier,
    })
  } catch {
    /* non-fatal if service role unavailable in dev */
  }
}

export function quotaErrorResponse(err: QuotaExceededError) {
  return {
    error: err.message,
    code: 'QUOTA_EXCEEDED',
    limit: err.limit,
    remaining: 0,
  }
}
