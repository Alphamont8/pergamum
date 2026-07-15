import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { avatarUrlFromUserMetadata, syncProfileAvatarIfMissing } from '@/lib/auth/avatar'
import { FREE_PLAN_TIER, normalizePlanTier } from '@/lib/billing/plans'
import { syncExpiredProFeaturesTrial } from '@/lib/billing/proTrial'
import { normalizeReferencingStyleId } from '@/utils/referencingStyle'
import type { Profile, SourceRecency, SourceTier } from '@/types'

export const getSessionUser = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
})

const PROFILE_COLUMNS =
  'id, username, display_name, avatar_url, school_id, default_style, default_in_text, default_suggest_corrections, default_recency, default_source_tier, theme_preference, referral_code, cites_balance, pro_cites_balance, bibliographies_count, onboarding_complete, stripe_customer_id, plan_tier, pro_trial_started_at, pro_trial_ends_at, created_at, updated_at'

export const getProfile = cache(async (userId: string): Promise<Profile | null> => {
  await syncExpiredProFeaturesTrial(userId)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let { data } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle()

  if (!data) return null

  if (user?.id === userId) {
    const synced = await syncProfileAvatarIfMissing(supabase, userId, user.user_metadata)
    if (synced && isMissingProfileAvatar(data.avatar_url)) {
      data = { ...data, avatar_url: synced }
    } else if (isMissingProfileAvatar(data.avatar_url)) {
      const fallback = avatarUrlFromUserMetadata(user.user_metadata)
      if (fallback) data = { ...data, avatar_url: fallback }
    }
  }

  return mapProfile(data)
})

function isMissingProfileAvatar(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0
}

export function mapProfile(row: Record<string, unknown>): Profile {
  const permanent = Number(row.cites_balance ?? 0)
  const proPool = Number(row.pro_cites_balance ?? 0)
  return {
    id: String(row.id),
    username: (row.username as string | null) ?? null,
    displayName: (row.display_name as string | null) ?? null,
    avatarUrl: (row.avatar_url as string | null) ?? null,
    schoolId: (row.school_id as string | null) ?? null,
    defaultStyle: normalizeReferencingStyleId((row.default_style as string) ?? 'apa'),
    defaultInText: Boolean(row.default_in_text ?? true),
    defaultSuggestCorrections: Boolean(row.default_suggest_corrections ?? true),
    defaultRecency: ((row.default_recency as SourceRecency) ?? 'any') as SourceRecency,
    defaultSourceTier: ((row.default_source_tier as SourceTier) ?? 'any') as SourceTier,
    themePreference: (row.theme_preference as Profile['themePreference']) ?? 'system',
    referralCode: String(row.referral_code),
    citesBalance: permanent + proPool,
    permanentCitesBalance: permanent,
    proCitesBalance: proPool,
    bibliographiesCount: Number(row.bibliographies_count ?? 0),
    onboardingComplete: Boolean(row.onboarding_complete),
    stripeCustomerId: (row.stripe_customer_id as string | null) ?? null,
    planTier: normalizePlanTier(row.plan_tier ?? FREE_PLAN_TIER),
    proTrialStartedAt: (row.pro_trial_started_at as string | null) ?? null,
    proTrialEndsAt: (row.pro_trial_ends_at as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}
